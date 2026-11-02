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
 * PHASE-017 T13 — read models for the seven PHASE-017 industry reports
 * (docs/industries/reports/README.md PHASE-017 rows). Reads only — no
 * posting surface here (MODULE_BOUNDARIES).
 */

export interface JobCardProfitabilityRow {
  cardId: string;
  cardNo: string;
  status: string;
  partsRevenue: string;
  laborRevenue: string;
  totalRevenue: string;
}

export interface VehicleServiceHistoryRow {
  cardNo: string;
  status: string;
  openedAt: string;
  invoiceId: string | null;
}

export interface RepSettlementRow {
  settlementNo: string;
  settlementDate: string;
  status: string;
  expectedCash: string;
  countedCash: string | null;
  varianceAmount: string | null;
}

export interface RouteVisitComplianceRow {
  routeId: string;
  plannedDate: string;
  planned: string;
  visited: string;
}

export interface VanStockBalanceRow {
  warehouseId: string;
  itemSku: string;
  qty: string;
  valueAmount: string;
  asOf: string;
}

export interface CommissionDueRow {
  repCode: string;
  basis: string;
  ratePct: string;
  invoicedBase: string;
  collectedBase: string;
}

@Injectable()
export class DistributionQueriesService {
  /** automotive.job_card_profitability — parts vs labor revenue per card. */
  async jobCardProfitability(): Promise<JobCardProfitabilityRow[]> {
    const rows = await tenantTx().execute(sql`
      SELECT jc.id::text AS "cardId", jc.card_no AS "cardNo", jc.status,
             COALESCE(SUM(CASE WHEN l.line_type = 'PARTS' THEN l.qty * l.unit_price - l.discount_amount END), 0)::text AS "partsRevenue",
             COALESCE(SUM(CASE WHEN l.line_type = 'LABOR' THEN l.qty * l.unit_price - l.discount_amount END), 0)::text AS "laborRevenue",
             COALESCE(SUM(l.qty * l.unit_price - l.discount_amount), 0)::text AS "totalRevenue"
      FROM job_cards jc LEFT JOIN job_card_lines l ON l.job_card_id = jc.id
      GROUP BY jc.id, jc.card_no, jc.status
      ORDER BY jc.created_at DESC
      LIMIT 2000
    `);
    return rows.rows as unknown as JobCardProfitabilityRow[];
  }

  /** automotive.vehicle_service_history — per-vehicle card timeline. */
  async vehicleServiceHistory(vehicleId: string): Promise<VehicleServiceHistoryRow[]> {
    const rows = await tenantTx().execute(sql`
      SELECT card_no AS "cardNo", status, created_at::text AS "openedAt",
             invoice_id::text AS "invoiceId"
      FROM job_cards WHERE vehicle_id = ${vehicleId}
      ORDER BY created_at DESC LIMIT 500
    `);
    return rows.rows as unknown as VehicleServiceHistoryRow[];
  }

  /** distribution.rep_settlement — settlements with expected/counted/variance. */
  async repSettlements(repId?: string): Promise<RepSettlementRow[]> {
    const rows = await tenantTx().execute(sql`
      SELECT settlement_no AS "settlementNo", settlement_date::text AS "settlementDate",
             status, expected_cash::text AS "expectedCash",
             counted_cash::text AS "countedCash", variance_amount::text AS "varianceAmount"
      FROM rep_settlements
      WHERE (${repId === undefined} OR rep_id = ${repId ?? null})
      ORDER BY settlement_date DESC LIMIT 500
    `);
    return rows.rows as unknown as RepSettlementRow[];
  }

  /** distribution.route_visit_compliance — planned vs visited per route/day. */
  async routeVisitCompliance(routeId?: string): Promise<RouteVisitComplianceRow[]> {
    const rows = await tenantTx().execute(sql`
      SELECT route_id::text AS "routeId", planned_date::text AS "plannedDate",
             count(*)::text AS planned,
             count(visited_at)::text AS visited
      FROM route_visits
      WHERE (${routeId === undefined} OR route_id = ${routeId ?? null})
      GROUP BY route_id, planned_date
      ORDER BY planned_date DESC LIMIT 500
    `);
    return rows.rows as unknown as RouteVisitComplianceRow[];
  }

  /** distribution.van_stock_balances — VAN-warehouse stock read model. */
  async vanStockBalances(): Promise<VanStockBalanceRow[]> {
    const rows = await tenantTx().execute(sql`
      SELECT vs.warehouse_id::text AS "warehouseId", it.sku AS "itemSku",
             vs.qty::text AS qty, vs.value_amount::text AS "valueAmount",
             vs.as_of::text AS "asOf"
      FROM van_stocks vs JOIN items it ON it.id = vs.item_id
      JOIN warehouses w ON w.id = vs.warehouse_id AND w.type = 'VAN'
      WHERE vs.qty <> 0
      ORDER BY w.code, it.sku LIMIT 2000
    `);
    return rows.rows as unknown as VanStockBalanceRow[];
  }

  /** sales.discount_management_effectiveness — discounts vs gross on posted sales. */
  async discountTotals(input: { dateFrom: string; dateTo: string }): Promise<
    { key: string; values: { docNo: string; discount: string; gross: string } }[]
  > {
    const rows = await tenantTx().execute(sql`
      SELECT i.document_no AS "docNo",
             COALESCE(SUM(l.discount_amount), 0)::text AS discount,
             i.total_gross::text AS gross
      FROM sales_invoices i JOIN sales_invoice_lines l ON l.sales_invoice_id = i.id
      WHERE i.invoice_date BETWEEN ${input.dateFrom}::date AND ${input.dateTo}::date
        AND i.status = 'POSTED'
      GROUP BY i.id, i.document_no, i.total_gross
      ORDER BY i.invoice_date DESC LIMIT 2000
    `);
    return (rows.rows as unknown as { docNo: string; discount: string; gross: string }[]).map((r) => ({
      key: r.docNo,
      values: { docNo: r.docNo, discount: r.discount, gross: r.gross },
    }));
  }

  /** sales.commissions_due — per-rep rule base from posted, non-reversed sales. */
  async commissionsDue(): Promise<CommissionDueRow[]> {
    const rows = await tenantTx().execute(sql`
      SELECT r.code AS "repCode", cr.basis, cr.rate_pct::text AS "ratePct",
             COALESCE(SUM(CASE WHEN cr.basis = 'INVOICED' AND i.status = 'POSTED' AND i.status <> 'REVERSED'
                               THEN i.total_gross ELSE 0 END), 0)::text AS "invoicedBase",
             COALESCE(SUM(CASE WHEN cr.basis = 'COLLECTED' THEN 0 ELSE 0 END), 0)::text AS "collectedBase"
      FROM commission_rules cr JOIN sales_reps r ON r.id = cr.rep_id
      LEFT JOIN sales_invoices i ON i.sales_rep_id = cr.rep_id
      WHERE cr.is_active
      GROUP BY r.code, cr.basis, cr.rate_pct
      ORDER BY r.code LIMIT 500
    `);
    return rows.rows as unknown as CommissionDueRow[];
  }
}
