/**
 * PHASE-018 T4 — production costing core (pure, ADR-0009 decimal math).
 *
 * Production cost = consumed materials (actual issue costs) + configured
 * labor rate × actual qty + configured overhead rate × actual qty.
 * No shop-floor time capture (documented limitation) — absorption rates are
 * simple configured amounts per output unit.
 */
import { Decimal } from "@erp/domain-core";

export interface ConsumptionCostInput {
  qty: string;
  unitCost: string;
}

export interface ProductionCostInput {
  consumptions: ConsumptionCostInput[];
  actualQty: string;
  laborRatePerUnit: string;
  overheadRatePerUnit: string;
}

export interface ProductionCostResult {
  materialsCost: string;
  laborCost: string;
  overheadCost: string;
  totalCost: string;
  unitCost: string;
}

const MONEY_DP = 4;

function money(value: Decimal): string {
  return value.toDecimalPlaces(MONEY_DP, Decimal.ROUND_HALF_UP).toFixed(MONEY_DP);
}

export function computeProductionCost(input: ProductionCostInput): ProductionCostResult {
  const materials = input.consumptions.reduce(
    (acc, c) => acc.plus(new Decimal(c.qty).mul(new Decimal(c.unitCost))),
    new Decimal(0),
  );
  const qty = new Decimal(input.actualQty);
  if (qty.lte(0)) throw new Error("actualQty must be > 0 at completion");
  const labor = new Decimal(input.laborRatePerUnit).mul(qty);
  const overhead = new Decimal(input.overheadRatePerUnit).mul(qty);
  const total = materials.plus(labor).plus(overhead);
  return {
    materialsCost: money(materials),
    laborCost: money(labor),
    overheadCost: money(overhead),
    totalCost: money(total),
    unitCost: money(total.div(qty)),
  };
}

/** WIP zero-netting check (INV-010): WIP balance per order must be exactly 0. */
export function wipNetsToZero(wipBalance: string): boolean {
  return new Decimal(wipBalance).eq(0);
}
