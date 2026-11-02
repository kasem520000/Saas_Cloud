/**
 * PHASE-018 T1 — BOM domain core (pure, infrastructure-free).
 *
 * Explosion math per PHASE-018 §2.1: gross requirement for a component =
 * planned output ÷ yield × qty_per_output × (1 + scrap_factor_pct/100),
 * composed exactly on decimal primitives (ADR-0009 — Decimal strings, 6-dp
 * quantity rounding, ROUND_CEILING so a production order never under-buys).
 */
import { Decimal } from "@erp/domain-core";

export interface BomLineInput {
  componentItemId: string;
  qtyPerOutput: string;
  scrapFactorPct: string;
}

export interface BomExplosionRow {
  componentItemId: string;
  /** Gross required quantity for the requested output (6-dp ceiling). */
  grossQty: string;
  /** Net BOM quantity (before scrap) for reporting. */
  netQty: string;
}

const QTY_DP = 6;

function ceilQty(value: Decimal): string {
  return value.toDecimalPlaces(QTY_DP, Decimal.ROUND_CEIL).toFixed(QTY_DP);
}

/**
 * Explode one BOM version for a planned output quantity.
 * `yieldQty` is the expected output per one BOM execution (default 1).
 */
export function explodeBom(lines: BomLineInput[], plannedOutput: string, yieldQty = "1"): BomExplosionRow[] {
  const planned = new Decimal(plannedOutput);
  if (planned.lte(0)) throw new Error("plannedOutput must be > 0");
  const y = new Decimal(yieldQty);
  if (y.lte(0)) throw new Error("yieldQty must be > 0");
  const executions = planned.div(y);
  return lines.map((line) => {
    const qtyPer = new Decimal(line.qtyPerOutput);
    if (qtyPer.lte(0)) throw new Error("qtyPerOutput must be > 0");
    const scrap = new Decimal(line.scrapFactorPct);
    if (scrap.lt(0) || scrap.gte(100)) throw new Error("scrapFactorPct must be in [0,100)");
    const net = qtyPer.mul(executions);
    const gross = net.mul(new Decimal(1).plus(scrap.div(100)));
    return {
      componentItemId: line.componentItemId,
      grossQty: ceilQty(gross),
      netQty: ceilQty(net),
    };
  });
}

/** Determinism check used by property tests: same inputs → same outputs. */
export function explosionIsDeterministic(
  lines: BomLineInput[],
  plannedOutput: string,
  yieldQty?: string,
): boolean {
  return JSON.stringify(explodeBom(lines, plannedOutput, yieldQty)) ===
    JSON.stringify(explodeBom(lines, plannedOutput, yieldQty));
}
