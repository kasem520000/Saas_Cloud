/**
 * /{locale}/budgeting — budget list (PHASE-028 T9; requires
 * budgeting.budgets.view). The period-grid workspace (§4 variant) lives on
 * the budget detail page.
 */
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../components/app-shell";
import { ErrorState } from "../../../components/client-ui";
import { RetryButton } from "../../../components/retry-button";
import { getDictionary, isLocale, type Locale } from "../../../i18n/dictionaries";
import { fetchApi, requireSessionToken } from "../../../lib/server-api";

interface BudgetRow {
  id: string;
  code: string;
  scope: string;
  version: number;
  status: string;
}

export default async function BudgetingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const localeValue = locale as Locale;
  const d = getDictionary(localeValue);

  await requireSessionToken(localeValue);

  const budgets = await fetchApi<readonly BudgetRow[]>("budgeting/budgets?limit=25");
  if (!budgets.ok && budgets.status === 401) notFound();
  if (!budgets.ok) {
    return (
      <AppShell locale={localeValue} pagePath="budgeting" title={d.bgTitle}>
        <ErrorState title={d.loading} detail={String(budgets.error)} retry={<RetryButton label={d.loading} />} />
      </AppShell>
    );
  }

  return (
    <AppShell locale={localeValue} pagePath="budgeting" title={d.bgTitle}>
      <table>
        <thead>
          <tr>
            <th>{d.bgCode}</th>
            <th>{d.bgScope}</th>
            <th>{d.bgVersion}</th>
            <th>{d.bgStatus}</th>
          </tr>
        </thead>
        <tbody>
          {budgets.data.map((b) => (
            <tr key={b.id}>
              <td>{b.code}</td>
              <td>{b.scope}</td>
              <td>{b.version}</td>
              <td>{b.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}
