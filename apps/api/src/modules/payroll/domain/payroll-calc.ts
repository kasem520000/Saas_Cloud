/**
 * PHASE-029 — payroll calculation core (DR-005; BR-052…055; INV-025).
 * Pure decimal math (ADR-0009, half-up 4dp). Component order:
 * basic → PERCENT_OF_BASIC → PERCENT_OF_GROSS → FIXED.
 * EOS accrual is tenant-policy driven — NO jurisdiction rates are shipped
 * (BR-055: no fabricated rates).
 */
import { Decimal } from "@erp/domain-core";

export type ComponentKind = "EARNING" | "DEDUCTION" | "EMPLOYER" | "EOS_BASE";
export type ComponentCalc = "FIXED" | "PERCENT_OF_BASIC" | "PERCENT_OF_GROSS";

export interface Component {
  code: string;
  kind: ComponentKind;
  calc: ComponentCalc;
  amount?: string; // FIXED
  percent?: string; // PERCENT_*
  glAccountId: string;
  isEosBase: boolean;
  seq: number;
}

export class PayrollRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PayrollRuleError";
  }
}

function r4(x: Decimal): Decimal {
  return x.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/** Compute one employee's run line from the structure snapshot. */
export function computeRunLine(input: {
  basicSalary: string;
  components: Component[]; // already in seq order
  loanInstallment?: string; // BR-054 capped below
  loanCapPercent?: string; // default 25% of net (BR-054)
  eosPolicy?: { enabled: boolean; rateOfEosBase?: string }; // tenant policy; rate optional — never fabricated
}): {
  gross: string;
  deductions: string;
  net: string;
  employer: string;
  eosAccrual: string;
  loanDeduction: string;
  warnings: string[];
  snapshot: Array<{ code: string; amount: string }>;
} {
  const basic = new Decimal(input.basicSalary);
  const warnings: string[] = [];
  const snapshot: Array<{ code: string; amount: string }> = [];
  let gross = basic;
  let deductions = new Decimal(0);
  let employer = new Decimal(0);
  let eosAccrual = new Decimal(0);

  const ordered = [...input.components].sort((a, b) => a.seq - b.seq);
  // order: basic first (already in gross), then PERCENT_OF_BASIC, PERCENT_OF_GROSS, FIXED
  const rank = (c: Component) => (c.calc === "PERCENT_OF_BASIC" ? 1 : c.calc === "PERCENT_OF_GROSS" ? 2 : 3);
  ordered.sort((a, b) => rank(a) - rank(b) || a.seq - b.seq);

  let eosBase = new Decimal(0);
  for (const c of ordered) {
    let amt: Decimal;
    if (c.calc === "FIXED") amt = r4(new Decimal(c.amount ?? "0"));
    else if (c.calc === "PERCENT_OF_BASIC") amt = r4(basic.mul(new Decimal(c.percent ?? "0")));
    else amt = r4(gross.mul(new Decimal(c.percent ?? "0")));
    if (c.isEosBase || c.kind === "EOS_BASE") eosBase = eosBase.add(amt); // EOS base feeds the accrual basis, not gross
    if (c.kind === "EARNING") gross = gross.add(amt);
    else if (c.kind === "DEDUCTION") deductions = deductions.add(amt);
    else if (c.kind === "EMPLOYER") employer = employer.add(amt);
    snapshot.push({ code: c.code, amount: amt.toFixed(4) });
  }

  // BR-054: loan installment capped at cap% of net (default 25%), net-floor protected.
  let loanDeduction = new Decimal(0);
  if (input.loanInstallment && new Decimal(input.loanInstallment).gt(0)) {
    const capPct = new Decimal(input.loanCapPercent ?? "0.25");
    const proposed = new Decimal(input.loanInstallment);
    // net before loan:
    const netBeforeLoan = gross.minus(deductions);
    const cap = r4(netBeforeLoan.mul(capPct));
    if (proposed.gt(cap)) {
      loanDeduction = cap;
      warnings.push(`BR-054: loan installment ${proposed.toFixed(4)} clamped to cap ${cap.toFixed(4)} (${capPct.mul(100).toFixed(0)}% of net)`);
    } else {
      loanDeduction = r4(proposed);
    }
    deductions = deductions.add(loanDeduction);
  }

  // BR-055: EOS accrual per tenant policy; disabled or missing rate → skip + warn.
  if (input.eosPolicy?.enabled) {
    if (input.eosPolicy.rateOfEosBase !== undefined) {
      eosAccrual = r4(eosBase.mul(new Decimal(input.eosPolicy.rateOfEosBase)));
    } else {
      warnings.push("BR-055: EOS enabled without a tenant rate — accrual skipped (no fabricated rates)");
    }
  }

  const net = r4(gross.minus(deductions));
  if (net.lt(0)) throw new PayrollRuleError("NET_FLOOR_VIOLATION", "net pay would be negative (BR-054 net-floor)");
  return {
    gross: gross.toFixed(4),
    deductions: deductions.toFixed(4),
    net: net.toFixed(4),
    employer: employer.toFixed(4),
    eosAccrual: eosAccrual.toFixed(4),
    loanDeduction: loanDeduction.toFixed(4),
    warnings,
    snapshot,
  };
}

/** INV-025: run totals = Σ lines exactly; net = gross − deductions. */
export function assertInv025(lines: Array<{ gross: string; deductions: string; net: string }>, totals: { gross: string; deductions: string; net: string }): void {
  const sum = (k: "gross" | "deductions" | "net") => lines.reduce((s, l) => s.add(new Decimal(l[k])), new Decimal(0)).toFixed(4);
  if (sum("gross") !== new Decimal(totals.gross).toFixed(4) || sum("deductions") !== new Decimal(totals.deductions).toFixed(4) || sum("net") !== new Decimal(totals.net).toFixed(4)) {
    throw new PayrollRuleError("INV025_VIOLATION", "run totals must equal Σ lines (INV-025)");
  }
  for (const l of lines) {
    if (!new Decimal(l.gross).minus(l.deductions).eq(new Decimal(l.net))) {
      throw new PayrollRuleError("INV025_VIOLATION", "line net ≠ gross − deductions (INV-025)");
    }
  }
}
