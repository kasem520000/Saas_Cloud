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

function requireIdentity(request: ExpressRequest): SessionContext {
  const identity = identityOf(request);
  if (identity === undefined) {
    throw new UnauthenticatedError();
  }
  return identity;
}
import { ProductionOrderService } from "../application/production-order.service";
import { QcService } from "../application/qc.service";
import { ManufacturingQueriesService } from "../application/manufacturing-queries";

const consumeBody = z.object({
  itemId: z.string().uuid(),
  qty: z.string(),
  batchId: z.string().uuid().nullish(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const scrapBody = z.object({
  qty: z.string(),
  unitCost: z.string(),
  reasonCode: z.string().min(1),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const completeBody = z.object({
  actualQty: z.string(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  batchNo: z.string().min(1).max(60),
  shelfLifeDays: z.number().int().min(0).max(3650).default(0),
});
const inspectionBody = z.object({
  inspectionNo: z.string().min(1).max(60),
  targetType: z.enum(["GRN", "PRODUCTION_ORDER"]),
  targetId: z.string().uuid(),
  batchId: z.string().uuid().nullish(),
  result: z.enum(["PASS", "FAIL", "SAMPLED"]),
  disposition: z.enum(["ACCEPT", "SCRAP", "REWORK", "RETURN_TO_SUPPLIER"]).default("ACCEPT"),
  sampleSize: z.number().int().min(1).default(1),
  notes: z.string().max(500).nullish(),
});

/**
 * PHASE-018 — manufacturing HTTP surface (matrix §3.8): BOM/orders/QC reads
 * + the lifecycle action endpoints. Every posting action runs through
 * ProductionOrderService → PostingService (ADR-0007); approve/post keys are
 * risky and audited server-side.
 */
@Controller("api/v1/manufacturing")
export class ManufacturingController {
  constructor(
    private readonly orders: ProductionOrderService,
    private readonly qc: QcService,
    private readonly queries: ManufacturingQueriesService,
  ) {}

  private tx() {
    const ctx = requireTenantContext();
    if (ctx.tx === undefined) throw new Error("no ambient tenant scope");
    return ctx.tx;
  }

  @Get("orders")
  @RequirePermissions("manufacturing.production_orders.view")
  @RequireFeature("manufacturing.production_orders")
  async listOrders(@Query("status") status?: string) {
    const rows = await this.tx().execute(sql`
      SELECT id, order_no AS "orderNo", status, planned_qty::text AS "plannedQty",
             actual_qty::text AS "actualQty", fg_item_id AS "fgItemId", created_at AS "createdAt"
      FROM production_orders
      WHERE (${status ?? null}::text IS NULL OR status = ${status ?? ""})
      ORDER BY created_at DESC LIMIT 200
    `);
    return envelope({ orders: rows.rows });
  }

  @Get("boms")
  @RequirePermissions("manufacturing.boms.manage")
  @RequireFeature("manufacturing.bom")
  async listBoms() {
    const rows = await this.tx().execute(sql`
      SELECT b.id, b.name, b.item_id AS "itemId", b.current_version AS "currentVersion",
             (SELECT count(*)::int FROM bom_lines bl JOIN bom_versions v ON v.id = bl.bom_version_id
              WHERE v.bom_id = b.id) AS lines
      FROM bills_of_materials b ORDER BY b.name LIMIT 200
    `);
    return envelope({ boms: rows.rows });
  }

  @Get("inspections")
  @RequirePermissions("manufacturing.qc.manage")
  @RequireFeature("manufacturing.qc")
  async listInspections() {
    const rows = await this.tx().execute(sql`
      SELECT id, inspection_no AS "inspectionNo", target_type AS "targetType", result, disposition,
             batch_id AS "batchId", inspected_at AS "inspectedAt"
      FROM inspections ORDER BY inspected_at DESC LIMIT 200
    `);
    return envelope({ inspections: rows.rows });
  }

  @Get("genealogy/:batchId")
  @RequirePermissions("manufacturing.genealogy.read")
  @RequireFeature("manufacturing.batch_genealogy")
  async genealogy(@Param("batchId") batchId: string, @Query("direction") direction = "both") {
    const upstream = direction !== "downstream" ? await this.queries.genealogyUpstream(batchId) : [];
    const downstream = direction !== "upstream" ? await this.queries.genealogyDownstream(batchId) : [];
    return envelope({ upstream, downstream });
  }

  @Post("orders/:id/release")
  @RequirePermissions("manufacturing.production_orders.approve")
  @RequireFeature("manufacturing.production_orders")
  @HttpCode(HttpStatus.OK)
  async release(@Req() request: ExpressRequest, @Param("id") id: string) {
    const identity = requireIdentity(request);
    return envelope(await this.orders.release({ orderId: id, actorId: identity.userId, year: String(new Date().getFullYear()) }));
  }

  @Post("orders/:id/consume")
  @RequirePermissions("manufacturing.production_orders.post")
  @RequireFeature("manufacturing.production_orders")
  @HttpCode(HttpStatus.OK)
  async consume(@Req() request: ExpressRequest, @Param("id") id: string, @Body() body: unknown) {
    const identity = requireIdentity(request);
    const input = consumeBody.parse(body);
    return envelope(await this.orders.consume({ orderId: id, actorId: identity.userId, ...input, batchId: input.batchId ?? null }));
  }

  @Post("orders/:id/scrap")
  @RequirePermissions("manufacturing.scrap.post")
  @RequireFeature("manufacturing.scrap")
  @HttpCode(HttpStatus.OK)
  async scrap(@Req() request: ExpressRequest, @Param("id") id: string, @Body() body: unknown) {
    const identity = requireIdentity(request);
    return envelope(await this.orders.scrap({ orderId: id, actorId: identity.userId, ...scrapBody.parse(body) }));
  }

  @Post("orders/:id/complete")
  @RequirePermissions("manufacturing.production_orders.post")
  @RequireFeature("manufacturing.production_orders")
  @HttpCode(HttpStatus.OK)
  async complete(@Req() request: ExpressRequest, @Param("id") id: string, @Body() body: unknown) {
    const identity = requireIdentity(request);
    return envelope(await this.orders.complete({ orderId: id, actorId: identity.userId, ...completeBody.parse(body) }));
  }

  @Post("orders/:id/cancel")
  @RequirePermissions("manufacturing.production_orders.approve")
  @RequireFeature("manufacturing.production_orders")
  @HttpCode(HttpStatus.OK)
  async cancel(@Req() request: ExpressRequest, @Param("id") id: string) {
    const identity = requireIdentity(request);
    await this.orders.cancel({ orderId: id, actorId: identity.userId });
    return envelope({ cancelled: true });
  }

  @Post("inspections")
  @RequirePermissions("manufacturing.qc.manage")
  @RequireFeature("manufacturing.qc")
  @HttpCode(HttpStatus.OK)
  async inspect(@Req() request: ExpressRequest, @Body() body: unknown) {
    const identity = requireIdentity(request);
    const input = inspectionBody.parse(body);
    await this.qc.recordInspection({ ...input, actorId: identity.userId, batchId: input.batchId ?? null, notes: input.notes ?? null });
    return envelope({ recorded: true });
  }

  @Post("inspections/release/:batchId")
  @RequirePermissions("manufacturing.qc.manage")
  @RequireFeature("manufacturing.qc")
  @HttpCode(HttpStatus.OK)
  async releaseBatch(@Req() request: ExpressRequest, @Param("batchId") batchId: string) {
    const identity = requireIdentity(request);
    await this.qc.releaseQuarantine({ batchId, actorId: identity.userId });
    return envelope({ released: true });
  }
}
