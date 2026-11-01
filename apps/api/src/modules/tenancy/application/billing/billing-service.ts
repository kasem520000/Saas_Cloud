import { Inject, Injectable } from "@nestjs/common";

import { AuditService } from "../../../audit/api/audit";
import { env } from "../../../../config/env";
import { withPlatformScope, withTenantOnTx } from "../../../../infra/db/tenant-context";
import { childLogger } from "../../../../infra/observability/logger";
import { NotificationsService } from "../../../notifications/api";
import { publishTenancyEvent } from "../../../configuration/api";
import * as store from "../../infrastructure/tenancy.store";
import * as billingStore from "../../infrastructure/billing.store";
import { EntitlementsService } from "../entitlements-service";
import {
  BillingRecordNotFoundError,
  CheckoutInvalidError,
  InvalidSubscriptionTransitionError,
  WebhookSignatureInvalidError,
} from "../../domain/tenancy-errors";
import {
  createPaymentProvider,
  type PaymentProviderPort,
  type ProviderEvent,
} from "./provider-adapter";

/**
 * PHASE-014 T2/T3 — billing service (SUBSCRIPTION_AND_ENTITLEMENTS §10;
 * A-009/OQ-003):
 *
 * - sandbox checkout: `createCheckoutSession` opens an OPEN invoice bound to
 *   a provider session ref and records `checkout.session.created`;
 * - the webhook (`handleWebhook`) is signature-verified (HMAC, constant-time,
 *   5-minute freshness) and replay-safe (`billing_events.provider_event_id`
 *   unique — a redelivered event is acknowledged idempotently, never an
 *   error, INV-013 discipline);
 * - the MANDATORY manual fallback `recordManualPayment` (platform staff,
 *   reason required, audited via_platform_admin) produces the identical
 *   end state: invoice PAID + subscription ACTIVE + entitlements
 *   re-materialized — both paths show identically in billing history.
 *
 * All state changes run inside the target tenant's UoW (never mid-state —
 * §10.3) and every transition is audited + emitted as a billing event.
 */

const log = childLogger({ module: "billing" });

const WEBHOOK_SECRET = env.BILLING_WEBHOOK_SECRET ?? "dev-billing-webhook-secret";

@Injectable()
export class BillingService {
  private readonly provider: PaymentProviderPort;

  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {
    this.provider = createPaymentProvider(env.BILLING_PROVIDER);
  }

  /** Tenant-plane (owner): open a sandbox checkout session for a plan. */
  async createCheckoutSession(
    actorId: string,
    input: { planKey: string },
  ): Promise<{ session: unknown; invoice: billingStore.InvoiceRow }> {
    const plan = await store.findPlanByKey(input.planKey);
    if (plan === undefined || !plan.isActive) {
      throw new CheckoutInvalidError(`Plan ${input.planKey} is not purchasable`);
    }
    const live = await billingStore.liveSubscription();
    if (live !== undefined) {
      const livePlan = await store.findPlanById(live.planId);
      if (livePlan?.key === plan.key && live.status === "ACTIVE") {
        throw new CheckoutInvalidError("Tenant already holds this plan as ACTIVE");
      }
    }
    const now = new Date();
    const periodStart = now.toISOString().slice(0, 10);
    const periodEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const session = await this.provider.createCheckoutSession({
      tenantId: (await store.getOwnTenant()).id,
      planKey: plan.key,
      amount: plan.priceAmount,
      currencyCode: plan.currencyCode,
      periodStart,
      periodEnd,
    });
    const dueDate = new Date(now.getTime() + env.SUBSCRIPTION_GRACE_DAYS * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);
    // The invoice is bound to the checkout session; the subscription row is
    // only created/activated on payment confirmation (webhook or manual).
    const subscription = live ?? (await this.createPendingSubscription(plan.id, periodStart, periodEnd, session.providerRef));
    const invoice = await billingStore.insertInvoice({
      subscriptionId: subscription.id,
      number: await billingStore.nextInvoiceNumber(),
      amount: plan.priceAmount,
      currencyCode: plan.currencyCode,
      periodStart,
      periodEnd,
      dueDate,
      providerRef: session.providerRef,
      createdBy: actorId,
    });
    await billingStore.insertBillingEvent({
      eventType: "checkout.session.created",
      subscriptionId: subscription.id,
      invoiceId: invoice.id,
      providerEventId: null,
      payload: { planKey: plan.key, sessionId: session.sessionId, amount: plan.priceAmount },
      actorId,
    });
    await this.audit.record({
      action: "billing.checkout_created",
      entityType: "subscription_invoice",
      entityId: invoice.id,
      actorId,
      after: { plan: plan.key, number: invoice.number, amount: invoice.amount },
    });
    return { session, invoice };
  }

  private async createPendingSubscription(
    planId: string,
    periodStart: string,
    periodEnd: string,
    providerRef: string,
  ): Promise<billingStore.SubscriptionLifecycleRow> {
    await billingStore.supersedeLiveSubscriptions();
    return billingStore.insertSubscriptionRow({
      planId,
      status: "PAST_DUE",
      periodStart,
      periodEnd,
      providerRef,
    });
  }

  /**
   * Platform-plane webhook (public route, signature-verified). Returns
   * `{ processed: false, replay: true }` for redelivered events (200 —
   * idempotent acknowledgement, never an error to the provider).
   */
  async handleWebhook(
    rawBody: string,
    signatureHeader: string,
  ): Promise<{ processed: boolean; replay: boolean; type?: string }> {
    const event = this.provider.verifyEvent(rawBody, signatureHeader, WEBHOOK_SECRET);
    if (event === null) {
      throw new WebhookSignatureInvalidError();
    }
    const tenantId = (event.payload["tenant_id"] as string | undefined) ?? null;
    if (tenantId === null) {
      throw new WebhookSignatureInvalidError();
    }
    return withPlatformScope(async (tx) =>
      withTenantOnTx(tenantId, tx, async () => {
        if (await billingStore.billingEventExists(event.eventId)) {
          return { processed: false, replay: true, type: event.type };
        }
        await billingStore.insertBillingEvent({
          eventType: event.type,
          subscriptionId: null,
          invoiceId: null,
          providerEventId: event.eventId,
          payload: event.payload,
          actorId: null,
        });
        await this.dispatchProviderEvent(tenantId, event);
        return { processed: true, replay: false, type: event.type };
      }),
    );
  }

  private async dispatchProviderEvent(tenantId: string, event: ProviderEvent): Promise<void> {
    switch (event.type) {
      case "checkout.session.completed":
      case "invoice.paid": {
        const ref = event.checkoutSessionRef ?? event.invoiceRef;
        const invoice = ref !== null ? await billingStore.findOpenInvoiceByProviderRef(ref) : undefined;
        if (invoice !== undefined) {
          await billingStore.markInvoicePaid(invoice.id, "PROVIDER", null, ref);
          await this.activateFromInvoice(tenantId, invoice, "subscription.activated");
        }
        break;
      }
      case "invoice.payment_failed": {
        await this.enterGraceOrDunning(tenantId, "subscription.payment_failed");
        break;
      }
      default:
        log.warn({ type: event.type }, "unhandled provider event type");
    }
  }

  /**
   * T3 — the mandatory manual-invoicing fallback (A-009): platform staff
   * record an offline payment against an OPEN invoice; reason mandatory;
   * audited via_platform_admin on both trails. Identical end state to the
   * provider path.
   */
  async recordManualPayment(
    actorId: string,
    tenantId: string,
    input: { invoiceId: string; reason: string },
  ): Promise<billingStore.InvoiceRow> {
    return withPlatformScope(async (tx) =>
      withTenantOnTx(tenantId, tx, async () => {
        const invoice = await billingStore.findInvoice(input.invoiceId);
        if (invoice === undefined) {
          throw new BillingRecordNotFoundError("invoice", input.invoiceId);
        }
        const paid = await billingStore.markInvoicePaid(invoice.id, "MANUAL", actorId, null);
        if (paid === null) {
          throw new InvalidSubscriptionTransitionError(invoice.status, "mark paid");
        }
        await billingStore.insertBillingEvent({
          eventType: "payment.manual_recorded",
          subscriptionId: invoice.subscriptionId,
          invoiceId: invoice.id,
          providerEventId: null,
          payload: { reason: input.reason, amount: invoice.amount },
          actorId,
          viaPlatformAdmin: true,
        });
        await this.audit.recordPlatform({
          action: "billing.manual_payment",
          entityType: "subscription_invoice",
          entityId: invoice.id,
          actorId,
          after: { tenantId, number: invoice.number, amount: invoice.amount, reason: input.reason },
        });
        await this.audit.record({
          action: "billing.manual_payment",
          entityType: "subscription_invoice",
          entityId: invoice.id,
          actorId,
          viaPlatformAdmin: true,
          after: { number: invoice.number, amount: invoice.amount, reason: input.reason },
        });
        await this.activateFromInvoice(tenantId, paid, "subscription.activated");
        return paid;
      }),
    );
  }

  /** Activate the subscription behind an invoice: status ACTIVE + window +
   *  entitlements re-materialized transactionally (never mid-state). */
  private async activateFromInvoice(
    tenantId: string,
    invoice: billingStore.InvoiceRow,
    eventType: string,
  ): Promise<void> {
    const subscription = await billingStore.liveSubscription();
    if (subscription === undefined || subscription.id !== invoice.subscriptionId) {
      // The invoice belongs to a superseded row — still record activation.
      await billingStore.insertBillingEvent({
        eventType,
        subscriptionId: invoice.subscriptionId,
        invoiceId: invoice.id,
        providerEventId: null,
        payload: { note: "invoice paid; live subscription unchanged" },
        actorId: null,
      });
      return;
    }
    const plan = await store.findPlanById(subscription.planId);
    if (plan === undefined) {
      return;
    }
    const now = new Date();
    const periodStart = now.toISOString().slice(0, 10);
    const periodEnd =
      plan.billingPeriod === "YEARLY"
        ? new Date(now.getTime() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10)
        : new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const updated = await billingStore.transitionSubscription(
      subscription.id,
      ["PAST_DUE", "GRACE", "TRIAL", "ACTIVE"],
      "ACTIVE",
      { providerRef: subscription.providerRef, dunningStep: 0 },
    );
    if (updated === null) {
      return;
    }
    await billingStore.insertBillingEvent({
      eventType,
      subscriptionId: subscription.id,
      invoiceId: invoice.id,
      providerEventId: null,
      payload: { plan: plan.key, periodStart, periodEnd },
      actorId: null,
    });
    await this.entitlements.materializePlan(null, plan, "PLAN", null);
    await this.audit.record({
      action: eventType,
      entityType: "subscription",
      entityId: subscription.id,
      after: { plan: plan.key, invoice: invoice.number, periodStart, periodEnd },
    });
    await this.notify(tenantId, "subscription.restored", {
      ar: `تم تفعيل باقة ${plan.nameAr ?? plan.name} — شكرًا لسدادك.`,
      en: `Plan ${plan.name} activated — thank you for your payment.`,
    });
    publishPlanChanged(tenantId, plan.key);
  }

  /** Payment failure: dunning step up; enter read-only GRACE (§8). */
  private async enterGraceOrDunning(tenantId: string, eventType: string): Promise<void> {
    const subscription = await billingStore.liveSubscription();
    if (subscription === undefined) {
      return;
    }
    const graceEndsAt = new Date(
      Date.now() + env.SUBSCRIPTION_GRACE_DAYS * 24 * 3600 * 1000,
    ).toISOString();
    const nextStep = subscription.dunningStep + 1;
    const inGrace = await billingStore.transitionSubscription(
      subscription.id,
      ["TRIAL", "ACTIVE", "PAST_DUE"],
      "GRACE",
      { graceEndsAt, dunningStep: nextStep },
    );
    await billingStore.insertBillingEvent({
      eventType,
      subscriptionId: subscription.id,
      invoiceId: null,
      providerEventId: null,
      payload: { dunningStep: nextStep, graceEndsAt },
      actorId: null,
    });
    await this.audit.record({
      action: "subscription.grace_entered",
      entityType: "subscription",
      entityId: subscription.id,
      after: { dunningStep: nextStep, graceEndsAt, trigger: eventType },
    });
    if (inGrace !== null) {
      await this.notify(tenantId, "subscription.grace_entered", {
        ar: "فشل الدفع — تم تحويل الحساب إلى وضع القراءة فقط حتى السداد.",
        en: "Payment failed — the workspace is now read-only until payment.",
      });
    }
    publishPlanChanged(tenantId, subscription.planId);
  }

  private async notify(
    _tenantId: string,
    type: Parameters<NotificationsService["notifyBillingEvent"]>[1]["type"],
    body: { ar: string; en: string },
  ): Promise<void> {
    // Callers run inside the target tenant's UoW — getOwnTenant is ambient.
    const tenant = await store.getOwnTenant();
    await this.notifications.notifyBillingEvent(tenant.id, {
      type,
      detailAr: body.ar,
      detailEn: body.en,
      link: "/billing",
      tenantName: tenant.name,
    });
  }
}

function publishPlanChanged(tenantId: string, planKey: string): void {
  publishTenancyEvent({ type: "plan.changed", tenantId, planKey });
}
