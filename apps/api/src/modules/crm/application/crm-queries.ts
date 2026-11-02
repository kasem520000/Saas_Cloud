import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { requireTenantContext } from "../../../infra/db/tenant-context";
import { type TenantDb } from "../../../infra/db/client";

function tenantTx(): TenantDb {
  const context = requireTenantContext();
  if (context.tx === undefined) {
    throw new Error("query requires an ambient tenant scope");
  }
  return context.tx;
}

/**
 * PHASE-019 T10 — read-only CRM query service: contract revenue schedule
 * (contracted vs invoiced vs backlog — reconciles to AR control, INV-009) and
 * time billing summary (recorded vs billable vs invoiced hours per project).
 */
@Injectable()
export class CrmQueriesService {
  /** services.contract_revenue_schedule — contracted schedule vs billed lines. */
  async contractRevenueSchedule(input: { dateFrom: string; dateTo: string }): Promise<
    { key: string; values: Record<string, string> }[]
  > {
    const rows = await tenantTx().execute(sql`
      SELECT c.contract_no AS "contractNo", c.fee_model AS "feeModel", c.status,
             COALESCE((SELECT SUM(l.amount) FROM contract_schedule_lines l
                       WHERE l.contract_id = c.id), 0)::text AS contracted,
             COALESCE((SELECT SUM(l.amount) FROM contract_schedule_lines l
                       WHERE l.contract_id = c.id AND l.billed_invoice_id IS NOT NULL), 0)::text AS invoiced,
             COALESCE((SELECT SUM(l.amount) FROM contract_schedule_lines l
                       WHERE l.contract_id = c.id AND l.billed_invoice_id IS NULL), 0)::text AS backlog
      FROM service_contracts c
      WHERE c.start_date BETWEEN ${input.dateFrom}::date AND ${input.dateTo}::date
      ORDER BY c.contract_no LIMIT 1000
    `);
    return (rows.rows as unknown as Record<string, string>[]).map((r) => ({
      key: r.contractNo ?? "",
      values: r,
    }));
  }

  /** services.time_billing_summary — hours per project/fee item. */
  async timeBillingSummary(input: { dateFrom: string; dateTo: string }): Promise<
    { key: string; values: Record<string, string> }[]
  > {
    const rows = await tenantTx().execute(sql`
      SELECT p.code AS "projectCode", i.sku AS "feeItem",
             SUM(t.hours)::text AS recorded,
             SUM(CASE WHEN t.billable THEN t.hours ELSE 0 END)::text AS billable,
             SUM(CASE WHEN t.billed THEN t.hours ELSE 0 END)::text AS invoiced
      FROM time_entries t
      JOIN projects p ON p.id = t.project_id
      JOIN items i ON i.id = t.fee_item_id
      WHERE t.entry_date BETWEEN ${input.dateFrom}::date AND ${input.dateTo}::date
      GROUP BY p.code, i.sku
      ORDER BY p.code LIMIT 1000
    `);
    return (rows.rows as unknown as Record<string, string>[]).map((r) => ({
      key: `${r.projectCode ?? ""}/${r.feeItem ?? ""}`,
      values: r,
    }));
  }

  /** Lead pipeline counts for the follow-up dashboard. */
  async leadPipeline(): Promise<{ key: string; values: Record<string, string> }[]> {
    const rows = await tenantTx().execute(sql`
      SELECT status AS key, count(*)::text AS n FROM leads GROUP BY status ORDER BY status
    `);
    return (rows.rows as unknown as { key: string; n: string }[]).map((r) => ({
      key: r.key,
      values: { status: r.key, count: r.n },
    }));
  }
}
