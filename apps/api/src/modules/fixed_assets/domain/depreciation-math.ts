/**
 * PHASE-026 T6 — pure depreciation math (DR-002; ADR-0009 exact decimal,
 * half-up to 4dp storage scale). No infrastructure: pure functions over
 * canonical decimal strings so goldens and property tests (INV-023) run
 * without a database.
 */
import { Decimal } from "@erp/domain-core";

export type DepreciationMethod = "STRAIGHT_LINE" | "DECLINING_BALANCE" | "UNITS_OF_PRODUCTION";

export interface DepreciationInput {
  cost: string; // canonical decimal string, > 0
  salvageValue: string; // >= 0, < cost
  usefulLifeMonths: number; // > 0
  method: DepreciationMethod;
  /** DECLINING_BALANCE: annual rate applied per month (DR-002 default 2x SL rate). */
  decliningRatePerMonth?: string;
  /** UNITS_OF_PRODUCTION. */
  periodUnits?: string;
  totalEstimatedUnits?: string;
  /** Opening NBV for the period (after prior depreciation / revaluation). */
  openingNbv: string;
  /** Accumulated depreciation to date (before this period). */
  accumulatedToDate: string;
  /** Months elapsed including this period (for final-period residual). */
  monthsElapsed: number;
}

const SCALE = 4;

function d(s: string): Decimal {
  return new Decimal(s);
}

function roundHalfUp(x: Decimal): Decimal {
  return x.toDecimalPlaces(SCALE, Decimal.ROUND_HALF_UP);
}

/**
 * Compute one period's depreciation with the salvage floor and the
 * final-period residual absorption (Σ over life = cost − salvage exactly).
 * INV-023: result is always in [0, remainingBase]; accumulated never exceeds
 * cost − salvage; NBV never goes below salvage.
 */
export function computePeriodDepreciation(input: DepreciationInput): {
  periodAmount: string;
  accumulatedAfter: string;
  nbvAfter: string;
  fullyDepreciated: boolean;
} {
  const cost = d(input.cost);
  const salvage = d(input.salvageValue);
  const base = cost.minus(salvage); // depreciable base
  const accumulated = d(input.accumulatedToDate);
  const remaining = base.minus(accumulated);
  if (remaining.lte(0)) {
    return {
      periodAmount: "0.0000",
      accumulatedAfter: roundHalfUp(accumulated).toFixed(SCALE),
      nbvAfter: roundHalfUp(cost.minus(accumulated)).toFixed(SCALE),
      fullyDepreciated: true,
    };
  }

  let raw: Decimal;
  if (input.method === "STRAIGHT_LINE") {
    raw = base.div(input.usefulLifeMonths);
  } else if (input.method === "DECLINING_BALANCE") {
    const rate = d(input.decliningRatePerMonth ?? defaultDecliningRate(input.usefulLifeMonths));
    raw = d(input.openingNbv).mul(rate);
  } else {
    const totalUnits = d(input.totalEstimatedUnits ?? "0");
    const periodUnits = d(input.periodUnits ?? "0");
    if (totalUnits.lte(0)) throw new Error("UNITS_OF_PRODUCTION requires totalEstimatedUnits > 0");
    raw = base.mul(periodUnits).div(totalUnits);
  }

  // Salvage floor: never depreciate below the remaining base.
  let amount = roundHalfUp(raw);
  if (amount.gt(remaining)) amount = roundHalfUp(remaining);
  if (amount.lt(0)) amount = new Decimal(0);

  // Final-period residual: absorb so Σ over life = base exactly.
  const isFinalPeriod = input.monthsElapsed >= input.usefulLifeMonths;
  if (isFinalPeriod) amount = roundHalfUp(remaining);

  const accumulatedAfter = roundHalfUp(accumulated.add(amount));
  const nbvAfter = roundHalfUp(cost.minus(accumulatedAfter));
  return {
    periodAmount: amount.toFixed(SCALE),
    accumulatedAfter: accumulatedAfter.toFixed(SCALE),
    nbvAfter: nbvAfter.toFixed(SCALE),
    fullyDepreciated: nbvAfter.lte(salvage) || accumulatedAfter.gte(base),
  };
}

/** DR-002 default: declining-balance rate = 2 × straight-line monthly rate. */
export function defaultDecliningRate(usefulLifeMonths: number): string {
  return roundHalfUp(new Decimal(2).div(usefulLifeMonths)).toFixed(SCALE);
}

/** NBV = cost − accumulated (INV-023 read model). */
export function nbv(cost: string, accumulated: string): string {
  return roundHalfUp(d(cost).minus(d(accumulated))).toFixed(SCALE);
}

/** Disposal gain/loss (G-23): proceeds − NBV; loss mirror when negative (BR-043). */
export function disposalGainLoss(proceeds: string, netBookValue: string): string {
  return roundHalfUp(d(proceeds).minus(d(netBookValue))).toFixed(SCALE);
}
