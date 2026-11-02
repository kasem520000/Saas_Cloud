import type { Request as ExpressRequest } from "express";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { RequirePermissions } from "../../../infra/auth/require-permissions.decorator";
import { requireTenantContext } from "../../../infra/db/tenant-context";
import { envelope } from "../../../infra/http/envelope";
import { identityOf, type SessionContext } from "../../../infra/context/session-context";
import { UnauthenticatedError } from "../../identity/api/identity";
import { AuditService } from "../../audit/api/audit";

function requireIdentity(request: ExpressRequest): SessionContext {
  const identity = identityOf(request);
  if (identity === undefined) {
    throw new UnauthenticatedError();
  }
  return identity;
}

const projectBody = z.object({
  code: z.string().min(1).max(60),
  name: z.string().min(1).max(200),
  nameAr: z.string().max(200).nullish(),
  parentId: z.string().uuid().nullish(),
  contractId: z.string().uuid().nullish(),
});

/**
 * PHASE-019 T1 — projects dimension (accounting-owned): CRUD for the
 * analytical dimension stamped on documents and journal lines. Projects are
 * NOT a GL split — `journal_lines.project_id` is an engine-written filter
 * dimension only.
 */
@Controller("api/v1/accounting")
export class ProjectsController {
  constructor(private readonly audit: AuditService) {}

  private tx() {
    const ctx = requireTenantContext();
    if (ctx.tx === undefined) throw new Error("no ambient tenant scope");
    return ctx.tx;
  }

  @Get("projects")
  @RequirePermissions("accounting.projects.manage")
  async list(@Query("status") status?: string) {
    const rows = await this.tx().execute(sql`
      SELECT id, code, name, name_ar AS "nameAr", status, parent_id AS "parentId",
             contract_id AS "contractId", created_at AS "createdAt"
      FROM projects
      WHERE (${status ?? null}::text IS NULL OR status = ${status ?? ""})
      ORDER BY code LIMIT 500
    `);
    return envelope({ projects: rows.rows });
  }

  @Post("projects")
  @RequirePermissions("accounting.projects.manage")
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown, @Req() request: ExpressRequest) {
    const parsed = projectBody.parse(body);
    const rows = await this.tx().execute(sql`
      INSERT INTO projects (tenant_id, code, name, name_ar, parent_id, contract_id)
      VALUES (erp.current_tenant_id(), ${parsed.code}, ${parsed.name}, ${parsed.nameAr ?? null},
              ${parsed.parentId ?? null}, ${parsed.contractId ?? null})
      RETURNING id
    `);
    const id = (rows.rows[0] as { id: string }).id;
    await this.audit.record({
      action: "accounting.project_created",
      entityType: "project",
      entityId: id,
      actorId: requireIdentity(request).userId,
      after: { code: parsed.code, name: parsed.name },
    });
    return envelope({ id });
  }

  @Post("projects/:id/close")
  @RequirePermissions("accounting.projects.manage")
  @HttpCode(HttpStatus.OK)
  async close(@Param("id") id: string, @Req() request: ExpressRequest) {
    const rows = await this.tx().execute(sql`
      UPDATE projects SET status = 'CLOSED', updated_at = now()
      WHERE id = ${id} AND status = 'OPEN'
      RETURNING id, status
    `);
    if (rows.rows.length === 0) return envelope({ id, status: "CLOSED_OR_MISSING" });
    await this.audit.record({
      action: "accounting.project_closed",
      entityType: "project",
      entityId: id,
      actorId: requireIdentity(request).userId,
    });
    return envelope(rows.rows[0]);
  }
}
