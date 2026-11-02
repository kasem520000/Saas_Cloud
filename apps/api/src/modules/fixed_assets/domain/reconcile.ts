/**
 * PHASE-026 T10 — RC-10: fixed-asset register ↔ GL tie (RECONCILIATION §1
 * row 10, activated here). Per category account: Σ gross = FIXED_ASSET
 * balance; Σ accumulated = ACCUM_DEPRECIATION balance. Pure + unit-tested;
 * ReconciliationService wires it into the close checklist (PC-04 blocks LOCK
 * on BROKEN).
 */
import { Decimal } from "@erp/domain-core";

export interface Rc10Input {
  registerGross: string; // Σ cost of ACTIVE/FULLY_DEPRECIATED assets in the category
  registerAccumulated: string; // Σ accumulated depreciation
  glFixedAssetBalance: string;
  glAccumBalance: string;
}

export type Rc10Result =
  | { state: "OK" }
  | { state: "BROKEN"; grossDiff: string; accumDiff: string };

export function rc10Check(input: Rc10Input): Rc10Result {
  const grossDiff = new Decimal(input.registerGross).minus(input.glFixedAssetBalance).toFixed(4);
  const accumDiff = new Decimal(input.registerAccumulated).minus(input.glAccumBalance).toFixed(4);
  if (grossDiff === "0.0000" && accumDiff === "0.0000") return { state: "OK" };
  return { state: "BROKEN", grossDiff, accumDiff };
}
