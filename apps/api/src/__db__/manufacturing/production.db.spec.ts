import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { ensureTestDb, seedTenants, superuserClient } from "../test-db";
import { requireTenantContext, withTenant } from "../../infra/db/tenant-context";
import { AuditService } from "../../modules/audit/api/audit";
import { DrizzleAuditStore } from "../../modules/audit/infrastructure/drizzle-audit.store";
import { PostingService } from "../../modules/accounting/application/posting-service";
import { PeriodService } from "../../modules/accounting/application/period-service";
import { NumberingService } from "../../modules/accounting/application/numbering-service";
import { PartnerSubledgerService } from "../../modules/partners/application/subledger-service";
import { ProductionOrderService } from "../../modules/manufacturing/application/production-order.service";
import { QcService } from "../../modules/manufacturing/application/qc.service";
import { ManufacturingQueriesService } from "../../modules/manufacturing/application/manufacturing-queries";
import { explodeBom } from "../../modules/manufacturing/domain/bom";

/**
 * PHASE-018 golden db evidence (real PG16, app-role services — every journal
 * through PostingService, every stock move through the movement core):
 * consumption (DR WIP · CR INVENTORY at issue cost), scrap (DR
 * PRODUCTION_SCRAP · CR WIP with reason), completion (DR FG · CR WIP at
 * production cost, WIP nets to zero per INV-010), lifecycle rules
 * (cancel-after-consumption rejected, idempotent replay INV-013), BOM
 * explosion at release.
 */

const TENANT_M = "99999999-9999-9999-9999-999999999999";
const M_ACTOR = "dddddddd-0000-4000-8000-0000000000d1";

const audit = new AuditService(new DrizzleAuditStore());
const posting = new PostingService(audit, new PartnerSubledgerService(), null);
const numbering = new NumberingService(audit);
const orders = new ProductionOrderService(audit, posting, numbering);
const qc = new QcService(audit);
const mfgQueries = new ManufacturingQueriesService();
const periods = new PeriodService(audit);

/** Raw SQL on the AMBIENT tenant tx (same connection as the services). */
async function txQuery<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const ctx = requireTenantContext();
  if (ctx.tx === undefined) throw new Error("no ambient tx");
  const inlined = text.replace(/\$\d+/g, (m) => {
    const v = params[Number(m.slice(1)) - 1];
    return typeof v === "string" ? "'" + v.replace(/'/g, "''") + "'" : String(v);
  });
  const res = await ctx.tx.execute(sql.raw(inlined));
  return res.rows as T[];
}

let branchId = "";
let warehouseId = "";
let flourId = "";
let breadId = "";
let flourBatchId = "";
let bomVersionId = "";
let orderId = "";

beforeAll(async () => {
  ensureTestDb();
  const superuser = await superuserClient();
  await seedTenants(superuser as never);
  await superuser.query(
    `INSERT INTO tenants (id, name, name_ar, base_currency, country_code, timezone) VALUES
       ($1, 'Tenant M (manufacturing)', 'المستأجر م', 'SAR', 'SA', 'Asia/Riyadh')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_M],
  );
  await superuser.query(
    `INSERT INTO users (id, email, full_name, password_hash, status) VALUES
       ($1, 'mfg-actor@fixture.test', 'Mfg Actor', 'x', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`,
    [M_ACTOR],
  );
  await superuser.end();

  await withTenant(TENANT_M, async () => {
    const tenancyStore = await import("../../modules/tenancy/infrastructure/tenancy.store");
    const accountingStore = await import("../../modules/accounting/infrastructure/accounting.store");
    const itemsStore = await import("../../modules/items/infrastructure/items.store");
    await tenancyStore.seedMasterDataBasics();
    await tenancyStore.provisionCoaTemplate();

    // WIP + PRODUCTION_SCRAP accounts (mapped before any production posts —
    // PURPOSE_NOT_MAPPED fails closed otherwise).
    const parentAsset = await accountingStore.findAccountByCode("1100");
    const parentExpense = await accountingStore.findAccountByCode("5000");
    const wipAccount = await accountingStore.insertAccount({
      code: "1160",
      name: "Work in progress",
      nameAr: "أعمال تحت التشغيل",
      type: "ASSET",
      parentId: parentAsset?.id ?? null,
      currencyCode: null,
      isPostable: true,
    });
    const scrapAccount = await accountingStore.insertAccount({
      code: "5250",
      name: "Production scrap",
      nameAr: "هالك الإنتاج",
      type: "EXPENSE",
      parentId: parentExpense?.id ?? null,
      currencyCode: null,
      isPostable: true,
    });
    const invAccount = await accountingStore.findAccountByCode("1140");
    const mapPurpose = async (purposeKey: string, accountId: string) => {
      if ((await accountingStore.findActivePurpose(purposeKey)) === undefined) {
        await tenancyStore.insertAccountPurpose({ purposeKey, accountId, activeFrom: "2026-01-01" });
      }
    };
    await mapPurpose("INVENTORY", invAccount!.id);
    await mapPurpose("WIP", wipAccount.id);
    await mapPurpose("PRODUCTION_SCRAP", scrapAccount.id);

    await periods.createYear(M_ACTOR, { name: "FY2026", startDate: "2026-01-01", endDate: "2026-12-31" });

    const branch = await txQuery<{ id: string }>(
      `INSERT INTO branches (id, tenant_id, code, name, name_ar, address)
       VALUES ('aaaaaaaa-0000-4000-8000-0000000000b0', erp.current_tenant_id(), 'MAIN', 'Main', 'الرئيسي', NULL)
       ON CONFLICT DO NOTHING RETURNING id`,
    );
    branchId =
      branch[0]?.id ??
      (await txQuery<{ id: string }>(`SELECT id FROM branches WHERE tenant_id = erp.current_tenant_id() AND code = 'MAIN'`))[0]?.id ??
      "";
    const wh = await txQuery<{ id: string }>(
      `INSERT INTO warehouses (id, tenant_id, branch_id, code, name, name_ar, is_active)
       VALUES ('aaaaaa00-0000-4000-8000-00000000000a', erp.current_tenant_id(), '${branchId}', 'M-WH', 'Materials+FG', 'مواد ومنتج نهائي', true)
       ON CONFLICT DO NOTHING RETURNING id`,
    );
    warehouseId =
      wh[0]?.id ??
      (await txQuery<{ id: string }>(`SELECT id FROM warehouses WHERE tenant_id = erp.current_tenant_id() AND code = 'M-WH'`))[0]?.id ??
      "";

    const uoms = await itemsStore.listUoms();
    const pcs = uoms.find((u) => u.code === "PCS") ?? uoms[0]!;
    const mkItem = async (sku: string, name: string, trackBatch: boolean) => {
      const existing = await itemsStore.findItemBySku(sku);
      if (existing !== undefined) return existing.id;
      const row = await itemsStore.insertItem({
        sku,
        name,
        nameAr: null,
        kind: "STOCK",
        uomId: pcs.id,
        categoryId: null,
        taxCodeId: null,
        costingMethod: "WAC",
        trackBatch,
        trackSerial: false,
        trackImei: false,
        hasExpiry: trackBatch,
        reorderLevel: null,
        reorderQty: null,
        basePrice: null,
      });
      return row.id;
    };
    flourId = await mkItem("M-FLOUR", "Flour", true);
    breadId = await mkItem("M-BREAD", "Bread", true);

    // Opening flour stock: batch FL-001, 1000 kg @ 2.5000.
    const batch = await txQuery<{ id: string }>(
      `INSERT INTO item_batches (id, tenant_id, item_id, batch_no, status)
       VALUES ('aaaaaaaa-0000-4000-8000-0000000000a1', erp.current_tenant_id(), '${flourId}', 'FL-001', 'ACTIVE')
       ON CONFLICT DO NOTHING RETURNING id`,
    );
    flourBatchId =
      batch[0]?.id ??
      (await txQuery<{ id: string }>(`SELECT id FROM item_batches WHERE tenant_id = erp.current_tenant_id() AND batch_no = 'FL-001'`))[0]?.id ??
      "";
    await txQuery(
      `INSERT INTO stock_layers (id, tenant_id, item_id, warehouse_id, remaining_qty, unit_cost, received_at)
       VALUES ('aaaaaaaa-0000-4000-8000-0000000000a2', erp.current_tenant_id(), '${flourId}', '${warehouseId}', 1000, 2.5, '2026-01-05')
       ON CONFLICT DO NOTHING`,
    );
    await txQuery(
      `INSERT INTO stock_moves (id, tenant_id, item_id, warehouse_id, direction, move_kind, qty, unit_cost, value_amount, batch_id, source_type, source_id, moved_at)
       VALUES ('aaaaaaaa-0000-4000-8000-0000000000a4', erp.current_tenant_id(), '${flourId}', '${warehouseId}', 'IN', 'receipt', 1000, 2.5, 2500, '${flourBatchId}', 'opening_balance_doc', 'aaaaaaaa-0000-4000-8000-0000000000a5', '2026-01-05')
       ON CONFLICT DO NOTHING`,
    );
    await txQuery(
      `INSERT INTO item_stock (id, tenant_id, item_id, warehouse_id, qty, avg_cost)
       VALUES ('aaaaaaaa-0000-4000-8000-0000000000a3', erp.current_tenant_id(), '${flourId}', '${warehouseId}', 1000, 2.5)
       ON CONFLICT DO NOTHING`,
    );

    // BOM: bread ← 0.5 kg flour per unit, 2% scrap; yield 950 per execution.
    const bom = await txQuery<{ id: string }>(
      `INSERT INTO bills_of_materials (id, tenant_id, item_id, name, current_version)
       VALUES ('aaaaaaaa-0000-4000-8000-0000000000b1', erp.current_tenant_id(), '${breadId}', 'Bread BOM', 1)
       ON CONFLICT DO NOTHING RETURNING id`,
    );
    const bomId =
      bom[0]?.id ??
      (await txQuery<{ id: string }>(`SELECT id FROM bills_of_materials WHERE tenant_id = erp.current_tenant_id() AND item_id = '${breadId}'`))[0]?.id ??
      "";
    const ver = await txQuery<{ id: string }>(
      `INSERT INTO bom_versions (id, tenant_id, bom_id, version, effective_from, yield_qty)
       VALUES ('aaaaaaaa-0000-4000-8000-0000000000b2', erp.current_tenant_id(), '${bomId}', 1, '2026-01-01', 950)
       ON CONFLICT DO NOTHING RETURNING id`,
    );
    bomVersionId =
      ver[0]?.id ??
      (await txQuery<{ id: string }>(`SELECT id FROM bom_versions WHERE tenant_id = erp.current_tenant_id() AND bom_id = '${bomId}' AND version = 1`))[0]?.id ??
      "";
    await txQuery(
      `INSERT INTO bom_lines (id, tenant_id, bom_version_id, component_item_id, qty_per_output, scrap_factor_pct)
       VALUES ('aaaaaaaa-0000-4000-8000-0000000000b3', erp.current_tenant_id(), '${bomVersionId}', '${flourId}', 0.5, 2)
       ON CONFLICT DO NOTHING`,
    );

    // Production order: 1000 bread planned.
    const po = await txQuery<{ id: string }>(
      `INSERT INTO production_orders
         (id, tenant_id, branch_id, order_no, bom_version_id, fg_item_id, materials_warehouse_id, fg_warehouse_id,
          planned_qty, status, labor_rate, overhead_rate)
       VALUES ('aaaaaaaa-0000-4000-8000-0000000000c1', erp.current_tenant_id(), '${branchId}', 'DRAFT-TEMP', '${bomVersionId}', '${breadId}', '${warehouseId}', '${warehouseId}',
               1000, 'DRAFT', 0.5, 0.25)
       ON CONFLICT DO NOTHING RETURNING id`,
    );
    orderId =
      po[0]?.id ??
      (await txQuery<{ id: string }>(`SELECT id FROM production_orders WHERE tenant_id = erp.current_tenant_id() LIMIT 1`))[0]?.id ??
      "";
  });
}, 120_000);

describe("PHASE-018 production golden (real PG)", () => {
  it("BOM explosion at the planned quantity matches the domain math", async () => {
    await withTenant(TENANT_M, async () => {
      const rows = await txQuery<{ itemId: string; qtyPer: string; scrap: string; yield: string }>(
        `SELECT component_item_id AS "itemId", qty_per_output::text AS "qtyPer", scrap_factor_pct::text AS scrap,
                yield_qty::text AS yield FROM bom_lines bl JOIN bom_versions bv ON bv.id = bl.bom_version_id
         WHERE bl.tenant_id = erp.current_tenant_id() AND bv.version = 1`,
      );
      const r = rows[0] as unknown as { itemId: string; qtyPer: string; scrap: string; yield: string };
      const exploded = explodeBom(
        [{ componentItemId: r.itemId, qtyPerOutput: r.qtyPer, scrapFactorPct: r.scrap }],
        "1000",
        r.yield,
      );
      // 0.5 × (1000/950) × 1.02 = 0.536843 (6-dp ceiling)
      expect(exploded[0]?.grossQty).toBe("0.536843");
    });
  });

  it("release reserves PRD-2026-00001 and moves DRAFT→RELEASED", async () => {
    await withTenant(TENANT_M, async () => {
      const { orderNo } = await orders.release({ orderId, actorId: M_ACTOR, year: "2026" });
      expect(orderNo).toBe("PRD-2026-00001");
      const row = await txQuery(`SELECT status, order_no FROM production_orders WHERE id = '${orderId}'`);
      expect(row[0]).toMatchObject({ status: "RELEASED", order_no: "PRD-2026-00001" });
    });
  });

  it("consume 500 kg flour posts DR WIP · CR INVENTORY at issue cost 2.5000 (1250.0000)", async () => {
    await withTenant(TENANT_M, async () => {
      const res = await orders.consume({
        orderId,
        actorId: M_ACTOR,
        itemId: flourId,
        qty: "500",
        batchId: flourBatchId,
        entryDate: "2026-11-02",
      });
      expect(res.valueAmount).toBe("1250.0000");
      const lines = await txQuery<{ direction: string; amount: string; purpose: string }>(
        `SELECT l.direction, l.amount::text AS amount, p.purpose_key AS purpose
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.journal_entry_id
         LEFT JOIN account_purposes p ON p.account_id = l.account_id AND p.tenant_id = l.tenant_id
         WHERE e.id = '${res.journalEntryId}' ORDER BY l.line_no`,
      );
      const got = lines.map((r) => `${r.direction}:${r.purpose}:${r.amount}`);
      expect(got).toEqual(["DEBIT:WIP:1250.0000", "CREDIT:INVENTORY:1250.0000"]);
      // genealogy upstream edge recorded
      const cons = await txQuery(`SELECT qty::text AS qty, batch_id FROM production_consumptions WHERE production_order_id = '${orderId}'`);
      expect(cons[0]).toMatchObject({ qty: "500.000000", batch_id: flourBatchId });
    });
  });

  it("scrap posts DR PRODUCTION_SCRAP · CR WIP with a reason code; reason required", async () => {
    await withTenant(TENANT_M, async () => {
      await expect(
        orders.scrap({ orderId, actorId: M_ACTOR, qty: "10", unitCost: "1.0000", reasonCode: "", entryDate: "2026-11-02" }),
      ).rejects.toThrow(/reason/i);
      const res = await orders.scrap({
        orderId,
        actorId: M_ACTOR,
        qty: "10",
        unitCost: "1.0000",
        reasonCode: "BURNT",
        entryDate: "2026-11-02",
      });
      expect(res.amount).toBe("10.0000");
      const lines = await txQuery<{ direction: string; amount: string; purpose: string }>(
        `SELECT l.direction, l.amount::text AS amount, p.purpose_key AS purpose
         FROM journal_lines l JOIN journal_entries e ON e.id = l.journal_entry_id
         LEFT JOIN account_purposes p ON p.account_id = l.account_id AND p.tenant_id = l.tenant_id
         WHERE e.id = '${res.journalEntryId}' ORDER BY l.line_no`,
      );
      const got = lines.map((r) => `${r.direction}:${r.purpose}:${r.amount}`);
      expect(got).toEqual(["DEBIT:PRODUCTION_SCRAP:10.0000", "CREDIT:WIP:10.0000"]);
    });
  });

  it("complete receives the FG batch (expiry = date + shelf life) and posts DR FG · CR WIP at production cost; WIP nets to zero (INV-010)", async () => {
    await withTenant(TENANT_M, async () => {
      const res = await orders.complete({
        orderId,
        actorId: M_ACTOR,
        actualQty: "1000",
        entryDate: "2026-11-02",
        batchNo: "BR-001",
        shelfLifeDays: 3,
      });
      // materials 1250 + labor 0.5×1000=500 + overhead 0.25×1000=250 → 2000
      expect(res.cost.totalCost).toBe("2000.0000");
      expect(res.cost.unitCost).toBe("2.0000");
      const lines = await txQuery<{ direction: string; amount: string; purpose: string }>(
        `SELECT l.direction, l.amount::text AS amount, p.purpose_key AS purpose
         FROM journal_lines l JOIN journal_entries e ON e.id = l.journal_entry_id
         LEFT JOIN account_purposes p ON p.account_id = l.account_id AND p.tenant_id = l.tenant_id
         WHERE e.id = '${res.journalEntryId}' ORDER BY l.line_no`,
      );
      const batch = await txQuery(`SELECT batch_no, expiry_date, status FROM item_batches WHERE tenant_id = erp.current_tenant_id() AND batch_no = 'BR-001'`);
      const orderRow = await txQuery(`SELECT status, actual_qty::text AS qty FROM production_orders WHERE id = '${orderId}'`);
      const got = lines.map((r) => `${r.direction}:${r.purpose}:${r.amount}`);
      expect(got).toEqual(["DEBIT:INVENTORY:2000.0000", "CREDIT:WIP:2000.0000"]);
      expect(batch[0]).toMatchObject({ batch_no: "BR-001", expiry_date: "2026-11-05", status: "ACTIVE" });
      expect(orderRow[0]).toMatchObject({ status: "COMPLETED", qty: "1000.000000" });
      // INV-010: a COMPLETED order's WIP balance is exactly zero.
      expect(await orders.wipBalance(orderId)).toBe("0");
    });
  });

  it("completion replay is idempotent (INV-013): same entry, no second FG receipt", async () => {
    await withTenant(TENANT_M, async () => {
      const first = await txQuery<{ id: string }>(
        `SELECT id FROM journal_entries WHERE source_type = 'production_order' AND source_id = '${orderId}' AND operation = 'complete'`,
      );
      const again = await orders.complete({
        orderId,
        actorId: M_ACTOR,
        actualQty: "1000",
        entryDate: "2026-11-02",
        batchNo: "BR-001",
        shelfLifeDays: 3,
      });
      expect(again.journalEntryId).toBe(first[0]?.id);
      const count = await txQuery<{ n: number }>(
        `SELECT count(*)::int AS n FROM journal_entries WHERE source_type = 'production_order' AND source_id = '${orderId}' AND operation = 'complete'`,
      );
      const batches = await txQuery<{ n: number }>(
        `SELECT count(*)::int AS n FROM item_batches WHERE tenant_id = erp.current_tenant_id() AND batch_no = 'BR-001'`,
      );
      expect(count[0]?.n).toBe(1);
      expect(batches[0]?.n).toBe(1);
    });
  });

  it("cancel after consumption is rejected (DOCUMENT_LIFECYCLE §3)", async () => {
    await withTenant(TENANT_M, async () => {
      await expect(orders.cancel({ orderId, actorId: M_ACTOR })).rejects.toThrow(/cancel/i);
    });
  });

  it("QC gate: FAIL quarantines the FG batch (invisible to FEFO); PASS releases with no journal", async () => {
    await withTenant(TENANT_M, async () => {
      const batch = await txQuery<{ id: string }>(
        `SELECT id FROM item_batches WHERE tenant_id = erp.current_tenant_id() AND batch_no = 'BR-001'`,
      );
      const batchId = batch[0]?.id ?? "";
      const before = await txQuery<{ n: number }>(`SELECT count(*)::int AS n FROM journal_entries WHERE source_type = 'production_scrap'`);
      await qc.recordInspection({
        inspectionNo: "QC-0001",
        targetType: "PRODUCTION_ORDER",
        targetId: orderId,
        batchId,
        result: "FAIL",
        disposition: "SCRAP",
        actorId: M_ACTOR,
      });
      const status = await txQuery<{ status: string }>(`SELECT status FROM item_batches WHERE id = '${batchId}'`);
      expect(status[0]?.status).toBe("QUARANTINED");
      // FEFO excludes the quarantined batch (not sellable)
      const fefo = await txQuery<{ batchNo: string }>(
        `SELECT b.batch_no AS "batchNo" FROM item_batches b
         LEFT JOIN (SELECT batch_id, SUM(CASE WHEN direction = 'IN' THEN qty ELSE -qty END) AS on_hand
                    FROM stock_moves WHERE batch_id IS NOT NULL GROUP BY batch_id) o ON o.batch_id = b.id
         WHERE b.item_id = '${breadId}' AND b.status = 'ACTIVE' AND COALESCE(o.on_hand, '0') > 0`,
      );
      expect(fefo.map((r) => r.batchNo)).not.toContain("BR-001");
      // PASS releases quarantine, no journal posted
      await qc.recordInspection({
        inspectionNo: "QC-0002",
        targetType: "PRODUCTION_ORDER",
        targetId: orderId,
        batchId,
        result: "PASS",
        disposition: "ACCEPT",
        actorId: M_ACTOR,
      });
      await qc.releaseQuarantine({ batchId, actorId: M_ACTOR });
      const after = await txQuery<{ status: string }>(`SELECT status FROM item_batches WHERE id = '${batchId}'`);
      expect(after[0]?.status).toBe("ACTIVE");
      const afterJ = await txQuery<{ n: number }>(`SELECT count(*)::int AS n FROM journal_entries WHERE source_type = 'production_scrap'`);
      expect(afterJ[0]?.n).toBe(before[0]?.n);
    });
  });

  it("genealogy: upstream trace of the FG batch reaches the flour batch (read-only)", async () => {
    await withTenant(TENANT_M, async () => {
      const fg = await txQuery<{ id: string }>(`SELECT fg_batch_id AS id FROM production_orders WHERE id = '${orderId}'`);
      const up = await mfgQueries.genealogyUpstream(fg[0]?.id ?? "");
      expect(up.length).toBeGreaterThan(0);
      expect(up[0]?.values.batchNo).toBe("FL-001");
      // downstream: no sales yet → empty, not an error
      const down = await mfgQueries.genealogyDownstream(fg[0]?.id ?? "");
      expect(down).toEqual([]);
    });
  });

  it("a fresh DRAFT order can be cancelled", async () => {
    await withTenant(TENANT_M, async () => {
      const po = await txQuery<{ id: string }>(
        `INSERT INTO production_orders
           (id, tenant_id, branch_id, order_no, bom_version_id, fg_item_id, materials_warehouse_id, fg_warehouse_id, planned_qty, status)
         VALUES ('aaaaaaaa-0000-4000-8000-0000000000d9', erp.current_tenant_id(), '${branchId}', 'DRAFT-TEMP-2', '${bomVersionId}', '${breadId}', '${warehouseId}', '${warehouseId}', 10, 'DRAFT')
         ON CONFLICT DO NOTHING RETURNING id`,
      );
      const id = po[0]?.id ?? "";
      await orders.cancel({ orderId: id, actorId: M_ACTOR });
      const row = await txQuery<{ status: string }>(`SELECT status FROM production_orders WHERE id = '${id}'`);
      expect(row[0]?.status).toBe("CANCELLED");
    });
  });
});
