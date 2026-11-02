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

/**
 * PHASE-028 T7 — the two variance report contracts (register §J):
 * budget-vs-actual (budget, actual, variance, variance % per dimension ×
 * period) and variance-analysis (trends, top over/under lines). Each carries
 * a ledger-tie assertion: Σ actuals per period = trial-balance period
 * movements — a FAIL blocks export (PHASE-013 semantics).
 */

const WINDOW = { dateFrom: ISO_DATE, dateTo: ISO_DATE, asOf: ISO_DATETIME.nullish(), locale: LOCALE };

export const budgetVsActualContract = defineReport({
  id: "budgeting.budget-vs-actual",
  version: 1,
  title: bilingual("Budget vs actual", "Budget vs actual"),
  category: "budgeting",
  description: bilingual("Budget, actual, variance and variance % per dimension and period", "Budget, actual, variance and variance % per dimension and period"),
  parameters: z.object({ ...WINDOW, budgetId: z.string().optional() }),
  requiredPermission: "reports.budgeting.variance.read",
  dataSources: [
    source("budgeting", "budgeting.budgetVsActual", ["budgets", "budget_lines"], "Budget register", "Budget register"),
    source("accounting", "gl.accountBalances (read-only actuals)", ["journal_lines", "journal_entries"], "GL actuals via read services", "GL actuals via read services"),
  ],
  scopeRules: { asOf: "required" },
  freshness: { semantics: "as-of", cacheTtlSeconds: 0 },
  executionClass: "job",
  assertions: [
    assertDecl("variance-ledger-tie", "sum(actuals per period) == trial-balance period movements", "Actuals do not tie to the trial balance", "sum actuals ties to TB period movements"),
  ],
  run: async () => ({
    columns: [col("dimension", "Dimension", "Dimension"), col("period", "Period", "Period"), moneyCol("budget", "Budget", "Budget"), moneyCol("actual", "Actual", "Actual"), moneyCol("variance", "Variance", "Variance"), col("variancePct", "Variance %", "Variance %")],
    groups: [],
    rows: [],
    totals: [],
    assertionResults: [],
  }),
});

export const varianceAnalysisContract = defineReport({
  id: "budgeting.variance-analysis",
  version: 1,
  title: bilingual("Variance analysis", "Variance analysis"),
  category: "budgeting",
  description: bilingual("Period trends and top over/under-budget lines with threshold highlighting", "Period trends and top over/under-budget lines with threshold highlighting"),
  parameters: z.object(WINDOW),
  requiredPermission: "reports.budgeting.variance.read",
  dataSources: [
    source("budgeting", "budgeting.varianceAnalysis", ["budgets", "budget_lines"], "Budget register", "Budget register"),
    source("accounting", "gl.accountMovements (read-only)", ["journal_lines", "journal_entries"], "GL period movements via read services", "GL period movements via read services"),
  ],
  scopeRules: { asOf: "required" },
  freshness: { semantics: "as-of", cacheTtlSeconds: 0 },
  executionClass: "job",
  assertions: [
    assertDecl("variance-ledger-tie", "sum(actuals per period) == trial-balance period movements", "Actuals do not tie to the trial balance", "sum actuals ties to TB period movements"),
  ],
  run: async () => ({
    columns: [col("dimension", "Dimension", "Dimension"), moneyCol("budget", "Budget", "Budget"), moneyCol("actual", "Actual", "Actual"), moneyCol("variance", "Variance", "Variance"), col("trend", "Trend", "Trend")],
    groups: [],
    rows: [],
    totals: [],
    assertionResults: [],
  }),
});
