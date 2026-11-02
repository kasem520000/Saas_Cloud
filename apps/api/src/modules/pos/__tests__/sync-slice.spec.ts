import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeviceRevokedError } from "../domain/pos-errors";

/**
 * PHASE-016 T8 unit slice — the narrow server sync slice (SYNC_PROTOCOL §11):
 * batch budget (≤ 50), revoked-device rejection BEFORE execution, per-item
 * ACCEPTED/REJECTED/DEFERRED results, feed-group pull cursors with tombstones.
 * The DB-backed end-to-end proof lives in `__db__/pos/pos-flow.db.spec.ts`.
 */

vi.mock("../infrastructure/pos.store", () => ({
  deviceIsLive: vi.fn(async () => true),
  getCursor: vi.fn(async () => 0),
  setCursor: vi.fn(async () => undefined),
  readChangeLog: vi.fn(async () => [] as Array<{ seq: number; entityId: string; op: string; payload: unknown }>),
}));

vi.mock("../application/pos-sale.service", () => ({
  PosSaleService: class {},
}));

import * as store from "../infrastructure/pos.store";
import { SyncSliceService, type PushCommand } from "../application/sync-slice.service";

function makeSaleService(outcome: { status: "ACCEPTED" | "REJECTED"; result: Record<string, unknown>; replay: boolean }) {
  return {
    executePosSaleCommand: vi.fn(async () => outcome),
  } as unknown as import("../application/pos-sale.service").PosSaleService;
}

function saleCommand(key: string): PushCommand {
  return { idempotencyKey: key, clientId: "client-1", type: "pos_sale", payload: {} };
}

describe("PHASE-016 sync slice (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("push: batch > 50 commands ⇒ every item REJECTED with BATCH_TOO_LARGE, engine never called", async () => {
    const posSale = makeSaleService({ status: "ACCEPTED", result: {}, replay: false });
    const svc = new SyncSliceService(posSale);
    const commands = Array.from({ length: 51 }, (_, i) => saleCommand(`k${i}`));
    const { results } = await svc.push({ deviceId: "dev-1", commands });
    expect(results).toHaveLength(51);
    for (const r of results) {
      expect(r.status).toBe("REJECTED");
      expect(r.result.errorCode).toBe("BATCH_TOO_LARGE");
    }
    expect(posSale.executePosSaleCommand).not.toHaveBeenCalled();
  });

  it("push: revoked device ⇒ DEVICE_REVOKED before any command executes (zero effects)", async () => {
    vi.mocked(store.deviceIsLive).mockResolvedValueOnce(false);
    const posSale = makeSaleService({ status: "ACCEPTED", result: {}, replay: false });
    const svc = new SyncSliceService(posSale);
    await expect(svc.push({ deviceId: "dev-revoked", commands: [saleCommand("k1")] })).rejects.toBeInstanceOf(
      DeviceRevokedError,
    );
    expect(posSale.executePosSaleCommand).not.toHaveBeenCalled();
  });

  it("push: pos_sale command ⇒ per-item ACCEPTED with replay flag passed through (C-01 shape)", async () => {
    const posSale = makeSaleService({
      status: "ACCEPTED",
      result: { invoiceNo: "POS-B1-2611-00001" },
      replay: true,
    });
    const svc = new SyncSliceService(posSale);
    const { results } = await svc.push({ deviceId: "dev-1", commands: [saleCommand("k1")] });
    expect(results[0]).toMatchObject({
      idempotencyKey: "k1",
      status: "ACCEPTED",
      result: { invoiceNo: "POS-B1-2611-00001", replay: true },
    });
  });

  it("push: command types outside the POS slice ⇒ DEFERRED (honest, never dropped)", async () => {
    const posSale = makeSaleService({ status: "ACCEPTED", result: {}, replay: false });
    const svc = new SyncSliceService(posSale);
    const { results } = await svc.push({
      deviceId: "dev-1",
      commands: [{ idempotencyKey: "s1", clientId: "c", type: "cashier_shift", payload: {} }],
    });
    expect(results[0]?.status).toBe("DEFERRED");
    expect(results[0]?.result.errorCode).toBe("NOT_IN_POS_SLICE");
  });

  it("pull: entity outside the POS feed group ⇒ empty page, cursor untouched", async () => {
    const svc = new SyncSliceService(makeSaleService({ status: "ACCEPTED", result: {}, replay: false }));
    const page = await svc.pull({ deviceId: "dev-1", entity: "journal_lines", cursor: 7 });
    expect(page.changes).toEqual([]);
    expect(page.nextCursor).toBe(7);
    expect(store.setCursor).not.toHaveBeenCalled();
  });

  it("pull: advances the cursor to the last change seq and surfaces DELETE tombstones", async () => {
    vi.mocked(store.readChangeLog).mockResolvedValueOnce([
      { seq: 11, entityId: "i1", op: "UPSERT", payload: {} },
      { seq: 12, entityId: "i2", op: "DELETE", payload: {} },
    ]);
    const svc = new SyncSliceService(makeSaleService({ status: "ACCEPTED", result: {}, replay: false }));
    const page = await svc.pull({ deviceId: "dev-1", entity: "items" });
    expect(page.nextCursor).toBe(12);
    expect(page.tombstones).toEqual([{ seq: 12, entityId: "i2" }]);
    expect(store.setCursor).toHaveBeenCalledWith("dev-1", "items", 12);
  });
});
