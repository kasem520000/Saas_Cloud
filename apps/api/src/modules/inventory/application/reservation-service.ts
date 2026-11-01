import { Inject, Injectable } from "@nestjs/common";
import { Decimal } from "@erp/domain-core";
import { generateUuidV7 } from "@erp/domain-core";

import { AuditService } from "../../audit/api/audit";
import * as store from "../infrastructure/inventory.store";
import {
  ItemNotFoundError,
  ReservationNotFoundError,
  ReservationStateError,
  WarehouseNotFoundError,
} from "../domain/inventory-errors";
import { requirePositiveQty } from "./movement-core";

/**
 * Soft reservations (PHASE-010 T10; §2.13): the availability-netting MVP
 * seam — NEVER a hard allocation lock. Holders reserve qty against an
 * item-warehouse with an optional expiry; the availability service nets
 * ACTIVE non-expired rows out of on-hand. Hard/soft policies + the
 * entitlement-bearing feature surface (`inventory.reservations`) land in
 * PHASE-015; SALES_ORDER holders arrive with PHASE-012 (the holder_type
 * is ready for them).
 */
@Injectable()
export class ReservationService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async list(filter: { itemId?: string; warehouseId?: string; status?: string; limit: number }) {
    return store.listReservations(filter);
  }

  async find(id: string) {
    const reservation = await store.findReservationById(id);
    if (reservation === undefined) throw new ReservationNotFoundError(id);
    return reservation;
  }

  async create(input: {
    itemId: string;
    warehouseId: string;
    qty: string;
    holderType: "MANUAL" | "SALES_ORDER";
    holderId: string | null;
    expiresAt: string | null;
    note: string | null;
    actorId: string | null;
  }) {
    requirePositiveQty(input.qty, "reservation qty");
    const item = await store.findItemForInventory(input.itemId);
    if (item === undefined) throw new ItemNotFoundError(input.itemId);
    const warehouse = await store.findWarehouseById(input.warehouseId);
    if (warehouse === undefined) throw new WarehouseNotFoundError(input.warehouseId);
    const id = generateUuidV7();
    await store.insertReservation({
      id,
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      qty: new Decimal(input.qty).toFixed(6),
      holderType: input.holderType,
      holderId: input.holderId,
      expiresAt: input.expiresAt,
      note: input.note,
      createdBy: input.actorId,
    });
    await this.audit.record({
      action: "inventory.reservation_created",
      entityType: "stock_reservation",
      entityId: id,
      actorId: input.actorId ?? undefined,
      after: {
        itemId: input.itemId,
        warehouseId: input.warehouseId,
        qty: input.qty,
        holderType: input.holderType,
        expiresAt: input.expiresAt,
      },
    });
    return this.find(id);
  }

  async release(id: string, actorId: string | null) {
    await this.find(id);
    const flipped = await store.releaseReservation({ id, releasedBy: actorId });
    if (!flipped) throw new ReservationStateError(`reservation ${id} is not ACTIVE`);
    await this.audit.record({
      action: "inventory.reservation_released",
      entityType: "stock_reservation",
      entityId: id,
      actorId: actorId ?? undefined,
    });
  }

  async consume(id: string, actorId: string | null) {
    await this.find(id);
    const flipped = await store.consumeReservation(id);
    if (!flipped) throw new ReservationStateError(`reservation ${id} is not ACTIVE`);
    await this.audit.record({
      action: "inventory.reservation_consumed",
      entityType: "stock_reservation",
      entityId: id,
      actorId: actorId ?? undefined,
    });
  }

  /**
   * Expiry sweep (§2.13): flip lapsed ACTIVE rows to RELEASED. Availability
   * ignores them either way (expires_at <= now()); the sweep keeps the
   * pool honest and the volume bounded. The nightly job calls this before
   * the reorder scan.
   */
  async sweepExpired(actorId: string | null) {
    const released = await store.sweepExpiredReservations();
    if (released > 0) {
      // entity_id is a NOT NULL uuid — anchor the sweep's audit on the
      // first released row (the after payload carries the count).
      const firstReleased = (await store.listReservations({ status: "RELEASED", limit: 1 }))[0];
      await this.audit.record({
        action: "inventory.reservations_swept",
        entityType: "stock_reservation",
        entityId: firstReleased?.id ?? releasedRowFallback(),
        actorId: actorId ?? undefined,
        after: { released },
      });
    }
    return { released };
  }
}

/** A deterministic uuid-shaped anchor when the released-row lookup races. */
function releasedRowFallback(): string {
  return "00000000-0000-4000-8000-000000000000";
}
