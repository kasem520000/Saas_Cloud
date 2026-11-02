/**
 * /{locale}/installments — installment plans list (PHASE-027 T14; requires
 * installments.plans.manage). Schedule detail + aging live on the plan page.
 */
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../components/app-shell";
import { ErrorState } from "../../../components/client-ui";
import { RetryButton } from "../../../components/retry-button";
import { getDictionary, isLocale, type Locale } from "../../../i18n/dictionaries";
import { fetchApi, requireSessionToken } from "../../../lib/server-api";

interface PlanRow {
  id: string;
  sourceType: string;
  totalAmount: string;
  status: string;
}

export default async function InstallmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const localeValue = locale as Locale;
  const d = getDictionary(localeValue);

  await requireSessionToken(localeValue);

  const plans = await fetchApi<readonly PlanRow[]>("installment-plans?limit=25");
  if (!plans.ok && plans.status === 401) notFound();
  if (!plans.ok) {
    return (
      <AppShell locale={localeValue} pagePath="installments" title={d.ipTitle}>
        <ErrorState title={d.loading} detail={String(plans.error)} retry={<RetryButton label={d.loading} />} />
      </AppShell>
    );
  }

  return (
    <AppShell locale={localeValue} pagePath="installments" title={d.ipTitle}>
      <table>
        <thead>
          <tr>
            <th>{d.ipPlan}</th>
            <th>{d.ipTotal}</th>
            <th>{d.ipStatus}</th>
          </tr>
        </thead>
        <tbody>
          {plans.data.map((p) => (
            <tr key={p.id}>
              <td>{p.sourceType}</td>
              <td>{p.totalAmount}</td>
              <td>{p.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}
