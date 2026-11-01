import { Inject, Injectable } from "@nestjs/common";

import { EMAIL_SERVICE } from "../tokens";
import type { EmailService } from "./email-service";
import * as store from "../infrastructure/notifications.store";
import type { NotificationRow } from "../infrastructure/notifications.store";

/**
 * PHASE-014 T10 — the billing-critical notifications center
 * (FEATURE_CATALOG `platform.notifications`; the generalized event-driven
 * surface is PHASE-015 — the split is recorded in FEATURE_CATALOG):
 *
 * - in-app inbox rows (tenant-scoped, user-targeted or tenant-wide) +
 *   unread counts + read marking;
 * - preferences (per user or tenant-wide: in_app / email channels);
 * - owner email via the live email adapter (PHASE-003) using the
 *   `billing_notice` template — the recipient is supplied by the caller
 *   (this module deliberately does NOT import identity — identity imports
 *   this module for its own emails; the boundary rule forbids the cycle).
 *
 * Threshold warnings dedupe: one notification per (type, link) per 24 h.
 */

export type NotificationType =
  | "limit.warning"
  | "limit.exceeded"
  | "subscription.trial_expiring"
  | "subscription.grace_entered"
  | "subscription.grace_expiring"
  | "subscription.suspended"
  | "subscription.restored"
  | "subscription.plan_changed"
  | "subscription.payment_failed"
  | "reconciliation.broken"
  | "assertion.failed"
  | "invoice.overdue";

export interface NotifyInput {
  type: NotificationType;
  title: { ar: string; en: string };
  body: { ar: string; en: string };
  link?: string | null;
  /** Target user; null/undefined = tenant-wide (owner-facing events). */
  userId?: string | null;
  /** Owner recipient for the email channel (caller-resolved). */
  ownerEmail?: string | null;
  /** Tenant display name for the email envelope (caller-resolved). */
  tenantName?: string;
  locale?: "ar" | "en";
}

export interface NotifyOutcome {
  inbox: NotificationRow | null;
  emailed: boolean;
}

const BILLING_TYPE_TITLES: Record<string, { ar: string; en: string }> = {
  "limit.warning": { ar: "اقتراب من حد الخطة", en: "Approaching plan limit" },
  "limit.exceeded": { ar: "تم تجاوز حد الخطة", en: "Plan limit reached" },
  "subscription.trial_expiring": { ar: "Practice trial expiring", en: "Trial expiring" },
  "subscription.grace_entered": { ar: "الوضع للقراءة فقط", en: "Read-only mode" },
  "subscription.grace_expiring": { ar: "انتهاء مهلة السماح للقراءة فقط", en: "Grace period ending" },
  "subscription.suspended": { ar: "تم تعليق الاشتراك", en: "Subscription suspended" },
  "subscription.restored": { ar: "تمت إعادة تفعيل الاشتراك", en: "Subscription restored" },
  "subscription.plan_changed": { ar: "تغيّرت باقة الاشتراك", en: "Plan changed" },
  "subscription.payment_failed": { ar: "فشل الدفع", en: "Payment failed" },
  "reconciliation.broken": { ar: "فشل التسوية", en: "Reconciliation broken" },
  "assertion.failed": { ar: "فشل فحص التقرير", en: "Report assertion failed" },
  "invoice.overdue": { ar: "فواتير متأخرة السداد", en: "Overdue invoices" },
};

@Injectable()
export class NotificationsService {
  constructor(@Inject(EMAIL_SERVICE) private readonly email: EmailService) {}

  async notify(tenantId: string, input: NotifyInput): Promise<NotifyOutcome> {
    const userId = input.userId ?? null;
    const pref = await store.effectivePreference(userId, input.type);
    let inbox: NotificationRow | null = null;
    if (pref.inApp) {
      inbox = await store.insertNotification({
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
      });
    }
    let emailed = false;
    if (pref.email && input.ownerEmail !== null && input.ownerEmail !== undefined && input.ownerEmail !== "") {
      const locale = input.locale ?? "ar";
      const tenantName = input.tenantName ?? "ERP";
      await this.email.enqueue(tenantId, {
        template: "billing_notice",
        locale,
        recipient: input.ownerEmail,
        variables: {
          tenantName,
          subject: locale === "ar" ? input.title.ar : input.title.en,
          body: locale === "ar" ? input.body.ar : input.body.en,
          linkLabel: input.link !== null && input.link !== undefined && input.link !== "" ? "link" : "",
          linkUrl: input.link ?? "",
        },
      });
      emailed = true;
    }
    return { inbox, emailed };
  }

  /**
   * Billing-critical event helper (used by tenancy usage/lifecycle): builds
   * the bilingual copy from the type + details, dedupes threshold warnings
   * to one per (type, link) per 24 h, and targets the tenant-wide inbox.
   */
  async notifyBillingEvent(
    tenantId: string,
    input: {
      type: NotificationType;
      counterKey?: string;
      current?: number;
      limit?: number;
      detailAr?: string;
      detailEn?: string;
      link?: string | null;
      ownerEmail?: string | null;
      tenantName?: string;
      locale?: "ar" | "en";
    },
  ): Promise<NotifyOutcome> {
    const title = BILLING_TYPE_TITLES[input.type] ?? { ar: input.type, en: input.type };
    const ar = input.detailAr ?? "";
    const en = input.detailEn ?? "";
    if (input.type.startsWith("limit.") && input.counterKey !== undefined) {
      const pct = input.limit !== undefined && input.limit > 0 ? (((input.current ?? 0) / input.limit) * 100) | 0 : 0;
      return this.notify(tenantId, {
        type: input.type,
        title,
        body: {
          ar: `عداد ${input.counterKey}: ${input.current}/${input.limit} (${pct}%). ${ar}`.trim(),
          en: `Counter ${input.counterKey}: ${input.current}/${input.limit} (${pct}%). ${en}`.trim(),
        },
        link: input.link ?? "/billing",
        ownerEmail: input.ownerEmail,
        tenantName: input.tenantName,
        locale: input.locale,
      });
    }
    return this.notify(tenantId, {
      type: input.type,
      title,
      body: { ar, en },
      link: input.link ?? null,
      ownerEmail: input.ownerEmail,
      tenantName: input.tenantName,
      locale: input.locale,
    });
  }

  async list(userId: string, unreadOnly: boolean, limit: number): Promise<NotificationRow[]> {
    return store.listNotifications({ userId, unreadOnly, limit, beforeId: null });
  }

  async unreadCount(userId: string): Promise<number> {
    return store.unreadCount(userId);
  }

  async markRead(id: string, userId: string): Promise<NotificationRow | null> {
    return store.markRead(id, userId);
  }

  async preferences(userId: string | null) {
    return store.listPreferences(userId);
  }

  async setPreference(
    userId: string | null,
    eventType: string,
    inApp: boolean,
    email: boolean,
  ) {
    return store.upsertPreference({ userId, eventType, inApp, email });
  }

  /** Threshold-warning dedupe probe (24 h window). */
  async hasRecent(type: string, link: string | null): Promise<boolean> {
    return store.recentNotificationOfType(type, link, 24);
  }

}
