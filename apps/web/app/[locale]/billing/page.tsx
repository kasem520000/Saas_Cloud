/**
 * PHASE-014 T2/T3/T5/T6 — /{locale}/billing: subscription status (incl. the
 * honest read-only GRACE banner), plan, usage counters vs limits, billing
 * history (invoices + events, both payment paths), and checkout/change-plan
 * actions. Data: GET tenancy/subscription + tenancy/subscription/billing-history
 * + public/plans — all server-guarded (tenancy.subscription.manage).
 */
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";

import { ErrorState } from "../../../components/client-ui";
import { BillingActions } from "../../../components/billing-actions";
import { AppShell } from "../../../components/app-shell";
import { Card } from "../../../components/card";
import { DefList } from "../../../components/def-list";
import { RetryButton } from "../../../components/retry-button";
import { getDictionary, isLocale, type Locale } from "../../../i18n/dictionaries";
import type {
  BillingHistory,
  PublicPlansResponse,
  SubscriptionView,
} from "../../../lib/api-types";
import { localizedApiError } from "../../../lib/messages";
import { fetchApi, requireSessionToken } from "../../../lib/server-api";

function statusLabel(d: ReturnType<typeof getDictionary>, status: string): string {
  const key = `status${status}` as keyof typeof d;
  const value = d[key];
  return typeof value === "string" ? value : status;
}

export default async function BillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  const localeValue = locale as Locale;
  const d = getDictionary(localeValue);

  await requireSessionToken(localeValue);

  const [view, history, plans] = await Promise.all([
    fetchApi<SubscriptionView>("tenancy/subscription"),
    fetchApi<BillingHistory>("tenancy/subscription/billing-history"),
    fetchApi<PublicPlansResponse>("public/plans"),
  ]);
  if (!view.ok && view.status === 401) {
    redirect(`/${localeValue}/login`);
  }

  let content: JSX.Element;
  if (!view.ok) {
    const forbidden = view.status === 403 || view.error.code === "FORBIDDEN";
    content = (
      <ErrorState
        title={
          forbidden ? d.errorsForbidden : localizedApiError(d, view.error, view.retryAfterSeconds)
        }
        retry={forbidden ? undefined : <RetryButton label={d.retryLabel} />}
      />
    );
  } else {
    const { subscription, plan, readOnly, usage } = view.data;
    const invoices = history.ok ? history.data.invoices : [];
    const events = history.ok ? history.data.events : [];
    const openInvoices = invoices.filter((invoice) => invoice.status === "OPEN");
    content = (
      <div className="flex flex-col gap-4">
        {readOnly ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {d.billingReadOnlyBanner}
          </p>
        ) : null}
        <Card title={d.billingTitle}>
          {subscription === null || plan === null ? (
            <p className="text-sm text-gray-600">{d.billingNoSubscription}</p>
          ) : (
            <DefList
              items={[
                { term: d.billingPlanLabel, children: localeValue === "ar" ? plan.nameAr : plan.name },
                { term: d.billingStatusLabel, children: statusLabel(d, subscription.status) },
                {
                  term: d.billingPeriodLabel,
                  children: `${subscription.periodStart} → ${subscription.periodEnd}`,
                },
                ...(subscription.trialEndsAt !== null
                  ? [{ term: d.billingTrialEndsLabel, children: subscription.trialEndsAt }]
                  : []),
                ...(subscription.graceEndsAt !== null
                  ? [{ term: d.billingGraceEndsLabel, children: subscription.graceEndsAt }]
                  : []),
              ]}
            />
          )}
          <div className="mt-3">
            <BillingActions
              locale={localeValue}
              plans={plans.ok ? plans.data.plans : []}
              currentPlanKey={plan?.key ?? null}
              hasOpenInvoice={openInvoices.length > 0}
            />
          </div>
        </Card>
        <Card title={d.billingUsageTitle}>
          <p className="mb-2 text-xs text-gray-500">{usage.period}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {usage.entries.map((entry) => (
              <li key={entry.counterKey} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{entry.counterKey}</span>
                <span>
                  {d.billingCurrent}: <strong>{entry.current}</strong> / {d.billingLimit}:{" "}
                  {entry.limit === null ? d.billingUnlimited : entry.limit}
                </span>
                {entry.percent !== null ? <span className="text-gray-500">({entry.percent}%)</span> : null}
              </li>
            ))}
          </ul>
        </Card>
        <Card title={`${d.billingHistoryTitle} — ${d.billingInvoices}`}>
          {invoices.length === 0 ? (
            <p className="text-sm text-gray-600">{d.billingNoSubscription}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-start text-xs text-gray-500">
                  <th>{d.billingNumber}</th>
                  <th>{d.billingAmount}</th>
                  <th>{d.billingDue}</th>
                  <th>{d.billingStatusLabel}</th>
                  <th>{d.billingPaidVia}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-gray-100">
                    <td className="font-mono text-xs">{invoice.number}</td>
                    <td>{invoice.amount} {invoice.currencyCode}</td>
                    <td>{invoice.dueDate}</td>
                    <td>{statusLabel(d, invoice.status)}</td>
                    <td>{invoice.paidVia ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title={d.billingEvents}>
          <ul className="flex flex-col gap-1 text-sm">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap gap-2">
                <span className="font-mono text-xs text-gray-500">{event.createdAt}</span>
                <span className="font-mono text-xs">{event.eventType}</span>
                {event.viaPlatformAdmin ? <span className="text-xs text-amber-700">platform</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }

  return (
    <AppShell locale={localeValue} pagePath="billing" title={d.billingTitle}>
      {content}
    </AppShell>
  );
}
