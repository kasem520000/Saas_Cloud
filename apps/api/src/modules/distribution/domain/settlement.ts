import { Money } from "@erp/domain-core";

/**
 * PHASE-017 T10 — rep settlement math (pure). Expected cash per workflow (c):
 *   opening + cash sales + collections − cash refunds − approved expenses.
 * The variance ALWAYS posts (BR-021 family): shortage → DR cash-shortage
 * expense · CR rep cash; surplus → the inverse. Never netted silently.
 */

export interface RepDayTotals {
  openingCash: string;
  cashSales: string;
  collections: string;
  cashRefunds: string;
  approvedExpenses: string;
  currency: Parameters<typeof Money.fromString>[1];
}

export function expectedCash(t: RepDayTotals): Money {
  const cur = t.currency;
  return Money.fromString(t.openingCash, cur)
    .add(Money.fromString(t.cashSales, cur))
    .add(Money.fromString(t.collections, cur))
    .subtract(Money.fromString(t.cashRefunds, cur))
    .subtract(Money.fromString(t.approvedExpenses, cur));
}

export type VarianceKind = "SHORTAGE" | "OVERAGE" | "NONE";

export function variance(expected: Money, counted: Money): { kind: VarianceKind; amount: Money } {
  const cur = expected.currency;
  const diff = counted.subtract(expected);
  const zero = Money.fromString("0", cur);
  if (diff.toMinorUnits() === 0n) {
    return { kind: "NONE", amount: zero };
  }
  // shortage: counted < expected ⇒ positive amount owed to the till
  return diff.toMinorUnits() < 0n
    ? { kind: "SHORTAGE", amount: expected.subtract(counted) }
    : { kind: "OVERAGE", amount: diff };
}

/** Beyond-tolerance variance requires supervisor approval (BR-021). */
export function requiresApproval(varianceAmount: Money, tolerance: string): boolean {
  return varianceAmount.toMinorUnits() > Money.fromString(tolerance, varianceAmount.currency).toMinorUnits();
}
