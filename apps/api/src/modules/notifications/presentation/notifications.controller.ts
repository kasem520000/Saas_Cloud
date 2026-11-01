import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { envelope } from "../../../infra/http/envelope";
import { identityOf, type SessionContext } from "../../../infra/context/session-context";
import { UnauthenticatedError } from "../../identity/api/identity";
import { NotificationsService } from "../application/notifications-service";

/**
 * PHASE-014 T10 — the billing-critical notifications center (tenant plane).
 * Session-authenticated self-scoped routes (SESSION_ROUTES in the route
 * registry): every member reads their inbox (tenant-wide + own rows);
 * preferences are per-user with a tenant-wide default row.
 */

const preferenceSchema = z.object({
  eventType: z.string().min(3).max(80),
  inApp: z.boolean(),
  email: z.boolean(),
});

function requireIdentity(request: Request): SessionContext {
  const identity = identityOf(request);
  if (identity === undefined) {
    throw new UnauthenticatedError();
  }
  return identity;
}

@Controller("api/v1/notifications")
export class NotificationsController {
  constructor(
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query("unreadOnly") unreadOnly?: string,
    @Query("limit") rawLimit?: string,
  ): Promise<unknown> {
    const identity = requireIdentity(request);
    const limit = rawLimit !== undefined && Number.isFinite(Number(rawLimit)) ? Number(rawLimit) : 50;
    return envelope(
      await this.notifications.list(identity.userId, unreadOnly === "true", Math.min(limit, 200)),
    );
  }

  @Get("unread-count")
  async unreadCount(@Req() request: Request): Promise<unknown> {
    const identity = requireIdentity(request);
    return envelope({ count: await this.notifications.unreadCount(identity.userId) });
  }

  @Patch(":id/read")
  @HttpCode(HttpStatus.OK)
  async markRead(@Req() request: Request, @Param("id") id: string): Promise<unknown> {
    const identity = requireIdentity(request);
    return envelope({ row: await this.notifications.markRead(id, identity.userId) });
  }

  @Get("preferences")
  async listPreferences(@Req() request: Request): Promise<unknown> {
    const identity = requireIdentity(request);
    return envelope(await this.notifications.preferences(identity.userId));
  }

  @Put("preferences")
  @HttpCode(HttpStatus.OK)
  async setPreference(@Req() request: Request, @Body() body: unknown): Promise<unknown> {
    const identity = requireIdentity(request);
    const input = preferenceSchema.parse(body);
    return envelope(
      await this.notifications.setPreference(identity.userId, input.eventType, input.inApp, input.email),
    );
  }
}
