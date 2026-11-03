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
 * PHASE-029 T10 — the three payroll report contracts: register (ties to run
 * + journal totals), cost-summary (ties by dimension), eos-provision.
 * Employee detail requires the PII-restricted payroll.employees.view.
 */

const WINDOW = { dateFrom: ISO_DATE, dateTo: ISO_DATE, asOf: ISO_DATETIME.nullish(), locale: LOCALE };

export const payrollRegisterContract = defineReport({
  id: "payroll.register",
  version: 1,
  title: bilingual("Payroll register", "Payroll register"),
  category: "payroll",
  description: bilingual("Posted payroll runs with totals tied to journals", "Posted payroll runs with totals tied to journals"),
  parameters: z.object(WINDOW),
  requiredPermission: "payroll.reports.view",
  dataSources: [source("payroll", "payroll.register", ["payroll_runs", "payroll_run_lines"], "Payroll runs and lines", "Payroll runs and lines")],
  scopeRules: { asOf: "forbidden" },
  freshness: { semantics: "current", cacheTtlSeconds: 60, invalidationEvents: ["payroll_run.posted"] },
  assertions: [
    assertDecl("payroll-run-tie", "sum(run totals) == G-29 journal amounts (INV-025)", "Run totals do not tie to the journal", "sum run totals ties to G-29 journal"),
  ],
  run: async () => ({
    columns: [col("code", "Code", "Code"), col("period", "Period", "Period"), moneyCol("gross", "Gross", "Gross"), moneyCol("deductions", "Deductions", "Deductions"), moneyCol("net", "Net", "Net"), col("status", "Status", "Status")],
    groups: [],
    rows: [],
    totals: [],
    assertionResults: [],
  }),
});

export const payrollCostSummaryContract = defineReport({
  id: "payroll.cost-summary",
  version: 1,
  title: bilingual("Payroll cost summary", "Payroll cost summary"),
  category: "payroll",
  description: bilingual("Salary cost by cost center / branch with GL tie", "Salary cost by cost center / branch with GL tie"),
  parameters: z.object(WINDOW),
  requiredPermission: "payroll.reports.view",
  dataSources: [
    source("payroll", "payroll.costSummary", ["payroll_run_lines", "payroll_runs"], "Run lines with cost centers", "Run lines with cost centers"),
    source("accounting", "gl.accountBalances (read-only)", ["journal_lines"], "GL salary expense actuals", "GL salary expense actuals"),
  ],
  scopeRules: { asOf: "required" },
  freshness: { semantics: "as-of", cacheTtlSeconds: 0 },
  assertions: [
    assertDecl("cost-ledger-tie", "sum(cost by dimension) == SALARIES_EXPENSE + EMPLOYER_CONTRIBUTIONS GL movement", "Cost summary does not tie to the GL", "sum cost ties to GL expense movements"),
  ],
  run: async () => ({
    columns: [col("dimension", "Dimension", "Dimension"), moneyCol("cost", "Cost", "Cost"), moneyCol("employer", "Employer", "Employer")],
    groups: [],
    rows: [],
    totals: [],
    assertionResults: [],
  }),
});

export const payrollEosProvisionContract = defineReport({
  id: "payroll.eos-provision",
  version: 1,
  title: bilingual("EOS provision", "EOS provision"),
  category: "payroll",
  description: bilingual("End-of-service provision balances per employee (policy-driven, no shipped rates)", "End-of-service provision balances per employee (policy-driven, no shipped rates)"),
  parameters: z.object({ asOf: ISO_DATE, locale: LOCALE }),
  requiredPermission: "payroll.reports.view",
  dataSources: [source("payroll", "payroll.eosProvision", ["employees", "payroll_run_lines"], "Employees and EOS accruals", "Employees and EOS accruals")],
  scopeRules: { asOf: "required" },
  freshness: { semantics: "as-of", cacheTtlSeconds: 0 },
  assertions: [
    assertDecl("eos-tie", "sum(provisions) == EOS_PROVISION GL balance", "Provision balances do not tie to the GL", "sum provisions ties to EOS_PROVISION"),
  ],
  run: async () => ({
    columns: [col("employee", "Employee", "Employee"), moneyCol("provision", "Provision", "Provision")],
    groups: [],
    rows: [],
    totals: [],
    assertionResults: [],
  }),
});
