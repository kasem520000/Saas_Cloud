/**
 * PHASE-018 T10 — /{locale}/manufacturing/orders: production order workspace
 * list (release → consume → scrap → QC → complete actions are server-side
 * on POST /manufacturing/orders/:id/*; this page lists + links them).
 * Server-guarded: manufacturing.production_orders.view + feature.
 */
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../../components/app-shell";
import { ErrorState } from "../../../../components/client-ui";
import { Card } from "../../../../components/card";
import { getDictionary, isLocale, type Locale } from "../../../../i18n/dictionaries";
import { localizedApiError } from "../../../../lib/messages";
import { fetchApi, requireSessionToken } from "../../../../lib/server-api";

interface ProductionOrderRow {
  id: string;
  orderNo: string;
  status: string;
  plannedQty: string;
  actualQty: string;
}

export default async function ManufacturingOrdersPage({
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

  const res = await fetchApi<{ orders: ProductionOrderRow[] }>("manufacturing/orders");
  if (!res.ok && res.status === 401) {
    redirect(`/${localeValue}/login`);
  }

  return (
    <AppShell locale={localeValue} pagePath="manufacturing/orders" title={d.mfgOrdersTitle}>
      {!res.ok ? (
        <ErrorState
          title={localizedApiError(d, res.error, res.retryAfterSeconds)}
        />
      ) : (
        <Card>
          <table>
            <thead>
              <tr>
                <th>{d.mfgOrdersTitle}</th>
                <th>PRD</th>
                <th>{localeValue === "ar" ? "الحالة" : "Status"}</th>
                <th>{localeValue === "ar" ? "المخطط" : "Planned"}</th>
                <th>{localeValue === "ar" ? "الفعلي" : "Actual"}</th>
              </tr>
            </thead>
            <tbody>
              {res.data.orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.orderNo}</td>
                  <td>{o.status}</td>
                  <td>{o.plannedQty}</td>
                  <td>{o.actualQty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
