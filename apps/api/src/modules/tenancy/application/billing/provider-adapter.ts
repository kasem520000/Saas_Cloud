import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * PHASE-014 T2 — payment-provider adapter PORT (SUBSCRIPTION_AND_
 * ENTITLEMENTS §10; OQ-003 decision record keeps the provider choice open;
 * RISK-022 mitigation: the port is normative, the sandbox implementation is
 * the shipped default, and the manual fallback ships alongside).
 *
 * The sandbox provider is deterministic and fully local: a checkout session
 * is a signed record; the "webhook" is an HMAC-signed event the platform
 * delivers to /api/v1/platform/billing/webhook with a
 * `X-Provider-Signature: t=<ts>,v1=<hmac>` header (Stripe-style shape).
 * Signature verification is constant-time; replay protection lives in
 * `billing_events.provider_event_id` (UNV-013 discipline).
 */

export interface CheckoutSession {
  sessionId: string;
  providerRef: string;
  /** Sandbox: the hosted-page URL is a local marker — no real provider page. */
  checkoutUrl: string;
  planKey: string;
  amount: string;
  currencyCode: string;
}

export interface ProviderEvent {
  eventId: string;
  type: "checkout.session.completed" | "invoice.paid" | "invoice.payment_failed";
  checkoutSessionRef: string | null;
  invoiceRef: string | null;
  payload: Record<string, unknown>;
}

export interface PaymentProviderPort {
  readonly name: string;
  createCheckoutSession(input: {
    tenantId: string;
    planKey: string;
    amount: string;
    currencyCode: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<CheckoutSession>;
  /** Build a signed webhook payload for the sandbox provider. */
  signEvent(event: ProviderEvent, secret: string, timestampSeconds: number): string;
  /** Verify a webhook signature header; returns the parsed event or null. */
  verifyEvent(rawBody: string, signatureHeader: string, secret: string): ProviderEvent | null;
}

const SANDBOX_BASE = "https://sandbox.billing.erp.local";

export class SandboxPaymentProvider implements PaymentProviderPort {
  readonly name = "sandbox";

  async createCheckoutSession(input: {
    tenantId: string;
    planKey: string;
    amount: string;
    currencyCode: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<CheckoutSession> {
    const sessionId = `cs_sandbox_${input.tenantId.slice(0, 8)}_${input.planKey}_${Date.now()}`;
    return {
      sessionId,
      providerRef: sessionId,
      checkoutUrl: `${SANDBOX_BASE}/checkout/${sessionId}`,
      planKey: input.planKey,
      amount: input.amount,
      currencyCode: input.currencyCode,
    };
  }

  signEvent(event: ProviderEvent, secret: string, timestampSeconds: number): string {
    const body = JSON.stringify({ ...event, ts: timestampSeconds });
    const mac = createHmac("sha256", secret).update(body).digest("hex");
    return `t=${timestampSeconds},v1=${mac}`;
  }

  verifyEvent(rawBody: string, signatureHeader: string, secret: string): ProviderEvent | null {
    const parts = Object.fromEntries(
      signatureHeader.split(",").map((pair) => {
        const idx = pair.indexOf("=");
        return [pair.slice(0, idx), pair.slice(idx + 1)];
      }),
    );
    const ts = parts["t"];
    const v1 = parts["v1"];
    if (ts === undefined || v1 === undefined) {
      return null;
    }
    const expected = createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    const a = Buffer.from(v1);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }
    // Freshness window: 5 minutes (replay-with-old-timestamp protection).
    const age = Math.abs(Date.now() / 1000 - Number(ts));
    if (!Number.isFinite(age) || age > 300) {
      return null;
    }
    try {
      const parsed = JSON.parse(rawBody) as ProviderEvent & { ts?: number };
      if (typeof parsed.eventId !== "string" || typeof parsed.type !== "string") {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }
}

/** Factory: the provider choice is configuration (OQ-003); sandbox is the only shipped adapter. */
export function createPaymentProvider(name: string): PaymentProviderPort {
  if (name === "sandbox") {
    return new SandboxPaymentProvider();
  }
  throw new Error(`Unknown billing provider: ${name}`);
}
