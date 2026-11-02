/**
 * PHASE-019 T12 — /{locale}/crm/contracts: service contract list with fee
 * model, term and status. Schedule expansion + billing run are server-side
 * on POST /crm/contracts/:id/*. Server-guarded: crm.contracts.manage + feature.
 */
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../../components/app-shell";
import { ErrorState } from "../../../../components/client-ui";
import { Card } from "../../../../components/card";
import { getDictionary, isLocale, type Locale } from "../../../../i18n/dictionaries";
import { localizedApiError } from "../../../../lib/messages";
import { fetchApi, requireSessionToken } from "../../../../lib/server-api";

interface ContractRow {
  id: string;
  contractNo: string;
  partnerId: string;
  projectId: string | null;
  feeModel: string;
  status: string;
  renewalState: string;
  startDate: string;
  endDate: string | null;
}

export default async function CrmContractsPage({
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

  const res = await fetchApi<{ contracts: ContractRow[] }>("crm/contracts");
  if (!res.ok && res.status === 401) {
    redirect(`/${localeValue}/login`);
  }

  return (
    <AppShell locale={localeValue} pagePath="crm/contracts" title={d.crmContractsTitle}>
      {!res.ok ? (
        <ErrorState
          title={localizedApiError(d, res.error, res.retryAfterSeconds)}
        />
      ) : (
        <Card>
          <table>
            <thead>
              <tr>
                <th>{localeValue === "ar" ? "رقم العقد" : "Contract"}</th>
                <th>{localeValue === "ar" ? "نموذج الأتعاب" : "Fee model"}</th>
                <th>{localeValue === "ar" ? "الحالة" : "Status"}</th>
                <th>{localeValue === "ar" ? "البداية" : "Start"}</th>
                <th>{localeValue === "ar" ? "النهاية" : "End"}</th>
              </tr>
            </thead>
            <tbody>
              {res.data.contracts.map((c) => (
                <tr key={c.id}>
                  <td>{c.contractNo}</td>
                  <td>{c.feeModel}</td>
                  <td>{c.status}</td>
                  <td>{c.startDate}</td>
                  <td>{c.endDate ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
