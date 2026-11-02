/**
 * /{locale}/payroll — employee register list (PHASE-029 T11; requires the
 * PII-restricted payroll.employees.view; national_id/bank fields are masked
 * by the API and never rendered here).
 */
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../components/app-shell";
import { ErrorState } from "../../../components/client-ui";
import { RetryButton } from "../../../components/retry-button";
import { getDictionary, isLocale, type Locale } from "../../../i18n/dictionaries";
import { fetchApi, requireSessionToken } from "../../../lib/server-api";

interface EmployeeRow {
  id: string;
  code: string;
  name: string;
  basicSalary: string;
  status: string;
}

export default async function PayrollPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const localeValue = locale as Locale;
  const d = getDictionary(localeValue);

  await requireSessionToken(localeValue);

  const employees = await fetchApi<readonly EmployeeRow[]>("payroll/employees?limit=25");
  if (!employees.ok && employees.status === 401) notFound();
  if (!employees.ok) {
    return (
      <AppShell locale={localeValue} pagePath="payroll" title={d.prTitle}>
        <ErrorState title={d.loading} detail={String(employees.error)} retry={<RetryButton label={d.loading} />} />
      </AppShell>
    );
  }

  return (
    <AppShell locale={localeValue} pagePath="payroll" title={d.prTitle}>
      <table>
        <thead>
          <tr>
            <th>{d.prCode}</th>
            <th>{d.prName}</th>
            <th>{d.prSalary}</th>
            <th>{d.prStatus}</th>
          </tr>
        </thead>
        <tbody>
          {employees.data.map((e) => (
            <tr key={e.id}>
              <td>{e.code}</td>
              <td>{e.name}</td>
              <td>{e.basicSalary}</td>
              <td>{e.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}
