import { Money, Quantity } from "@erp/domain-core";

/**
 * PHASE-017 T12 — commission accrual computation (pure). Rules are per-rep
 * (percentage on COLLECTED or INVOICED basis). The accrual posts ONLY at run
 * time (DR commission expense · CR commission accrual) and never modifies the
 * invoice or its VAT. The base excludes reversed/credited sales.
 */

export interface CommissionRuleInput {
  repId: string;
  basis: "COLLECTED" | "INVOICED";
  ratePct: string;
}

export interface CommissionBaseLine {
  repId: string;
  amount: string;
  reversed: boolean;
}

export function accrualFor(rule: CommissionRuleInput, lines: readonly CommissionBaseLine[], currency: Parameters<typeof Money.fromString>[1]): Money {
  const rate = Quantity.fromString(rule.ratePct).toDecimal().div(100);
  const base = lines
    .filter((l) => l.repId === rule.repId && !l.reversed)
    .reduce((acc, l) => acc.add(Money.fromString(l.amount, currency)), Money.fromString("0", currency));
  return base.multiplyQuantity(Quantity.fromString(rate.toDecimalPlaces(10).toFixed()));
}

/** Run idempotency: a run key is (tenant, period) — re-running must not double-accrue. */
export function runKey(periodFrom: string, periodTo: string): string {
  return `${periodFrom}..${periodTo}`;
}
