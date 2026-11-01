import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { envelope } from "../../../infra/http/envelope";
import { RequirePermissions } from "../../../infra/auth/require-permissions.decorator";
import { AuditService } from "../application/audit.service";
import { identityOf } from "../../../infra/context/session-context";
import { UnauthenticatedError } from "../../../modules/identity/domain/identity-errors";

/**
 * Audit query endpoint (PHASE-003 §2.11): gated by `audit.view` (matrix
 * §3.8); reads flow through the ambient tenant UoW so RLS confines the
 * trail to the caller's tenant (A1/A2 hold here by construction — the
 * store has no cross-tenant path even if the query were wrong).
 */

const querySchema = z.object({
  entityType: z.string().min(3).max(100).optional(),
  entityId: z.string().uuid().optional(),
  fromAt: z.string().datetime().optional(),
  toAt: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

@Controller("api/v1/audit/events")
export class AuditEventsController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions("audit.view")
  async list(@Req() request: Request, @Query() query: unknown) {
    const identity = identityOf(request);
    if (identity === undefined) {
      throw new UnauthenticatedError();
    }
    const input = querySchema.parse(query);
    const rows = await this.audit.list(input);
    return envelope(
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        actorId: row.actorId,
        correlationId: row.correlationId,
        at: row.at,
      })),
    );
  }
}
