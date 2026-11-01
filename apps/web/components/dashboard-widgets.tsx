/**
 * PHASE-014 T9 — owner dashboard KPI widgets. The widgets NEVER compute
 * business numbers themselves: each card is a pinned-parameter run of an
 * existing report contract (POST /api/v1/reporting/report-runs) and renders
 * the contract's own totals/rows — data equals the report workspace by
 * construction (no parallel math, BR-039 discipline). Money is summed with
 * domain-core Money (never binary float — ADR-0009).
 */
import type { JSX } from "react";

import { Money } from "@erp/domain-core";

import { getDictionary, type Locale } from "../i18n/dictionaries";
import type {
  ReportResultEnvelope,
  ReportRunOutcome,
  ReportRunStatus,
} from "../lib/api-types";
import { fetchApi } from "../lib/server-api";

interface WidgetSpec {
  labelKey: "dashSalesToday" | "dashCashToday" | "dashArOverdue" | "dashStockLow";
  reportKey: string;
  params: Record<string, string>;
  reportPath: string;
  /** How to derive the headline number from the result envelope. */
  summarize: (result: ReportResultEnvelope) => string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function sumMoneyColumn(result: ReportResultEnvelope, columnId: string): string {
  const currency = result.formatting.baseCurrency as Parameters<typeof Money.fromString>[1];
  const amounts = result.rows
    .map((row) => row.values[columnId])
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .map((value) => Money.fromString(String(value), currency));
  if (amounts.length === 0) {
    return Money.fromString("0", currency).toString();
  }
  return Money.sum(amounts).toString();
}

const WIDGETS: readonly WidgetSpec[] = [
  {
    labelKey: "dashSalesToday",
    reportKey: "sales.by-branch",
    params: { dateFrom: todayIso(), dateTo: todayIso() },
    reportPath: "/reports",
    summarize: (result) => sumMoneyColumn(result, "netSales"),
  },
  {
    labelKey: "dashCashToday",
    reportKey: "treasury.daily-cash",
    params: { dateFrom: todayIso(), dateTo: todayIso() },
    reportPath: "/reports",
    summarize: (result) => sumMoneyColumn(result, "net"),
  },
  {
    labelKey: "dashArOverdue",
    reportKey: "ar.aging",
    params: { asOf: todayIso() },
    reportPath: "/reports",
    summarize: (result) => String(result.rows.length),
  },
  {
    labelKey: "dashStockLow",
    reportKey: "inventory.stock-on-hand",
    params: { asOf: todayIso() },
    reportPath: "/reports",
    summarize: (result) =>
      String(result.rows.filter((row) => Number(row.values["qty"] ?? 0) <= 0).length),
  },
];

async function runWidget(spec: WidgetSpec): Promise<string | null> {
  const created = await fetchApi<ReportRunOutcome>("reporting/report-runs", {
    method: "POST",
    body: { reportKey: spec.reportKey, params: spec.params },
  });
  if (!created.ok) {
    return null;
  }
  let result = created.data.result;
  if (result === undefined) {
    // job path: poll to terminal, then read the stored result
    for (let attempt = 0; attempt < 20 && result === undefined; attempt += 1) {
      const status = await fetchApi<ReportRunStatus>(`reporting/report-runs/${created.data.runId}`);
      if (!status.ok || status.data.status === "FAILED") {
        return null;
      }
      if (status.data.status === "SUCCEEDED") {
        const stored = await fetchApi<ReportResultEnvelope>(
          `reporting/report-runs/${created.data.runId}/result`,
        );
        result = stored.ok ? stored.data : undefined;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
  return result === undefined ? null : spec.summarize(result);
}

export async function DashboardWidgets({ locale }: { locale: Locale }): Promise<JSX.Element> {
  const d = getDictionary(locale);
  const values = await Promise.all(WIDGETS.map((spec) => runWidget(spec)));

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-gray-900">{d.dashWidgetsTitle}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {WIDGETS.map((spec, index) => (
          <a
            key={spec.reportKey}
            href={`/${locale}${spec.reportPath}`}
            className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:border-primary-300"
          >
            <span className="text-xs text-gray-500">{d[spec.labelKey]}</span>
            <span className="text-xl font-bold text-gray-900">
              {values[index] ?? d.dashWidgetError}
            </span>
            <span className="text-xs text-primary-700">{d.dashOpenReport} →</span>
          </a>
        ))}
      </div>
    </section>
  );
}
