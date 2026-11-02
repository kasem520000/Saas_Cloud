import type { Request as ExpressRequest } from "express";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { RequirePermissions } from "../../../infra/auth/require-permissions.decorator";
import { RequireFeature } from "../../../infra/auth/require-feature.decorator";
import { requireTenantContext } from "../../../infra/db/tenant-context";
import { envelope } from "../../../infra/http/envelope";
import { identityOf, type SessionContext } from "../../../infra/context/session-context";
import { UnauthenticatedError } from "../../identity/api/identity";
import { LeadsService } from "../application/leads.service";
import { ContractsService } from "../application/contracts.service";
import { CrmOperationsService } from "../application/operations.service";

function requireIdentity(request: ExpressRequest): SessionContext {
  const identity = identityOf(request);
  if (identity === undefined) {
    throw new UnauthenticatedError();
  }
  return identity;
}

const leadCreateBody = z.object({
  branchId: z.string().uuid(),
  name: z.string().min(1).max(200),
  nameAr: z.string().max(200).nullish(),
  source: z.enum(["WALK_IN", "WEB", "REFERRAL", "CAMPAIGN", "OTHER"]).default("WALK_IN"),
  ownerRepId: z.string().uuid().nullish(),
});
const leadTransitionBody = z.object({
  action: z.enum(["QUALIFY", "LOSE"]),
  lostReason: z.string().max(500).nullish(),
});
const leadConvertBody = z.object({
  partnerId: z.string().uuid().nullish(),
  newPartner: z
    .object({
      code: z.string().min(1).max(60),
      name: z.string().min(1).max(200),
      nameAr: z.string().max(200).nullish(),
    })
    .nullish(),
});
const taskCreateBody = z.object({
  title: z.string().min(1).max(300),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  leadId: z.string().uuid().nullish(),
  partnerId: z.string().uuid().nullish(),
  contractId: z.string().uuid().nullish(),
  assignedTo: z.string().uuid().nullish(),
});
const activityBody = z.object({
  kind: z.enum(["NOTE", "CALL", "MEETING", "EMAIL"]).default("NOTE"),
  body: z.string().min(1).max(2000),
  leadId: z.string().uuid().nullish(),
  partnerId: z.string().uuid().nullish(),
  contractId: z.string().uuid().nullish(),
});
const timeEntryBody = z.object({
  projectId: z.string().uuid(),
  feeItemId: z.string().uuid(),
  hours: z.string(),
  billable: z.boolean().default(true),
  narrative: z.string().max(2000).nullish(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const contractCreateBody = z.object({
  branchId: z.string().uuid(),
  contractNo: z.string().min(1).max(60),
  partnerId: z.string().uuid(),
  projectId: z.string().uuid().nullish(),
  feeModel: z.enum(["RETAINER", "MILESTONE", "HOURLY"]).default("RETAINER"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});
const billBody = z.object({
  periodKey: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.string(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const serviceOrderBody = z.object({
  branchId: z.string().uuid(),
  orderNo: z.string().min(1).max(60),
  partnerId: z.string().uuid(),
  contractId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
});

/**
 * PHASE-019 — CRM HTTP surface (matrix §3.8): leads + conversion, tasks,
 * activities, time entries, service contracts + schedule expansion + billing
 * run, service orders. Contract billing posts only through PostingService
 * (ADR-0007); every action endpoint is permission-gated and audited.
 */
@Controller("api/v1/crm")
export class CrmController {
  constructor(
    private readonly leads: LeadsService,
    private readonly contracts: ContractsService,
    private readonly ops: CrmOperationsService,
  ) {}

  private tx() {
    const ctx = requireTenantContext();
    if (ctx.tx === undefined) throw new Error("no ambient tenant scope");
    return ctx.tx;
  }

  // -- leads ---------------------------------------------------------------
  @Get("leads")
  @RequirePermissions("crm.leads.manage")
  @RequireFeature("crm.leads")
  async listLeads(@Query("status") status?: string) {
    const rows = await this.tx().execute(sql`
      SELECT id, name, name_ar AS "nameAr", source, status, partner_id AS "partnerId",
             lost_reason AS "lostReason", created_at AS "createdAt"
      FROM leads
      WHERE (${status ?? null}::text IS NULL OR status = ${status ?? ""})
      ORDER BY created_at DESC LIMIT 200
    `);
    return envelope({ leads: rows.rows });
  }

  @Post("leads")
  @RequirePermissions("crm.leads.manage")
  @RequireFeature("crm.leads")
  @HttpCode(HttpStatus.CREATED)
  async createLead(@Body() body: unknown, @Req() request: ExpressRequest) {
    const parsed = leadCreateBody.parse(body);
    const result = await this.leads.create({ ...parsed, nameAr: parsed.nameAr ?? null, ownerRepId: parsed.ownerRepId ?? null, actorId: requireIdentity(request).userId });
    return envelope(result);
  }

  @Post("leads/:id/transition")
  @RequirePermissions("crm.leads.manage")
  @RequireFeature("crm.leads")
  @HttpCode(HttpStatus.OK)
  async transitionLead(@Param("id") id: string, @Body() body: unknown, @Req() request: ExpressRequest) {
    const parsed = leadTransitionBody.parse(body);
    const result = await this.leads.transition({
      leadId: id,
      action: parsed.action,
      lostReason: parsed.lostReason ?? undefined,
      actorId: requireIdentity(request).userId,
    });
    return envelope(result);
  }

  @Post("leads/:id/convert")
  @RequirePermissions("crm.leads.manage")
  @RequireFeature("crm.leads")
  @HttpCode(HttpStatus.OK)
  async convertLead(@Param("id") id: string, @Body() body: unknown, @Req() request: ExpressRequest) {
    const parsed = leadConvertBody.parse(body);
    const result = await this.leads.convert({
      leadId: id,
      partnerId: parsed.partnerId ?? null,
      newPartner: parsed.newPartner ?? undefined,
      actorId: requireIdentity(request).userId,
    });
    return envelope(result);
  }

  // -- tasks / activities / time -------------------------------------------
  @Get("tasks")
  @RequirePermissions("crm.tasks.manage")
  @RequireFeature("crm.tasks_activities")
  async listTasks(@Query("status") status?: string) {
    const rows = await this.tx().execute(sql`
      SELECT id, title, due_date AS "dueDate", status, lead_id AS "leadId", partner_id AS "partnerId",
             contract_id AS "contractId", assigned_to AS "assignedTo", reminder_sent AS "reminderSent"
      FROM tasks
      WHERE (${status ?? null}::text IS NULL OR status = ${status ?? ""})
      ORDER BY due_date NULLS LAST, created_at DESC LIMIT 200
    `);
    return envelope({ tasks: rows.rows });
  }

  @Post("tasks")
  @RequirePermissions("crm.tasks.manage")
  @RequireFeature("crm.tasks_activities")
  @HttpCode(HttpStatus.CREATED)
  async createTask(@Body() body: unknown, @Req() request: ExpressRequest) {
    const parsed = taskCreateBody.parse(body);
    const result = await this.ops.createTask({
      ...parsed,
      dueDate: parsed.dueDate ?? null,
      leadId: parsed.leadId ?? null,
      partnerId: parsed.partnerId ?? null,
      contractId: parsed.contractId ?? null,
      assignedTo: parsed.assignedTo ?? null,
      actorId: requireIdentity(request).userId,
    });
    return envelope(result);
  }

  @Post("tasks/:id/complete")
  @RequirePermissions("crm.tasks.manage")
  @RequireFeature("crm.tasks_activities")
  @HttpCode(HttpStatus.OK)
  async completeTask(@Param("id") id: string, @Req() request: ExpressRequest) {
    return envelope(await this.ops.completeTask({ taskId: id, actorId: requireIdentity(request).userId }));
  }

  @Get("activities")
  @RequirePermissions("crm.activities.manage")
  @RequireFeature("crm.tasks_activities")
  async listActivities(@Query("partnerId") partnerId?: string) {
    const rows = await this.tx().execute(sql`
      SELECT id, kind, body, lead_id AS "leadId", partner_id AS "partnerId", contract_id AS "contractId",
             created_at AS "createdAt"
      FROM activities
      WHERE (${partnerId ?? null}::uuid IS NULL OR partner_id = ${partnerId ?? "00000000-0000-0000-0000-000000000000"})
      ORDER BY created_at DESC LIMIT 200
    `);
    return envelope({ activities: rows.rows });
  }

  @Post("activities")
  @RequirePermissions("crm.activities.manage")
  @RequireFeature("crm.tasks_activities")
  @HttpCode(HttpStatus.CREATED)
  async recordActivity(@Body() body: unknown, @Req() request: ExpressRequest) {
    const parsed = activityBody.parse(body);
    const result = await this.ops.recordActivity({
      ...parsed,
      leadId: parsed.leadId ?? null,
      partnerId: parsed.partnerId ?? null,
      contractId: parsed.contractId ?? null,
      actorId: requireIdentity(request).userId,
    });
    return envelope(result);
  }

  @Get("time-entries")
  @RequirePermissions("crm.contracts.manage")
  @RequireFeature("crm.service_contracts")
  async listTimeEntries(@Query("projectId") projectId?: string) {
    const rows = await this.tx().execute(sql`
      SELECT t.id, t.project_id AS "projectId", t.fee_item_id AS "feeItemId", t.hours::text AS hours,
             t.billable, t.narrative, t.billed, t.entry_date AS "entryDate"
      FROM time_entries t
      WHERE (${projectId ?? null}::uuid IS NULL OR t.project_id = ${projectId ?? "00000000-0000-0000-0000-000000000000"})
      ORDER BY t.entry_date DESC LIMIT 500
    `);
    return envelope({ timeEntries: rows.rows });
  }

  @Post("time-entries")
  @RequirePermissions("crm.contracts.manage")
  @RequireFeature("crm.service_contracts")
  @HttpCode(HttpStatus.CREATED)
  async recordTimeEntry(@Body() body: unknown, @Req() request: ExpressRequest) {
    const parsed = timeEntryBody.parse(body);
    const result = await this.ops.recordTimeEntry({
      ...parsed,
      narrative: parsed.narrative ?? null,
      actorId: requireIdentity(request).userId,
    });
    return envelope(result);
  }

  // -- service contracts + billing ------------------------------------------
  @Get("contracts")
  @RequirePermissions("crm.contracts.manage")
  @RequireFeature("crm.service_contracts")
  async listContracts(@Query("status") status?: string) {
    const rows = await this.tx().execute(sql`
      SELECT id, contract_no AS "contractNo", partner_id AS "partnerId", project_id AS "projectId",
             fee_model AS "feeModel", status, renewal_state AS "renewalState",
             start_date AS "startDate", end_date AS "endDate"
      FROM service_contracts
      WHERE (${status ?? null}::text IS NULL OR status = ${status ?? ""})
      ORDER BY created_at DESC LIMIT 200
    `);
    return envelope({ contracts: rows.rows });
  }

  @Post("contracts")
  @RequirePermissions("crm.contracts.manage")
  @RequireFeature("crm.service_contracts")
  @HttpCode(HttpStatus.CREATED)
  async createContract(@Body() body: unknown, @Req() request: ExpressRequest) {
    const parsed = contractCreateBody.parse(body);
    const result = await this.contracts.create({
      ...parsed,
      projectId: parsed.projectId ?? null,
      endDate: parsed.endDate ?? null,
      actorId: requireIdentity(request).userId,
    });
    return envelope(result);
  }

  @Post("contracts/:id/expand-schedule")
  @RequirePermissions("crm.contracts.manage")
  @RequireFeature("crm.service_contracts")
  @HttpCode(HttpStatus.OK)
  async expandSchedule(@Param("id") id: string, @Req() request: ExpressRequest) {
    return envelope(await this.contracts.expandSchedule({ contractId: id, actorId: requireIdentity(request).userId }));
  }

  @Post("contracts/:id/bill")
  @RequirePermissions("crm.contracts.manage")
  @RequireFeature("crm.recurring_billing")
  @HttpCode(HttpStatus.OK)
  async bill(@Param("id") id: string, @Body() body: unknown, @Req() request: ExpressRequest) {
    const parsed = billBody.parse(body);
    const result = await this.contracts.billPeriod({
      contractId: id,
      periodKey: parsed.periodKey,
      amount: parsed.amount,
      entryDate: parsed.entryDate,
      actorId: requireIdentity(request).userId,
    });
    return envelope(result);
  }

  // -- service orders ---------------------------------------------------------
  @Get("service-orders")
  @RequirePermissions("crm.service_orders.manage")
  @RequireFeature("crm.service_orders")
  async listServiceOrders(@Query("status") status?: string) {
    const rows = await this.tx().execute(sql`
      SELECT id, order_no AS "orderNo", contract_id AS "contractId", partner_id AS "partnerId",
             project_id AS "projectId", status
      FROM service_orders
      WHERE (${status ?? null}::text IS NULL OR status = ${status ?? ""})
      ORDER BY created_at DESC LIMIT 200
    `);
    return envelope({ serviceOrders: rows.rows });
  }

  @Post("service-orders")
  @RequirePermissions("crm.service_orders.manage")
  @RequireFeature("crm.service_orders")
  @HttpCode(HttpStatus.CREATED)
  async createServiceOrder(@Body() body: unknown) {
    const parsed = serviceOrderBody.parse(body);
    const rows = await this.tx().execute(sql`
      INSERT INTO service_orders (tenant_id, branch_id, order_no, contract_id, partner_id, project_id)
      VALUES (erp.current_tenant_id(), ${parsed.branchId}, ${parsed.orderNo}, ${parsed.contractId ?? null},
              ${parsed.partnerId}, ${parsed.projectId ?? null})
      RETURNING id, order_no AS "orderNo"
    `);
    const row = rows.rows[0] as { id: string; orderNo: string };
    return envelope({ id: row.id, orderNo: row.orderNo });
  }
}
