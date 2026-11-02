/**
 * PHASE-016 T2 — /{locale}/pos/terminals: POS terminal registry admin.
 * Data: GET /api/bff/pos/terminals; register/activate/deactivate POST to the
 * same base. Server-guarded (pos.terminals.manage + pos.terminals feature).
 */
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../../components/app-shell";
import { ErrorState } from "../../../../components/client-ui";
import { Card } from "../../../../components/card";
import { RetryButton } from "../../../../components/retry-button";
import { TerminalAdmin } from "../../../../components/terminal-admin";
import { getDictionary, isLocale, type Locale } from "../../../../i18n/dictionaries";
import type { PosTerminal } from "../../../../lib/api-types";
import { localizedApiError } from "../../../../lib/messages";
import { fetchApi, requireSessionToken } from "../../../../lib/server-api";

export default async function PosTerminalsPage({
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

  const res = await fetchApi<{ terminals: PosTerminal[] }>("pos/terminals");
  if (!res.ok && res.status === 401) {
    redirect(`/${localeValue}/login`);
  }

  return (
    <AppShell locale={localeValue} pagePath="pos/terminals" title={d.posTerminalsTitle}>
      {!res.ok ? (
        <ErrorState
          title={localizedApiError(d, res.error, res.retryAfterSeconds)}
          retry={<RetryButton label={d.retryLabel} />}
        />
      ) : (
        <Card title={d.posTerminalsTitle}>
          <p className="mb-4 text-sm text-gray-600">{d.posTerminalsDescription}</p>
          <TerminalAdmin locale={localeValue} initial={res.data.terminals} />
        </Card>
      )}
    </AppShell>
  );
}
