import { z } from "zod";

import { ISO_DATE, LOCALE, bilingual, col, defineReport, moneyCol, source } from "../kit";
import { reportingServices } from "../services";

/**
 * PHASE-016 T12 — the POS end-of-day reports pinned by the industry templates
 * (docs/industries/reports/README.md PHASE-016 rows): `pos.sales_by_terminal`,
 * `pos.sales_by_hour`, `treasury.shift_cash_reconciliation`. All read POSTED
 * sales invoices / cashier shifts — read-only, GL-tie-able.
 */

const WINDOW_PARAMS = { dateFrom: ISO_DATE, dateTo: ISO_DATE, locale: LOCALE };

export const posSalesByTerminalContract = defineReport({
  id: "pos.sales_by_terminal",
  version: 1,
  title: bilingual("مبيعات نقاط البيع حسب الجهاز", "POS sales by terminal"),
  category: "sales",
  description: bilingual(
    "إجماليات المبيعات Posted حسب جهاز نقاط البيع في فترة — Z report",
    "Posted POS sales totals per terminal over a period — the Z-report basis",
  ),
  parameters: z.object({ ...WINDOW_PARAMS }),
  requiredPermission: "reports.sales.by-branch.read",
  dataSources: [
    source(
      "sales",
      "salesAnalytics.posByTerminal",
      ["sales_invoices", "pos_terminals"],
      "فواتير نقاط البيع المرحلة",
      "Posted POS invoices",
    ),
  ],
  scopeRules: { dateRange: "required", asOf: "optional", warehouses: "optional" },
  freshness: { semantics: "current", cacheTtlSeconds: 300, invalidationEvents: ["journal.posted"] },
  assertions: [],
  run: async (_ctx, params) => {
    const { salesAnalytics: sales } = reportingServices();
    const rows = await sales.posByTerminal({ fromDate: params.dateFrom!, toDate: params.dateTo! });
    return {
      columns: [
        col("terminalCode", "الجهاز", "Terminal"),
        col("saleCount", "عدد المبيعات", "Sales", "text", true),
        moneyCol("totalNet", "صافي", "Net"),
        moneyCol("totalTax", "ضريبة", "Tax"),
        moneyCol("totalGross", "إجمالي", "Gross"),
      ],
      groups: [],
      rows: rows.map((row) => ({
        key: row.terminalCode,
        values: {
          terminalCode: row.terminalCode,
          saleCount: String(row.saleCount),
          totalNet: row.totalNet,
          totalTax: row.totalTax,
          totalGross: row.totalGross,
        },
      })),
      totals: [
        {
          id: "total-gross",
          label: bilingual("إجمالي مبيعات نقاط البيع", "Total POS sales"),
          amount: rows.reduce((sum, r) => sum + Number(r.totalGross), 0).toFixed(4),
          kind: "sum" as const,
        },
      ],
      assertionResults: [],
    };
  },
});

export const posSalesByHourContract = defineReport({
  id: "pos.sales_by_hour",
  version: 1,
  title: bilingual("مبيعات نقاط البيع حسب الساعة", "POS sales by hour"),
  category: "sales",
  description: bilingual(
    "حجم مبيعات نقاط البيع حسب الساعة يوم",
    "POS sales volume by hour of day — counter load profile",
  ),
  parameters: z.object({ ...WINDOW_PARAMS }),
  requiredPermission: "reports.sales.by-branch.read",
  dataSources: [
    source(
      "sales",
      "salesAnalytics.posByHour",
      ["sales_invoices", "pos_terminals"],
      "فواتير نقاط البيع المرحلة",
      "Posted POS invoices",
    ),
  ],
  scopeRules: { dateRange: "required", asOf: "optional", warehouses: "optional" },
  freshness: { semantics: "current", cacheTtlSeconds: 300, invalidationEvents: ["journal.posted"] },
  assertions: [],
  run: async (_ctx, params) => {
    const { salesAnalytics: sales } = reportingServices();
    const rows = await sales.posByHour({ fromDate: params.dateFrom!, toDate: params.dateTo! });
    return {
      columns: [
        col("hour", "الساعة", "Hour"),
        col("saleCount", "عدد المبيعات", "Sales", "text", true),
        moneyCol("totalGross", "إجمالي", "Gross"),
      ],
      groups: [],
      rows: rows.map((row) => ({
        key: String(row.hour),
        values: { hour: `${row.hour}:00`, saleCount: String(row.saleCount), totalGross: row.totalGross },
      })),
      totals: [],
      assertionResults: [],
    };
  },
});

export const treasuryShiftCashReconciliationContract = defineReport({
  id: "treasury.shift_cash_reconciliation",
  version: 1,
  title: bilingual("تسوية صندوق الوردية", "Shift cash reconciliation"),
  category: "treasury",
  description: bilingual(
    "المتوقع مقابل المعدود في الوردية مع الفرق — BR-021",
    "Expected vs counted cash per shift with variance state — BR-021",
  ),
  parameters: z.object({ ...WINDOW_PARAMS }),
  requiredPermission: "inventory.stock.read",
  dataSources: [
    source(
      "treasury",
      "treasuryQueries.shiftCashReconciliation",
      ["cashier_shifts", "cash_accounts", "accounts", "pos_terminals"],
      "وردיות الصندوق",
      "Cashier shifts",
    ),
  ],
  scopeRules: { dateRange: "required", asOf: "optional", warehouses: "optional" },
  freshness: { semantics: "current", cacheTtlSeconds: 300, invalidationEvents: ["journal.posted"] },
  assertions: [],
  run: async (_ctx, params) => {
    const { treasury } = reportingServices();
    const rows = await treasury.shiftCashReconciliation({ fromDate: params.dateFrom!, toDate: params.dateTo! });
    return {
      columns: [
        col("shiftNo", "رقم الوردية", "Shift"),
        col("terminalCode", "الجهاز", "Terminal"),
        col("cashAccountCode", "الصندوق", "Till"),
        moneyCol("openingAmount", "افتتاحي", "Opening"),
        moneyCol("expectedAmount", "متوقع", "Expected"),
        moneyCol("countedAmount", "معدود", "Counted"),
        moneyCol("difference", "فرق", "Variance"),
        col("status", "الحالة", "Status", "status"),
      ],
      groups: [],
      rows: rows.map((row) => ({
        key: row.shiftId,
        values: {
          shiftNo: row.shiftNo ?? "—",
          terminalCode: row.terminalCode,
          cashAccountCode: row.cashAccountCode,
          openingAmount: row.openingAmount,
          expectedAmount: row.expectedAmount ?? "—",
          countedAmount: row.countedAmount ?? "—",
          difference: row.difference ?? "—",
          status: row.status,
        },
      })),
      totals: [],
      assertionResults: [],
    };
  },
});
