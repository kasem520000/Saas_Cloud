import { z } from "zod";

import { ISO_DATE, LOCALE, bilingual, col, defineReport, moneyCol, qtyCol, source } from "../kit";
import { reportingServices } from "../services";

/**
 * PHASE-015 T10 — the industry reports pinned by the three priority templates
 * (docs/industries/reports/README.md PHASE-015 rows): `inventory.expiry_list`,
 * `grocery.expiry_writeoff`, `retail.imei_register`. Data exists since
 * PHASE-010 (batches/serials) and PHASE-012 (adjustments); these contracts
 * register against the PHASE-013 engine — no orphan pins.
 */

const AS_OF_PARAMS = { asOf: ISO_DATE, locale: LOCALE };

export const inventoryExpiryListContract = defineReport({
  id: "inventory.expiry_list",
  version: 1,
  title: bilingual("قائمة الصلاحيات", "Expiry List"),
  category: "inventory",
  description: bilingual(
    "قائمة الدفعات حسب الأقرب انتهاءً مع الكمية المتبقية — pin لقالب البقالة",
    "Batch expiry list ordered by nearest expiry with on-hand qty — grocery template pin",
  ),
  parameters: z.object({ ...AS_OF_PARAMS, warehouseIds: z.array(z.string().uuid()).nullish() }),
  requiredPermission: "inventory.batches.read",
  dataSources: [
    source(
      "inventory",
      "batchQueries.expiry",
      ["item_batches", "stock_moves", "items", "warehouses"],
      "دفعات الصلاحية النشطة",
      "Active batches with expiry",
    ),
  ],
  scopeRules: { dateRange: "optional", asOf: "required", warehouses: "optional" },
  freshness: { semantics: "as-of", cacheTtlSeconds: 3600, invalidationEvents: ["journal.posted"] },
  assertions: [],
  run: async (_ctx, params) => {
    const { inventory } = reportingServices();
    const rows = await inventory.expiry({
      asOf: params.asOf!,
      warehouseIds: params.warehouseIds ?? undefined,
    });
    return {
      columns: [
        col("batchNo", "الدفعة", "Batch"),
        col("itemSku", "الصنف", "SKU"),
        col("warehouseCode", "المستودع", "Warehouse"),
        col("expiryDate", "الانتهاء", "Expiry", "date"),
        qtyCol("qty", "الكمية", "Qty"),
        col("daysToExpiry", "الأيام المتبقية", "Days left", "text", true),
        col("status", "الحالة", "Status", "status"),
      ],
      groups: [],
      rows: rows
        .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
        .map((row) => ({
          key: row.batchId,
          values: {
            batchNo: row.batchNo,
            itemSku: row.itemSku,
            warehouseCode: row.warehouseCode,
            expiryDate: row.expiryDate,
            qty: row.qty,
            daysToExpiry: row.daysToExpiry,
            status: row.status,
          },
        })),
      totals: [],
      assertionResults: [],
    };
  },
});

export const groceryExpiryWriteoffContract = defineReport({
  id: "grocery.expiry_writeoff",
  version: 1,
  title: bilingual("سجل إعدام الصلاحية", "Expiry Write-off Register"),
  category: "inventory",
  description: bilingual(
    "تسويات الإعدام المرتبطة بانتهاء الصلاحية بقيمة الإعدام — write-off value ties to shrinkage journal lines",
    "Expiry write-off adjustments with value, tying to shrinkage journal lines",
  ),
  parameters: z.object({ dateFrom: ISO_DATE, dateTo: ISO_DATE, locale: LOCALE }),
  requiredPermission: "inventory.stock.read",
  dataSources: [
    source(
      "inventory",
      "stockQueries.expiryWriteoffs",
      ["stock_adjustments", "items", "warehouses"],
      "تسويات المخزون (أسباب الإعدام)",
      "Stock adjustments (write-off reasons)",
    ),
  ],
  scopeRules: { dateRange: "required", asOf: "optional", warehouses: "optional" },
  freshness: { semantics: "current", cacheTtlSeconds: 300, invalidationEvents: ["journal.posted"] },
  assertions: [],
  run: async (_ctx, params) => {
    const { inventory } = reportingServices();
    const rows = await inventory.expiryWriteoffs({
      dateFrom: params.dateFrom!,
      dateTo: params.dateTo!,
    });
    return {
      columns: [
        col("adjustmentNo", "رقم التسوية", "Adjustment"),
        col("itemSku", "الصنف", "SKU"),
        col("warehouseCode", "المستودع", "Warehouse"),
        col("reason", "السبب", "Reason"),
        qtyCol("deltaQty", "الكمية", "Qty"),
        moneyCol("value", "القيمة", "Value"),
        col("createdAt", "التاريخ", "Date", "date"),
      ],
      groups: [],
      rows: rows.map((row) => ({
        key: row.id,
        values: {
          adjustmentNo: row.adjustmentNo,
          itemSku: row.itemSku,
          warehouseCode: row.warehouseCode,
          reason: row.reason,
          deltaQty: row.deltaQty,
          value: row.value,
          createdAt: row.createdAt,
        },
      })),
      totals: [
        {
          id: "total-writeoff-value",
          label: bilingual("إجمالي قيمة الإعدام", "Total write-off value"),
          amount: rows.reduce((sum, r) => sum + Number(r.value), 0).toFixed(4),
          kind: "sum" as const,
        },
      ],
      assertionResults: [],
    };
  },
});

export const retailImeiRegisterContract = defineReport({
  id: "retail.imei_register",
  version: 1,
  title: bilingual("سجل الأجهزة (IMEI)", "IMEI Register"),
  category: "inventory",
  description: bilingual(
    "سجل الأجهزة مع مع IMEI وحالة الجهاز (مباع/متاح) — pin لقالب التجزئة",
    "Serial register with IMEI and device status (sold/available) — retail template pin",
  ),
  parameters: z.object({ serial: z.string().max(80).optional(), locale: LOCALE }),
  requiredPermission: "inventory.serials.read",
  dataSources: [
    source(
      "inventory",
      "stockQueries.serials",
      ["item_serials", "items"],
      "سجل serials الأجهزة",
      "Device serial register",
    ),
  ],
  scopeRules: { dateRange: "optional", asOf: "optional", warehouses: "optional" },
  freshness: { semantics: "current", cacheTtlSeconds: 300, invalidationEvents: ["journal.posted"] },
  assertions: [],
  run: async (_ctx, params) => {
    const { inventory } = reportingServices();
    const rows = await inventory.serials({ serial: params.serial });
    return {
      columns: [
        col("serialNo", "الرقم التسلسلي", "Serial"),
        col("imei", "IMEI", "IMEI"),
        col("itemSku", "الصنف", "SKU"),
        col("status", "الحالة", "Status", "status"),
        col("currentOwner", "المالك الحالي", "Current owner"),
        col("soldAt", "تاريخ البيع", "Sold at", "date"),
      ],
      groups: [],
      rows: rows.map((row) => ({
        key: row.serialId,
        values: {
          serialNo: row.serialNo,
          imei: row.imei ?? "—",
          itemSku: row.itemSku,
          status: row.status,
          currentOwner: row.currentOwner ?? "—",
          soldAt: row.soldAt ?? "—",
        },
      })),
      totals: [],
      assertionResults: [],
    };
  },
});
