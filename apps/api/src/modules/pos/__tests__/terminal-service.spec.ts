import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  TerminalCodeConflictError,
  TerminalCodeInvalidError,
  TerminalNotFoundError,
} from "../domain/pos-errors";

/**
 * PHASE-016 T2 unit slice — terminal registry validation: code shape
 * (^[A-Z0-9-]{2,20}$, upper-cased), receipt size 80/58 only, duplicate code
 * conflict, unknown id on status/device bind. DB lifecycle proof lives in
 * `__db__/pos/pos-flow.db.spec.ts`.
 */

vi.mock("../../audit/application/audit.service", () => ({
  AuditService: class {
    record = vi.fn(async () => undefined);
  },
}));

vi.mock("../infrastructure/pos.store", () => ({
  listTerminals: vi.fn(async () => []),
  findTerminalByCode: vi.fn(async () => undefined),
  findTerminalById: vi.fn(async () => undefined),
  insertTerminal: vi.fn(async (input: { code: string }) => ({ id: "t-1", ...input, status: "ACTIVE" })),
  setTerminalStatus: vi.fn(async () => undefined),
  bindDevice: vi.fn(async () => undefined),
}));

import { AuditService } from "../../audit/application/audit.service";
import * as store from "../infrastructure/pos.store";
import { TerminalService } from "../application/terminal.service";

const base = {
  branchId: "b-1",
  deviceId: null,
  code: "pos-1",
  name: "Counter 1",
  cashAccountId: "ca-1",
  receiptSizeMm: 80,
  actorId: "u-1",
};

describe("PHASE-016 terminal registry (unit)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("register upper-cases the code and inserts + audits", async () => {
    const svc = new TerminalService(new AuditService());
    const row = await svc.register({ ...base, code: "pos-1" });
    expect(row.code).toBe("POS-1");
    expect(store.insertTerminal).toHaveBeenCalledWith(expect.objectContaining({ code: "POS-1" }));
  });

  it("register rejects invalid code shapes fail-closed", async () => {
    const svc = new TerminalService(new AuditService());
    await expect(svc.register({ ...base, code: "x" })).rejects.toBeInstanceOf(TerminalCodeInvalidError);
    await expect(svc.register({ ...base, code: "has space" })).rejects.toBeInstanceOf(TerminalCodeInvalidError);
    await expect(svc.register({ ...base, code: "a".repeat(21) })).rejects.toBeInstanceOf(TerminalCodeInvalidError);
  });

  it("register rejects receipt sizes other than 80/58", async () => {
    const svc = new TerminalService(new AuditService());
    await expect(svc.register({ ...base, receiptSizeMm: 57 })).rejects.toBeInstanceOf(TerminalCodeInvalidError);
  });

  it("register rejects a duplicate code with a conflict error", async () => {
    vi.mocked(store.findTerminalByCode).mockResolvedValueOnce({ id: "t-0", code: "POS-1" } as never);
    const svc = new TerminalService(new AuditService());
    await expect(svc.register({ ...base })).rejects.toBeInstanceOf(TerminalCodeConflictError);
    expect(store.insertTerminal).not.toHaveBeenCalled();
  });

  it("setStatus on an unknown terminal ⇒ TerminalNotFoundError", async () => {
    const svc = new TerminalService(new AuditService());
    await expect(svc.setStatus("nope", "INACTIVE", "u-1")).rejects.toBeInstanceOf(TerminalNotFoundError);
  });

  it("bindDevice on an unknown terminal ⇒ TerminalNotFoundError, no bind", async () => {
    const svc = new TerminalService(new AuditService());
    await expect(svc.bindDevice("nope", "dev-1", "u-1")).rejects.toBeInstanceOf(TerminalNotFoundError);
    expect(store.bindDevice).not.toHaveBeenCalled();
  });
});
