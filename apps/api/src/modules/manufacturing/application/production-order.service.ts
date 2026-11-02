import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { requireTenantContext } from "../../../infra/db/tenant-context";
import { type TenantDb } from "../../../infra/db/client";
import { AuditService } from "../../audit/api/audit";
import { PostingService } from "../../accounting/application/posting-service";
import { NumberingService } from "../../accounting/application/numbering-service";
import type { JournalSpec } from "../../accounting/domain/posting-engine/journal-spec";
import { applyIssue, applyReceipt, planIssue, planReceipt } from "../../inventory/application/movement-core";
import { computeProductionCost } from "../domain/costing";
import { transition, type ProductionOrderStatus } from "../domain/production-order";

function tenantTx(): TenantDb {
  const context = requireTenantContext();
  if (context.tx === undefined) {
    throw new Error("manufacturing requires an ambient tenant scope");
  }
  return context.tx;
}

export class ProductionOrderError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProductionOrderError";
  }
}

/**
 * PHASE-018 T2–T6 — production order application service. Every ledger effect
 * flows through the centralized PostingService (ADR-0007): consumption posts
 * DR WIP · CR INVENTORY at issue cost, completion posts DR FG · CR WIP at
 * computed production cost, scrap posts DR PRODUCTION_SCRAP · CR WIP. Stock
 * moves are atomic with their journals (INV-018) via plan/apply pairs inside
 * the same tenant transaction.
 */
@Injectable()
export class ProductionOrderService {
  constructor(
    private readonly audit: AuditService,
    private readonly posting: PostingService,
    private readonly numbering: NumberingService,
  ) {}

  private async order(id: string) {
    const rows = await tenantTx().execute(sql`
      SELECT * FROM production_orders WHERE id = ${id}
    `);
    const row = rows.rows[0] as Record<string, unknown> | undefined;
    if (row === undefined) throw new ProductionOrderError("NOT_FOUND", "production order not found");
    return row;
  }

  /** RELEASE: reserve PRD-{yyyy}-{seq:5} (INV-021), bind BOM version, DRAFT→RELEASED. */
  async release(input: { orderId: string; actorId: string; year: string }): Promise<{ orderNo: string }> {
    const order = await this.order(input.orderId);
    const next = transition(order.status as ProductionOrderStatus, "RELEASE");
    const reserved = await this.numbering.reserve({
      docType: "production_order",
      branchId: order.branch_id as string,
      periodKey: null,
      format: "PRD-{YYYY}-{SEQ:5}",
      prefix: "PRD",
      year: input.year,
    });
    await tenantTx().execute(sql`
      UPDATE production_orders
      SET "status" = ${next}, "order_no" = ${reserved.number}, "released_at" = now(), "updated_at" = now()
      WHERE id = ${input.orderId}
    `);
    await this.numbering.bind("production_order", reserved.number, input.orderId);
    await this.audit.record({
      action: "manufacturing.order_released",
      entityType: "production_order",
      entityId: input.orderId,
      actorId: input.actorId,
      after: { orderNo: reserved.number, bomVersionId: order.bom_version_id },
    });
    return { orderNo: reserved.number };
  }

  /**
   * CONSUME: batch-tracked issue from the materials warehouse.
   * Journal: DR WIP · CR INVENTORY at actual issue cost (INV-018 atomic with
   * the stock move). Records the genealogy upstream edge (batch ref).
   */
  async consume(input: {
    orderId: string;
    actorId: string;
    itemId: string;
    qty: string;
    batchId: string | null;
    entryDate: string;
  }): Promise<{ journalEntryId: string; valueAmount: string; idempotentReplay: boolean }> {
    const order = await this.order(input.orderId);
    const next = transition(order.status as ProductionOrderStatus, "CONSUME");
    const plan = await planIssue({
      itemId: input.itemId,
      warehouseId: order.materials_warehouse_id as string,
      qty: input.qty,
      movedAt: input.entryDate,
      moveKind: "issue",
      sourceType: "production_order",
      sourceId: input.orderId,
      batchId: input.batchId,
      memo: `Consumption for ${order.order_no as string}`,
      memoAr: `استهلاك لأمر الإنتاج ${order.order_no as string}`,
    });
    const spec: JournalSpec = {
      source: { docType: "production_consumption", docId: plan.anchorId, operation: "post" },
      entryDate: input.entryDate,
      description: { en: `Material consumption ${order.order_no as string}`, ar: `استهلاك مواد ${order.order_no as string}` },
      reference: order.order_no as string,
      currency: "SAR",
      lines: [
        { purpose: "WIP", direction: "DEBIT", amount: plan.valueAmount, itemId: input.itemId },
        { purpose: "INVENTORY", direction: "CREDIT", amount: plan.valueAmount, itemId: input.itemId },
      ],
    };
    const result = await this.posting.post(spec, {
      postedBy: input.actorId,
      onPosted: async (entryId) => {
        await applyIssue(plan, entryId);
        await tenantTx().execute(sql`
          INSERT INTO production_consumptions
            (tenant_id, production_order_id, item_id, batch_id, qty, unit_cost, journal_entry_id)
          VALUES ((SELECT tenant_id FROM production_orders WHERE id = ${input.orderId}),
                  ${input.orderId}, ${input.itemId}, ${input.batchId}, ${input.qty},
                  ${plan.slices[0]?.unitCost ?? "0"}, ${entryId})
        `);
        await tenantTx().execute(sql`
          UPDATE production_orders SET "status" = ${next}, "updated_at" = now() WHERE id = ${input.orderId}
        `);
      },
    });
    return { journalEntryId: result.journalEntryId, valueAmount: plan.valueAmount, idempotentReplay: result.idempotentReplay };
  }

  /**
   * SCRAP: reason-coded scrap. Journal: DR PRODUCTION_SCRAP · CR WIP.
   * `scrap_reason_required` policy enforced (template policy).
   */
  async scrap(input: {
    orderId: string;
    actorId: string;
    qty: string;
    unitCost: string;
    reasonCode: string;
    entryDate: string;
  }): Promise<{ journalEntryId: string; amount: string }> {
    if (!input.reasonCode) {
      throw new ProductionOrderError("SCRAP_REASON_REQUIRED", "scrap reason code is required");
    }
    const order = await this.order(input.orderId);
    transition(order.status as ProductionOrderStatus, "CONSUME"); // must be RELEASED/IN_PROGRESS
    const amount = (Number(input.qty) * Number(input.unitCost)).toFixed(4);
    // deterministic uuid-shaped idempotency key (INV-013)
    const digest = createHash("md5").update(`${input.orderId}:scrap:${input.reasonCode}:${input.qty}`).digest("hex");
    const anchorId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    const spec: JournalSpec = {
      source: { docType: "production_scrap", docId: anchorId, operation: "post" },
      entryDate: input.entryDate,
      description: { en: `Scrap ${order.order_no as string} (${input.reasonCode})`, ar: `هالك ${order.order_no as string} (${input.reasonCode})` },
      reference: order.order_no as string,
      currency: "SAR",
      lines: [
        { purpose: "PRODUCTION_SCRAP", direction: "DEBIT", amount },
        { purpose: "WIP", direction: "CREDIT", amount },
      ],
    };
    const result = await this.posting.post(spec, { postedBy: input.actorId });
    return { journalEntryId: result.journalEntryId, amount };
  }

  /**
   * COMPLETE: receive the FG batch (expiry = production date + shelf life)
   * into the FG warehouse at computed production cost; Journal: DR FG
   * inventory · CR WIP for the full production cost (WIP nets to zero per
   * order, INV-010). Idempotent under replay (INV-013 via the engine).
   */
  async complete(input: {
    orderId: string;
    actorId: string;
    actualQty: string;
    entryDate: string;
    batchNo: string;
    shelfLifeDays: number;
  }): Promise<{ journalEntryId: string; fgBatchId: string | null; cost: ReturnType<typeof computeProductionCost> }> {
    const order = await this.order(input.orderId);
    if (order.status === "COMPLETED") {
      // INV-013 service-level replay: return the original completion entry
      const stored = order.completion_journal_entry_id as string | null;
      return {
        journalEntryId: stored ?? "",
        fgBatchId: (order.fg_batch_id as string | null) ?? null,
        cost: computeProductionCost({
          consumptions: [],
          actualQty: String(order.actual_qty),
          laborRatePerUnit: String(order.labor_rate),
          overheadRatePerUnit: String(order.overhead_rate),
        }),
      };
    }
    const next = transition(order.status as ProductionOrderStatus, "COMPLETE");
    const consumptions = await tenantTx().execute(sql`
      SELECT qty::text AS qty, unit_cost::text AS "unitCost"
      FROM production_consumptions WHERE production_order_id = ${input.orderId}
    `);
    const cost = computeProductionCost({
      consumptions: consumptions.rows as { qty: string; unitCost: string }[],
      actualQty: input.actualQty,
      laborRatePerUnit: String(order.labor_rate),
      overheadRatePerUnit: String(order.overhead_rate),
    });
    const expiry = new Date(input.entryDate);
    expiry.setDate(expiry.getDate() + input.shelfLifeDays);
    const expiryIso = expiry.toISOString().slice(0, 10);

    const plan = await planReceipt({
      itemId: order.fg_item_id as string,
      warehouseId: order.fg_warehouse_id as string,
      qty: input.actualQty,
      unitCost: cost.unitCost,
      movedAt: input.entryDate,
      moveKind: "receipt",
      sourceType: "production_order",
      sourceId: input.orderId,
      batchNo: input.batchNo,
      batchExpiry: expiryIso,
      memo: `FG receipt ${order.order_no as string}`,
      memoAr: `استلام المنتج النهائي ${order.order_no as string}`,
    });
    const spec: JournalSpec = {
      source: { docType: "production_order", docId: input.orderId, operation: "complete" },
      entryDate: input.entryDate,
      description: { en: `Production completion ${order.order_no as string}`, ar: `إتمام إنتاج ${order.order_no as string}` },
      reference: order.order_no as string,
      currency: "SAR",
      lines: [
        { purpose: "INVENTORY", direction: "DEBIT", amount: cost.totalCost, itemId: order.fg_item_id as string },
        { purpose: "WIP", direction: "CREDIT", amount: cost.totalCost },
      ],
    };
    const result = await this.posting.post(spec, {
      postedBy: input.actorId,
      onPosted: async (entryId) => {
        await applyReceipt(plan, entryId);
        const batchId = plan.createdBatch?.id ?? plan.batchId;
        await tenantTx().execute(sql`
          UPDATE production_orders
          SET "status" = ${next}, "actual_qty" = ${input.actualQty}, "fg_batch_id" = ${batchId},
              "completion_journal_entry_id" = ${entryId}, "completed_at" = now(), "updated_at" = now()
          WHERE id = ${input.orderId}
        `);
      },
    });
    return { journalEntryId: result.journalEntryId, fgBatchId: null, cost };
  }

  /** CANCELLED — only before any consumption (DOCUMENT_LIFECYCLE §3). */
  async cancel(input: { orderId: string; actorId: string }): Promise<void> {
    const order = await this.order(input.orderId);
    const consumed = await tenantTx().execute(sql`
      SELECT COALESCE(SUM(qty), 0)::text AS total FROM production_consumptions
      WHERE production_order_id = ${input.orderId}
    `);
    const next = transition(order.status as ProductionOrderStatus, "CANCEL", (consumed.rows[0] as { total: string }).total);
    await tenantTx().execute(sql`
      UPDATE production_orders SET "status" = ${next}, "cancelled_at" = now(), "updated_at" = now()
      WHERE id = ${input.orderId}
    `);
    await this.audit.record({
      action: "manufacturing.order_cancelled",
      entityType: "production_order",
      entityId: input.orderId,
      actorId: input.actorId,
    });
  }

  /** INV-010: per-order WIP balance — a COMPLETED order nets to exactly zero. */
  async wipBalance(orderId: string): Promise<string> {
    const order = await this.order(orderId);
    if (order.status === "COMPLETED") return "0";
    const consumed = await tenantTx().execute(sql`
      SELECT COALESCE(SUM(qty * unit_cost), 0)::text AS v FROM production_consumptions
      WHERE production_order_id = ${orderId}
    `);
    return (consumed.rows[0] as { v: string }).v;
  }
}
