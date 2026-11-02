/**
 * PHASE-018 T10 — /{locale}/manufacturing/genealogy: batch genealogy search
 * (upstream consumed batches / downstream sales lines). Read-only.
 * Server-guarded: manufacturing.genealogy.read + manufacturing.batch_genealogy.
 */
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../../components/app-shell";
import { ErrorState } from "../../../../components/client-ui";
import { Card } from "../../../../components/card";
import { getDictionary, isLocale, type Locale } from "../../../../i18n/dictionaries";
import { localizedApiError } from "../../../../lib/messages";
import { fetchApi, requireSessionToken } from "../../../../lib/server-api";

interface TraceRow {
  key: string;
  values: Record<string, string>;
}

export default async function ManufacturingGenealogyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ batchId?: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  const localeValue = locale as Locale;
  const d = getDictionary(localeValue);
  const { batchId } = await searchParams;

  await requireSessionToken(localeValue);

  const res = batchId
    ? await fetchApi<{ upstream: TraceRow[]; downstream: TraceRow[] }>(`manufacturing/genealogy/${batchId}`)
    : { ok: true as const, data: { upstream: [] as TraceRow[], downstream: [] as TraceRow[] } };
  if (!res.ok && "status" in res && res.status === 401) {
    redirect(`/${localeValue}/login`);
  }

  const ar = localeValue === "ar";
  return (
    <AppShell locale={localeValue} pagePath="manufacturing/genealogy" title={d.mfgGenealogyTitle}>
      <Card>
        <form method="get">
          <input name="batchId" defaultValue={batchId ?? ""} placeholder={ar ? "رقم الدفعة" : "Batch id"} />
          <button type="submit">{ar ? "بحث" : "Search"}</button>
        </form>
      </Card>
      {"ok" in res && res.ok ? (
        <>
          <Card>
            <h2>{ar ? "المسار الخلفي (المواد المستهلكة)" : "Upstream (consumed batches)"}</h2>
            <table>
              <tbody>
                {res.data.upstream.map((r) => (
                  <tr key={r.key}>
                    <td>{r.values.batchNo}</td>
                    <td>{r.values.itemName}</td>
                    <td>{r.values.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card>
            <h2>{ar ? "المسار الأمامي (فواتير البيع)" : "Downstream (sales invoices)"}</h2>
            <table>
              <tbody>
                {res.data.downstream.map((r) => (
                  <tr key={r.key}>
                    <td>{r.values.docNo}</td>
                    <td>{r.values.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      ) : (
        <ErrorState title={localizedApiError(d, res.error, res.retryAfterSeconds)} />
      )}
    </AppShell>
  );
}
