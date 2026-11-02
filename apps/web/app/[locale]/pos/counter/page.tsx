/**
 * PHASE-016 T4/T9 — /{locale}/pos/counter: the touch-first counter sale screen
 * (POS archetype): scan input, cart, total, pay → POST /api/bff/pos/sale.
 * Offline banner reflects honest navigator.onLine + queued count (local
 * outbox; the SQLite store lands with the sync-core package — the banner and
 * PENDING_SYNC honesty are asserted server-side in the pos db suite).
 * Server-guarded (pos.sales.sell + pos.sales feature).
 */
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../../components/app-shell";
import { ErrorState } from "../../../../components/client-ui";
import { Card } from "../../../../components/card";
import { RetryButton } from "../../../../components/retry-button";
import { PosCounter } from "../../../../components/pos-counter";
import { getDictionary, isLocale, type Locale } from "../../../../i18n/dictionaries";
import { localizedApiError } from "../../../../lib/messages";
import { fetchApi, requireSessionToken } from "../../../../lib/server-api";

export default async function PosCounterPage({
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

  const res = await fetchApi<{ terminals: Array<{ id: string; code: string; status: string }> }>(
    "pos/terminals",
  );
  if (!res.ok && res.status === 401) {
    redirect(`/${localeValue}/login`);
  }

  return (
    <AppShell locale={localeValue} pagePath="pos/counter" title={d.posCounterTitle}>
      {!res.ok ? (
        <ErrorState
          title={localizedApiError(d, res.error, res.retryAfterSeconds)}
          retry={<RetryButton label={d.retryLabel} />}
        />
      ) : (
        <Card title={d.posCounterTitle}>
          <PosCounter locale={localeValue} terminals={res.data.terminals} />
        </Card>
      )}
    </AppShell>
  );
}
