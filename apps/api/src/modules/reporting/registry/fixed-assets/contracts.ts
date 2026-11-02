import { z } from "zod";

import {
  ISO_DATE,
  ISO_DATETIME,
  LOCALE,
  assertDecl,
  bilingual,
  col,
  defineReport,
  moneyCol,
  source,
} from "../kit";
import { reportingServices } from "../services";
import type { AssertionResult } from "../../application/contract";

/**
 * PHASE-026 T11 — the three fixed-assets report contracts (register §J):
 * asset-register (as-of, ties fa-cost-tie/fa-accum-tie), depreciation-schedule,
 * movements. Provenance: fixed_assets query service over owned tables only.
 */


async function faTieAssertions(register: { cost: string; accumulated: string }[]): Promise<AssertionResult[]> {
  const { gl } = reportingServices();
  const { findActivePurpose } = await import("../../../accounting/infrastructure/accounting.store");
  const sum = (k: "cost" | "accumulated") =>
    register.reduce((s, r) => s + Number(r[k]), 0).toFixed(4);
  const balances = await gl.accountBalances({});
  const fa = await findActivePurpose("FIXED_ASSET");
  const acc = await findActivePurpose("ACCUM_DEPRECIATION");
  const glFa = fa ? (balances.find((b) => b.accountId === fa.accountId)?.balance ?? "0.0000") : "0.0000";
  const glAcc = acc ? (balances.find((b) => b.accountId === acc.accountId)?.balance ?? "0.0000") : "0.0000";
  return [
    { id: "fa-cost-tie", status: sum("cost") === Number(glFa).toFixed(4) ? "PASS" : "FAIL", compared: { left: sum("cost"), right: glFa } },
    { id: "fa-accum-tie", status: sum("accumulated") === Number(glAcc).toFixed(4) ? "PASS" : "FAIL", compared: { left: sum("accumulated"), right: glAcc } },
  ];
}

const AS_OF_PARAMS = {
  asOf: ISO_DATE,
  locale: LOCALE,
};

const WINDOW_PARAMS = {
  dateFrom: ISO_DATE,
  dateTo: ISO_DATE,
  asOf: ISO_DATETIME.nullish(),
  locale: LOCALE,
};

export const faAssetRegisterContract = defineReport({
  id: "fixed_assets.asset-register",
  version: 1,
  title: bilingual("سجل الأصول الثابتة", "Fixed Asset Register"),
  category: "fixed-assets",
  description: bilingual("سجل الأصول بتكلفتها 积累 وتراكمية وصافي القيمة الدفترية", "Asset register with cost, accumulated depreciation and NBV"),
  parameters: z.object({ ...AS_OF_PARAMS, categoryCode: z.string().optional(), status: z.string().optional() }),
  requiredPermission: "reports.fixed-assets.register.read",
  dataSources: [
    source("fixed_assets", "fixedAssets.assetRegister", ["assets", "asset_categories", "depreciation_lines"], "Asset register and depreciation lines", "Asset register and depreciation lines"),
  ],
  scopeRules: { asOf: "required" },
  freshness: { semantics: "as-of", cacheTtlSeconds: 0 },
  assertions: [
    assertDecl("fa-cost-tie", "sum(register cost) == FIXED_ASSET GL balance", "Total register cost does not tie to the FIXED_ASSET GL balance", "sum cost ties to FIXED_ASSET GL"),
    assertDecl("fa-accum-tie", "sum(register accumulated) == ACCUM_DEPRECIATION GL balance", "Total accumulated does not tie to the ACCUM_DEPRECIATION GL balance", "sum accumulated ties to ACCUM_DEPRECIATION GL"),
  ],
  run: async (_ctx, params) => {
    const { fixedAssets } = reportingServices();
    const rows = await fixedAssets.assetRegister({ asOf: String(params.asOf), categoryCode: params.categoryCode ? String(params.categoryCode) : null, status: params.status ? String(params.status) : null });
    return {
      columns: [
        col("code", "الرمز", "Code"),
        col("name", "الاسم", "Name"),
        col("categoryCode", "الفئة", "Category"),
        col("status", "الحالة", "Status"),
        moneyCol("cost", "التكلفة", "Cost"),
        moneyCol("accumulated", "مجمع الإهلاك", "Accumulated"),
        moneyCol("nbv", "صافي القيمة الدفترية", "NBV"),
      ],
      groups: [],
      rows: rows.map((r) => ({ key: r.code, values: { ...r } })),
      totals: [],
      assertionResults: await faTieAssertions(rows),
    };
  },
});

export const faDepreciationScheduleContract = defineReport({
  id: "fixed_assets.depreciation-schedule",
  version: 1,
  title: bilingual("جدول الإهلاك", "Depreciation Schedule"),
  category: "fixed-assets",
  description: bilingual("جدولة الإهلاكPostedavenir المتبقي والمرحّل", "Posted and remaining depreciation schedule"),
  parameters: z.object({ assetCode: z.string().optional(), locale: LOCALE }),
  requiredPermission: "reports.fixed-assets.register.read",
  dataSources: [
    source("fixed_assets", "fixedAssets.depreciationSchedule", ["depreciation_lines", "depreciation_runs", "assets"], "Depreciation lines and runs", "Depreciation lines and runs"),
  ],
  scopeRules: { asOf: "forbidden" },
  freshness: { semantics: "current", cacheTtlSeconds: 60, invalidationEvents: ["depreciation_run.posted"] },
  assertions: [
    assertDecl("fa-schedule-tie", "sum(schedule amounts) == sum(depreciation_lines.period_amount)", "Schedule does not tie to posted depreciation lines", "sum schedule ties to posted lines"),
  ],
  run: async (_ctx, params) => {
    const { fixedAssets } = reportingServices();
    const rows = await fixedAssets.depreciationSchedule((params.assetCode as unknown as string | undefined) ?? null);
    return {
      columns: [col("assetCode", "الأصل", "Asset"), col("period", "الفترة", "Period"), moneyCol("amount", "قيمة الفترة", "Period amount"), moneyCol("accumulated", "مجمع", "Accumulated")],
      groups: [],
      rows: rows.map((r, i) => ({ key: `${r.assetCode}-${r.period}-${i}`, values: { ...r } })),
      totals: [],
      assertionResults: [],
    };
  },
});

export const faMovementsContract = defineReport({
  id: "fixed_assets.movements",
  version: 1,
  title: bilingual("حركات الأصول", "Asset Movements"),
  category: "fixed-assets",
  description: bilingual(" giust IVA Portalnet acquisizioni, rivalutazioni, ammortamenti e dismissioni del periodo", "Acquisitions, revaluations, depreciation and disposals per period"),
  parameters: z.object(WINDOW_PARAMS),
  requiredPermission: "reports.fixed-assets.register.read",
  dataSources: [
    source("fixed_assets", "fixedAssets.movements", ["assets", "asset_disposals", "asset_revaluations", "depreciation_lines"], "Asset movement tables", "Asset movement tables"),
  ],
  scopeRules: { asOf: "forbidden" },
  freshness: { semantics: "current", cacheTtlSeconds: 60, invalidationEvents: ["asset.disposed", "depreciation_run.posted"] },
  assertions: [
    assertDecl("fa-movements-complete", "every disposal/revaluation in window appears in movements", "Movement list incomplete for the window", "movements complete for window"),
  ],
  run: async (_ctx, params) => {
    const { fixedAssets } = reportingServices();
    const rows = await fixedAssets.movements(params.dateFrom!, params.dateTo!);
    return {
      columns: [col("date", "التاريخ", "Date"), col("kind", "نوع الحركة", "Kind"), col("assetCode", "الأصل", "Asset"), moneyCol("amount", "المبلغ", "Amount")],
      groups: [],
      rows: rows.map((r, i) => ({ key: `${r.date}-${r.kind}-${i}`, values: { ...r } })),
      totals: [],
      assertionResults: [],
    };
  },
});
