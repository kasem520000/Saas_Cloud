import { z } from "zod";

import { ISO_DATE, LOCALE, bilingual, col, defineReport, moneyCol, qtyCol, source } from "../kit";
import { reportingServices } from "../services";

/**
 * PHASE-018 T9 — the manufacturing reports
 * (docs/industries/reports/README.md PHASE-018 rows) on the report contract.
 * Data sources are the migration-0025 tables; reads only, no posting surface.
 */

const WINDOW_PARAMS = { dateFrom: ISO_DATE, dateTo: ISO_DATE, locale: LOCALE };

export const manufacturingProductionCostContract = defineReport({
  id: "manufacturing.production_cost",
  version: 1,
  title: bilingual("كلفة الإنتاج", "Production Cost"),
  category: "inventory",
  description: bilingual(
    "المخطط مقابل الفعلي للمواد والعمالة والنفقات العامة لكل أمر إنتاج",
    "Planned vs actual materials/labor/overhead per production order",
  ),
  parameters: z.object(WINDOW_PARAMS),
  requiredPermission: "manufacturing.costing.read",
  dataSources: [
    source("manufacturing", "manufacturingQueries.productionCost", ["production_orders", "production_consumptions"], "أوامر الإنتاج والاستهلاكات", "Production orders and consumptions"),
  ],
  scopeRules: { dateRange: "required", asOf: "forbidden", warehouses: "optional" },
  freshness: { semantics: "current", cacheTtlSeconds: 300, invalidationEvents: ["journal.posted"] },
  assertions: [],
  run: async (_ctx, params) => {
    const { manufacturing } = reportingServices();
    const rows = await manufacturing.productionCost({
      dateFrom: params.dateFrom ?? "1970-01-01",
      dateTo: params.dateTo ?? "2999-12-31",
    });
    return {
      columns: [
        col("orderNo", "رقم الأمر", "Order"),
        col("status", "الحالة", "Status", "status"),
        qtyCol("plannedQty", "المخطط", "Planned"),
        qtyCol("actualQty", "الفعلي", "Actual"),
        moneyCol("materialsCost", "كلفة المواد", "Materials"),
        moneyCol("laborCost", "كلفة العمالة", "Labor"),
        moneyCol("overheadCost", "النفقات العامة", "Overhead"),
      ],
      groups: [],
      rows: rows.map((r) => ({ key: r.key, values: r.values })),
      totals: [],
      assertionResults: [],
    };
  },
});

export const manufacturingBatchGenealogyContract = defineReport({
  id: "manufacturing.batch_genealogy",
  version: 1,
  title: bilingual("شجرة الأنساب", "Batch Genealogy"),
  category: "inventory",
  description: bilingual(
    "التتبع الأمامي والخلفي لدفعة — reading فقط، لا يعدل أي مستند مرحّل",
    "Forward/backward trace of a batch — read-only, never alters posted documents",
  ),
  parameters: z.object({ batchId: z.string().uuid(), traceDirection: z.enum(["upstream", "downstream", "both"]).default("both"), locale: LOCALE }),
  requiredPermission: "manufacturing.genealogy.read",
  dataSources: [
    source("manufacturing", "manufacturingQueries.genealogyUpstream", ["item_batches", "production_consumptions", "sales_invoice_lines"], "الدفعات والاستهلاكات وفواتير البيع", "Batches, consumptions, sales lines"),
  ],
  scopeRules: { dateRange: "optional", asOf: "forbidden", warehouses: "optional" },
  freshness: { semantics: "current", cacheTtlSeconds: 60, invalidationEvents: ["journal.posted"] },
  assertions: [],
  run: async (_ctx, params) => {
    const { manufacturing } = reportingServices();
    const upstream = params.traceDirection !== "downstream" ? await manufacturing.genealogyUpstream(params.batchId ?? "00000000-0000-0000-0000-000000000000") : [];
    const downstream = params.traceDirection !== "upstream" ? await manufacturing.genealogyDownstream(params.batchId ?? "00000000-0000-0000-0000-000000000000") : [];
    return {
      columns: [
        col("direction", "الاتجاه", "Direction", "status"),
        col("batchNo", "الدفعة", "Batch"),
        col("docNo", "المستند", "Document"),
        qtyCol("qty", "الكمية", "Qty"),
        moneyCol("unitCost", "كلفة الوحدة", "Unit cost"),
      ],
      groups: [],
      rows: [
        ...upstream.map((r) => ({ key: `up:${r.key}`, values: { ...r.values, direction: "upstream" } })),
        ...downstream.map((r) => ({ key: `down:${r.key}`, values: { ...r.values, direction: "downstream" } })),
      ],
      totals: [],
      assertionResults: [],
    };
  },
});

export const manufacturingQcInspectionLogContract = defineReport({
  id: "manufacturing.qc_inspection_log",
  version: 1,
  title: bilingual("سجل فحوصات الجودة", "QC Inspection Log"),
  category: "inventory",
  description: bilingual(
    "نتائج الفحوصات (ناجح/راسب/عينة) وقراراتها لكل دفعة أو أمر",
    "Inspection results (pass/fail/sampled) and dispositions per batch or order",
  ),
  parameters: z.object(WINDOW_PARAMS),
  requiredPermission: "manufacturing.qc.manage",
  dataSources: [
    source("manufacturing", "manufacturingQueries.qcInspectionLog", ["inspections", "item_batches"], "الفحوصات والدفعات", "Inspections and batches"),
  ],
  scopeRules: { dateRange: "required", asOf: "forbidden", warehouses: "optional" },
  freshness: { semantics: "current", cacheTtlSeconds: 300, invalidationEvents: ["journal.posted"] },
  assertions: [],
  run: async (_ctx, params) => {
    const { manufacturing } = reportingServices();
    const rows = await manufacturing.qcInspectionLog({
      dateFrom: params.dateFrom ?? "1970-01-01",
      dateTo: params.dateTo ?? "2999-12-31",
    });
    return {
      columns: [
        col("inspectionNo", "رقم الفحص", "Inspection"),
        col("targetType", "الهدف", "Target", "status"),
        col("result", "النتيجة", "Result", "status"),
        col("disposition", "القرار", "Disposition", "status"),
        col("batchNo", "الدفعة", "Batch"),
        qtyCol("sampleSize", "حجم العينة", "Sample"),
      ],
      groups: [],
      rows: rows.map((r) => ({ key: r.key, values: r.values })),
      totals: [],
      assertionResults: [],
    };
  },
});
