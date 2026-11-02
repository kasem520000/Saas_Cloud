/**
 * PHASE-029 — G-29/G-30/G-31 JournalSpec builders (ADR-0007: payroll posts
 * only via the engine; BR-053: no manual journals on payroll-purpose accounts).
 */
import { Decimal } from "@erp/domain-core";
import type { JournalLineSpec, JournalSpec } from "../../accounting/domain/posting-engine/journal-spec";

/** G-29: one journal per run. DR expense lines · CR payable/deduction/loan/EOS lines. */
export function buildG29Run(input: {
  runId: string; entryDate: string; currency: string;
  lines: Array<{
    gross: string; deductions: string; net: string; employer: string; eosAccrual: string;
    thirdPartyDeductions: string; loanDeduction: string; costCenterId: string | null;
  }>;
  reference?: string;
}): JournalSpec {
  const lines: JournalLineSpec[] = [];
  const sum = (k: "gross" | "employer" | "eosAccrual" | "thirdPartyDeductions" | "loanDeduction" | "net") =>
    input.lines.reduce((s, l) => s.add(new Decimal(l[k])), new Decimal(0)).toFixed(4);
  const cc = input.lines[0]?.costCenterId ?? undefined;
  const push = (purpose: string, direction: "DEBIT" | "CREDIT", amount: string) => {
    if (Number(amount) > 0) lines.push({ purpose, direction, amount, costCenterId: cc });
  };
  push("SALARIES_EXPENSE", "DEBIT", sum("gross"));
  push("EMPLOYER_CONTRIBUTIONS", "DEBIT", sum("employer"));
  push("EOS_PROVISION_EXPENSE", "DEBIT", sum("eosAccrual"));
  push("EOS_PROVISION", "CREDIT", sum("eosAccrual"));
  push("DEDUCTIONS_PAYABLE", "CREDIT", new Decimal(sum("thirdPartyDeductions")).add(sum("employer")).toFixed(4));
  push("EMPLOYEE_LOAN_CONTROL", "CREDIT", sum("loanDeduction"));
  push("SALARIES_PAYABLE", "CREDIT", sum("net"));
  return {
    source: { docType: "payroll_run", docId: input.runId, operation: "post" },
    entryDate: input.entryDate,
    reference: input.reference,
    currency: input.currency,
    description: { en: "Payroll run" },
    lines,
  };
}

/** G-30: payout — DR SALARIES_PAYABLE · CR BANK/CASH per run. */
export function buildG30Payout(input: {
  runId: string; entryDate: string; currency: string; amount: string; cashPurpose: "CASH" | "BANK"; reference?: string;
}): JournalSpec {
  return {
    source: { docType: "payroll_payout", docId: input.runId, operation: "pay" },
    entryDate: input.entryDate,
    reference: input.reference,
    currency: input.currency,
    description: { en: "Payroll payout" },
    lines: [
      { purpose: "SALARIES_PAYABLE", direction: "DEBIT", amount: input.amount },
      { purpose: input.cashPurpose, direction: "CREDIT", amount: input.amount },
    ],
  };
}

/** G-31: EOS settlement at termination. DR EOS_PROVISION (full balance) ·
 *  CR CASH (settled) · CR EOS_PROVISION_EXPENSE (residual release).
 *  Settle ABOVE the provision balance is rejected (mirror case). */
export function buildG31EosSettlement(input: {
  employeeId: string; entryDate: string; currency: string; provisionBalance: string; settled: string;
}): JournalSpec {
  const balance = new Decimal(input.provisionBalance);
  const settled = new Decimal(input.settled);
  if (settled.gt(balance)) {
    throw new Error("EOS_SETTLE_ABOVE_PROVISION: settle amount exceeds provision balance (G-31 mirror rejected)");
  }
  const residual = balance.minus(settled).toFixed(4);
  const lines: JournalLineSpec[] = [
    { purpose: "EOS_PROVISION", direction: "DEBIT", amount: input.provisionBalance },
    { purpose: "CASH", direction: "CREDIT", amount: input.settled },
  ];
  if (Number(residual) > 0) lines.push({ purpose: "EOS_PROVISION_EXPENSE", direction: "CREDIT", amount: residual });
  return {
    source: { docType: "eos_settlement", docId: input.employeeId, operation: "settle" },
    entryDate: input.entryDate,
    currency: input.currency,
    description: { en: "End-of-service settlement" },
    lines,
  };
}

export function isBalanced(spec: JournalSpec): boolean {
  let dr = 0;
  let cr = 0;
  for (const l of spec.lines) {
    if (l.direction === "DEBIT") dr += Number(l.amount);
    else cr += Number(l.amount);
  }
  return Math.abs(dr - cr) < 1e-9;
}
