import type { Request as ExpressRequest } from "express";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from "@nestjs/common";
import { z } from "zod";

import { RequirePermissions } from "../../../infra/auth/require-permissions.decorator";
import { RequireFeature } from "../../../infra/auth/require-feature.decorator";
import { envelope } from "../../../infra/http/envelope";
import { identityOf, type SessionContext } from "../../../infra/context/session-context";
import { UnauthenticatedError } from "../../identity/api/identity";
import { DevicesService } from "../application/devices.service";
import { PullService } from "../application/pull.service";
import { PushService } from "../application/push.service";
import { InboxService } from "../application/inbox.service";
import type { SyncCommand } from "../domain/batch";

function requireIdentity(request: ExpressRequest): SessionContext {
  const identity = identityOf(request);
  if (identity === undefined) throw new UnauthenticatedError();
  return identity;
}

const commandSchema = z.object({
  commandId: z.string().uuid(),
  entityType: z.string().regex(/^[a-z_]{2,40}$/),
  intent: z.string().regex(/^[a-z_]{2,40}$/),
  idempotencyKey: z.string().min(1).max(200),
  baseVersion: z.number().int().min(0).nullish(),
  clientCreatedAt: z.string().nullish(),
  localRef: z.string().max(120).nullish(),
  payload: z.unknown(),
});
const pushBody = z.object({
  deviceId: z.string().uuid(),
  commands: z.array(commandSchema).min(1).max(50),
});
const pullAckBody = z.object({ deviceId: z.string().uuid(), entity: z.string(), cursor: z.string().min(1) });

/**
 * PHASE-020 — the generalized sync wire surface (SYNC_PROTOCOL §2/§3):
 * GET status/pull, POST push (+acks), device registry management. Every push
 * is permission- and device-gated; revoked devices reject pre-execution.
 */
@Controller("api/v1/sync")
export class SyncController {
  constructor(
    private readonly devices: DevicesService,
    private readonly pullSvc: PullService,
    private readonly pushSvc: PushService,
    private readonly inbox: InboxService,
  ) {}

  @Get("status")
  @RequirePermissions("sync.pull")
  @RequireFeature("offline.sync_protocol")
  async status(@Query("deviceId") deviceId: string, @Query("entities") entities?: string) {
    return envelope(
      await this.pullSvc.status({
        deviceId,
        entities: (entities ?? "items,partners_lite,tax_codes,pos_terminal").split(","),
      }),
    );
  }

  @Get("pull")
  @RequirePermissions("sync.pull")
  @RequireFeature("offline.sync_protocol")
  async pull(
    @Query("deviceId") deviceId: string,
    @Query("entity") entity: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return envelope(
      await this.pullSvc.pull({ deviceId, entity, cursorToken: cursor, limit: limit === undefined ? undefined : Number(limit) }),
    );
  }

  @Post("pull/ack")
  @RequirePermissions("sync.pull")
  @RequireFeature("offline.sync_protocol")
  @HttpCode(HttpStatus.OK)
  async pullAck(@Body() body: unknown) {
    const parsed = pullAckBody.parse(body);
    return envelope(await this.pullSvc.ack({ deviceId: parsed.deviceId, entity: parsed.entity, cursorToken: parsed.cursor }));
  }

  @Post("push")
  @RequirePermissions("sync.push")
  @RequireFeature("offline.sync_protocol")
  @HttpCode(HttpStatus.OK)
  async push(@Body() body: unknown, @Req() request: ExpressRequest) {
    const parsed = pushBody.parse(body);
    return envelope(
      await this.pushSvc.push({
        deviceId: parsed.deviceId,
        commands: parsed.commands as SyncCommand[],
        actorId: requireIdentity(request).userId,
      }),
    );
  }

  @Get("devices")
  @RequirePermissions("identity.devices.manage")
  @RequireFeature("offline.device_management")
  async listDevices(@Req() request: ExpressRequest) {
    return envelope(await this.devices.list(requireIdentity(request).userId));
  }

  @Post("devices/:id/attest/challenge")
  @RequirePermissions("sync.devices.register")
  @RequireFeature("offline.sync_protocol")
  @HttpCode(HttpStatus.OK)
  async challenge(@Param("id") id: string, @Req() request: ExpressRequest) {
    return envelope(await this.devices.attestationChallenge({ deviceId: id, actorId: requireIdentity(request).userId }));
  }

  @Post("devices/:id/attest")
  @RequirePermissions("sync.devices.register")
  @RequireFeature("offline.sync_protocol")
  @HttpCode(HttpStatus.OK)
  async attest(@Param("id") id: string, @Body() body: unknown, @Req() request: ExpressRequest) {
    const parsed = z
      .object({
        nonce: z.string().min(1),
        signature: z.string().min(1),
        publicKey: z.string().min(1),
        platformAttestation: z.string().nullish(),
      })
      .parse(body);
    return envelope(
      await this.devices.attest({ deviceId: id, actorId: requireIdentity(request).userId, ...parsed }),
    );
  }

  @Post("devices/:id/revoke")
  @RequirePermissions("sync.devices.revoke")
  @RequireFeature("offline.device_management")
  @HttpCode(HttpStatus.OK)
  async revoke(@Param("id") id: string, @Body() body: unknown, @Req() request: ExpressRequest) {
    const parsed = z.object({ reason: z.string().min(1).max(500) }).parse(body);
    return envelope(await this.devices.revoke({ deviceId: id, actorId: requireIdentity(request).userId, reason: parsed.reason }));
  }

  @Post("inbox/retention")
  @RequirePermissions("sync.health.read")
  @RequireFeature("offline.sync_protocol")
  @HttpCode(HttpStatus.OK)
  async retention(@Req() request: ExpressRequest) {
    return envelope(await this.inbox.runRetention(requireIdentity(request).userId));
  }
}
