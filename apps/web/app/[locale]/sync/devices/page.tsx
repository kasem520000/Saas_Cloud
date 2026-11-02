/**
 * PHASE-020 T14 — /{locale}/sync/devices: admin device registry (offline
 * device management). Server-guarded: identity.devices.manage +
 * offline.device_management feature.
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

interface DeviceRow {
  id: string;
  platform: string;
  name: string | null;
  revokedAt: string | null;
  contractVersion: number;
  attestedAt: string | null;
  lastSeenAt: string | null;
}

export default async function SyncDevicesPage({
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

  const res = await fetchApi<{ devices: DeviceRow[] }>("sync/devices");
  if (!res.ok && res.status === 401) {
    redirect(`/${localeValue}/login`);
  }

  return (
    <AppShell locale={localeValue} pagePath="sync/devices" title={d.syncDevicesTitle}>
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
                <th>{localeValue === "ar" ? "الجهاز" : "Device"}</th>
                <th>{localeValue === "ar" ? "المنصة" : "Platform"}</th>
                <th>{localeValue === "ar" ? "الحالة" : "Status"}</th>
                <th>{localeValue === "ar" ? "الإصدار" : "Contract"}</th>
                <th>{localeValue === "ar" ? "آخر رؤية" : "Last seen"}</th>
              </tr>
            </thead>
            <tbody>
              {res.data.devices.map((dev) => (
                <tr key={dev.id}>
                  <td>{dev.name ?? dev.id.slice(0, 8)}</td>
                  <td>{dev.platform}</td>
                  <td>{dev.revokedAt !== null ? (localeValue === "ar" ? "مُبطل" : "REVOKED") : (localeValue === "ar" ? "نشط" : "live")}</td>
                  <td>v{dev.contractVersion}</td>
                  <td>{dev.lastSeenAt ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
