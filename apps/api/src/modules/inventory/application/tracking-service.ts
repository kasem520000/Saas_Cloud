import { Inject, Injectable } from "@nestjs/common";
import { Decimal } from "@erp/domain-core";
import { generateUuidV7 } from "@erp/domain-core";

import { AuditService } from "../../audit/api/audit";
import * as store from "../infrastructure/inventory.store";
import {
  BatchExistsError,
  BatchNotFoundError,
  ItemNotFoundError,
  SerialExistsError,
  SerialNotFoundError,
} from "../domain/inventory-errors";
import { StockService } from "./stock-service";

/**
 * Tracking service (PHASE-010 T9; §2.11/§2.12; BR-017/BR-018): the batch/
 * lot + serial/IMEI registries and their workflow endpoints.
 *
 * FEFO issuing is enforced in the movement core (has_expiry items pick
 * earliest-expiry batches first — INVENTORY_ACCOUNTING §5's costing–picking
 * decoupling keeps the costing math untouched). The expiry write-off
 * posts as shrinkage with reason EXPIRED (§2.11) through the same manual
 * issue path — never around the posting engine.
 */
@Injectable()
export class TrackingService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    private readonly stock: StockService,
  ) {}

  // -- batches ------------------------------------------------------------------

  async listBatches(filter: { itemId?: string; expiredOnly?: boolean; limit: number }) {
    return store.listBatches(filter);
  }

  async findBatch(id: string) {
    const batch = await store.findBatchById(id);
    if (batch === undefined) throw new BatchNotFoundError(id);
    return batch;
  }

  async registerBatch(input: {
    itemId: string;
    batchNo: string;
    expiryDate: string | null;
    sourceRef: string | null;
    actorId: string | null;
  }) {
    const item = await store.findItemForInventory(input.itemId);
    if (item === undefined) throw new ItemNotFoundError(input.itemId);
    if (item.hasExpiry && (input.expiryDate ?? null) === null) {
      const { BatchRequiredError } = await import("../domain/inventory-errors");
      throw new BatchRequiredError(input.itemId);
    }
    const existing = await store.findBatchByNo(input.itemId, input.batchNo);
    if (existing !== undefined) throw new BatchExistsError(input.itemId, input.batchNo);
    const id = generateUuidV7();
    await store.insertBatch({
      id,
      itemId: input.itemId,
      batchNo: input.batchNo,
      expiryDate: input.expiryDate,
      sourceRef: input.sourceRef,
      createdBy: input.actorId,
    });
    await this.audit.record({
      action: "inventory.batch_registered",
      entityType: "item_batch",
      entityId: id,
      actorId: input.actorId ?? undefined,
      after: { itemId: input.itemId, batchNo: input.batchNo, expiryDate: input.expiryDate },
    });
    return this.findBatch(id);
  }

  /**
   * Expiry write-off (§2.11): an expired batch leaves the books as
   * shrinkage with reason EXPIRED — qty = the batch's on-hand (the
   * append-only move ledger is the truth), one journal, zero residue.
   */
  async writeOffExpiredBatch(input: {
    batchId: string;
    warehouseId: string;
    valueDate: string;
    actorId: string | null;
  }) {
    const batch = await this.findBatch(input.batchId);
    const onHand = await store.batchOnHand(batch.id);
    if (new Decimal(onHand).lte(0)) {
      const { BatchNotOnHandError } = await import("../domain/inventory-errors");
      throw new BatchNotOnHandError({ batchNo: batch.batchNo, onHand, requested: "any" });
    }
    const result = await this.stock.manualIssue({
      itemId: batch.itemId,
      warehouseId: input.warehouseId,
      qty: onHand,
      reason: "EXPIRED",
      counterAccountId: null,
      valueDate: input.valueDate,
      batchId: batch.id,
      note: `Expiry write-off — ${batch.batchNo}`,
      noteAr: `شطب منتهي الصلاحية — ${batch.batchNo}`,
      actorId: input.actorId,
    });
    await store.markBatchWrittenOff(batch.id);
    await this.audit.record({
      action: "inventory.batch_written_off",
      entityType: "item_batch",
      entityId: batch.id,
      actorId: input.actorId ?? undefined,
      after: { batchNo: batch.batchNo, qty: onHand, journalEntryId: result.journalEntryId },
    });
    return { ...result, batchNo: batch.batchNo, qty: onHand };
  }

  // -- serials --------------------------------------------------------------------

  async listSerials(filter: { itemId?: string; status?: string; limit: number }) {
    return store.listSerials(filter);
  }

  async findSerial(id: string) {
    const serial = await store.findSerialById(id);
    if (serial === undefined) throw new SerialNotFoundError(id);
    return serial;
  }

  async registerSerial(input: {
    itemId: string;
    serialNo: string;
    imei: string | null;
    actorId: string | null;
  }) {
    const item = await store.findItemForInventory(input.itemId);
    if (item === undefined) throw new ItemNotFoundError(input.itemId);
    const existing = await store.findSerialByNo(input.itemId, input.serialNo);
    if (existing !== undefined) throw new SerialExistsError(input.itemId, input.serialNo);
    const id = generateUuidV7();
    await store.insertSerial({
      id,
      itemId: input.itemId,
      serialNo: input.serialNo,
      imei: input.imei,
      createdBy: input.actorId,
    });
    await this.audit.record({
      action: "inventory.serial_registered",
      entityType: "item_serial",
      entityId: id,
      actorId: input.actorId ?? undefined,
      after: { itemId: input.itemId, serialNo: input.serialNo, imei: input.imei },
    });
    return this.findSerial(id);
  }

  /** The serial's original sale move (BR-018 return-cost lookup surface). */
  async serialSale(serialId: string) {
    const serial = await this.findSerial(serialId);
    const original = await store.findSerialIssueMove(serial.id);
    return {
      serial,
      originalIssue:
        original === undefined
          ? null
          : {
              unitCost: original.unitCost,
              movedAt: original.movedAt,
              warehouseId: original.warehouseId,
            },
    };
  }
}
