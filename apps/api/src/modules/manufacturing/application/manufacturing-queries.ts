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
 * PHASE-018 T7/T9 — read-only query service: genealogy traces (upstream /
 * downstream by batch) and the manufacturing report derivations. Genealogy is
 * read-only by construction: it only SELECTs.
 */
@Injectable()
export class ManufacturingQueriesService {
  /** manufacturing.batch_genealogy — upstream: batches consumed by this batch's order. */
  async genealogyUpstream(batchId: string): Promise<{ key: string; values: Record<string, string> }[]> {
    const rows = await tenantTx().execute(sql`
      SELECT b.batch_no AS "batchNo", i.name AS "itemName", c.qty::text AS qty, c.unit_cost::text AS "unitCost"
      FROM item_batches b
      JOIN production_orders po ON po.fg_batch_id = b.id
      JOIN production_consumptions c ON c.production_order_id = po.id
      JOIN items i ON i.id = c.item_id
      WHERE b.id = ${batchId}
      ORDER BY i.name
    `);
    return (rows.rows as unknown as Record<string, string>[]).map((r) => ({
      key: r.batchNo ?? "",
      values: r,
    }));
  }

  /** manufacturing.batch_genealogy — downstream: sales lines that sold this batch. */
  async genealogyDownstream(batchId: string): Promise<{ key: string; values: Record<string, string> }[]> {
    const rows = await tenantTx().execute(sql`
      SELECT i.document_no AS "docNo", l.qty::text AS qty, l.unit_price::text AS "unitPrice"
      FROM item_batches b
      JOIN sales_invoice_lines l ON l.batch_id = b.id
      JOIN sales_invoices i ON i.id = l.sales_invoice_id
      WHERE b.id = ${batchId}
      ORDER BY i.invoice_date DESC LIMIT 1000
    `);
    return (rows.rows as unknown as Record<string, string>[]).map((r) => ({
      key: r.docNo ?? "",
      values: r,
    }));
  }

  /** manufacturing.production_cost — planned vs actual per order. */
  async productionCost(input: { dateFrom: string; dateTo: string }): Promise<
    { key: string; values: Record<string, string> }[]
  > {
    const rows = await tenantTx().execute(sql`
      SELECT po.order_no AS "orderNo", po.status, po.planned_qty::text AS "plannedQty",
             po.actual_qty::text AS "actualQty",
             COALESCE((SELECT SUM(c.qty * c.unit_cost) FROM production_consumptions c
                       WHERE c.production_order_id = po.id), 0)::text AS "materialsCost",
             (po.labor_rate * po.actual_qty)::text AS "laborCost",
             (po.overhead_rate * po.actual_qty)::text AS "overheadCost"
      FROM production_orders po
      WHERE po.created_at::date BETWEEN ${input.dateFrom}::date AND ${input.dateTo}::date
      ORDER BY po.created_at DESC LIMIT 1000
    `);
    return (rows.rows as unknown as Record<string, string>[]).map((r) => ({
      key: r.orderNo ?? "",
      values: r,
    }));
  }

  /** manufacturing.qc_inspection_log — inspections with dispositions. */
  async qcInspectionLog(input: { dateFrom: string; dateTo: string }): Promise<
    { key: string; values: Record<string, string> }[]
  > {
    const rows = await tenantTx().execute(sql`
      SELECT ins.inspection_no AS "inspectionNo", ins.target_type AS "targetType",
             ins.result, ins.disposition, ins.sample_size::text AS "sampleSize",
             b.batch_no AS "batchNo"
      FROM inspections ins
      LEFT JOIN item_batches b ON b.id = ins.batch_id
      WHERE ins.inspected_at::date BETWEEN ${input.dateFrom}::date AND ${input.dateTo}::date
      ORDER BY ins.inspected_at DESC LIMIT 1000
    `);
    return (rows.rows as unknown as Record<string, string>[]).map((r) => ({
      key: r.inspectionNo ?? "",
      values: r,
    }));
  }
}
