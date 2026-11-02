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
import type { Request } from "express";
import { z } from "zod";

import { envelope } from "../../../infra/http/envelope";
import { identityOf, type SessionContext } from "../../../infra/context/session-context";
import { RequirePermissions } from "../../../infra/auth/require-permissions.decorator";
import { RequireFeature } from "../../../infra/auth/require-feature.decorator";
import { UnauthenticatedError } from "../../identity/api/identity";
import { TerminalService } from "../application/terminal.service";
import { PosSaleService } from "../application/pos-sale.service";
import { SyncSliceService } from "../application/sync-slice.service";

/**
 * PHASE-016 — POS tenant-plane routes (matrix §3.2/§3.8): terminal registry
 * admin, the online counter-sale submit, and the narrow sync slice
 * (pull/push/status). Every route carries its matrix key (route-permissions).
 */

const terminalCodeSchema = z.string().regex(/^[A-Za-z0-9-]{2,20}$/);
const saleLineSchema = z.object({
  itemId: z.string().uuid(),
  qty: z.string().regex(/^\d+(\.\d{1,6})?$/),
  unitPrice: z.string().regex(/^\d+(\.\d{1,4})?$/),
  discountAmount: z.string().nullish(),
  taxCodeId: z.string().uuid().nullish(),
  batchId: z.string().uuid().nullish(),
  serialIds: z.array(z.string().uuid()).nullish(),
});
const saleBodySchema = z.object({
  terminalCode: terminalCodeSchema,
  customerId: z.string().uuid(),
  orderType: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY", "COUNTER"]).nullish(),
  tableRef: z.string().max(40).nullish(),
  offlineReceiptNo: z.string().regex(/^OFF-[A-Z0-9-]+-\d+$/).nullish(),
  lines: z.array(saleLineSchema).min(1).max(500),
});
const registerBodySchema = z.object({
  branchId: z.string().uuid(),
  deviceId: z.string().uuid().nullish(),
  code: terminalCodeSchema,
  name: z.string().min(1).max(80),
  cashAccountId: z.string().uuid(),
  receiptSizeMm: z.union([z.literal(80), z.literal(58)]),
});
const pushBodySchema = z.object({
  deviceId: z.string().uuid(),
  commands: z
    .array(
      z.object({
        idempotencyKey: z.string().min(8).max(80),
        clientId: z.string().uuid(),
        type: z.enum(["pos_sale", "cashier_shift", "partner_create"]),
        payload: z.unknown(),
      }),
    )
    .max(50),
});

function requireIdentity(request: Request): SessionContext {
  const identity = identityOf(request);
  if (identity === undefined) {
    throw new UnauthenticatedError();
  }
  return identity;
}

@Controller("api/v1/pos")
export class PosController {
  constructor(
    private readonly terminals: TerminalService,
    private readonly posSale: PosSaleService,
    private readonly sync: SyncSliceService,
  ) {}

  // -- T2 terminal registry --------------------------------------------------

  @Get("terminals")
  @RequirePermissions("pos.terminals.manage")
  @RequireFeature("pos.terminals")
  async listTerminals() {
    return envelope({ terminals: await this.terminals.list() });
  }

  @Post("terminals")
  @RequirePermissions("pos.terminals.manage")
  @RequireFeature("pos.terminals")
  @HttpCode(HttpStatus.OK)
  async registerTerminal(@Req() request: Request, @Body() body: unknown) {
    const identity = requireIdentity(request);
    const input = registerBodySchema.parse(body);
    return envelope(await this.terminals.register({ ...input, deviceId: input.deviceId ?? null, actorId: identity.userId }));
  }

  @Post("terminals/:id/activate")
  @RequirePermissions("pos.terminals.manage")
  @RequireFeature("pos.terminals")
  @HttpCode(HttpStatus.OK)
  async activate(@Req() request: Request, @Param("id") id: string) {
    const identity = requireIdentity(request);
    return envelope(await this.terminals.setStatus(id, "ACTIVE", identity.userId));
  }

  @Post("terminals/:id/deactivate")
  @RequirePermissions("pos.terminals.manage")
  @RequireFeature("pos.terminals")
  @HttpCode(HttpStatus.OK)
  async deactivate(@Req() request: Request, @Param("id") id: string) {
    const identity = requireIdentity(request);
    return envelope(await this.terminals.setStatus(id, "INACTIVE", identity.userId));
  }

  @Post("terminals/:id/bind-device")
  @RequirePermissions("pos.terminals.manage")
  @RequireFeature("pos.terminals")
  @HttpCode(HttpStatus.OK)
  async bindDevice(@Req() request: Request, @Param("id") id: string, @Body() body: unknown) {
    const identity = requireIdentity(request);
    const parsed = z.object({ deviceId: z.string().uuid() }).parse(body);
    return envelope(await this.terminals.bindDevice(id, parsed.deviceId, identity.userId));
  }

  // -- T5 online counter sale -------------------------------------------------

  @Post("sale")
  @RequirePermissions("pos.sales.sell")
  @RequireFeature("pos.sales")
  @HttpCode(HttpStatus.OK)
  async submitSale(@Req() request: Request, @Body() body: unknown) {
    const identity = requireIdentity(request);
    const input = saleBodySchema.parse(body);
    return envelope(await this.posSale.submitSale({ ...input, orderType: input.orderType ?? undefined, tableRef: input.tableRef ?? undefined, offlineReceiptNo: input.offlineReceiptNo ?? undefined, actorId: identity.userId }));
  }

  // -- T8 narrow sync slice ---------------------------------------------------

  @Get("sync/pull")
  @RequirePermissions("sales.pos_session.post")
  @RequireFeature("pos.offline_queue")
  async pull(
    @Req() request: Request,
    @Query("deviceId") deviceId: string,
    @Query("entity") entity: string,
    @Query("cursor") cursor?: string,
  ) {
    requireIdentity(request);
    return envelope(
      await this.sync.pull({ deviceId, entity, cursor: cursor !== undefined ? Number(cursor) : undefined }),
    );
  }

  @Post("sync/push")
  @RequirePermissions("sales.pos_session.post")
  @RequireFeature("pos.offline_queue")
  @HttpCode(HttpStatus.OK)
  async push(@Req() request: Request, @Body() body: unknown) {
    requireIdentity(request);
    const input = pushBodySchema.parse(body);
    return envelope(await this.sync.push(input));
  }

  @Get("sync/status")
  @RequirePermissions("sales.pos_session.post")
  @RequireFeature("pos.offline_queue")
  async syncStatus(@Req() request: Request, @Query("deviceId") deviceId: string) {
    requireIdentity(request);
    return envelope(await this.sync.status(deviceId));
  }
}
