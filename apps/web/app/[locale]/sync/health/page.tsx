/**
 * PHASE-020 T14 — /{locale}/sync/health: sync health dashboard (cursor lag
 * per entity for a device + contract version). Server-guarded:
 * sync.health.read / sync.pull + offline.sync_protocol feature.
 */
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../../components/app-shell";
import { ErrorState } from "../../../../components/client-ui";
import { Card } from "../../../../components/card";
import { RetryButton } from "../../../../components/retry-button";
import { getDictionary, isLocale, type Locale } from "../../../../i18n/dictionaries";
import { localizedApiError } from "../../../../lib/messages";
import { fetchApi, requireSessionToken } from "../../../../lib/server-api";

interface SyncStatus {
  deviceId: string;
  cursors: Record<string, number>;
  lag: Record<string, number>;
  contractVersion: number;
  serverTime: string;
}

const DEFAULT_DEVICE = "00000000-0000-4000-8000-0000000000aa";

export default async function SyncHealthPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ deviceId?: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  const localeValue = locale as Locale;
  const d = getDictionary(localeValue);
  const { deviceId } = await searchParams;

  await requireSessionToken(localeValue);

  const device = deviceId ?? DEFAULT_DEVICE;
  const res = await fetchApi<SyncStatus>(
    `sync/status?deviceId=${encodeURIComponent(device)}&entities=items,partners_lite,tax_codes,pos_terminal,sales_invoice`,
  );
  if (!res.ok && res.status === 401) {
    redirect(`/${localeValue}/login`);
  }

  return (
    <AppShell locale={localeValue} pagePath="sync/health" title={d.syncHealthTitle}>
      {!res.ok ? (
        <ErrorState
          title={localizedApiError(d, res.error, res.retryAfterSeconds)}
          retry={<RetryButton label={d.retryLabel} />}
        />
      ) : (
        <Card>
          <table>
            <thead>
              <tr>
                <th>{localeValue === "ar" ? "نوع الكيان" : "Entity"}</th>
                <th>{localeValue === "ar" ? "المؤشر" : "Cursor"}</th>
                <th>{localeValue === "ar" ? "التأخر" : "Lag"}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(res.data.lag).map(([entity, lag]) => (
                <tr key={entity}>
                  <td>{entity}</td>
                  <td>{res.data.cursors[entity] ?? 0}</td>
                  <td>{lag}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            {localeValue === "ar" ? "نسخة العقد" : "Contract version"}: v{res.data.contractVersion} ·{" "}
            {localeValue === "ar" ? "وقت الخادم" : "Server time"}: {res.data.serverTime}
          </p>
        </Card>
      )}
    </AppShell>
  );
}
