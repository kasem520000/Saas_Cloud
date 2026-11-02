import { Injectable } from "@nestjs/common";

import { AuditService } from "../../audit/application/audit.service";
import { ownTenantBaseCurrency } from "../../../infra/settings/setting-reader";
import { SalesInvoiceService, type InvoiceLineInput } from "../../sales/application/invoices";
import {
  DeviceRevokedError,
  PosSaleValidationError,
  TerminalInactiveError,
  TerminalNotFoundError,
} from "../domain/pos-errors";
import * as store from "../infrastructure/pos.store";

/**
 * PHASE-016 T5 — POS sale submit (online path) and the sync command handler.
 * A POS sale IS a sales-module invoice (POS channel, kind=CASH): settlement +
 * COGS journals flow through the centralized posting engine inside
 * SalesInvoiceService (ADR-0007 — sync adds transport, never a second
 * business-logic path). BR-005: cash auto-post records
 * `approved_by = policy:pos.cash_autopost` distinctly (handled by the sales
 * module's policy autopost).
 *
 * Idempotency (INV-013 second layer, SYNC_PROTOCOL §11): every command carries
 * a client idempotencyKey; `sync_commands` replays the original result on
 * duplicate delivery — zero additional ledger effects.
 */

export interface PosSaleLineInput {
  itemId: string | null;
  accountId?: string | null;
  qty: string;
  unitPrice: string;
  discountAmount?: string | null;
  taxCodeId?: string | null;
  batchId?: string | null;
  serialIds?: string[] | null;
}

export interface PosSaleInput {
  terminalCode: string;
  customerId: string;
  orderType?: "DINE_IN" | "TAKEAWAY" | "DELIVERY" | "COUNTER";
  tableRef?: string | null;
  offlineReceiptNo?: string | null;
  lines: readonly PosSaleLineInput[];
  actorId: string | null;
}

export interface PosSaleResult {
  invoiceId: string;
  invoiceNo: string | null;
  offlineReceiptNo: string | null;
  status: string;
  totalGross: string;
  syncState: "SYNCED" | "PENDING_SYNC" | "POSTED";
  journalEntryId: string | null;
  cogsJournalEntryId: string | null;
  idempotentReplay: boolean;
}

@Injectable()
export class PosSaleService {
  constructor(
    private readonly invoices: SalesInvoiceService,
    private readonly audit: AuditService,
  ) {}

  private async requireActiveTerminal(code: string): Promise<store.PosTerminalRow> {
    const terminal = await store.findTerminalByCode(code.toUpperCase());
    if (terminal === undefined) {
      throw new TerminalNotFoundError(code);
    }
    if (terminal.status !== "ACTIVE") {
      throw new TerminalInactiveError(terminal.code);
    }
    if (!(await store.deviceIsLive(terminal.deviceId))) {
      throw new DeviceRevokedError();
    }
    return terminal;
  }

  /** Online counter sale: create + policy auto-post through the sales chain. */
  async submitSale(input: PosSaleInput): Promise<PosSaleResult> {
    const terminal = await this.requireActiveTerminal(input.terminalCode);
    if (input.lines.length === 0) {
      throw new PosSaleValidationError("POS sale requires at least one line");
    }
    const invoiceDate = new Date().toISOString().slice(0, 10);
    const lines: InvoiceLineInput[] = input.lines.map((l) => ({
      itemId: l.itemId,
      accountId: l.accountId ?? null,
      deliveryLineId: null,
      description: null,
      descriptionAr: null,
      qty: l.qty,
      unitPrice: l.unitPrice,
      discountAmount: l.discountAmount ?? null,
      taxCodeId: l.taxCodeId ?? null,
      batchId: l.batchId ?? null,
      serialIds: l.serialIds ?? null,
      note: null,
    }));
    const invoice = await this.invoices.create({
      branchId: terminal.branchId,
      customerId: input.customerId,
      salesRepId: null,
      kind: "CASH",
      invoiceDate,
      dueDate: invoiceDate,
      currencyCode: await this.baseCurrency(),
      exchangeRate: null,
      orderId: null,
      deliveryId: null,
      warehouseId: null,
      cashAccountId: terminal.cashAccountId,
      note: null,
      noteAr: null,
      actorId: input.actorId,
      lines,
    });
    if (invoice.status !== "POSTED") {
      // Fail-closed: without the BR-005 autopost policy a counter sale cannot
      // self-approve (SoD); it waits for a supervisor — never silently posts.
      throw new PosSaleValidationError(
        "cash auto-post policy is off (sales.cash_autopost) — counter sale stays pending supervisor approval",
      );
    }
    await store.markInvoicePosChannel({
      invoiceId: invoice.id,
      terminalId: terminal.id,
      orderType: input.orderType ?? "COUNTER",
      tableRef: input.tableRef ?? null,
      offlineReceiptNo: input.offlineReceiptNo ?? null,
      syncState: input.offlineReceiptNo !== null && input.offlineReceiptNo !== undefined ? "PENDING_SYNC" : "SYNCED",
    });
    await store.appendChangeLog({
      entityType: "sales_invoice",
      entityId: invoice.id,
      op: "INSERT",
      payload: { invoiceNo: invoice.invoiceNo, terminalCode: terminal.code, kind: "CASH" },
    });
    await this.audit.record({
      action: "pos_sale.posted",
      entityType: "sales_invoice",
      entityId: invoice.id,
      actorId: input.actorId,
      deviceId: terminal.deviceId ?? undefined,
      after: { invoiceNo: invoice.invoiceNo, terminalCode: terminal.code, totalGross: invoice.totalGross },
    });
    return {
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      offlineReceiptNo: input.offlineReceiptNo ?? null,
      status: invoice.status,
      totalGross: invoice.totalGross,
      syncState: input.offlineReceiptNo ? "PENDING_SYNC" : "SYNCED",
      journalEntryId: invoice.postedJournalId,
      cogsJournalEntryId: invoice.postedCogsJournalId,
      idempotentReplay: false,
    };
  }

  /**
   * Sync push handler for `pos_sale` commands (T8): dedupe by idempotencyKey
   * (replay returns the original result — C-01), execute through the sale
   * path, record ACCEPTED with the official number alongside the OFF- number
   * (1:1 reconciliation, BR-029), typed REJECTED otherwise (C-09).
   */
  async executePosSaleCommand(input: {
    idempotencyKey: string;
    clientId: string;
    deviceId: string | null;
    payload: PosSaleInput & { offlineReceiptNo: string };
  }): Promise<{ status: "ACCEPTED" | "REJECTED"; result: Record<string, unknown>; replay: boolean }> {
    const existing = await store.findCommand(input.idempotencyKey);
    if (existing !== undefined) {
      // C-01: duplicate delivery replays the original result — zero new effects.
      return { status: existing.status === "ACCEPTED" ? "ACCEPTED" : "REJECTED", result: existing.result, replay: true };
    }
    try {
      if (input.deviceId !== null && !(await store.deviceIsLive(input.deviceId))) {
        throw new DeviceRevokedError();
      }
      const sale = await this.submitSale({ ...input.payload, actorId: null });
      const result: Record<string, unknown> = {
        invoiceId: sale.invoiceId,
        invoiceNo: sale.invoiceNo,
        offlineReceiptNo: sale.offlineReceiptNo,
        journalEntryId: sale.journalEntryId,
        cogsJournalEntryId: sale.cogsJournalEntryId,
        totalGross: sale.totalGross,
      };
      await store.insertCommand({
        idempotencyKey: input.idempotencyKey,
        deviceId: input.deviceId ?? null,
        commandType: "pos_sale",
        clientId: input.clientId,
        status: "ACCEPTED",
        result,
      });
      await this.audit.record({
        action: "pos_sale.synced",
        entityType: "sales_invoice",
        entityId: sale.invoiceId,
        deviceId: input.deviceId ?? undefined,
        after: { idempotencyKey: input.idempotencyKey, invoiceNo: sale.invoiceNo, offlineReceiptNo: sale.offlineReceiptNo },
      });
      return { status: "ACCEPTED", result, replay: false };
    } catch (error) {
      const code = (error as { code?: string }).code ?? "VALIDATION_ERROR";
      const result: Record<string, unknown> = {
        errorCode: code,
        message: error instanceof Error ? error.message : String(error),
      };
      await store.insertCommand({
        idempotencyKey: input.idempotencyKey,
        deviceId: input.deviceId ?? null,
        commandType: "pos_sale",
        clientId: input.clientId,
        status: "REJECTED",
        result,
      });
      return { status: "REJECTED", result, replay: false };
    }
  }

  private async baseCurrency(): Promise<string> {
    return ownTenantBaseCurrency();
  }
}
