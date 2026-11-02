/**
 * PHASE-018 T10 — /{locale}/manufacturing/boms: BOM list (versions, yield,
 * scrap factors; editor actions server-side). Server-guarded:
 * manufacturing.boms.manage + manufacturing.bom feature.
 */
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../../components/app-shell";
import { ErrorState } from "../../../../components/client-ui";
import { Card } from "../../../../components/card";
import { getDictionary, isLocale, type Locale } from "../../../../i18n/dictionaries";
import { localizedApiError } from "../../../../lib/messages";
import { fetchApi, requireSessionToken } from "../../../../lib/server-api";

interface BomRow {
  id: string;
  name: string;
  itemId: string;
  currentVersion: number;
  lines: number;
}

export default async function ManufacturingBomsPage({
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

  const res = await fetchApi<{ boms: BomRow[] }>("manufacturing/boms");
  if (!res.ok && res.status === 401) {
    redirect(`/${localeValue}/login`);
  }

  return (
    <AppShell locale={localeValue} pagePath="manufacturing/boms" title={d.mfgBomsTitle}>
      {!res.ok ? (
        <ErrorState
          title={localizedApiError(d, res.error, res.retryAfterSeconds)}
        />
      ) : (
        <Card>
          <table>
            <thead>
              <tr>
                <th>{d.mfgBomsTitle}</th>
                <th>{localeValue === "ar" ? "الإصدار الحالي" : "Current version"}</th>
                <th>{localeValue === "ar" ? "عدد المكونات" : "Components"}</th>
              </tr>
            </thead>
            <tbody>
              {res.data.boms.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.currentVersion}</td>
                  <td>{b.lines}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
