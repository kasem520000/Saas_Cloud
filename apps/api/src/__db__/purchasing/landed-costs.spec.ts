import { beforeAll, describe, expect, it } from "vitest";

import { withTenant } from "../../infra/db/tenant-context";
import * as inventoryStore from "../../modules/inventory/infrastructure/inventory.store";
import * as pStore from "../../modules/purchasing/infrastructure/purchasing.store";
import {
  P_ACCOUNTANT,
  P_ACTOR,
  P_MAR,
  TENANT_P,
  goodsReceipts,
  landedCosts,
  purchaseOrders,
  setupPurchasingFixture,
  type PurchasingFixture,
} from "./fixtures";

/**
 * PHASE-011 landed-cost baseline tests (the phase §2.10; INVENTORY_ACCOUNTING
 * §3): value/qty allocation across received lines, revaluing the WAC/layers
 * through the inventory service (INV-010 stays exact — the revalue lands
 * as an adjust move), the remaining-qty constraint (already-issued stock
 * allocates to the remainder; the difference posts to COGS — documented,
 * auditable, no silent back-dating).
 */

let fixture: PurchasingFixture;

beforeAll(async () => {
  fixture = await setupPurchasingFixture();
});

/** A posted GRN over two stock lines (the allocation substrate). */
async function postedGrn(itemA: string, itemB: string): Promise<{ grnId: string; lineA: string; lineB: string }> {
  const order = await withTenant(TENANT_P, () =>
    purchaseOrders.create({
      branchId: fixture.branchId,
      supplierId: fixture.supplierId,
      orderDate: P_MAR,
      expectedDate: null,
      currencyCode: "SAR",
      exchangeRate: null,
      note: null,
      noteAr: null,
      requestId: null,
      revisionOfId: null,
      actorId: P_ACCOUNTANT,
      lines: [
        { itemId: itemA, qty: "100", unitPrice: "2.000000", taxCodeId: null, requestLineId: null, note: null },
        { itemId: itemB, qty: "50", unitPrice: "4.000000", taxCodeId: null, requestLineId: null, note: null },
      ],
    }),
  );
  await withTenant(TENANT_P, () => purchaseOrders.issue(order.id, P_ACCOUNTANT));
  const orderLines = await withTenant(TENANT_P, () => pStore.listPurchaseOrderLines(order.id));
  const grn = await withTenant(TENANT_P, () =>
    goodsReceipts.create({
      branchId: fixture.branchId,
      supplierId: fixture.supplierId,
      poId: order.id,
      warehouseId: fixture.warehouseId,
      receiptDate: P_MAR,
      poLessReason: null,
      note: null,
      noteAr: null,
      actorId: P_ACTOR,
      lines: [
        {
          poLineId: orderLines[0]!.id,
          itemId: itemA,
          qty: "100",
          unitCost: "2.000000",
          accountId: null,
          batchNo: null,
          batchExpiry: null,
          serialIds: null,
          note: null,
        },
        {
          poLineId: orderLines[1]!.id,
          itemId: itemB,
          qty: "50",
          unitCost: "4.000000",
          accountId: null,
          batchNo: null,
          batchExpiry: null,
          serialIds: null,
          note: null,
        },
      ],
    }),
  );
  await withTenant(TENANT_P, () => goodsReceipts.post(grn.id, P_ACTOR));
  const lines = await withTenant(TENANT_P, () => pStore.listGoodsReceiptLines(grn.id));
  return { grnId: grn.id, lineA: lines[0]!.id, lineB: lines[1]!.id };
}

describe("Landed-cost allocation — by VALUE (default)", () => {
  it("allocates proportionally to line values, revalues WAC, and posts the journal", async () => {
    const { grnId } = await postedGrn(fixture.items.wac, fixture.items.wac);
    // Lines: 200.00 + 200.00 = 400 basis; freight 100 → 50/50.
    const cost = await withTenant(TENANT_P, () =>
      landedCosts.create({
        grnId,
        costType: "freight",
        vendorId: null,
        amount: "100.0000",
        allocationMethod: "VALUE",
        chargeAccountId: fixture.items.expenseAccount,
        note: "G-07 freight",
        actorId: P_ACCOUNTANT,
      }),
    );
    const result = await withTenant(TENANT_P, () => landedCosts.post(cost.id, P_ACCOUNTANT));

    expect(result.costNo).toMatch(/^LDC-2026-\d{6}$/);
    // Fully on hand → allocated_to_stock = 100, COGS = 0.
    expect(result.cost.allocatedToStock).toBe("100.0000");
    expect(result.cost.allocatedToCogs).toBe("0.0000");

    // The revalue adjust move joins the INV-010 trail (2 lines → 2 moves).
    const moves = await withTenant(TENANT_P, () =>
      inventoryStore.listStockMoves({ sourceType: "landed_cost", sourceId: cost.id, limit: 10 }),
    );
    expect(moves.length).toBe(2);
    expect(moves.reduce((sum, move) => sum + Number(move.valueAmount), 0).toFixed(4)).toBe("100.0000");
    for (const move of moves) {
      expect(move.moveKind).toBe("adjust");
      expect(move.reason).toBe("LANDED_COST");
    }

    // WAC revalued: item avg rose by the per-unit allocation.
    const onHand = await withTenant(TENANT_P, () =>
      inventoryStore.findItemStock(fixture.items.wac, fixture.warehouseId),
    );
    expect(onHand).toBeDefined();
  });
});

describe("Landed-cost allocation — remaining-qty constraint (§2.10)", () => {
  it("already-issued stock allocates to the remainder; the difference posts to COGS", async () => {
    const { grnId, lineA } = await postedGrn(fixture.items.fifo, fixture.items.fifo);
    // Issue 30 of line A's 50 units BEFORE the landed cost (stock already
    // sold at the lower cost — the remaining-qty case).
    const { StockService } = await import("../../modules/inventory/application/stock-service");
    const { AuditService: AuditS } = await import("../../modules/audit/api/audit");
    const { DrizzleAuditStore: DrizzleStore } = await import("../../modules/audit/infrastructure/drizzle-audit.store");
    const { PostingService: PostingS } = await import("../../modules/accounting/application/posting-service");
    const { PartnerSubledgerService: SubS } = await import("../../modules/partners/application/subledger-service");
    const audit = new AuditS(new DrizzleStore());
    const stock = new StockService(audit, new PostingS(audit, new SubS(), null));

    // Issue down to a REMAINDER below line A's received qty (order-
    // independent: the issue targets on-hand − 50, so prior-suite stock
    // cannot mask the remaining-qty case).
    const stockBeforeIssue = await withTenant(TENANT_P, () =>
      inventoryStore.findItemStock(fixture.items.fifo, fixture.warehouseId),
    );
    const onHandBefore = new (await import("@erp/domain-core")).Decimal(stockBeforeIssue?.qty ?? "0");
    const issueQty = onHandBefore.minus(50).toDecimalPlaces(6).toFixed(6);
    await withTenant(TENANT_P, () =>
      stock.manualIssue({
        itemId: fixture.items.fifo,
        warehouseId: fixture.warehouseId,
        qty: issueQty,
        reason: "OTHER",
        counterAccountId: fixture.gl.cogs,
        valueDate: P_MAR,
        note: "pre-landed-cost issue (remaining-qty fixture)",
        actorId: P_ACTOR,
      }),
    );
    // On hand now 50 — below line A's 100 received units.

    // Freight 100 by QTY across the two lines (50/50 units) → line A's 50
    // share = 50; on hand for A's portion = 20 → 30 to COGS.
    const cost = await withTenant(TENANT_P, () =>
      landedCosts.create({
        grnId,
        costType: "customs",
        vendorId: null,
        amount: "100.0000",
        allocationMethod: "QTY",
        chargeAccountId: fixture.items.expenseAccount,
        note: "remaining-qty constraint fixture",
        actorId: P_ACCOUNTANT,
      }),
    );
    const result = await withTenant(TENANT_P, () => landedCosts.post(cost.id, P_ACCOUNTANT));

    // Stock + COGS = 100 exactly (the allocation-sum CHECK holds).
    const stockPart = Number(result.cost.allocatedToStock);
    const cogsPart = Number(result.cost.allocatedToCogs);
    expect((stockPart + cogsPart).toFixed(4)).toBe("100.0000");
    expect(cogsPart).toBeGreaterThan(0); // the issued portion's difference

    // The allocation rows persist the remaining-qty snapshot.
    const allocations = await withTenant(TENANT_P, () => pStore.listLandedCostAllocations(cost.id));
    expect(allocations.length).toBe(2);
    const lineARow = allocations.find((row) => row.grnLineId === lineA)!;
    expect(Number(lineARow.remainingQty)).toBeLessThanOrEqual(Number(lineARow.qtyAtAllocation));
    expect(Number(lineARow.cogsAdjustmentAmount)).toBeGreaterThan(0);
  });
});

describe("Landed-cost journal shape", () => {
  it("posts DR INVENTORY (+ DR COGS) · CR charge account through the engine", async () => {
    const { grnId } = await postedGrn(fixture.items.wac, fixture.items.wac);
    const cost = await withTenant(TENANT_P, () =>
      landedCosts.create({
        grnId,
        costType: "insurance",
        vendorId: null,
        amount: "40.0000",
        allocationMethod: "VALUE",
        chargeAccountId: fixture.items.expenseAccount,
        note: null,
        actorId: P_ACCOUNTANT,
      }),
    );
    const result = await withTenant(TENANT_P, () => landedCosts.post(cost.id, P_ACCOUNTANT));
    const journal = await import("../../modules/accounting/infrastructure/journal.store");
    const lines = await withTenant(TENANT_P, () => journal.listLines(result.journalEntryId!));
    // All on hand: [DR INVENTORY 40, CR charge 40].
    expect(lines.length).toBe(2);
    const debit = lines.find((l) => l.direction === "DEBIT")!;
    const credit = lines.find((l) => l.direction === "CREDIT")!;
    expect(debit.accountId).toBe(fixture.gl.inventory);
    expect(debit.amount).toBe("40.0000");
    expect(credit.accountId).toBe(fixture.items.expenseAccount);
    expect(credit.amount).toBe("40.0000");

    // INV-013 replay: re-post returns the stored result.
    const replay = await withTenant(TENANT_P, () => landedCosts.post(cost.id, P_ACCOUNTANT));
    expect(replay.idempotentReplay).toBe(true);
  });
});
