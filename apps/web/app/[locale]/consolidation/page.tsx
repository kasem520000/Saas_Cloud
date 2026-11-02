/**
 * /{locale}/consolidation — consolidation groups & runs overview (PHASE-034
 * T11; requires consolidation.groups.manage / consolidation.runs.execute /
 * consolidation.reports.view). Composes existing archetypes only (List +
 * Report Page); zero new archetypes. Read-only over member books (ADR-0018):
 * this page lists groups/runs/eliminations of the OWNER tenant — it never
 * reads member books directly.
 */
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../components/app-shell";
import { ErrorState } from "../../../components/client-ui";
import { RetryButton } from "../../../components/retry-button";
import { getDictionary, isLocale, type Locale } from "../../../i18n/dictionaries";
import { fetchApi, requireSessionToken } from "../../../lib/server-api";

interface GroupRow {
  id: string;
  name: string;
  baseCurrency: string;
  fxTranslationMethod: string;
  status: string;
}

export default async function ConsolidationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const localeValue = locale as Locale;
  const d = getDictionary(localeValue);

  await requireSessionToken(localeValue);

  const groups = await fetchApi<readonly GroupRow[]>("consolidation/groups");
  if (!groups.ok && groups.status === 401) notFound();
  if (!groups.ok) {
    return (
      <AppShell locale={localeValue} pagePath="consolidation" title={d.conTitle}>
        <ErrorState title={d.loading} detail={String(groups.error)} retry={<RetryButton label={d.loading} />} />
      </AppShell>
    );
  }

  return (
    <AppShell locale={localeValue} pagePath="consolidation" title={d.conTitle}>
      <section>
        <h2>{d.conGroups}</h2>
        {groups.data.length === 0 ? (
          <p>{d.conEmpty}</p>
        ) : (
          <ul>
            {groups.data.map((g) => (
              <li key={g.id}>
                {g.name} — {g.baseCurrency} · {g.fxTranslationMethod} · {g.status}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
