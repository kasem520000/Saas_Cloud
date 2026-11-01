import { Inject, Injectable, Optional } from "@nestjs/common";
import { UsageService } from "../../tenancy/api";
import { Decimal } from "@erp/domain-core";

import { AuditService } from "../../audit/api/audit";
import * as store from "../infrastructure/inventory.store";
import {
  InvalidQuantityError,
  WarehouseCodeExistsError,
  WarehouseNotDeactivatableError,
  WarehouseNotFoundError,
} from "../domain/inventory-errors";

/**
 * Warehouse service (PHASE-010 T2; §2.1/§2.2): tenant stock locations under
 * a PHASE-004 branch, with the optional GL inventory-account override that
 * realizes G-15's branch-distinct valuation accounts (NULL ⇒ the tenant's
 * active INVENTORY purpose). Deactivation blocks new documents; every
 * historical row (moves FK'd RESTRICT) is preserved. Per-item-per-
 * warehouse reorder/min defaults ride `item_warehouse_settings` (BR-019's
 * job substrate — the in-app alert surface lands PHASE-015).
 */
@Injectable()
export class WarehouseService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    // PHASE-014 §6: warehouses counter (read-model; best-effort — never blocks).
    @Optional() @Inject(UsageService) private readonly usage: UsageService | null,
  ) {}

  async list(filter: { activeOnly?: boolean; branchId?: string; limit: number }) {
    return store.listWarehouses(filter);
  }

  async find(id: string) {
    const warehouse = await store.findWarehouseById(id);
    if (warehouse === undefined) throw new WarehouseNotFoundError(id);
    return warehouse;
  }

  async create(input: {
    branchId: string;
    code: string;
    name: string;
    nameAr: string | null;
    inventoryAccountId: string | null;
    note: string | null;
    actorId: string | null;
  }) {
    const existing = await store.findWarehouseByCode(input.code);
    if (existing !== undefined) throw new WarehouseCodeExistsError(input.code);
    const created = await store.insertWarehouse({
      branchId: input.branchId,
      code: input.code,
      name: input.name,
      nameAr: input.nameAr,
      inventoryAccountId: input.inventoryAccountId,
      note: input.note,
      createdBy: input.actorId,
    });
    await this.audit.record({
      action: "inventory.warehouse_created",
      entityType: "warehouse",
      entityId: created.id,
      actorId: input.actorId ?? undefined,
      after: {
        code: created.code,
        name: created.name,
        branchId: created.branchId,
        inventoryAccountId: created.inventoryAccountId,
      },
    });
    await this.recordCounterDelta("warehouses", 1);
    return created;
  }

  async update(
    id: string,
    patch: {
      name?: string;
      nameAr?: string | null;
      inventoryAccountId?: string | null;
      note?: string | null;
    },
    actorId: string | null,
  ) {
    await this.find(id);
    await store.updateWarehouse(id, patch);
    await this.audit.record({
      action: "inventory.warehouse_updated",
      entityType: "warehouse",
      entityId: id,
      actorId: actorId ?? undefined,
      after: patch,
    });
    return store.findWarehouseById(id);
  }

  async deactivate(id: string, actorId: string | null) {
    const warehouse = await this.find(id);
    const inTransit = await store.listInTransit(id);
    if (inTransit.length > 0) {
      throw new WarehouseNotDeactivatableError(
        `warehouse ${warehouse.code} has ${inTransit.length} IN_TRANSIT transfer lines — receive or cancel them first`,
      );
    }
    await store.deactivateWarehouse(id, actorId);
    await this.recordCounterDelta("warehouses", -1);
    await this.audit.record({
      action: "inventory.warehouse_deactivated",
      entityType: "warehouse",
      entityId: id,
      actorId: actorId ?? undefined,
      after: { code: warehouse.code },
    });
  }

  async reactivate(id: string, actorId: string | null) {
    await this.find(id);
    await store.reactivateWarehouse(id);
    await this.recordCounterDelta("warehouses", 1);
    await this.audit.record({
      action: "inventory.warehouse_reactivated",
      entityType: "warehouse",
      entityId: id,
      actorId: actorId ?? undefined,
    });
  }

  /** PHASE-014: best-effort counter delta — a counter failure never fails the action. */
  private async recordCounterDelta(counterKey: "warehouses", delta: number): Promise<void> {
    if (this.usage === null || this.usage === undefined) {
      return;
    }
    try {
      await this.usage.recordResourceDelta(counterKey, delta);
    } catch {
      // INV-022: counters are a read-model; never let them gate the action.
    }
  }

  async upsertItemSetting(input: {
    itemId: string;
    warehouseId: string;
    reorderLevel: string;
    minQty: string;
    actorId: string | null;
  }) {
    await this.find(input.warehouseId);
    const QTY_RE = /^\d+(\.\d{1,6})?$/;
    if (!QTY_RE.test(input.reorderLevel) || !QTY_RE.test(input.minQty)) {
      throw new InvalidQuantityError(
        `reorderLevel/minQty must be non-negative decimals (≤ 6dp): ${input.reorderLevel}/${input.minQty}`,
      );
    }
    const setting = await store.upsertItemWarehouseSetting({
      itemId: input.itemId,
      warehouseId: input.warehouseId,
      reorderLevel: new Decimal(input.reorderLevel).toFixed(6),
      minQty: new Decimal(input.minQty).toFixed(6),
      createdBy: input.actorId,
    });
    await this.audit.record({
      action: "inventory.item_warehouse_setting_upserted",
      entityType: "item_warehouse_setting",
      entityId: setting.id,
      actorId: input.actorId ?? undefined,
      after: {
        itemId: input.itemId,
        warehouseId: input.warehouseId,
        reorderLevel: setting.reorderLevel,
        minQty: setting.minQty,
      },
    });
    return setting;
  }
}
