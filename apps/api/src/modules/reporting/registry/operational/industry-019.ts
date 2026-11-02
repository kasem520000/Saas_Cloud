import { z } from "zod";

import { ISO_DATE, LOCALE, bilingual, col, defineReport, moneyCol, source } from "../kit";
import { reportingServices } from "../services";

/**
 * PHASE-019 T10 — the services reports
 * (docs/industries/reports/README.md PHASE-019 rows) on the report contract.
 * Data sources are the migration-0026 tables; reads only, no posting surface.
 * services.contract_revenue_schedule reconciles schedule → invoices → backlog
 * (INV-009 discipline: invoiced lines tie to posted sales invoices).
 */

const WINDOW_PARAMS = { dateFrom: ISO_DATE, dateTo: ISO_DATE, locale: LOCALE };

export const servicesContractRevenueScheduleContract = defineReport({
  id: "services.contract_revenue_schedule",
  version: 1,
  title: bilingual("جدول إيرادات العقود", "Contract Revenue Schedule"),
  category: "services",
  description: bilingual(
    "المتعاقد مقابل المفوتر مقابل المتأخر لكل عقد خدمة — يتطابق مع رصيد حساب العملاء",
    "Contracted vs invoiced vs backlog per service contract — reconciles to the AR control",
  ),
  parameters: z.object(WINDOW_PARAMS),
  requiredPermission: "crm.contracts.manage",
  dataSources: [
    source("crm", "crmQueries.contractRevenueSchedule", ["service_contracts", "contract_schedule_lines", "sales_invoices"], "عقود الخدمات وجداول الفوترة", "Service contracts, schedule lines, sales invoices"),
  ],
  scopeRules: { dateRange: "required", asOf: "forbidden" },
  freshness: { semantics: "current", cacheTtlSeconds: 300, invalidationEvents: ["journal.posted"] },
  assertions: [],
  run: async (_ctx, params) => {
    const { crm } = reportingServices();
    const rows = await crm.contractRevenueSchedule({
      dateFrom: params.dateFrom ?? "1970-01-01",
      dateTo: params.dateTo ?? "2999-12-31",
    });
    return {
      columns: [
        col("contractNo", "رقم العقد", "Contract"),
        col("feeModel", "نموذج الأتعاب", "Fee model", "status"),
        col("status", "الحالة", "Status", "status"),
        moneyCol("contracted", "المتعاقد", "Contracted"),
        moneyCol("invoiced", "المفوتر", "Invoiced"),
        moneyCol("backlog", "المتبقي", "Backlog"),
      ],
      groups: [],
      rows: rows.map((r) => ({ key: r.key, values: r.values })),
      totals: [],
      assertionResults: [],
    };
  },
});

export const servicesTimeBillingSummaryContract = defineReport({
  id: "services.time_billing_summary",
  version: 1,
  title: bilingual("ملخص فواتير الوقت", "Time Billing Summary"),
  category: "services",
  description: bilingual(
    "الساعات المسجلة مقابل القابلة للفوترة مقابل المفوترة لكل ملف/بند أتعاب",
    "Recorded vs billable vs invoiced hours per project/fee item",
  ),
  parameters: z.object(WINDOW_PARAMS),
  requiredPermission: "crm.contracts.manage",
  dataSources: [
    source("crm", "crmQueries.timeBillingSummary", ["time_entries", "projects", "items"], "إدخالات الوقت والمشاريع", "Time entries, projects, fee items"),
  ],
  scopeRules: { dateRange: "required", asOf: "forbidden" },
  freshness: { semantics: "current", cacheTtlSeconds: 300, invalidationEvents: ["journal.posted"] },
  assertions: [],
  run: async (_ctx, params) => {
    const { crm } = reportingServices();
    const rows = await crm.timeBillingSummary({
      dateFrom: params.dateFrom ?? "1970-01-01",
      dateTo: params.dateTo ?? "2999-12-31",
    });
    return {
      columns: [
        col("projectCode", "رمز الملف", "Project"),
        col("feeItem", "بند الأتعاب", "Fee item"),
        col("recorded", "المسجل", "Recorded"),
        col("billable", "القابل للفوترة", "Billable"),
        col("invoiced", "المفوتر", "Invoiced"),
      ],
      groups: [],
      rows: rows.map((r) => ({ key: r.key, values: r.values })),
      totals: [],
      assertionResults: [],
    };
  },
});
