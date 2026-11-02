import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { requireTenantContext } from "../../../infra/db/tenant-context";
import { type TenantDb } from "../../../infra/db/client";
import { AuditService } from "../../audit/api/audit";

function tenantTx(): TenantDb {
  const context = requireTenantContext();
  if (context.tx === undefined) {
    throw new Error("qc requires an ambient tenant scope");
  }
  return context.tx;
}

export class QcError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "QcError";
  }
}

/**
 * PHASE-018 T6 — QC inspections. A REQUIRED gate at completion quarantines
 * the FG batch (stock status flag — not a ledger state): FEFO picking and
 * explicit-batch issues exclude QUARANTINED batches, so quarantined FG is
 * invisible to availability/sales. PASS releases the quarantine with NO
 * journal; FAIL routes to scrap (posted by ProductionOrderService.scrap) or
 * another disposition. Inspections are read-mostly records; passing posts
 * nothing.
 */
@Injectable()
export class QcService {
  constructor(private readonly audit: AuditService) {}

  async recordInspection(input: {
    inspectionNo: string;
    targetType: "GRN" | "PRODUCTION_ORDER";
    targetId: string;
    batchId: string | null;
    result: "PASS" | "FAIL" | "SAMPLED";
    disposition: "ACCEPT" | "SCRAP" | "REWORK" | "RETURN_TO_SUPPLIER";
    sampleSize?: number;
    notes?: string | null;
    actorId: string;
  }): Promise<void> {
    await tenantTx().execute(sql`
      INSERT INTO inspections
        (tenant_id, inspection_no, target_type, target_id, batch_id, result, disposition, sample_size, notes, inspected_by)
      VALUES (erp.current_tenant_id(), ${input.inspectionNo}, ${input.targetType}, ${input.targetId},
              ${input.batchId}, ${input.result}, ${input.disposition}, ${input.sampleSize ?? 1},
              ${input.notes ?? null}, ${input.actorId})
    `);
    if (input.batchId !== null && input.result === "FAIL" && input.disposition !== "ACCEPT") {
      // quarantine the batch until disposition completes
      await tenantTx().execute(sql`
        UPDATE item_batches SET status = 'QUARANTINED', updated_at = now()
        WHERE id = ${input.batchId} AND status = 'ACTIVE'
      `);
    }
    await this.audit.record({
      action: "manufacturing.inspection_recorded",
      entityType: "inspection",
      entityId: input.batchId ?? input.targetId,
      actorId: input.actorId,
      after: { result: input.result, disposition: input.disposition, batchId: input.batchId },
    });
  }

  /** PASS ⇒ release quarantine, no journal. */
  async releaseQuarantine(input: { batchId: string; actorId: string }): Promise<void> {
    const rows = await tenantTx().execute(sql`
      UPDATE item_batches SET status = 'ACTIVE', updated_at = now()
      WHERE id = ${input.batchId} AND status = 'QUARANTINED'
      RETURNING id
    `);
    if (rows.rows.length === 0) {
      throw new QcError("NOT_QUARANTINED", "batch is not quarantined");
    }
    await this.audit.record({
      action: "manufacturing.quarantine_released",
      entityType: "item_batch",
      entityId: input.batchId,
      actorId: input.actorId,
    });
  }
}
