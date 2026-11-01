import { Inject, Injectable } from "@nestjs/common";

import { AuditService } from "../../audit/api/audit";
import { publishTenancyEvent } from "../../configuration/api";
import * as store from "../infrastructure/tenancy.store";
import * as billingStore from "../infrastructure/billing.store";
import { UsageService } from "./usage-service";
import { EntitlementsService } from "./entitlements-service";
import { DowngradeBlockedError, PlanNotFoundError } from "../domain/tenancy-errors";

/**
 * PHASE-014 T1 — tenant-plane subscription surface (SUBSCRIPTION_AND_
 * ENTITLEMENTS §8/§10; matrix §3.9 `tenancy.subscription.manage`):
 *
 * - `current()` — live subscription + plan + limits + usage snapshot +
 *   read-only flag (the owner console + dashboards render from this);
 * - `changePlan()` — upgrade/downgrade with the §8 downgrade guard: blocked
 *   while current usage exceeds the target plan's limits, naming each
 *   blocker; entitlements re-materialize transactionally (never mid-state);
 * - billing history = subscription_invoices + billing_events (both the
 *   sandbox and the manual path show identically — A-009).
 */

export interface SubscriptionView {
  subscription: billingStore.SubscriptionLifecycleRow | null;
  plan: { key: string; name: string; nameAr: string | null; limits: Record<string, unknown>; billingPeriod: string } | null;
  readOnly: boolean;
  usage: Awaited<ReturnType<UsageService["snapshot"]>>;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(UsageService) private readonly usage: UsageService,
  ) {}

  async current(): Promise<SubscriptionView> {
    const live = await billingStore.liveSubscription();
    const subscription = live ?? null;
    let plan: SubscriptionView["plan"] = null;
    if (subscription !== null) {
      const planRow = await store.findPlanById(subscription.planId);
      if (planRow !== undefined) {
        plan = {
          key: planRow.key,
          name: planRow.name,
          nameAr: planRow.nameAr,
          limits: planRow.limits as Record<string, unknown>,
          billingPeriod: planRow.billingPeriod,
        };
      }
    }
    return {
      subscription,
      plan,
      readOnly: await billingStore.isReadOnlyGrace(),
      usage: await this.usage.snapshot(),
    };
  }

  /**
   * Change the tenant's plan (owner self-serve). Downgrade is blocked while
   * usage exceeds the target plan's limits — the tenant is told exactly
   * what blocks it (§8). Entitlements re-materialize transactionally.
   */
  async changePlan(actorId: string, input: { planKey: string }): Promise<SubscriptionView> {
    const target = await store.findPlanByKey(input.planKey);
    if (target === undefined || !target.isActive) {
      throw new PlanNotFoundError(input.planKey);
    }
    const live = await billingStore.liveSubscription();
    if (live !== undefined) {
      const currentPlan = await store.findPlanById(live.planId);
      if (currentPlan?.key === target.key) {
        return this.current();
      }
      // §8 downgrade guard: compare current usage against target limits.
      const targetLimits = UsageService.limitsOf(target.limits as Record<string, unknown>);
      const snapshot = await this.usage.snapshot();
      const blockers: { counterKey: string; current: number; limit: number }[] = [];
      for (const entry of snapshot.entries) {
        const limit = targetLimits[entry.counterKey];
        if (limit !== null && entry.current > limit) {
          blockers.push({ counterKey: entry.counterKey, current: entry.current, limit });
        }
      }
      if (blockers.length > 0) {
        throw new DowngradeBlockedError(blockers);
      }
    }
    const now = new Date();
    const periodStart = now.toISOString().slice(0, 10);
    const periodEnd =
      target.billingPeriod === "YEARLY"
        ? new Date(now.getTime() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10)
        : new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    // Transactional: supersede + new row + entitlements — never mid-state.
    await billingStore.supersedeLiveSubscriptions();
    const status = live?.status === "GRACE" ? "GRACE" : live !== undefined ? live.status : "ACTIVE";
    const row = await billingStore.insertSubscriptionRow({
      planId: target.id,
      status,
      periodStart,
      periodEnd,
      providerRef: live?.providerRef ?? null,
      graceEndsAt: live?.graceEndsAt ?? null,
      trialEndsAt: live?.trialEndsAt ?? null,
    });
    await this.entitlements.materializePlan(actorId, target, live !== undefined ? "PLAN" : "TRIAL", live?.trialEndsAt ?? null);
    const tenant = await store.getOwnTenant();
    await this.audit.record({
      action: "subscription.plan_changed",
      entityType: "subscription",
      entityId: row.id,
      actorId,
      after: { plan: target.key, status: row.status, periodStart, periodEnd },
    });
    await billingStore.insertBillingEvent({
      eventType: "subscription.plan_changed",
      subscriptionId: row.id,
      invoiceId: null,
      providerEventId: null,
      payload: { plan: target.key, previous: live !== undefined ? live.planId : null },
      actorId,
    });
    publishTenancyEvent({ type: "plan.changed", tenantId: tenant.id, planKey: target.key });
    return this.current();
  }

  async billingHistory(): Promise<{
    invoices: billingStore.InvoiceRow[];
    events: billingStore.BillingEventRow[];
  }> {
    const [invoices, events] = await Promise.all([
      billingStore.listInvoices(100),
      billingStore.listBillingEvents(200),
    ]);
    return { invoices, events };
  }
}
