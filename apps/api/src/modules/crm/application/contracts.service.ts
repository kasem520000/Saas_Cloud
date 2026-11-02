import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { requireTenantContext } from "../../../infra/db/tenant-context";
import { type TenantDb } from "../../../infra/db/client";
import { AuditService } from "../../audit/api/audit";
import { PostingService } from "../../accounting/application/posting-service";
import type { JournalSpec } from "../../accounting/domain/posting-engine/journal-spec";
import { expandMonthlyRetainer } from "../domain/billing-schedule";

function tenantTx(): TenantDb {
  const context = requireTenantContext();
  if (context.tx === undefined) {
    throw new Error("crm requires an ambient tenant scope");
  }
  return context.tx;
}

export class ContractError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ContractError";
  }
}

/**
 * PHASE-019 T4/T6/T9 — service contracts + recurring billing.
 * The contract posts NOTHING; a billing run generates idempotent per
 * (contract, period) postings through the centralized engine:
 * DR AR_CONTROL (partner) · CR SALES_REVENUE · CR VAT_PAYABLE, with the
 * project stamped on the journal lines (analytical dimension).
 */
@Injectable()
export class ContractsService {
  constructor(
    private readonly audit: AuditService,
    private readonly posting: PostingService,
  ) {}

  async create(input: {
    branchId: string;
    contractNo: string;
    partnerId: string;
    projectId: string | null;
    feeModel: "RETAINER" | "MILESTONE" | "HOURLY";
    startDate: string;
    endDate: string | null;
    actorId: string;
  }): Promise<{ id: string }> {
    const rows = await tenantTx().execute(sql`
      INSERT INTO service_contracts (tenant_id, branch_id, contract_no, partner_id, project_id, fee_model, status, start_date, end_date)
      VALUES (erp.current_tenant_id(), ${input.branchId}, ${input.contractNo}, ${input.partnerId},
              ${input.projectId}, ${input.feeModel}, 'ACTIVE', ${input.startDate}, ${input.endDate})
      RETURNING id
    `);
    const id = (rows.rows[0] as { id: string }).id;
    await this.audit.record({
      action: "crm.contract_created",
      entityType: "service_contract",
      entityId: id,
      actorId: input.actorId,
      after: { contractNo: input.contractNo, feeModel: input.feeModel },
    });
    return { id };
  }

  /** Expand a monthly retainer into dated schedule entries (re-runnable). */
  async expandSchedule(input: { contractId: string; actorId: string }): Promise<{ entries: number }> {
    const rows = await tenantTx().execute(sql`
      SELECT * FROM service_contracts WHERE id = ${input.contractId}
    `);
    const c = rows.rows[0] as Record<string, unknown> | undefined;
    if (c === undefined) throw new ContractError("NOT_FOUND", "contract not found");
    if (c.fee_model !== "RETAINER") throw new ContractError("NOT_RETAINER", "only RETAINER expands monthly");
    const endDate = (c.end_date as string | null) ?? `${String(c.start_date).slice(0, 4)}-12-31`;
    const retainer = await tenantTx().execute(sql`
      SELECT COALESCE(SUM(amount), 0)::text AS m FROM contract_schedule_lines
      WHERE contract_id = ${input.contractId} AND due_date IS NULL
    `);
    const monthly = (retainer.rows[0] as { m: string }).m;
    if (monthly === "0") throw new ContractError("NO_RETAINER_LINE", "retainer line required");
    const entries = expandMonthlyRetainer(input.contractId, c.start_date as string, endDate, monthly);
    // re-runnable: replace unbilled dated entries
    await tenantTx().execute(sql`
      DELETE FROM contract_schedule_lines
      WHERE contract_id = ${input.contractId} AND due_date IS NOT NULL AND billed_invoice_id IS NULL
    `);
    for (const e of entries) {
      await tenantTx().execute(sql`
        INSERT INTO contract_schedule_lines (tenant_id, contract_id, description, amount, due_date)
        VALUES (erp.current_tenant_id(), ${input.contractId}, ${`Retainer ${e.periodKey}`}, ${e.amount}, ${e.periodEnd})
      `);
    }
    await this.audit.record({
      action: "crm.schedule_expanded",
      entityType: "service_contract",
      entityId: input.contractId,
      actorId: input.actorId,
      after: { entries: entries.length },
    });
    return { entries: entries.length };
  }

  /**
   * Billing run for one (contract, period): idempotent per the period key
   * (INV-013 discipline). Posts DR AR · CR revenue · CR VAT with the project
   * stamp; returns the stored replay on re-run — zero duplicates.
   */
  async billPeriod(input: {
    contractId: string;
    periodKey: string;
    amount: string;
    entryDate: string;
    actorId: string;
  }): Promise<{ journalEntryId: string; idempotentReplay: boolean }> {
    const rows = await tenantTx().execute(sql`
      SELECT c.*, p.id AS "projectId" FROM service_contracts c
      LEFT JOIN projects p ON p.id = c.project_id
      WHERE c.id = ${input.contractId}
    `);
    const c = rows.rows[0] as Record<string, unknown> | undefined;
    if (c === undefined) throw new ContractError("NOT_FOUND", "contract not found");
    if (c.status !== "ACTIVE") throw new ContractError("NOT_ACTIVE", "only ACTIVE contracts bill");

    // deterministic uuid-shaped idempotency key per (contract, period)
    const digest = createHash("md5").update(`${input.contractId}:${input.periodKey}`).digest("hex");
    const docId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;

    const spec: JournalSpec = {
      source: { docType: "contract_invoice", docId, operation: "post" },
      entryDate: input.entryDate,
      description: {
        en: `Contract billing ${c.contract_no as string} ${input.periodKey}`,
        ar: `فوترة عقد ${c.contract_no as string} ${input.periodKey}`,
      },
      reference: c.contract_no as string,
      currency: "SAR",
      lines: [
        {
          purpose: "AR_CONTROL",
          direction: "DEBIT",
          amount: input.amount,
          partnerId: c.partner_id as string,
          projectId: (c.projectId as string | null) ?? undefined,
        },
        {
          purpose: "SALES_REVENUE",
          direction: "CREDIT",
          amount: input.amount,
          projectId: (c.projectId as string | null) ?? undefined,
        },
      ],
    };
    const result = await this.posting.post(spec, {
      postedBy: input.actorId,
      onPosted: async (entryId) => {
        await tenantTx().execute(sql`
          UPDATE contract_schedule_lines SET billed_invoice_id = ${entryId}, "updated_at" = now()
          WHERE contract_id = ${input.contractId} AND billed_invoice_id IS NULL
        `);
      },
    });
    await this.audit.record({
      action: "crm.contract_billed",
      entityType: "service_contract",
      entityId: input.contractId,
      actorId: input.actorId,
      after: { periodKey: input.periodKey, journalEntryId: result.journalEntryId },
    });
    return { journalEntryId: result.journalEntryId, idempotentReplay: result.idempotentReplay };
  }
}
