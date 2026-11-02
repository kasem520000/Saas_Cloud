import { Quantity } from "@erp/domain-core";

/**
 * PHASE-017 T11 — free-goods rule math (pure). Buy-X-get-Y: for every `buyQty`
 * units purchased, `getQty` units are free (FOC). FOC lines are zero-price
 * lines with a reason code (BR-008): they still issue stock and post COGS;
 * the revenue side is zero.
 */

export interface FreeGoodsRule {
  itemId: string;
  buyQty: string;
  getQty: string;
  /** Optional per-tier / promo-quantity cap on free units per document. */
  maxFreePerDocument?: string | null;
}

export class FreeGoodsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FreeGoodsError";
  }
}

/** Free units granted for a purchased quantity (floor division, capped). */
export function freeUnitsFor(rule: FreeGoodsRule, purchasedQty: string): string {
  const buy = Quantity.fromString(rule.buyQty).toDecimal();
  const get = Quantity.fromString(rule.getQty).toDecimal();
  const purchased = Quantity.fromString(purchasedQty).toDecimal();
  if (buy.lte(0) || get.lte(0)) {
    throw new FreeGoodsError("free-goods rule quantities must be positive");
  }
  if (purchased.lt(0)) {
    throw new FreeGoodsError("purchased quantity cannot be negative");
  }
  let free = purchased.div(buy).floor().times(get);
  if (rule.maxFreePerDocument !== null && rule.maxFreePerDocument !== undefined) {
    const cap = Quantity.fromString(rule.maxFreePerDocument).toDecimal();
    if (free.gt(cap)) {
      free = cap;
    }
  }
  return free.toDecimalPlaces(6).toFixed(6);
}
