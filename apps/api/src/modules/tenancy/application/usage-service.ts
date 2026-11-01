import { Inject, Injectable } from "@nestjs/common";

import { AuditService } from "../../audit/api/audit";
import { countActiveMembers } from "../../identity/infrastructure/identity.store";
import { NotificationsService } from "../../notifications/api";
import * as billingStore from "../infrastructure/billing.store";
import { tenantUsageLimits } from "../infrastructure/subscription-guard-projection";
import * as store from "../infrastructure/tenancy.store";
import { LimitExceededError } from "../domain/tenancy-errors";

/**
 * PHASE-014 T6 — usage counters + the §6 limit-behavior matrix
 * (SUBSCRIPTION_AND_ENTITLEMENTS §6; INV-022 boundary):
 *
 * - soft warnings at 80% and 100% (in-app notification + owner email,
 *   dashboard banner links the usage report) — implemented here;
 * - hard blocks ONLY on creation actions (invite user, create
 *   branch/warehouse, activate terminal/device) — `assertCanCreate`;
 * - documents/month NEVER hard-blocks posting — the binding product
 *   principle; `recordDocument` only counts + warns (property-tested).
 *
 * Limits come from the live plan's seeded `limits` (PLACEHOLDER per OQ-002);
 * "unlimited" plans have no ceiling. Counters are a read-model — no limit
 * behavior may affect posted data or reconciliation (INV-022).
 */

export type UsageCounterKey =
  | "users"
  | "branches"
  | "warehouses"
  | "documents_per_month"
  | "pos_terminals"
  | "offline_devices";

/** Creation actions that hard-block at the limit (§6 matrix). */
export type HardBlockKind =
  | "invite_user"
  | "create_branch"
  | "create_warehouse"
  | "activate_terminal"
  | "activate_device";

export const HARD_BLOCK_KIND_TO_COUNTER: Record<HardBlockKind, UsageCounterKey> = {
  invite_user: "users",
  create_branch: "branches",
  create_warehouse: "warehouses",
  activate_terminal: "pos_terminals",
  activate_device: "offline_devices",
};

export interface UsageEntry {
  counterKey: UsageCounterKey;
  limit: number | null; // null = unlimited
  current: number;
  percent: number | null;
  warn80: boolean;
  warn100: boolean;
  hardBlock: boolean; // whether this key hard-blocks creation at limit
}

export interface UsageSnapshot {
  period: string;
  entries: UsageEntry[];
}

@Injectable()
export class UsageService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  /** Plan limits jsonb → typed map ("unlimited" → null). */
  static limitsOf(limits: Record<string, unknown>): Record<UsageCounterKey, number | null> {
    const read = (key: UsageCounterKey): number | null => {
      const raw = limits[key];
      if (raw === "unlimited" || raw === undefined || raw === null) {
        return null;
      }
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    return {
      users: read("users"),
      branches: read("branches"),
      warehouses: read("warehouses"),
      documents_per_month: read("documents_per_month"),
      pos_terminals: read("pos_terminals"),
      offline_devices: read("offline_devices"),
    };
  }

  private async currentValue(counterKey: UsageCounterKey, period: string): Promise<number> {
    switch (counterKey) {
      case "users":
        return countActiveMembers();
      case "branches":
        return (await store.listBranches(null)).filter((b) => b.isActive).length;
      default:
        return billingStore.getCounter(counterKey, period);
    }
  }

  async snapshot(): Promise<UsageSnapshot> {
    const period = billingStore.currentPeriod();
    const subscription = await billingStore.liveSubscription();
    const plan =
      subscription !== undefined ? await store.findPlanById(subscription.planId) : undefined;
    const limits = UsageService.limitsOf((plan?.limits ?? {}) as Record<string, unknown>);
    const keys = Object.keys(limits) as UsageCounterKey[];
    const entries: UsageEntry[] = [];
    for (const counterKey of keys) {
      const limit = limits[counterKey];
      const current = await this.currentValue(counterKey, period);
      const percent = limit !== null && limit > 0 ? ((current / limit) * 100) | 0 : null;
      entries.push({
        counterKey,
        limit,
        current,
        percent,
        warn80: percent !== null && percent >= 80 && percent < 100,
        warn100: percent !== null && percent >= 100,
        hardBlock: counterKey !== "documents_per_month",
      });
    }
    return { period, entries };
  }

  /** §6 hard block — creation actions only (ambient tenant UoW). */
  async assertCanCreate(kind: HardBlockKind): Promise<void> {
    const counterKey = HARD_BLOCK_KIND_TO_COUNTER[kind];
    const period = billingStore.currentPeriod();
    const subscription = await billingStore.liveSubscription();
    const plan =
      subscription !== undefined ? await store.findPlanById(subscription.planId) : undefined;
    const limit = UsageService.limitsOf((plan?.limits ?? {}) as Record<string, unknown>)[counterKey];
    if (limit === null) {
      return; // unlimited
    }
    const current = await this.currentValue(counterKey, period);
    if (current >= limit) {
      throw new LimitExceededError(counterKey, limit, current);
    }
  }

  /**
   * §6 hard block — GUARD variant: runs in the guard layer BEFORE the tenant
   * UoW exists, so it resolves everything through the pre-GUC definer
   * projection (erp.tenant_usage_limits, migration 0021) — same pattern as
   * the entitlement guard's erp.tenant_active_entitlements.
   */
  async assertCanCreateFor(tenantId: string, kind: HardBlockKind): Promise<void> {
    const counterKey = HARD_BLOCK_KIND_TO_COUNTER[kind];
    const period = billingStore.currentPeriod();
    const projection = await tenantUsageLimits(tenantId, period);
    const limit = UsageService.limitsOf(
      (projection.limits ?? {}) as Record<string, unknown>,
    )[counterKey];
    if (limit === null) {
      return; // unlimited (or no live subscription — no limit enforced)
    }
    const current =
      counterKey === "users"
        ? projection.users
        : counterKey === "branches"
          ? projection.branches
          : (projection.counters[counterKey] ?? 0);
    if (current >= limit) {
      throw new LimitExceededError(counterKey, limit, current);
    }
  }

  /**
   * Record a posted document (called beside the posting, NEVER in front of
   * it — the caller wraps this in try/catch so a counter failure cannot
   * fail a posting: INV-022). Fires 80%/100% soft warnings exactly when a
   * threshold is crossed.
   */
  async recordDocument(actorId: string | null): Promise<void> {
    const period = billingStore.currentPeriod();
    const before = await billingStore.getCounter("documents_per_month", period);
    const after = await billingStore.incrementCounter("documents_per_month", period, 1);
    await this.maybeWarn("documents_per_month", before, after);
    if (actorId !== null) {
      const tenant = await store.getOwnTenant();
      await this.audit.record({
        action: "usage.document_counted",
        entityType: "usage_counter",
        entityId: tenant.id,
        actorId,
        after: { counter: "documents_per_month", period, value: after },
      });
    }
  }

  /** Record a creation/deactivation of a hard-blocked resource kind. */
  async recordResourceDelta(counterKey: UsageCounterKey, delta: number): Promise<void> {
    const period = billingStore.currentPeriod();
    if (delta === 0) {
      return;
    }
    if (delta > 0) {
      const before = await billingStore.getCounter(counterKey, period);
      const after = await billingStore.incrementCounter(counterKey, period, delta);
      await this.maybeWarn(counterKey, before, after);
    } else {
      await billingStore.incrementCounter(counterKey, period, delta);
    }
  }

  private async maybeWarn(counterKey: UsageCounterKey, before: number, after: number): Promise<void> {
    const subscription = await billingStore.liveSubscription();
    const plan =
      subscription !== undefined ? await store.findPlanById(subscription.planId) : undefined;
    const limit = UsageService.limitsOf((plan?.limits ?? {}) as Record<string, unknown>)[counterKey];
    if (limit === null || limit <= 0) {
      return;
    }
    const pctBefore = (before / limit) * 100;
    const pctAfter = (after / limit) * 100;
    const crossed = (threshold: number): boolean => pctBefore < threshold && pctAfter >= threshold;
    const level = crossed(100) ? "limit.exceeded" : crossed(80) ? "limit.warning" : null;
    if (level === null) {
      return;
    }
    const tenant = await store.getOwnTenant();
    await this.notifications.notifyBillingEvent(tenant.id, {
      type: level,
      counterKey,
      current: after,
      limit,
      link: "/billing",
    });
  }
}
