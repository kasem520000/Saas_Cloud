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
import * as journal from "../../accounting/infrastructure/journal.store";

/**
 * PHASE-013 · inventory report queries (REPORT_CATALOG §4): on-hand,
 * movement, valuation, expiry, count variance, transfers, serials,
 * slow-moving — plus the INV-010 tie (Σ qty×valuation == INVENTORY
 * account balance) the valuation reports assert in the footer.
 */

export interface OnHandRow {
  itemId: string;
  sku: string;
  itemName: string;
  itemNameAr: string | null;
  warehouseId: string;
  warehouseCode: string;
  qty: string;
  value: string;
}

export interface MovementRow {
  moveId: string;
  movedAt: string;
  itemSku: string;
  itemName: string;
  warehouseCode: string;
  direction: "IN" | "OUT";
  moveKind: string;
  qty: string;
  valueAmount: string;
  sourceType: string;
  sourceId: string | null;
}

export interface ExpiryRow {
  batchId: string;
  batchNo: string;
  expiryDate: string;
  itemSku: string;
  itemName: string;
  warehouseCode: string;
  qty: string;
  daysToExpiry: number;
  status: string;
}

export interface CountVarianceRow {
  countId: string;
  countNo: string;
  warehouseCode: string;
  status: string;
  variance: string;
  countedAt: string | null;
}

export interface TransferLogRow {
  transferId: string;
  transferNo: string;
  status: string;
  dispatchDate: string;
  fromWarehouse: string;
  toWarehouse: string;
  receiveDate: string | null;
}

export interface SerialRow {
  serialId: string;
  serialNo: string;
  imei: string | null;
  itemSku: string;
  itemName: string;
  status: string;
  currentOwner: string | null;
  soldAt: string | null;
}

export interface SlowMovingRow {
  itemId: string;
  sku: string;
  itemName: string;
  qty: string;
  value: string;
  lastMovedAt: string | null;
  daysIdle: number | null;
}

@Injectable()
export class InventoryQueriesService {
  /** Stock on hand per (item, warehouse) with WAC/FIFO value. */
  async onHand(filter: { warehouseIds?: readonly string[] } = {}): Promise<OnHandRow[]> {
    const rows = await tenantTx().execute(sql`
      SELECT it.id AS "itemId", it.sku, it.name AS "itemName", it.name_ar AS "itemNameAr",
             w.id AS "warehouseId", w.code AS "warehouseCode",
             SUM(CASE WHEN m.direction = 'IN' THEN m.qty ELSE -m.qty END)::text AS qty,
             SUM(CASE WHEN m.direction = 'IN' THEN m.value_amount ELSE -m.value_amount END)::text AS value
      FROM stock_moves m
      JOIN items it ON it.id = m.item_id
      JOIN warehouses w ON w.id = m.warehouse_id
      WHERE (${filter.warehouseIds === undefined} OR m.warehouse_id IN (${sql.join(
        (filter.warehouseIds ?? []).map((id) => sql`${id}`),
        sql`, `,
      )}))
      GROUP BY it.id, it.sku, it.name, it.name_ar, w.id, w.code
      HAVING SUM(CASE WHEN m.direction = 'IN' THEN m.qty ELSE -m.qty END) <> 0
      ORDER BY it.sku, w.code
    `);
    return rows.rows as unknown as OnHandRow[];
  }

  /** Movement ledger (append-only stock_moves with provenance). */
  async movement(input: {
    fromDate: string;
    toDate: string;
    warehouseIds?: readonly string[];
  }): Promise<MovementRow[]> {
    const rows = await tenantTx().execute(sql`
      SELECT m.id AS "moveId", m.moved_at::text AS "movedAt",
             it.sku AS "itemSku", it.name AS "itemName", w.code AS "warehouseCode",
             m.direction, m.move_kind AS "moveKind", m.qty::text AS qty,
             m.value_amount::text AS "valueAmount", m.source_type AS "sourceType",
             m.source_id AS "sourceId"
      FROM stock_moves m
      JOIN items it ON it.id = m.item_id
      JOIN warehouses w ON w.id = m.warehouse_id
      WHERE m.moved_at::date BETWEEN ${input.fromDate} AND ${input.toDate}
        AND (${input.warehouseIds === undefined} OR m.warehouse_id IN (${sql.join(
          (input.warehouseIds ?? []).map((id) => sql`${id}`),
          sql`, `,
        )}))
      ORDER BY m.moved_at, m.id
      LIMIT 5000
    `);
    return rows.rows as unknown as MovementRow[];
  }

  /** Batch expiry report with days-to-expiry buckets. */
  async expiry(input: {
    asOf: string;
    warehouseIds?: readonly string[];
  }): Promise<ExpiryRow[]> {
    const rows = await tenantTx().execute(sql`
      SELECT b.id AS "batchId", b.batch_no AS "batchNo", b.expiry_date::text AS "expiryDate",
             it.sku AS "itemSku", it.name AS "itemName", w.code AS "warehouseCode",
             SUM(CASE WHEN m.direction = 'IN' THEN m.qty ELSE -m.qty END)::text AS qty,
             (b.expiry_date - ${input.asOf}::date) AS "daysToExpiry",
             b.status
      FROM item_batches b
      JOIN items it ON it.id = b.item_id
      LEFT JOIN stock_moves m ON m.batch_id = b.id
      LEFT JOIN warehouses w ON w.id = m.warehouse_id
      WHERE b.status = 'ACTIVE'
        AND (${input.warehouseIds === undefined} OR m.warehouse_id IN (${sql.join(
          (input.warehouseIds ?? []).map((id) => sql`${id}`),
          sql`, `,
        )}))
      GROUP BY b.id, b.batch_no, b.expiry_date, it.sku, it.name, w.code, b.status
      ORDER BY b.expiry_date
      LIMIT 2000
    `);
    return rows.rows as unknown as ExpiryRow[];
  }

  /** Count-variance register (posted adjustments via provenance). */
  async countVariance(): Promise<CountVarianceRow[]> {
    const rows = await tenantTx().execute(sql`
      SELECT c.id AS "countId", c.count_no AS "countNo", w.code AS "warehouseCode",
             c.status, c.variance::text AS variance, c.submitted_at::text AS "countedAt"
      FROM stock_counts c JOIN warehouses w ON w.id = c.warehouse_id
      ORDER BY c.snapshot_at DESC
      LIMIT 500
    `);
    return rows.rows as unknown as CountVarianceRow[];
  }

  /** Transfer log (two-leg moves with in-transit state). */
  async transferLog(input: {
    fromDate: string;
    toDate: string;
  }): Promise<TransferLogRow[]> {
    const rows = await tenantTx().execute(sql`
      SELECT t.id AS "transferId", t.transfer_no AS "transferNo", t.status,
             t.dispatch_date::text AS "dispatchDate",
             wf.code AS "fromWarehouse", wt.code AS "toWarehouse",
             t.receive_date::text AS "receiveDate"
      FROM stock_transfers t
      JOIN warehouses wf ON wf.id = t.from_warehouse_id
      JOIN warehouses wt ON wt.id = t.to_warehouse_id
      WHERE t.dispatch_date BETWEEN ${input.fromDate} AND ${input.toDate}
      ORDER BY t.dispatch_date DESC
      LIMIT 500
    `);
    return rows.rows as unknown as TransferLogRow[];
  }

  /** Serial/IMEI tracking (status + provenance). */
  async serials(filter: { serial?: string; itemId?: string } = {}): Promise<SerialRow[]> {
    const rows = await tenantTx().execute(sql`
      SELECT s.id AS "serialId", s.serial_no AS "serialNo", s.imei,
             it.sku AS "itemSku", it.name AS "itemName", s.status,
             s.current_owner AS "currentOwner", s.sold_at::text AS "soldAt"
      FROM item_serials s JOIN items it ON it.id = s.item_id
      WHERE (${filter.serial === undefined} OR s.serial_no ILIKE ${"%" + (filter.serial ?? "") + "%"}
             OR s.imei ILIKE ${"%" + (filter.serial ?? "") + "%"})
        AND (${filter.itemId === undefined} OR s.item_id = ${filter.itemId ?? null})
      ORDER BY s.serial_no
      LIMIT 2000
    `);
    return rows.rows as unknown as SerialRow[];
  }

  /** Slow-moving stock: on-hand value with no OUT moves inside the window. */
  async slowMoving(input: {
    asOf: string;
    noSaleDays: number;
  }): Promise<SlowMovingRow[]> {
    const rows = await tenantTx().execute(sql`
      WITH onhand AS (
        SELECT m.item_id, m.warehouse_id,
               SUM(CASE WHEN m.direction = 'IN' THEN m.qty ELSE -m.qty END) AS qty,
               SUM(CASE WHEN m.direction = 'IN' THEN m.value_amount ELSE -m.value_amount END) AS value
        FROM stock_moves m
        WHERE m.moved_at::date <= ${input.asOf}
        GROUP BY m.item_id, m.warehouse_id
        HAVING SUM(CASE WHEN m.direction = 'IN' THEN m.qty ELSE -m.qty END) > 0
      ), lastout AS (
        SELECT m.item_id, MAX(m.moved_at)::text AS last_at
        FROM stock_moves m WHERE m.direction = 'OUT'
        GROUP BY m.item_id
      )
      SELECT it.id AS "itemId", it.sku, it.name AS "itemName",
             SUM(o.qty)::text AS qty, SUM(o.value)::text AS value,
             lo.last_at AS "lastMovedAt",
             (DATE(${input.asOf}::date) - DATE(lo.last_at::date))::int AS "daysIdle"
      FROM onhand o
      JOIN items it ON it.id = o.item_id
      LEFT JOIN lastout lo ON lo.item_id = o.item_id
      WHERE lo.last_at IS NULL
         OR DATE(lo.last_at) < DATE(${input.asOf}::date) - ${input.noSaleDays}
      GROUP BY it.id, it.sku, it.name, lo.last_at
      ORDER BY SUM(o.value) DESC
      LIMIT 1000
    `);
    return rows.rows as unknown as SlowMovingRow[];
  }

  /**
   * The INV-010 tie for stock-on-hand/valuation reports: Σ on-hand value ==
   * INVENTORY-purpose account balance at the same as-of (exact decimals).
   */
  async inv010Tie(input: { asOf: string }): Promise<{ valuationSide: string; glSide: string }> {
    const valRows = await tenantTx().execute(sql`
      SELECT COALESCE(SUM(CASE WHEN m.direction = 'IN' THEN m.value_amount ELSE -m.value_amount END), 0)::text AS total
      FROM stock_moves m WHERE m.moved_at::date <= ${input.asOf}
    `);
    const inventoryAccounts = await journal.accountsForPurposes(["INVENTORY"]);
    let gl = "0.0000";
    if (inventoryAccounts.length > 0) {
      const balances = await journal.accountBalancesAt({ asOfDate: input.asOf, asOf: null });
      for (const row of balances) {
        if (inventoryAccounts.some((a) => a.accountId === row.accountId)) {
          gl = (Number(gl) + Number(row.signedBalance)).toFixed(4);
        }
      }
    }
    return {
      valuationSide: (valRows.rows[0] as { total: string }).total,
      glSide: gl,
    };
  }
}
