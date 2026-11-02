import { Inject, Injectable } from "@nestjs/common";
import { Decimal } from "@erp/domain-core";

import { AuditService } from "../../audit/api/audit";
import { NumberingService } from "../../accounting/application/numbering-service";
import { PostingService } from "../../accounting/application/posting-service";
import { SelfApprovalBlockedError } from "../../accounting/domain/accounting-errors";
import type { JournalLineSpec, JournalSpec } from "../../accounting/domain/posting-engine/journal-spec";
import { TaxResolverService } from "../../tax/application/tax-resolver-service";
import { recordDocumentTaxSummary } from "../../tax/application/posting-adapter";
import {
  planIssue,
  applyIssue,
  resolveInventoryAccount,
  stagePendingOverlay,
  type IssuePlan,
} from "../../inventory/application/movement-core";
import { ownTenantBaseCurrency } from "../../../infra/settings/setting-reader";
import * as store from "../infrastructure/sales.store";
import { ConfigurationService } from "../../configuration/application/configuration.service";
import {
  ClaimRefRequiredError,
  DeliveryAlreadyInvoicedError,
  DeliveryNoteNotFoundError,
  EmptyDocumentError,
  InvoiceLineInvalidError,
  SalesDocumentStateError,
  SalesInvoiceNotFoundError,
} from "../domain/sales-errors";
import { requireCustomer, requireSellableItem } from "./quotations";
import { resolveOutputTaxLines, type SalesTaxLine } from "./tax-lines";
import { salesLineNetAmount, PRICE_RE } from "./pricing";
import { enforceAtApproval, runCreditCheck } from "./credit-limits";

/**
 * Sales-invoice service (PHASE-012 T5/T6; POSTING_ENGINE §4/§5; goldens
 * G-01/G-02/G-03; W-1): cash + credit kinds posting through the engine —
 *
 *   G-01 credit: DR AR_CONTROL (partner) · CR SALES_REVENUE · CR VAT_PAYABLE
 *   G-02 cash:   DR cash/bank · CR revenue · CR VAT_PAYABLE
 *                (+ the treasury cash_movements row — INV-019)
 *   G-03 COGS (with-goods, flow B): DR COGS · CR INVENTORY at issue cost
 *
 * Sequencing per §5 — ONE transaction: planIssues → COGS post
 * (sales_invoice:cogs) → applyIssues → tax stamp (INV-012 OUTPUT) →
 * AR/cash post (sales_invoice:post) → subledger (the posting service's
 * partner-subledger port, INV-009 from entry #1) → SAL- number → audit.
 *
 * BR-001: credit limits enforce at APPROVAL (server-side, all three
 * postures, override via sales.credit_check.override audited) and
 * RE-VERIFY at post (no TOCTOU gap). BR-005: cash invoices may auto-post
 * on save per sales.cash_autopost (approved_by = the POLICY_ACTOR sentinel,
 * recorded distinctly from posted_by). BR-033: tax snapshots stamp per
 * line at create; posting re-resolves deterministically and REFUSES a
 * mismatch (never silently recomputes).
 */

const SAL_FORMAT = { prefix: "SAL", format: "SAL-{YYYY}-{SEQ:6}", docType: "sales_invoice" };

/** BR-005: the policy-driven approval actor sentinel (never a real user). */
export const POLICY_ACTOR_ID = "00000000-0000-0000-0000-000000000505";

const QTY_RE = /^\d+(\.\d{1,6})?$/;

export interface InvoiceLineInput {
  itemId: string | null;
  accountId: string | null;
  deliveryLineId: string | null;
  description: string | null;
  descriptionAr: string | null;
  qty: string;
  unitPrice: string;
  discountAmount: string | null;
  taxCodeId: string | null;
  batchId: string | null;
  serialIds: string[] | null;
  note: string | null;
}

@Injectable()
export class SalesInvoiceService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    private readonly posting: PostingService,
    private readonly numbering: NumberingService,
    private readonly resolver: TaxResolverService,
    private readonly configuration: ConfigurationService,
  ) {}

  async list(filter: {
    status?: string;
    customerId?: string;
    orderId?: string;
    kind?: string;
    limit: number;
  }) {
    return store.listSalesInvoices(filter);
  }

  async find(id: string) {
    const invoice = await store.findSalesInvoiceById(id);
    if (invoice === undefined) throw new SalesInvoiceNotFoundError(id);
    return invoice;
  }

  async findWithLines(id: string) {
    const invoice = await this.find(id);
    return { ...invoice, lines: await store.listSalesInvoiceLines(id) };
  }

  /**
   * Create a DRAFT invoice. Flow A (delivery_then_invoice): deliveryId +
   * per-line deliveryLineId; stock/COGS already posted by the DN — the
   * issue snapshots copy over (the W-3 provenance). Flow B
   * (invoice_then_delivery, with-goods): warehouseId; stock issues + COGS
   * post at the invoice itself. CASH invoices carry a cashAccountId.
   */
  async create(input: {
    branchId: string;
    customerId: string;
    salesRepId: string | null;
    kind: "CASH" | "CREDIT";
    invoiceDate: string;
    dueDate: string | null;
    currencyCode: string;
    exchangeRate: string | null;
    orderId: string | null;
    deliveryId: string | null;
    warehouseId: string | null;
    cashAccountId: string | null;
    note: string | null;
    noteAr: string | null;
    /** PHASE-031: external insurer claim reference (مطالبة تأمينية). Undefined = self-pay; null/blank with the policy active is rejected. */
    claimRef?: string | null;
    actorId: string | null;
    lines: readonly InvoiceLineInput[];
  }): Promise<store.SalesInvoiceRow> {
    if (input.lines.length === 0) throw new EmptyDocumentError("sales invoice");
    // PHASE-031: policy-gated claim-ref capture. An explicitly provided but
    // blank claim ref on an insured invoice is rejected (CLAIM_REF_REQUIRED);
    // an absent claimRef means self-pay (دفع مباشر) and always saves. Capture
    // only — never alters posting (INV-022).
    if (input.claimRef !== undefined) {
      const effective = await this.configuration.resolveEffectiveConfig();
      const required = effective.policies["claim_ref_required_for_insured_invoices"] === true;
      if (required && (input.claimRef === null || input.claimRef.trim() === "")) {
        throw new ClaimRefRequiredError();
      }
    }
    const customer = await requireCustomer(input.customerId);
    const base = await ownTenantBaseCurrency();
    if (input.currencyCode !== base && (input.exchangeRate === null || Number(input.exchangeRate) <= 0)) {
      throw new InvoiceLineInvalidError(
        `invoice in ${input.currencyCode} requires a positive exchange rate (base ${base})`,
      );
    }
    if (input.deliveryId !== null && input.warehouseId !== null) {
      throw new InvoiceLineInvalidError(
        "an invoice references either a delivery (flow A) or issues stock itself (flow B) — not both (BR-007)",
      );
    }
    if (input.kind === "CASH" && input.cashAccountId === null) {
      throw new InvoiceLineInvalidError("cash invoices require cashAccountId (the G-02 DR leg)");
    }
    if (input.kind === "CASH" && input.currencyCode !== base) {
      throw new InvoiceLineInvalidError(
        "cash invoices settle in the base currency at the counter — foreign-currency cash invoices belong to the credit + receipt flow (W-2)",
      );
    }

    // Cash account validation (A7 + active check).
    if (input.cashAccountId !== null) {
      const treasuryStore = await import("../../treasury/infrastructure/treasury.store");
      const account = await treasuryStore.findCashAccountById(input.cashAccountId);
      if (account === undefined) {
        throw new InvoiceLineInvalidError(`cash account ${input.cashAccountId} does not exist in this tenant`);
      }
      if (account.status !== "ACTIVE") {
        throw new SalesDocumentStateError(
          `cash account ${account.name} is ${account.status} and cannot receive counter receipts`,
        );
      }
    }

    // Due date: explicit, or the customer's credit terms from invoice date (BR-026).
    let dueDate = input.dueDate;
    if (dueDate === null) {
      dueDate = input.kind === "CASH" ? input.invoiceDate : null;
      if (dueDate === null) {
        dueDate = input.invoiceDate;
        if (customer.creditTermId !== null) {
          const partnersStore = await import("../../partners/infrastructure/partners.store");
          const term = await partnersStore.findCreditTermsById(customer.creditTermId);
          if (term !== undefined && term.days > 0) {
            dueDate = new Date(
              new Date(`${input.invoiceDate}T00:00:00Z`).getTime() + term.days * 24 * 60 * 60 * 1000,
            )
              .toISOString()
              .slice(0, 10);
          }
        }
      }
    }

    // Flow A context: the posted DN + per-line bounds (INV-016 shape).
    const deliveryLines =
      input.deliveryId !== null ? await this.requireDeliveryContext(input.deliveryId, input.customerId) : new Map<
        string,
        store.DeliveryNoteLineRow
      >();
    const alreadyInvoiced = await store.deliveryLineInvoicedQty();

    // Line validation + tax resolution (BR-033 snapshots at create).
    const taxLines = await resolveOutputTaxLines({
      resolver: this.resolver,
      documentDate: input.invoiceDate,
      currencyCode: input.currencyCode,
      lines: input.lines
        .map((line) => ({
          taxCodeId: line.taxCodeId ?? "",
          amount: salesLineNetAmount(
            line.qty,
            line.unitPrice,
            line.discountAmount ?? "0",
          ),
        }))
        .filter((line) => line.taxCodeId !== ""),
    });
    const taxByLine = new Map<number, SalesTaxLine>();
    let taxIndex = 0;
    for (let index = 0; index < input.lines.length; index += 1) {
      if (input.lines[index]!.taxCodeId !== null) {
        taxByLine.set(index + 1, taxLines.lines[taxIndex]!);
        taxIndex += 1;
      }
    }

    let totalNet = new Decimal(0);
    let totalTax = new Decimal(0);
    type SiStoreLine = Parameters<typeof store.insertSalesInvoice>[0]["lines"][number];
    const storeLines: SiStoreLine[] = [];
    let lineNo = 0;
    for (const line of input.lines) {
      lineNo += 1;
      if ((line.itemId === null) === (line.accountId === null)) {
        throw new InvoiceLineInvalidError(
          "each invoice line targets exactly one of item (stock/revenue) or account (service/charge)",
        );
      }
      if (!QTY_RE.test(line.qty) || Number(line.qty) <= 0) {
        throw new InvoiceLineInvalidError(`invoice line qty must be positive (≤ 6dp): ${line.qty}`);
      }
      if (!PRICE_RE.test(line.unitPrice) || Number(line.unitPrice) < 0) {
        throw new InvoiceLineInvalidError(`invoice line unit price must be non-negative: ${line.unitPrice}`);
      }
      if (line.itemId !== null) {
        await requireSellableItem(line.itemId);
      }
      const net = salesLineNetAmount(line.qty, line.unitPrice, line.discountAmount ?? "0");
      const tax = taxByLine.get(lineNo);
      const taxAmount = tax?.resolved.taxAmount ?? "0.0000";

      // Flow A: the delivery-line bound (invoiced ≤ delivered).
      let issueUnitCost: string | null = null;
      let issueValue: string | null = null;
      let batchId = line.batchId;
      let serialIds = line.serialIds;
      if (line.deliveryLineId !== null) {
        const deliveryLine = deliveryLines.get(line.deliveryLineId);
        if (deliveryLine === undefined) {
          throw new InvoiceLineInvalidError(
            `delivery line ${line.deliveryLineId} does not exist on delivery ${input.deliveryId}`,
          );
        }
        if (deliveryLine.itemId !== line.itemId) {
          throw new InvoiceLineInvalidError(
            `delivery line ${line.deliveryLineId} carries a different item — the invoice line must match (INV-006)`,
          );
        }
        const invoiced = alreadyInvoiced.get(line.deliveryLineId) ?? "0";
        const after = new Decimal(invoiced).plus(new Decimal(line.qty));
        if (after.comparedTo(new Decimal(deliveryLine.qty)) > 0) {
          throw new DeliveryAlreadyInvoicedError({
            deliveryLineId: line.deliveryLineId,
            delivered: deliveryLine.qty,
            alreadyInvoiced: invoiced,
            requested: line.qty,
          });
        }
        // The W-3 provenance copies from the DN line's post snapshots.
        issueUnitCost = deliveryLine.issueUnitCost;
        issueValue = new Decimal(deliveryLine.issueUnitCost ?? "0")
          .times(new Decimal(line.qty))
          .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
          .toFixed(4);
        batchId = deliveryLine.batchId;
        serialIds = deliveryLine.serialIds;
      } else if (line.itemId !== null && input.warehouseId !== null) {
        // Flow B: stock issues at post — capture batch/serial now.
        void issueUnitCost;
        void issueValue;
      }

      totalNet = totalNet.plus(new Decimal(net));
      totalTax = totalTax.plus(new Decimal(taxAmount));
      storeLines.push({
        itemId: line.itemId,
        accountId: line.accountId,
        deliveryLineId: line.deliveryLineId,
        description: line.description,
        descriptionAr: line.descriptionAr,
        qty: new Decimal(line.qty).toFixed(6),
        unitPrice: new Decimal(line.unitPrice).toFixed(6),
        discountAmount: new Decimal(line.discountAmount ?? "0").toFixed(4),
        taxCodeId: line.taxCodeId,
        netAmount: net,
        taxAmount,
        taxSnapshot: (tax?.resolved.snapshot as unknown as Record<string, unknown>) ?? null,
        batchId,
        serialIds,
        note: line.note,
      });
    }

    const totalNetS = totalNet.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
    const totalTaxS = totalTax.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
    const totalGross = totalNet.plus(totalTax).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);

    // BR-001 preview (recorded on the draft; enforced at approve). CASH
    // invoices carry no credit exposure (money received at the counter) —
    // the check is a CREDIT-kind control, so cash records ALLOW by shape.
    const documentBase =
      input.currencyCode === base
        ? totalGross
        : new Decimal(totalGross).times(new Decimal(input.exchangeRate ?? "1"))
            .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
            .toFixed(4);
    const preview =
      input.kind === "CASH"
        ? {
            posture: "cash",
            partnerId: input.customerId,
            openBalance: "0.0000",
            documentAmount: documentBase,
            limit: null,
            wouldExceed: false,
            overdueCount: 0,
            decision: "ALLOW" as const,
            math: "cash — no credit exposure",
          }
        : await runCreditCheck({
            customerId: input.customerId,
            documentAmountBase: documentBase,
          });

    const created = await store.insertSalesInvoice({
      branchId: input.branchId,
      customerId: input.customerId,
      salesRepId: input.salesRepId,
      kind: input.kind,
      invoiceDate: input.invoiceDate,
      dueDate,
      currencyCode: input.currencyCode,
      exchangeRate: input.exchangeRate,
      orderId: input.orderId,
      deliveryId: input.deliveryId,
      warehouseId: input.warehouseId,
      cashAccountId: input.cashAccountId,
      note: input.note,
      noteAr: input.noteAr,
      claimRef: input.claimRef === undefined ? null : input.claimRef,
      actorId: input.actorId,
      totalNet: totalNetS,
      totalTax: totalTaxS,
      totalGross,
      taxSummary: { groups: taxLines.summaryGroups, totalTax: taxLines.totalTax },
      creditCheck: { ...preview, stage: "draft" },
      lines: storeLines,
    });
    await this.audit.record({
      action: "sales.invoice_created",
      entityType: "sales_invoice",
      entityId: created.id,
      actorId: input.actorId ?? undefined,
      after: {
        kind: input.kind,
        customerId: input.customerId,
        totalNet: totalNetS,
        totalTax: totalTaxS,
        totalGross,
        creditDecision: preview.decision,
      },
    });

    // BR-005: cash autopost (policy-driven approval + post, distinctly recorded).
    const autopost = (await store.readSetting<boolean>("sales.cash_autopost")) ?? false;
    if (autopost && input.kind === "CASH") {
      await store.updateSalesInvoiceStatus({
        id: created.id,
        status: "APPROVED",
        actorId: POLICY_ACTOR_ID,
      });
      const posted = await this.post(created.id, POLICY_ACTOR_ID);
      return posted.invoice;
    }
    return created;
  }

  async submit(id: string, actorId: string | null) {
    const invoice = await this.find(id);
    if (invoice.status !== "DRAFT") {
      throw new SalesDocumentStateError(
        `sales invoice ${id} is ${invoice.status} — only DRAFT invoices submit`,
      );
    }
    await store.updateSalesInvoiceStatus({ id, status: "PENDING_APPROVAL", actorId });
    return this.find(id);
  }

  /**
   * Approve: SoD + the BR-001 enforcement (all three postures; override
   * requires sales.credit_check.override — the controller verifies the
   * permission and passes override=true, audited here).
   */
  async approve(id: string, actorId: string | null, override: boolean) {
    const invoice = await this.find(id);
    if (invoice.status !== "PENDING_APPROVAL" && invoice.status !== "DRAFT") {
      throw new SalesDocumentStateError(
        `sales invoice ${id} is ${invoice.status} — only DRAFT/PENDING_APPROVAL invoices approve`,
      );
    }
    if (invoice.createdBy !== null && invoice.createdBy === actorId) {
      throw new SelfApprovalBlockedError();
    }
    // BR-003 staleness gate (sync-vocabulary aligned): when manual overrides
    // are disallowed, every item line's price must still match the
    // deterministic resolution — a drifted draft is PRICE_CHANGED, never
    // silently posted (the offline sync reason codes reuse this vocabulary).
    const overrideAllowed = (await store.readSetting<boolean>("sales.price_override_allowed")) ?? true;
    if (!overrideAllowed) {
      const lines = await store.listSalesInvoiceLines(id);
      for (const line of lines) {
        if (line.itemId === null || line.deliveryLineId !== null) continue;
        const resolved = await (
          await import("./pricing")
        ).resolveSalesPrice({ customerId: invoice.customerId, itemId: line.itemId, qty: line.qty });
        if (resolved.source !== "MANUAL" && resolved.unitPrice !== line.unitPrice) {
          throw new (await import("../domain/sales-errors")).PriceChangedError({
            itemId: line.itemId,
            resolved: resolved.unitPrice,
            provided: line.unitPrice,
          });
        }
      }
    }
    const base = await ownTenantBaseCurrency();
    // BR-001 at approval is a CREDIT-kind control: cash invoices carry no
    // AR exposure, so no check runs (the draft preview records ALLOW by
    // shape; the post-time re-verification guards the same way).
    if (invoice.kind === "CREDIT") {
      const documentBase =
        invoice.currencyCode === base
          ? invoice.totalGross
          : new Decimal(invoice.totalGross).times(new Decimal(invoice.exchangeRate ?? "1"))
              .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
              .toFixed(4);
      const check = await enforceAtApproval({
        customerId: invoice.customerId,
        documentAmountBase: documentBase,
        override,
      });
      if (override) {
        await this.audit.record({
          action: "sales.credit_check_overridden",
          entityType: "sales_invoice",
          entityId: id,
          actorId: actorId ?? undefined,
          after: { check },
        });
      }
      await store.updateSalesInvoiceStatus({
        id,
        status: "APPROVED",
        actorId,
        creditCheck: { ...check, stage: "approved", override },
      });
      await this.audit.record({
        action: "sales.invoice_approved",
        entityType: "sales_invoice",
        entityId: id,
        actorId: actorId ?? undefined,
        after: { creditDecision: check.decision, math: check.math },
      });
      return this.find(id);
    }
    await store.updateSalesInvoiceStatus({ id, status: "APPROVED", actorId });
    await this.audit.record({
      action: "sales.invoice_approved",
      entityType: "sales_invoice",
      entityId: id,
      actorId: actorId ?? undefined,
      after: { creditDecision: "ALLOW", math: "cash — no credit exposure" },
    });
    return this.find(id);
  }

  /**
   * Post (POSTING_ENGINE §5): ONE transaction — planIssues (flow B) →
   * COGS journal → applyIssues → tax stamp (INV-012) → AR/cash journal →
   * SAL- number → status flip. Idempotent (INV-013); BR-001 re-verified
   * (no TOCTOU); PERIOD_LOCKED refuses pre-write (INV-011, zero residue).
   */
  async post(id: string, actorId: string | null) {
    const invoice = await this.find(id);
    if (invoice.status === "POSTED") {
      return {
        invoice,
        journalEntryId: invoice.postedJournalId,
        cogsJournalEntryId: invoice.postedCogsJournalId,
        invoiceNo: invoice.invoiceNo,
        idempotentReplay: true,
      };
    }
    if (invoice.status !== "APPROVED") {
      throw new SalesDocumentStateError(
        `sales invoice ${id} is ${invoice.status} — approval (with the credit decision) precedes posting`,
      );
    }
    const lines = await store.listSalesInvoiceLines(id);
    const base = await ownTenantBaseCurrency();

    // BR-001 re-verification at post (the no-TOCTOU gap closer).
    if (invoice.kind === "CREDIT") {
      const documentBase =
        invoice.currencyCode === base
          ? invoice.totalGross
          : new Decimal(invoice.totalGross).times(new Decimal(invoice.exchangeRate ?? "1"))
              .toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
              .toFixed(4);
      const fresh = await enforceAtApproval({
        customerId: invoice.customerId,
        documentAmountBase: documentBase,
        override: (invoice.creditCheck as { override?: boolean } | null)?.override === true,
      });
      void fresh;
    }

    // (1) Flow B: plan every stock issue — NO writes yet.
    const plans: { line: store.SalesInvoiceLineRow; plan: IssuePlan }[] = [];
    if (invoice.warehouseId !== null) {
      for (const line of lines) {
        if (line.itemId === null) continue;
        const plan = await planIssue({
          itemId: line.itemId,
          warehouseId: invoice.warehouseId,
          qty: line.qty,
          movedAt: invoice.invoiceDate,
          moveKind: "issue",
          sourceType: "sales_invoice",
          sourceId: id,
          batchId: line.batchId,
          serialIds: line.serialIds ?? [],
          memo: `Invoice ${invoice.invoiceNo ?? id}`,
          memoAr: `فاتورة ${invoice.invoiceNo ?? id}`,
        });
        plans.push({ line, plan });
        stagePendingOverlay(plan);
      }
    }

    // (2) The COGS journal (sales_invoice:cogs) — G-03 at issue cost.
    let cogsJournalId: string | null = null;
    let cogsTotal = new Decimal(0);
    if (plans.length > 0) {
      const accountingStore = await import("../../accounting/infrastructure/accounting.store");
      const cogsMapping = await accountingStore.findActivePurpose("COGS");
      if (cogsMapping === undefined) {
        const { purposeNotMapped } = await import("../../accounting/domain/posting-engine/posting-errors");
        throw purposeNotMapped({ purposeKey: "COGS" });
      }
      const inventoryByAccount = new Map<string, string>();
      for (const { plan } of plans) {
        const inventoryAccount = await resolveInventoryAccount(invoice.warehouseId!);
        inventoryByAccount.set(
          inventoryAccount,
          new Decimal(inventoryByAccount.get(inventoryAccount) ?? "0")
            .plus(new Decimal(plan.valueAmount))
            .toFixed(4),
        );
        cogsTotal = cogsTotal.plus(new Decimal(plan.valueAmount));
      }
      const cogsLines: JournalLineSpec[] = [
        {
          accountId: cogsMapping.accountId,
          direction: "DEBIT",
          amount: cogsTotal.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4),
          memo: {
            en: `Invoice ${invoice.invoiceNo ?? id} — COGS at issue cost`,
            ar: `فاتورة ${invoice.invoiceNo ?? id} — تكلفة المبيعات بسعر الإصدار`,
          },
        },
      ];
      for (const [accountId, amount] of [...inventoryByAccount.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
        if (amount === "0.0000") continue;
        cogsLines.push({
          accountId,
          direction: "CREDIT",
          amount,
          memo: {
            en: `Invoice ${invoice.invoiceNo ?? id} — stock issued`,
            ar: `فاتورة ${invoice.invoiceNo ?? id} — صرف مخزون`,
          },
        });
      }
      const cogsSpec: JournalSpec = {
        source: { docType: "sales_invoice", docId: id, operation: "cogs" },
        entryDate: invoice.invoiceDate,
        description: {
          en: `Sales invoice ${invoice.invoiceNo ?? id} — COGS entry`,
          ar: `فاتورة بيع ${invoice.invoiceNo ?? id} — قيد تكلفة المبيعات`,
        },
        currency: base,
        lines: cogsLines,
      };
      const cogsResult = await this.posting.post(cogsSpec, { postedBy: actorId });
      if (cogsResult.idempotentReplay) {
        cogsJournalId = cogsResult.journalEntryId;
      } else {
        cogsJournalId = cogsResult.journalEntryId;
        for (const { plan } of plans) {
          await applyIssue(plan, cogsJournalId);
        }
        for (const { line, plan } of plans) {
          const unitCost = new Decimal(plan.qty).gt(0)
            ? new Decimal(plan.valueAmount).div(new Decimal(plan.qty)).toDecimalPlaces(6, Decimal.ROUND_HALF_UP)
            : new Decimal(0);
          await store.markInvoiceLineIssued({
            lineId: line.id,
            issueUnitCost: unitCost.toFixed(6),
            issueValue: plan.valueAmount,
          });
        }
      }
    }

    // (3) Tax stamp integrity (BR-033): deterministic re-resolution — a
    // mismatch refuses the post (the draft spans a rate boundary).
    const taxableLines = lines.filter((line) => line.taxCodeId !== null);
    const taxResolution = await resolveOutputTaxLines({
      resolver: this.resolver,
      documentDate: invoice.invoiceDate,
      currencyCode: invoice.currencyCode,
      lines: taxableLines.map((line) => ({
        taxCodeId: line.taxCodeId!,
        amount: line.netAmount,
      })),
    });
    const taxLinesByNo = new Map<number, SalesTaxLine>();
    taxableLines.forEach((line, index) => taxLinesByNo.set(line.lineNo, taxResolution.lines[index]!));
    for (const line of taxableLines) {
      const tax = taxLinesByNo.get(line.lineNo);
      if (tax !== undefined && line.taxSnapshot !== null) {
        const persistedRate = (line.taxSnapshot as { rate?: string }).rate ?? null;
        if (persistedRate !== null && persistedRate !== tax.resolved.rate) {
          // COGS side may have applied — but the whole UoW rolls back on throw.
          throw new SalesDocumentStateError(
            `line ${line.lineNo} tax snapshot (rate ${persistedRate}) no longer matches the resolution (rate ${tax.resolved.rate}) — re-open the draft to recompute (BR-033)`,
          );
        }
      }
    }
    const vatLines: JournalLineSpec[] = [];
    for (const [, tax] of taxLinesByNo) {
      vatLines.push(...tax.vatLines);
    }

    // (4) The AR/cash journal (sales_invoice:post) — G-01/G-02.
    const accountingStore = await import("../../accounting/infrastructure/accounting.store");
    const revenueMapping = await accountingStore.findActivePurpose("SALES_REVENUE");
    if (revenueMapping === undefined) {
      const { purposeNotMapped } = await import("../../accounting/domain/posting-engine/posting-errors");
      throw purposeNotMapped({ purposeKey: "SALES_REVENUE" });
    }
    // Revenue: item lines → SALES_REVENUE; account lines → their account.
    const revenueByAccount = new Map<string, string>();
    let itemRevenueTotal = new Decimal(0);
    for (const line of lines) {
      if (line.itemId !== null) {
        itemRevenueTotal = itemRevenueTotal.plus(new Decimal(line.netAmount));
      } else {
        revenueByAccount.set(
          line.accountId!,
          new Decimal(revenueByAccount.get(line.accountId!) ?? "0")
            .plus(new Decimal(line.netAmount))
            .toFixed(4),
        );
      }
    }
    const journalLines: JournalLineSpec[] = [];
    // G-02 cash: DR cash/bank first; G-01 credit: DR AR_CONTROL (partner).
    if (invoice.kind === "CASH") {
      const treasuryStore = await import("../../treasury/infrastructure/treasury.store");
      const account = await treasuryStore.findCashAccountById(invoice.cashAccountId!);
      if (account === undefined) {
        throw new InvoiceLineInvalidError(
          `cash account ${invoice.cashAccountId} does not exist in this tenant`,
        );
      }
      journalLines.push({
        accountId: account.accountId,
        direction: "DEBIT",
        amount: invoice.totalGross,
        memo: {
          en: `Cash invoice ${invoice.invoiceNo ?? id}`,
          ar: `فاتورة نقدية ${invoice.invoiceNo ?? id}`,
        },
      });
    } else {
      journalLines.push({
        purpose: "AR_CONTROL",
        direction: "DEBIT",
        amount: invoice.totalGross,
        partnerId: invoice.customerId,
        memo: {
          en: `Sales invoice ${invoice.invoiceNo ?? id}`,
          ar: `فاتورة بيع ${invoice.invoiceNo ?? id}`,
        },
      });
    }
    if (itemRevenueTotal.gt(0)) {
      journalLines.push({
        accountId: revenueMapping.accountId,
        direction: "CREDIT",
        amount: itemRevenueTotal.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4),
        memo: {
          en: `Sales revenue — invoice ${invoice.invoiceNo ?? id}`,
          ar: `إيرادات المبيعات — فاتورة ${invoice.invoiceNo ?? id}`,
        },
      });
    }
    for (const [accountId, amount] of [...revenueByAccount.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (amount === "0.0000") continue;
      journalLines.push({
        accountId,
        direction: "CREDIT",
        amount,
        memo: {
          en: `Service revenue — invoice ${invoice.invoiceNo ?? id}`,
          ar: `إيرادات خدمات — فاتورة ${invoice.invoiceNo ?? id}`,
        },
      });
    }
    journalLines.push(...vatLines);

    const effectiveRate =
      invoice.currencyCode === base ? undefined : invoice.exchangeRate ?? undefined;
    const spec: JournalSpec = {
      source: { docType: "sales_invoice", docId: id, operation: "post" },
      entryDate: invoice.invoiceDate,
      description: {
        en: `Sales invoice ${invoice.invoiceNo ?? id} — ${invoice.kind === "CASH" ? "cash" : "AR open"}`,
        ar: `فاتورة بيع ${invoice.invoiceNo ?? id} — ${invoice.kind === "CASH" ? "نقدية" : "فتح حساب مدين"}`,
      },
      currency: invoice.currencyCode,
      exchangeRate: effectiveRate,
      lines: journalLines,
    };
    const result = await this.posting.post(spec, { postedBy: actorId });
    if (result.idempotentReplay) {
      const current = await this.find(id);
      return {
        invoice: current,
        journalEntryId: result.journalEntryId,
        cogsJournalEntryId: current.postedCogsJournalId,
        invoiceNo: current.invoiceNo,
        idempotentReplay: true,
      };
    }

    // (5) INV-012 document summaries — same transaction (OUTPUT side).
    await recordDocumentTaxSummary({
      sourceType: "sales_invoice",
      sourceId: id,
      documentDate: invoice.invoiceDate,
      fiscalPeriodId: null,
      direction: "OUTPUT",
      lines: taxableLines.map((line) => taxLinesByNo.get(line.lineNo)!.resolved),
    });

    // (6) Cash invoice: the treasury cash_movements row (INV-019 — the
    // cash account's balance is ALWAYS Σ movements).
    if (invoice.kind === "CASH") {
      const treasuryStore = await import("../../treasury/infrastructure/treasury.store");
      await treasuryStore.insertCashMovement({
        cashAccountId: invoice.cashAccountId!,
        direction: "IN",
        amount: invoice.totalGross,
        currencyCode: invoice.currencyCode,
        exchangeRate: "1",
        baseAmount: invoice.totalGross,
        sourceType: "sales_invoice",
        sourceId: id,
        valueDate: invoice.invoiceDate,
        memo: `Cash invoice ${invoice.invoiceNo ?? id}`,
        memoAr: `فاتورة نقدية ${invoice.invoiceNo ?? id}`,
      });
    }

    // (7) Official SAL- number + status flip.
    const year = invoice.invoiceDate.slice(0, 4);
    const acquired = await this.numbering.reserve({
      docType: SAL_FORMAT.docType,
      branchId: invoice.branchId,
      periodKey: year,
      format: SAL_FORMAT.format,
      prefix: SAL_FORMAT.prefix,
      year,
    });
    await store.updateSalesInvoiceStatus({
      id,
      status: "POSTED",
      actorId,
      invoiceNo: acquired.number,
      postingDate: invoice.invoiceDate,
      postedJournalId: result.journalEntryId,
      postedCogsJournalId: cogsJournalId,
      cogsValue: cogsTotal.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4),
    });
    await this.numbering.bind(SAL_FORMAT.docType, acquired.number, id);
    await this.audit.record({
      action: "sales.invoice_posted",
      entityType: "sales_invoice",
      entityId: id,
      actorId: actorId ?? undefined,
      after: {
        invoiceNo: acquired.number,
        journalEntryId: result.journalEntryId,
        cogsJournalEntryId: cogsJournalId,
        totalGross: invoice.totalGross,
        kind: invoice.kind,
      },
    });
    return {
      invoice: await this.find(id),
      journalEntryId: result.journalEntryId,
      cogsJournalEntryId: cogsJournalId,
      invoiceNo: acquired.number,
      idempotentReplay: false,
    };
  }

  async cancel(id: string, reason: string, actorId: string | null) {
    const invoice = await this.find(id);
    if (invoice.status === "POSTED") {
      throw new SalesDocumentStateError(
        "posted sales invoices are immutable — correction is a credit note or reversal (INV-003/BR-031)",
      );
    }
    await store.updateSalesInvoiceStatus({ id, status: "CANCELLED", actorId, cancelReason: reason });
    await this.audit.record({
      action: "sales.invoice_cancelled",
      entityType: "sales_invoice",
      entityId: id,
      actorId: actorId ?? undefined,
      after: { reason },
    });
    return this.find(id);
  }

  /** The flow-A delivery context: posted DN + same customer + its lines. */
  private async requireDeliveryContext(
    deliveryId: string,
    customerId: string,
  ): Promise<Map<string, store.DeliveryNoteLineRow>> {
    const delivery = await store.findDeliveryNoteById(deliveryId);
    if (delivery === undefined) throw new DeliveryNoteNotFoundError(deliveryId);
    if (delivery.status !== "POSTED") {
      throw new SalesDocumentStateError(
        `delivery note ${deliveryId} is ${delivery.status} — invoices clear posted deliveries only`,
      );
    }
    if (delivery.customerId !== customerId) {
      throw new InvoiceLineInvalidError(
        "the delivery belongs to a different customer — the source chain must match (INV-006)",
      );
    }
    const lines = await store.listDeliveryNoteLines(deliveryId);
    return new Map(lines.map((line) => [line.id, line]));
  }

  /** Flow A conversion: create the invoice from a posted DN (lines carried). */
  async createFromDelivery(input: {
    deliveryId: string;
    dueDate: string | null;
    taxCodeId: string | null;
    note: string | null;
    actorId: string | null;
  }): Promise<store.SalesInvoiceRow> {
    const delivery = await store.findDeliveryNoteById(input.deliveryId);
    if (delivery === undefined) throw new DeliveryNoteNotFoundError(input.deliveryId);
    if (delivery.status !== "POSTED") {
      throw new SalesDocumentStateError(
        `delivery note ${input.deliveryId} is ${delivery.status} — only POSTED deliveries convert to invoices`,
      );
    }
    if (delivery.convertedInvoiceId !== null) {
      throw new SalesDocumentStateError(
        `delivery note ${input.deliveryId} already converted to invoice ${delivery.convertedInvoiceId}`,
      );
    }
    const lines = await store.listDeliveryNoteLines(input.deliveryId);
    const invoice = await this.create({
      branchId: delivery.branchId,
      customerId: delivery.customerId,
      salesRepId: delivery.salesRepId,
      kind: "CREDIT",
      invoiceDate: new Date().toISOString().slice(0, 10),
      dueDate: input.dueDate,
      currencyCode: delivery.currencyCode,
      exchangeRate: null,
      orderId: delivery.orderId,
      deliveryId: delivery.id,
      warehouseId: null,
      cashAccountId: null,
      note: input.note,
      noteAr: null,
      actorId: input.actorId,
      lines: lines.map((line) => ({
        itemId: line.itemId,
        accountId: null,
        deliveryLineId: line.id,
        description: line.description,
        descriptionAr: line.descriptionAr,
        qty: line.qty,
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount,
        taxCodeId: input.taxCodeId,
        batchId: line.batchId,
        serialIds: line.serialIds,
        note: null,
      })),
    });
    await store.setDeliveryConvertedInvoice(delivery.id, invoice.id);
    // W-3 provenance: carry the DN line's issue-cost snapshot onto the
    // invoice lines — the re-entry cost source for later credit notes
    // (INVENTORY_ACCOUNTING §2: the ORIGINAL issue cost, never a
    // current-average recompute).
    const invoiceLines = await store.listSalesInvoiceLines(invoice.id);
    const dnLineById = new Map(lines.map((line) => [line.id, line]));
    for (const invoiceLine of invoiceLines) {
      const dnLine =
        invoiceLine.deliveryLineId !== null ? dnLineById.get(invoiceLine.deliveryLineId) : undefined;
      if (dnLine !== undefined && dnLine.issueUnitCost !== null && dnLine.issueValue !== null) {
        await store.markInvoiceLineIssued({
          lineId: invoiceLine.id,
          issueUnitCost: dnLine.issueUnitCost,
          issueValue: dnLine.issueValue,
        });
      }
    }
    return invoice;
  }
}
