import { z } from "zod";

import { ISO_DATE, LOCALE, bilingual, col, defineReport, moneyCol, qtyCol, source } from "../kit";
import { reportingServices } from "../services";

/**
 * PHASE-017 T13 — the seven PHASE-017 industry reports
 * (docs/industries/reports/README.md PHASE-017 rows) on the report contract.
 * Data sources are the migration-0024 tables; reads only, no posting surface.
 */

const WINDOW_PARAMS = { dateFrom: ISO_DATE, dateTo: ISO_DATE, locale: LOCALE };

export const automotiveJobCardProfitabilityContract = defineReport({
  id: "automotive.job_card_profitability",
  version: 1,
  title: bilingual("ربحية بطاقة العمل", "Job Card Profitability"),
  category: "sales",
  description: bilingual(
    "إيراد قطع الغيار مقابل الأجور لكل بطاقة عمل (تكلفة العمالة غير متتبعة —blouse limitation)",
    "Parts vs labor revenue per job card (labor cost not tracked — documented limitation)",
  ),
  parameters: z.object({ locale: LOCALE }),
  requiredPermission: "sales.job_cards.manage",
  dataSources: [
    source("distribution", "distributionQueries.jobCardProfitability", ["job_cards", "job_card_lines"], "بطاقات العمل وسطورها", "Job cards and lines"),
  ],
  scopeRules: { dateRange: "optional", asOf: "forbidden", warehouses: "optional" },
  freshness: { semantics: "current", cacheTtlSeconds: 300, invalidationEvents: ["journal.posted"] },
  assertions: [],
  run: async () => {
    const { distribution } = reportingServices();
    const rows = await distribution.jobCardProfitability();
    return {
      columns: [
        col("cardNo", "رقم البطاقة", "Card"),
        col("status", "الحالة", "Status", "status"),
        moneyCol("partsRevenue", "إيراد القطع", "Parts revenue"),
        moneyCol("laborRevenue", "إيراد الأجور", "Labor revenue"),
        moneyCol("totalRevenue", "الإجمالي", "Total"),
      ],
      groups: [],
      rows: rows.map((r) => ({
        key: r.cardId,
        values: {
          cardNo: r.cardNo,
          status: r.status,
          partsRevenue: r.partsRevenue,
          laborRevenue: r.laborRevenue,
          totalRevenue: r.totalRevenue,
        },
      })),
      totals: [],
      assertionResults: [],
    };
  },
});

export const automotiveVehicleServiceHistoryContract = defineReport({
  id: "automotive.vehicle_service_history",
  version: 1,
  title: bilingual("سجل صيانة المركبة", "Vehicle Service History"),
  category: "sales",
  description: bilingual("الخط الزمني لبطاقات عمل المركبة", "Job-card timeline for one vehicle"),
  parameters: z.object({ vehicleId: z.string().uuid(), locale: LOCALE }),
  requiredPermission: "partners.balances.read",
  dataSources: [
    source("distribution", "distributionQueries.vehicleServiceHistory", ["job_cards", "vehicles"], "سجل الصيانة", "Service history"),
  ],
  scopeRules: { dateRange: "optional", asOf: "forbidden", warehouses: "optional" },
  freshness: { semantics: "current", cacheTtlSeconds: 300, invalidationEvents: ["journal.posted"] },
  assertions: [],
  run: async (_ctx, params) => {
    const { distribution } = reportingServices();
    const rows = await distribution.vehicleServiceHistory(params.vehicleId!);
    return {
      columns: [
        col("cardNo", "البطاقة", "Card"),
        col("status", "الحالة", "Status", "status"),
        col("openedAt", "تاريخ الفتح", "Opened", "date"),
        col("invoiceId", "الفاتورة", "Invoice"),
      ],
      groups: [],
      rows: rows.map((r) => ({
        key: r.cardNo + r.openedAt,
        values: { cardNo: r.cardNo, status: r.status, openedAt: r.openedAt, invoiceId: r.invoiceId ?? "—" },
      })),
      totals: [],
      assertionResults: [],
    };
  },
});

export const distributionRepSettlementContract = defineReport({
  id: "distribution.rep_settlement",
  version: 1,
  title: bilingual("تقرير تسوية المندوب", "Rep Settlement"),
  category: "treasury",
  description: bilingual("المتوقع مقابل الجرد والفرق لكل تسوية", "Expected vs counted cash and variance per settlement"),
  parameters: z.object({ ...WINDOW_PARAMS, repId: z.string().uuid().optional() }),
  requiredPermission: "distribution.settlements.manage",
  dataSources: [
    source("distribution", "distributionQueries.repSettlements", ["rep_settlements"], "التسويات", "Settlements"),
  ],
  scopeRules: { dateRange: "required", asOf: "optional", warehouses: "optional" },
  freshness: { semantics: "current", cacheTtlSeconds: 300, invalidationEvents: ["journal.posted"] },
  assertions: [],
  run: async (_ctx, params) => {
    const { distribution } = reportingServices();
    const rows = await distribution.repSettlements(params.repId ?? undefined);
    return {
      columns: [
        col("settlementNo", "رقم التسوية", "Settlement"),
        col("settlementDate", "التاريخ", "Date", "date"),
        col("status", "الحالة", "Status", "status"),
        moneyCol("expectedCash", "المتوقع", "Expected"),
        moneyCol("countedCash", "المجرد", "Counted"),
        moneyCol("varianceAmount", "الفرق", "Variance"),
      ],
      groups: [],
      rows: rows.map((r) => ({
        key: r.settlementNo,
        values: {
          settlementNo: r.settlementNo,
          settlementDate: r.settlementDate,
          status: r.status,
          expectedCash: r.expectedCash,
          countedCash: r.countedCash ?? "—",
          varianceAmount: r.varianceAmount ?? "—",
        },
      })),
      totals: [],
      assertionResults: [],
    };
  },
});

export const distributionRouteVisitComplianceContract = defineReport({
  id: "distribution.route_visit_compliance",
  version: 1,
  title: bilingual("الالتزام بالمسار", "Route Visit Compliance"),
  category: "sales",
  description: bilingual("الزيارات المخططة مقابل الفعلية حسب المسار واليوم", "Planned vs actual visits per route and day"),
  parameters: z.object({ ...WINDOW_PARAMS, routeId: z.string().uuid().optional() }),
  requiredPermission: "distribution.routes.manage",
  dataSources: [
    source("distribution", "distributionQueries.routeVisitCompliance", ["routes", "route_visits"], "المسارات والزيارات", "Routes and visits"),
  ],
  scopeRules: { dateRange: "required", asOf: "optional", warehouses: "optional" },
  freshness: { semantics: "current", cacheTtlSeconds: 300, invalidationEvents: [] },
  assertions: [],
  run: async (_ctx, params) => {
    const { distribution } = reportingServices();
    const rows = await distribution.routeVisitCompliance(params.routeId ?? undefined);
    return {
      columns: [
        col("plannedDate", "اليوم", "Day", "date"),
        qtyCol("planned", "المخطط", "Planned"),
        qtyCol("visited", "الفعلي", "Visited"),
      ],
      groups: [],
      rows: rows.map((r) => ({
        key: r.routeId + r.plannedDate,
        values: { plannedDate: r.plannedDate, planned: r.planned, visited: r.visited },
      })),
      totals: [],
      assertionResults: [],
    };
  },
});

export const distributionVanStockBalancesContract = defineReport({
  id: "distribution.van_stock_balances",
  version: 1,
  title: bilingual("أرصدة مخزون السيارات", "Van Stock Balances"),
  category: "inventory",
  description: bilingual("رصيد كل صنف في كل سيارة (مستودع VAN)", "On-hand per item per van (VAN warehouse)"),
  parameters: z.object({ locale: LOCALE }),
  requiredPermission: "distribution.van_stock.view",
  dataSources: [
    source("distribution", "distributionQueries.vanStockBalances", ["van_stocks", "items", "warehouses"], "أرصدة السيارات", "Van balances"),
  ],
  scopeRules: { dateRange: "optional", asOf: "required", warehouses: "optional" },
  freshness: { semantics: "as-of", cacheTtlSeconds: 300, invalidationEvents: ["journal.posted"] },
  assertions: [],
  run: async () => {
    const { distribution } = reportingServices();
    const rows = await distribution.vanStockBalances();
    return {
      columns: [
        col("itemSku", "الصنف", "SKU"),
        qtyCol("qty", "الكمية", "Qty"),
        moneyCol("valueAmount", "القيمة", "Value"),
        col("asOf", "كما في", "As of", "date"),
      ],
      groups: [],
      rows: rows.map((r) => ({
        key: r.warehouseId + r.itemSku,
        values: { itemSku: r.itemSku, qty: r.qty, valueAmount: r.valueAmount, asOf: r.asOf },
      })),
      totals: [],
      assertionResults: [],
    };
  },
});

export const salesCommissionsDueContract = defineReport({
  id: "sales.commissions_due",
  version: 1,
  title: bilingual("العمولات المستحقة", "Commissions Due"),
  category: "sales",
  description: bilingual("قاعدة العمولة لكل مندوب من المبيعاتStage غير المعكوسة", "Commission base per rep from posted, non-reversed sales"),
  parameters: z.object({ locale: LOCALE }),
  requiredPermission: "sales.commissions.manage",
  dataSources: [
    source("sales", "distributionQueries.commissionsDue", ["commission_rules", "sales_reps", "sales_invoices"], "قواعد العمولات", "Commission rules"),
  ],
  scopeRules: { dateRange: "optional", asOf: "forbidden", warehouses: "optional" },
  freshness: { semantics: "current", cacheTtlSeconds: 300, invalidationEvents: ["journal.posted"] },
  assertions: [],
  run: async () => {
    const { distribution } = reportingServices();
    const rows = await distribution.commissionsDue();
    return {
      columns: [
        col("repCode", "المندوب", "Rep"),
        col("basis", "الأساس", "Basis"),
        col("ratePct", "النسبة", "Rate %"),
        moneyCol("invoicedBase", "قاعدة الفواتير", "Invoiced base"),
        moneyCol("collectedBase", "قاعدة التحصيل", "Collected base"),
      ],
      groups: [],
      rows: rows.map((r) => ({
        key: r.repCode + r.basis,
        values: {
          repCode: r.repCode,
          basis: r.basis,
          ratePct: r.ratePct,
          invoicedBase: r.invoicedBase,
          collectedBase: r.collectedBase,
        },
      })),
      totals: [],
      assertionResults: [],
    };
  },
});

export const salesDiscountEffectivenessContract = defineReport({
  id: "sales.discount_management_effectiveness",
  version: 1,
  title: bilingual("فعالية الخصومات", "Discount Effectiveness"),
  category: "sales",
  description: bilingual("إجمالي الخصومات الممنوحة مقابل gross المبيعات", "Total granted discounts vs gross sales"),
  parameters: z.object({ ...WINDOW_PARAMS }),
  requiredPermission: "sales.invoices.read",
  dataSources: [
    source("distribution", "distributionQueries.discountTotals", ["sales_invoices", "sales_invoice_lines"], "الخصومات", "Discounts"),
  ],
  scopeRules: { dateRange: "required", asOf: "optional", warehouses: "optional" },
  freshness: { semantics: "current", cacheTtlSeconds: 300, invalidationEvents: ["journal.posted"] },
  assertions: [],
  run: async (_ctx, params) => {
    const rows = await reportingServices().distribution.discountTotals({
      dateFrom: params.dateFrom!,
      dateTo: params.dateTo!,
    });
    return {
      columns: [
        col("docNo", "المستند", "Document"),
        moneyCol("discount", "الخصم", "Discount"),
        moneyCol("gross", "الإجمالي", "Gross"),
      ],
      groups: [],
      rows,
      totals: [],
      assertionResults: [],
    };
  },
});
