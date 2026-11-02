/**
 * PHASE-019 T4/T6 — contract billing schedule expansion (pure, ADR-0009).
 *
 * Monthly retainer: one schedule entry per calendar month the contract
 * touches, with the amount prorated for partial first/last months
 * (actual days / days in month). Idempotency key per (contract, period) so a
 * billing run never duplicates (INV-013 discipline).
 */
import { Decimal } from "@erp/domain-core";

export interface ScheduleEntry {
  /** (contractId, yyyy-mm) — the idempotency key. */
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
}

function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

function iso(y: number, m1: number, d: number): string {
  return `${y}-${String(m1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Expand a monthly retainer of `monthlyAmount` over [startDate, endDate]
 * (inclusive). Partial months prorate by days.
 */
export function expandMonthlyRetainer(
  contractId: string,
  startDate: string,
  endDate: string,
  monthlyAmount: string,
): ScheduleEntry[] {
  const sp = startDate.split("-").map(Number);
  const ep = endDate.split("-").map(Number);
  const sy = sp[0] as number;
  const sm = sp[1] as number;
  const sd = sp[2] as number;
  const ey = ep[0] as number;
  const em = ep[1] as number;
  const ed = ep[2] as number;
  const amount = new Decimal(monthlyAmount);
  if (amount.lte(0)) throw new Error("monthlyAmount must be > 0");
  if (startDate > endDate) return [];
  const entries: ScheduleEntry[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const dim = daysInMonth(y, m);
    const from = y === sy && m === sm ? sd : 1;
    const to = y === ey && m === em ? ed : dim;
    const covered = to - from + 1;
    const part = amount.mul(covered).div(dim).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    entries.push({
      periodKey: `${contractId}:${y}-${String(m).padStart(2, "0")}`,
      periodStart: iso(y, m, from),
      periodEnd: iso(y, m, to),
      amount: part.toFixed(4),
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return entries;
}

/** Idempotency: same inputs → byte-identical schedule (property). */
export function scheduleIsDeterministic(
  contractId: string,
  startDate: string,
  endDate: string,
  monthlyAmount: string,
): boolean {
  return (
    JSON.stringify(expandMonthlyRetainer(contractId, startDate, endDate, monthlyAmount)) ===
    JSON.stringify(expandMonthlyRetainer(contractId, startDate, endDate, monthlyAmount))
  );
}
