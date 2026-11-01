import { Inject, Injectable, OnModuleInit } from "@nestjs/common";

import { AuditService } from "../../audit/api/audit";
import { env } from "../../../config/env";
import { JobsService, getBoss } from "../../../infra/jobs/boss";
import { withPlatformScope, withTenantOnTx } from "../../../infra/db/tenant-context";
import { childLogger } from "../../../infra/observability/logger";
import { sql } from "drizzle-orm";
import { NotificationsService } from "../../notifications/api";
import * as store from "../infrastructure/tenancy.store";
import * as billingStore from "../infrastructure/billing.store";
import { LifecycleService } from "./lifecycle-service";

/**
 * PHASE-014 T4 — the subscription lifecycle state machine
 * (SUBSCRIPTION_AND_ENTITLEMENTS §7–§8):
 *
 *   TRIAL ──expiry, unpaid──▶ GRACE(read-only) ──grace expiry──▶ SUSPENDED
 *     │                         │ payment                          │ restore
 *     └────── payment ──────────┴──────────────▶ ACTIVE ◀───────────┘
 *
 * - TRIAL entitlements materialize exactly like paid ones (no parallel path
 *   — registration already seeds source TRIAL rows with expires_at);
 * - GRACE is the read-only product state: reads/reports/exports/printing
 *   stay alive; state-changing routes fail with typed
 *   `subscription_read_only` (the guard reads
 *   erp.tenant_subscription_read_only);
 * - grace expiry suspends through the PHASE-004 semantics (sessions killed,
 *   pushes rejected) — the LifecycleService is reused verbatim;
 * - every transition is audited + emitted as a billing event + notified.
 *
 * The sweep runs as a pg-boss recurring job (ADR-0008) AND once at boot;
 * durations are PLACEHOLDER configuration (OQ-002).
 */

const log = childLogger({ module: "subscription-lifecycle" });

export const SUBSCRIPTION_SWEEP_QUEUE = "subscription-lifecycle-sweep";

@Injectable()
export class SubscriptionLifecycleService implements OnModuleInit {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(LifecycleService) private readonly tenantLifecycle: LifecycleService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const boss = getBoss();
    await boss.createQueue(SUBSCRIPTION_SWEEP_QUEUE).catch(() => undefined);
    await boss.work(SUBSCRIPTION_SWEEP_QUEUE, async () => {
      await this.sweep();
    });
    // Hourly schedule + one immediate boot sweep.
    await this.jobs.publish(SUBSCRIPTION_SWEEP_QUEUE, { tenantId: "platform" }).catch(() => undefined);
    await boss.schedule(SUBSCRIPTION_SWEEP_QUEUE, "0 * * * *", {}, { tz: "UTC" }).catch(() => undefined);
  }

  /** Scan due subscriptions (platform plane) and apply transitions per tenant. */
  async sweep(): Promise<{ swept: number; grace: number; suspended: number; activated: number }> {
    const nowIso = new Date().toISOString();
    const due = await withPlatformScope(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT s.id, s.tenant_id AS "tenantId", s.status,
               s.trial_ends_at AS "trialEndsAt", s.grace_ends_at AS "graceEndsAt",
               s.period_end AS "periodEnd", s.plan_id AS "planId"
        FROM subscriptions s
        WHERE (s.status = 'TRIAL' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at <= ${nowIso})
           OR (s.status IN ('ACTIVE', 'PAST_DUE') AND s.period_end < ${nowIso}::date)
           OR (s.status = 'GRACE' AND s.grace_ends_at IS NOT NULL AND s.grace_ends_at <= ${nowIso})
      `);
      return rows.rows as unknown as {
        id: string;
        tenantId: string;
        status: string;
        trialEndsAt: string | null;
        graceEndsAt: string | null;
        periodEnd: string;
        planId: string;
      }[];
    });
    let grace = 0;
    let suspended = 0;
    let activated = 0;
    for (const row of due) {
      try {
        const outcome = await withPlatformScope(async (tx) =>
          withTenantOnTx(row.tenantId, tx, async () => this.applyDue(row)),
        );
        if (outcome === "grace") grace += 1;
        if (outcome === "suspended") suspended += 1;
        if (outcome === "activated") activated += 1;
      } catch (error) {
        log.error({ tenantId: row.tenantId, subscription: row.id, error }, "lifecycle sweep failed for row");
      }
    }
    log.info({ swept: due.length, grace, suspended, activated }, "subscription sweep done");
    return { swept: due.length, grace, suspended, activated };
  }

  private async applyDue(
    row: { id: string; tenantId: string; status: string; graceEndsAt: string | null; trialEndsAt: string | null },
  ): Promise<"grace" | "suspended" | "activated" | "noop"> {
    if (row.status === "TRIAL" || row.status === "PAST_DUE" || row.status === "ACTIVE") {
      // Unpaid expiry → read-only GRACE (§8: never an immediate freeze).
      const graceEndsAt = new Date(Date.now() + env.SUBSCRIPTION_GRACE_DAYS * 24 * 3600 * 1000).toISOString();
      const moved = await billingStore.transitionSubscription(
        row.id,
        ["TRIAL", "ACTIVE", "PAST_DUE"],
        "GRACE",
        { graceEndsAt },
      );
      if (moved === null) {
        return "noop";
      }
      await this.record(row.tenantId, row.id, "subscription.grace_entered", {
        reason: row.status === "TRIAL" ? "trial expired unpaid" : "period ended unpaid",
        graceEndsAt,
      });
      await this.notify(row.tenantId, "subscription.grace_entered", {
        ar: "انتهت فترة التجربة/الاستحقاق دون سداد — الحساب للقراءة فقط حتى السداد.",
        en: "Trial/period ended unpaid — the workspace is read-only until payment.",
      });
      return "grace";
    }
    if (row.status === "GRACE") {
      // Grace expired → suspend through the PHASE-004 semantics.
      const moved = await billingStore.transitionSubscription(row.id, ["GRACE"], "SUSPENDED", {});
      if (moved === null) {
        return "noop";
      }
      await this.record(row.tenantId, row.id, "subscription.suspended", { reason: "grace expired" });
      await this.tenantLifecycle.suspend(null, row.tenantId, "subscription grace expired");
      await this.notify(row.tenantId, "subscription.suspended", {
        ar: "انتهت مهلة السماح — تم تعليق الحساب. تواصل مع الدعم أو سدّد المستحقات.",
        en: "Grace period expired — the workspace is suspended. Pay or contact support.",
      });
      return "suspended";
    }
    return "noop";
  }

  private async record(
    tenantId: string,
    subscriptionId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await billingStore.insertBillingEvent({
      eventType,
      subscriptionId,
      invoiceId: null,
      providerEventId: null,
      payload,
      actorId: null,
    });
    await this.audit.record({
      action: eventType,
      entityType: "subscription",
      entityId: subscriptionId,
      after: { tenantId, ...payload },
    });
  }

  private async notify(
    tenantId: string,
    type: "subscription.grace_entered" | "subscription.suspended" | "subscription.trial_expiring",
    body: { ar: string; en: string },
  ): Promise<void> {
    const tenant = await store.getOwnTenant();
    await this.notifications.notifyBillingEvent(tenantId, {
      type,
      detailAr: body.ar,
      detailEn: body.en,
      link: "/billing",
      tenantName: tenant.name,
    });
  }
}
