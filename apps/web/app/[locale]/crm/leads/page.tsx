/**
 * PHASE-019 T12 — /{locale}/crm/leads: lead pipeline list (status filter).
 * Mutations (transition/convert) are server-side on POST /crm/leads/:id/*;
 * this page lists the pipeline. Server-guarded: crm.leads.manage + feature.
 */
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../../components/app-shell";
import { ErrorState } from "../../../../components/client-ui";
import { Card } from "../../../../components/card";
import { getDictionary, isLocale, type Locale } from "../../../../i18n/dictionaries";
import { localizedApiError } from "../../../../lib/messages";
import { fetchApi, requireSessionToken } from "../../../../lib/server-api";

interface LeadRow {
  id: string;
  name: string;
  nameAr: string | null;
  source: string;
  status: string;
  partnerId: string | null;
  lostReason: string | null;
}

export default async function CrmLeadsPage({
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

  const res = await fetchApi<{ leads: LeadRow[] }>("crm/leads");
  if (!res.ok && res.status === 401) {
    redirect(`/${localeValue}/login`);
  }

  return (
    <AppShell locale={localeValue} pagePath="crm/leads" title={d.crmLeadsTitle}>
      {!res.ok ? (
        <ErrorState
          title={localizedApiError(d, res.error, res.retryAfterSeconds)}
        />
      ) : (
        <Card>
          <table>
            <thead>
              <tr>
                <th>{localeValue === "ar" ? "الاسم" : "Name"}</th>
                <th>{localeValue === "ar" ? "المصدر" : "Source"}</th>
                <th>{localeValue === "ar" ? "الحالة" : "Status"}</th>
                <th>{localeValue === "ar" ? "سبب الخسارة" : "Lost reason"}</th>
              </tr>
            </thead>
            <tbody>
              {res.data.leads.map((l) => (
                <tr key={l.id}>
                  <td>{localeValue === "ar" && l.nameAr ? l.nameAr : l.name}</td>
                  <td>{l.source}</td>
                  <td>{l.status}</td>
                  <td>{l.lostReason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
