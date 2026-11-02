/**
 * PHASE-019 T12 — /{locale}/accounting/projects: the projects/cases analytical
 * dimension (accounting-owned). Server-guarded: accounting.projects.manage.
 */
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../../components/app-shell";
import { ErrorState } from "../../../../components/client-ui";
import { Card } from "../../../../components/card";
import { getDictionary, isLocale, type Locale } from "../../../../i18n/dictionaries";
import { localizedApiError } from "../../../../lib/messages";
import { fetchApi, requireSessionToken } from "../../../../lib/server-api";

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  status: string;
  parentId: string | null;
  contractId: string | null;
}

export default async function AccountingProjectsPage({
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

  const res = await fetchApi<{ projects: ProjectRow[] }>("accounting/projects");
  if (!res.ok && res.status === 401) {
    redirect(`/${localeValue}/login`);
  }

  return (
    <AppShell locale={localeValue} pagePath="accounting/projects" title={d.projectsTitle}>
      {!res.ok ? (
        <ErrorState
          title={localizedApiError(d, res.error, res.retryAfterSeconds)}
        />
      ) : (
        <Card>
          <table>
            <thead>
              <tr>
                <th>{localeValue === "ar" ? "الرمز" : "Code"}</th>
                <th>{localeValue === "ar" ? "الاسم" : "Name"}</th>
                <th>{localeValue === "ar" ? "الحالة" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {res.data.projects.map((p) => (
                <tr key={p.id}>
                  <td>{p.code}</td>
                  <td>{localeValue === "ar" && p.nameAr ? p.nameAr : p.name}</td>
                  <td>{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
