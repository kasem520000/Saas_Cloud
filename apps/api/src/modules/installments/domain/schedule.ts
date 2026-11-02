/**
 * PHASE-027 T8 — installment schedule builder (BR-048): plan total must equal
 * the source document total; the schedule is immutable after activation.
 * Frequencies WEEKLY/BIWEEKLY/MONTHLY/QUARTERLY; half-up 4dp per-period
 * amounts with the FINAL line absorbing the residual so Σ = total exactly.
 */
import { Decimal } from "@erp/domain-core";

export type Frequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY";

export interface ScheduleLine {
  seq: number;
  dueDate: string; // ISO yyyy-mm-dd
  amount: string; // 4dp canonical
}

const FREQ_MONTHS: Record<Frequency, number> = { WEEKLY: 1 / 4, BIWEEKLY: 0.5, MONTHLY: 1, QUARTERLY: 3 };

function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  const whole = Math.floor(months);
  const frac = months - whole;
  dt.setUTCMonth(dt.getUTCMonth() + whole);
  if (frac > 0) dt.setUTCDate(dt.getUTCDate() + Math.round(frac * 30));
  return dt.toISOString().slice(0, 10);
}

export class InstallmentRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "InstallmentRuleError";
  }
}

/** BR-048: activation requires plan total == source total (and down < total). */
export function assertPlanTotalEqualsSource(planTotal: string, sourceTotal: string, downPayment: string): void {
  if (!new Decimal(planTotal).eq(new Decimal(sourceTotal))) {
    throw new InstallmentRuleError("PLAN_TOTAL_MISMATCH", "plan total must equal the source document total (BR-048)");
  }
  if (new Decimal(downPayment).gte(new Decimal(planTotal))) {
    throw new InstallmentRuleError("INVALID_AMOUNT", "down payment must be < plan total");
  }
}

/** Build the schedule; Σ lines = total exactly (final line absorbs residual). */
export function buildSchedule(input: { total: string; count: number; startDate: string; frequency: Frequency }): ScheduleLine[] {
  if (input.count <= 0) throw new InstallmentRuleError("INVALID_AMOUNT", "count must be > 0");
  const total = new Decimal(input.total);
  const base = total.div(input.count).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const lines: ScheduleLine[] = [];
  let acc = new Decimal(0);
  for (let i = 1; i <= input.count; i++) {
    const amount = i === input.count ? total.minus(acc).toDecimalPlaces(4, Decimal.ROUND_HALF_UP) : base;
    acc = acc.add(amount);
    lines.push({ seq: i, dueDate: addMonths(input.startDate, FREQ_MONTHS[input.frequency] * (i - 1)), amount: amount.toFixed(4) });
  }
  return lines;
}

/** BR-049: flat late fee = min(rate × overdueAmount, cap); flat only — no interest path exists. */
export function computeFlatLateFee(overdueAmount: string, policy: { rate: string; cap?: string }): string {
  const fee = new Decimal(overdueAmount).mul(new Decimal(policy.rate)).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  if (policy.cap !== undefined && fee.gt(new Decimal(policy.cap))) {
    return new Decimal(policy.cap).toFixed(4);
  }
  return fee.toFixed(4);
}

/** OVERDUE derivation (T9): due_date past + grace elapsed + unpaid. Job-derived only. */
export function isOverdue(dueDate: string, status: string, asOf: string, graceDays: number): boolean {
  if (status === "PAID" || status === "WAIVED") return false;
  const due = new Date(dueDate + "T00:00:00Z").getTime() + graceDays * 86_400_000;
  return new Date(asOf + "T00:00:00Z").getTime() > due;
}
