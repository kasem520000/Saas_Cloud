import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { requireTenantContext } from "../../../infra/db/tenant-context";
import { type TenantDb } from "../../../infra/db/client";
import { AuditService } from "../../audit/api/audit";

function tenantTx(): TenantDb {
  const context = requireTenantContext();
  if (context.tx === undefined) {
    throw new Error("crm requires an ambient tenant scope");
  }
  return context.tx;
}

export class OperationsError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "OperationsError";
  }
}

/**
 * PHASE-019 T3/T5 — tasks, activities and time entries. None of these ever
 * touch the ledger; time entries feed billing only (staff cost is not
 * tracked — documented limitation). Narrative is required on billable time
 * unless the entry is already billed (template policy
 * `narrative_required_on_time_billing`, enforced at the CHECK + here).
 */
@Injectable()
export class CrmOperationsService {
  constructor(private readonly audit: AuditService) {}

  async createTask(input: {
    title: string;
    dueDate: string | null;
    leadId: string | null;
    partnerId: string | null;
    contractId: string | null;
    assignedTo: string | null;
    actorId: string;
  }): Promise<{ id: string }> {
    const rows = await tenantTx().execute(sql`
      INSERT INTO tasks (tenant_id, title, due_date, lead_id, partner_id, contract_id, assigned_to)
      VALUES (erp.current_tenant_id(), ${input.title}, ${input.dueDate}, ${input.leadId},
              ${input.partnerId}, ${input.contractId}, ${input.assignedTo})
      RETURNING id
    `);
    const id = (rows.rows[0] as { id: string }).id;
    await this.audit.record({
      action: "crm.task_created",
      entityType: "task",
      entityId: id,
      actorId: input.actorId,
      after: { title: input.title, dueDate: input.dueDate },
    });
    return { id };
  }

  async completeTask(input: { taskId: string; actorId: string }): Promise<{ id: string; status: string }> {
    const rows = await tenantTx().execute(sql`
      UPDATE tasks SET status = 'DONE', "updated_at" = now()
      WHERE id = ${input.taskId} AND status = 'OPEN'
      RETURNING id, status
    `);
    if (rows.rows.length === 0) throw new OperationsError("NOT_OPEN", "task not found or not open");
    await this.audit.record({
      action: "crm.task_completed",
      entityType: "task",
      entityId: input.taskId,
      actorId: input.actorId,
    });
    return rows.rows[0] as { id: string; status: string };
  }

  async recordActivity(input: {
    kind: "NOTE" | "CALL" | "MEETING" | "EMAIL";
    body: string;
    leadId: string | null;
    partnerId: string | null;
    contractId: string | null;
    actorId: string;
  }): Promise<{ id: string }> {
    const rows = await tenantTx().execute(sql`
      INSERT INTO activities (tenant_id, kind, body, lead_id, partner_id, contract_id, created_by)
      VALUES (erp.current_tenant_id(), ${input.kind}, ${input.body}, ${input.leadId},
              ${input.partnerId}, ${input.contractId}, ${input.actorId})
      RETURNING id
    `);
    return { id: (rows.rows[0] as { id: string }).id };
  }

  async recordTimeEntry(input: {
    projectId: string;
    feeItemId: string;
    hours: string;
    billable: boolean;
    narrative: string | null;
    entryDate: string;
    actorId: string;
  }): Promise<{ id: string }> {
    if (input.billable && input.narrative === null) {
      throw new OperationsError(
        "NARRATIVE_REQUIRED",
        "billable time requires a narrative (template policy narrative_required_on_time_billing)",
      );
    }
    const rows = await tenantTx().execute(sql`
      INSERT INTO time_entries (tenant_id, project_id, fee_item_id, hours, billable, narrative, entry_date, created_by)
      VALUES (erp.current_tenant_id(), ${input.projectId}, ${input.feeItemId}, ${input.hours},
              ${input.billable}, ${input.narrative}, ${input.entryDate}, ${input.actorId})
      RETURNING id
    `);
    return { id: (rows.rows[0] as { id: string }).id };
  }

  /** Unbilled, narrative-complete time for the hourly billing pull. */
  async unbilledTime(input: { projectId: string | null }): Promise<Record<string, unknown>[]> {
    const rows = await tenantTx().execute(sql`
      SELECT t.id, t.project_id AS "projectId", t.fee_item_id AS "feeItemId", t.hours::text AS hours,
             t.billable, t.narrative, t.entry_date AS "entryDate"
      FROM time_entries t
      WHERE t.billed = false AND (${input.projectId ?? null}::uuid IS NULL OR t.project_id = ${input.projectId ?? ""})
      ORDER BY t.entry_date LIMIT 500
    `);
    return rows.rows as Record<string, unknown>[];
  }
}
