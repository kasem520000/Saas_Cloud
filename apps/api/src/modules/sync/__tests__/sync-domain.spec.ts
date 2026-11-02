import { describe, expect, it } from "vitest";

import { backoffCeiling, nextDelayMs, retriesExhausted, DEFAULT_RETRY_POLICY } from "../domain/retry";
import { bootstrapCursor, signCursor, verifyCursor, CursorError } from "../domain/cursor";
import { rejection, PUSH_REASONS } from "../domain/reasons";
import { MAX_BATCH_BYTES, MAX_BATCH_COMMANDS, validateBatch, type SyncCommand } from "../domain/batch";

function cmd(overrides: Partial<SyncCommand> = {}): SyncCommand {
  return {
    commandId: "018f3a2e-9c40-7000-8000-000000000001",
    entityType: "sales_invoice",
    intent: "pos_sale",
    idempotencyKey: "key-1",
    payload: {},
    ...overrides,
  };
}

describe("PHASE-020 retry scheduler (full jitter)", () => {
  it("backoff ceiling doubles with the attempt and caps at capMs", () => {
    expect(backoffCeiling(0)).toBe(250);
    expect(backoffCeiling(1)).toBe(500);
    expect(backoffCeiling(2)).toBe(1000);
    expect(backoffCeiling(20)).toBe(DEFAULT_RETRY_POLICY.capMs);
  });

  it("nextDelayMs is within [0, ceiling] and deterministic with a seeded random", () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const d = nextDelayMs(attempt, DEFAULT_RETRY_POLICY, () => 0.5);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(backoffCeiling(attempt));
      expect(d).toBe((0.5 * (backoffCeiling(attempt) + 1)) | 0);
    }
  });

  it("retriesExhausted flips exactly at maxAttempts", () => {
    expect(retriesExhausted(DEFAULT_RETRY_POLICY.maxAttempts - 1)).toBe(false);
    expect(retriesExhausted(DEFAULT_RETRY_POLICY.maxAttempts)).toBe(true);
  });
});

describe("PHASE-020 signed cursors", () => {
  it("sign → verify round-trips the payload", () => {
    const token = signCursor({ entityType: "items", seq: 42, issuedAt: 1700000000000 });
    const payload = verifyCursor(token, "items");
    expect(payload.seq).toBe(42);
    expect(payload.entityType).toBe("items");
  });

  it("a tampered token fails BAD_SIGNATURE", () => {
    const token = signCursor({ entityType: "items", seq: 1, issuedAt: 1 });
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(() => verifyCursor(tampered, "items")).toThrow(CursorError);
    try {
      verifyCursor(tampered, "items");
    } catch (e) {
      expect((e as CursorError).code).toBe("BAD_SIGNATURE");
    }
  });

  it("a cursor for another entity fails WRONG_ENTITY; garbage fails MALFORMED", () => {
    const token = signCursor({ entityType: "items", seq: 1, issuedAt: 1 });
    expect(() => verifyCursor(token, "partners_lite")).toThrow(CursorError);
    expect(() => verifyCursor("not-a-cursor", "items")).toThrow(CursorError);
  });

  it("a regressed cursor (seq < persisted) fails CURSOR_REGRESSION (C-12)", () => {
    const token = signCursor({ entityType: "items", seq: 5, issuedAt: 1 });
    expect(() => verifyCursor(token, "items", 10)).toThrow(CursorError);
    expect(verifyCursor(token, "items", 5).seq).toBe(5);
    expect(bootstrapCursor("items")).toContain(".");
  });
});

describe("PHASE-020 push reason registry", () => {
  it("every reason has a bilingual message and a resubmittable flag", () => {
    for (const reason of PUSH_REASONS) {
      const r = rejection(reason);
      expect(r.errorCode).toBe(reason);
      expect(r.message.en.length).toBeGreaterThan(0);
      expect(r.message.ar.length).toBeGreaterThan(0);
      expect(typeof r.resubmittable).toBe("boolean");
    }
    expect(rejection("DEVICE_REVOKED").resubmittable).toBe(false);
    expect(rejection("STALE_VERSION").resubmittable).toBe(true);
  });
});

describe("PHASE-020 batch validation", () => {
  it("accepts a valid batch at the budget edge", () => {
    const commands = Array.from({ length: MAX_BATCH_COMMANDS }, (_, i) => cmd({ commandId: `018f3a2e-9c40-7000-8000-${String(i).padStart(12, "0")}`, idempotencyKey: `k-${i}` }));
    expect(() => validateBatch(commands, MAX_BATCH_BYTES)).not.toThrow();
  });

  it("rejects > 50 commands and > 1 MB with BATCH_TOO_LARGE, empty with EMPTY_BATCH", () => {
    const tooMany = Array.from({ length: MAX_BATCH_COMMANDS + 1 }, (_, i) => cmd({ idempotencyKey: `k-${i}` }));
    expect(() => validateBatch(tooMany, 10)).toThrow(/50/);
    expect(() => validateBatch([cmd()], MAX_BATCH_BYTES + 1)).toThrow(/bytes/);
    expect(() => validateBatch([], 0)).toThrow(/at least one/);
  });

  it("rejects commands without commandId/idempotencyKey", () => {
    expect(() => validateBatch([cmd({ commandId: "" })], 10)).toThrow();
    expect(() => validateBatch([cmd({ idempotencyKey: "" })], 10)).toThrow();
  });
});
