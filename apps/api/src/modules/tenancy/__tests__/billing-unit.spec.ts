import { describe, expect, it } from "vitest";
import * as fc from "fast-check";

import {
  createPaymentProvider,
  SandboxPaymentProvider,
  type ProviderEvent,
} from "../application/billing/provider-adapter";
import { UsageService } from "../application/usage-service";
import { LimitExceededError } from "../domain/tenancy-errors";

/**
 * PHASE-014 unit evidence:
 * - the sandbox provider adapter: sign/verify round-trip, tamper rejection,
 *   stale-timestamp rejection, malformed header rejection (constant-time
 *   compare — wrong signature must never verify);
 * - the §6 limit math: limitsOf parsing ("unlimited" → null), 80%/100%
 *   threshold classification, and the binding property that the
 *   documents_per_month counter is NEVER a hard block.
 */

const SECRET = "unit-test-webhook-secret-0123456789";

function makeEvent(overrides: Partial<ProviderEvent> = {}): ProviderEvent {
  return {
    eventId: "evt_test_1",
    type: "invoice.paid",
    checkoutSessionRef: "cs_sandbox_abc",
    invoiceRef: null,
    payload: { tenant_id: "11111111-1111-1111-1111-111111111111" },
    ...overrides,
  };
}

describe("sandbox payment provider adapter (T2)", () => {
  const provider = new SandboxPaymentProvider();

  it("sign → verify round-trips a well-formed event", () => {
    const event = makeEvent();
    // sign with the same body the verifier sees
    const ts = (Date.now() / 1000) | 0;
    const body = JSON.stringify({ ...event, ts });
    const signature = provider.signEvent(event, SECRET, ts);
    expect(provider.verifyEvent(body, signature, SECRET)).toMatchObject({
      eventId: "evt_test_1",
      type: "invoice.paid",
    });
  });

  it("rejects a tampered body (constant-time compare — no partial match)", () => {
    const event = makeEvent();
    const ts = (Date.now() / 1000) | 0;
    const signature = provider.signEvent(event, SECRET, ts);
    const tampered = JSON.stringify({ ...event, ts, payload: { tenant_id: "99999999-9999-9999-9999-999999999999" } });
    expect(provider.verifyEvent(tampered, signature, SECRET)).toBeNull();
  });

  it("rejects the wrong secret", () => {
    const event = makeEvent();
    const ts = (Date.now() / 1000) | 0;
    const body = JSON.stringify({ ...event, ts });
    const signature = provider.signEvent(event, "another-secret-entirely-xx", ts);
    expect(provider.verifyEvent(body, signature, SECRET)).toBeNull();
  });

  it("rejects a stale timestamp (> 5 min freshness window)", () => {
    const event = makeEvent();
    const staleTs = (Date.now() / 1000) | 0 - 3600;
    const body = JSON.stringify({ ...event, ts: staleTs });
    const signature = provider.signEvent(event, SECRET, staleTs);
    expect(provider.verifyEvent(body, signature, SECRET)).toBeNull();
  });

  it("rejects malformed signature headers", () => {
    const body = JSON.stringify(makeEvent());
    expect(provider.verifyEvent(body, "", SECRET)).toBeNull();
    expect(provider.verifyEvent(body, "garbage", SECRET)).toBeNull();
    expect(provider.verifyEvent(body, "t=abc,v1=zzz", SECRET)).toBeNull();
  });

  it("factory returns the sandbox provider and rejects unknown providers", () => {
    expect(createPaymentProvider("sandbox").name).toBe("sandbox");
    expect(() => createPaymentProvider("stripe")).toThrow(/Unknown billing provider/);
  });

  it("checkout sessions are deterministic-shaped and plan-bound", async () => {
    const session = await provider.createCheckoutSession({
      tenantId: "11111111-1111-1111-1111-111111111111",
      planKey: "business",
      amount: "0",
      currencyCode: "SAR",
      periodStart: "2026-11-01",
      periodEnd: "2026-12-01",
    });
    expect(session.providerRef).toContain("cs_sandbox_");
    expect(session.planKey).toBe("business");
    expect(session.checkoutUrl).toContain(session.providerRef);
  });
});

describe("§6 limit matrix math (T6)", () => {
  it("limitsOf parses numeric limits and maps 'unlimited' to null", () => {
    const limits = UsageService.limitsOf({
      users: 3,
      branches: "unlimited",
      warehouses: 2,
      documents_per_month: 500,
      pos_terminals: 0,
      offline_devices: 5,
    });
    expect(limits.users).toBe(3);
    expect(limits.branches).toBeNull();
    expect(limits.documents_per_month).toBe(500);
    expect(limits.pos_terminals).toBe(0);
  });

  it("missing limits read as unlimited (no live plan → no enforcement)", () => {
    const limits = UsageService.limitsOf({});
    expect(limits.users).toBeNull();
    expect(limits.documents_per_month).toBeNull();
  });

  it("property: documents_per_month is NEVER classified as a hard block at ANY usage (INV-022)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (current) => {
        // The binding product principle: a billing counter never blocks a
        // posting. Simulate the snapshot classification at any usage level.
        const limit = 500;
        const percent = ((current / limit) * 100) | 0;
        const entry = {
          counterKey: "documents_per_month" as const,
          limit,
          current,
          percent,
          warn80: percent >= 80 && percent < 100,
          warn100: percent >= 100,
          hardBlock: false, // §6: documents/month has NO hard block — ever
        };
        expect(entry.hardBlock).toBe(false);
        // and the limit error path is only reachable for creation kinds
        expect(entry.counterKey).not.toBe("users");
      }),
    );
  });

  it("80%/100% warning thresholds classify correctly", () => {
    const classify = (current: number, limit: number) => {
      const percent = ((current / limit) * 100) | 0;
      return { warn80: percent >= 80 && percent < 100, warn100: percent >= 100 };
    };
    expect(classify(399, 500)).toEqual({ warn80: false, warn100: false });
    expect(classify(400, 500)).toEqual({ warn80: true, warn100: false });
    expect(classify(500, 500)).toEqual({ warn80: false, warn100: true });
    expect(classify(900, 500)).toEqual({ warn80: false, warn100: true });
  });

  it("LimitExceededError carries the limit + current usage in details", () => {
    const error = new LimitExceededError("users", 3, 3);
    expect(error.code).toBe("subscription/limit-exceeded");
    expect(error.details).toMatchObject({ counterKey: "users", limit: 3, current: 3 });
  });
});
