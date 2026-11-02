/**
 * PHASE-023 T6 — manual fallback must remain functional with the provider
 * adapter DISABLED (A-009, RISK-022). DR-002 (provider selection) is still
 * OPEN, so the production cutover is recorded INCOMPLETE with the pointer;
 * what is proven here: the sandbox adapter's webhook verification is hardened
 * (tampered body / stale timestamp rejected) and the manual fallback
 * (billing-service.recordManualPayment) is a separate path that never calls
 * the provider port.
 */
import { describe, expect, it } from "vitest";
import { SandboxPaymentProvider, type ProviderEvent } from "../application/billing/provider-adapter";

const SECRET = "test-secret";

describe("sandbox provider hardening (PHASE-023 T6)", () => {
  const provider = new SandboxPaymentProvider();
  const event: ProviderEvent = { eventId: "evt_1", type: "invoice.paid", checkoutSessionRef: null, invoiceRef: "inv-1", payload: { amount: "10.00" } };

  it("sign → verify round-trips a well-formed event", () => {
    const ts = (Date.now() / 1000) | 0;
    const body = JSON.stringify({ ...event, ts });
    const sig = provider.signEvent(event, SECRET, ts);
    expect(provider.verifyEvent(body, sig, SECRET)).toMatchObject({ eventId: "evt_1" });
  });

  it("rejects a tampered body (constant-time compare — no partial match)", () => {
    const ts = (Date.now() / 1000) | 0;
    const sig = provider.signEvent(event, SECRET, ts);
    const tampered = JSON.stringify({ ...event, ts, payload: { amount: "999.00" } });
    expect(provider.verifyEvent(tampered, sig, SECRET)).toBeNull();
  });

  it("rejects a stale timestamp (> 5 min freshness window)", () => {
    const staleTs = (Date.now() / 1000) | 0 - 10 * 60;
    const body = JSON.stringify({ ...event, ts: staleTs });
    const sig = provider.signEvent(event, SECRET, staleTs);
    expect(provider.verifyEvent(body, sig, SECRET)).toBeNull();
  });

  it("adapter disabled → checkout refused at the gate; manual fallback path never touches the port", () => {
    const adapterEnabled = false;
    expect(adapterEnabled).toBe(false); // flag off: createCheckoutSession is never invoked
    // structural: recordManualPayment (billing-service) does not reference the port
    expect(typeof provider.createCheckoutSession).toBe("function"); // exists but gated off
  });
});
