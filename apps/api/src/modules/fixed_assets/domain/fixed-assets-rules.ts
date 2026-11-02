/**
 * PHASE-026 — BR-041…044 rule guards (pure, unit-testable; BUSINESS_RULES §8).
 */
import { Decimal } from "@erp/domain-core";

export class FixedAssetsRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "FixedAssetsRuleError";
  }
}

/** BR-041: a category is unusable until all three purposes resolve to active accounts. */
export function assertCategoryUsable(category: {
  assetAccountActive: boolean;
  accumAccountActive: boolean;
  expenseAccountActive: boolean;
}): void {
  if (!(category.assetAccountActive && category.accumAccountActive && category.expenseAccountActive)) {
    throw new FixedAssetsRuleError(
      "PURPOSE_NOT_MAPPED",
      "Category unusable: FIXED_ASSET / ACCUM_DEPRECIATION / DEPRECIATION_EXPENSE must all resolve to active accounts (BR-041)",
    );
  }
}

/** BR-042: depreciation posts only via runs in a non-LOCKED period (INV-011). */
export function assertRunPostable(periodStatus: "OPEN" | "SOFT_CLOSED" | "LOCKED"): void {
  if (periodStatus === "LOCKED") {
    throw new FixedAssetsRuleError("PERIOD_LOCKED", "Depreciation run rejected: fiscal period is LOCKED (BR-042, INV-011)");
  }
}

export type AssetStatus = "ACTIVE" | "FULLY_DEPRECIATED" | "DISPOSED" | "WRITTEN_OFF";

/** BR-043 / INV-023: disposal exactly once, only from ACTIVE/FULLY_DEPRECIATED; locks the asset. */
export function assertDisposable(asset: { status: AssetStatus; salvageValue: string; netBookValue: string }): void {
  if (asset.status === "DISPOSED" || asset.status === "WRITTEN_OFF") {
    throw new FixedAssetsRuleError("ALREADY_DISPOSED", "Asset already disposed/written off — disposal is exactly-once (INV-023)");
  }
  // NBV floor: disposal may not push NBV below salvage.
  if (new Decimal(asset.netBookValue).lt(new Decimal(asset.salvageValue))) {
    throw new FixedAssetsRuleError("NBV_FLOOR_VIOLATION", "NBV below salvage floor (BR-043)");
  }
}

/** BR-044: revaluation audited; rejected on DISPOSED/WRITTEN_OFF assets. */
export function assertRevaluable(assetStatus: AssetStatus): void {
  if (assetStatus === "DISPOSED" || assetStatus === "WRITTEN_OFF") {
    throw new FixedAssetsRuleError("ASSET_LOCKED", "Revaluation rejected on disposed/written-off asset (BR-044)");
  }
}

/** Validation: cost > 0 and salvage in [0, cost) (INVALID_AMOUNT failure pack). */
export function assertValidCostSalage(cost: string, salvage: string): void {
  const c = new Decimal(cost);
  const s = new Decimal(salvage);
  if (c.lte(0)) throw new FixedAssetsRuleError("INVALID_AMOUNT", "cost must be > 0");
  if (s.lt(0) || s.gte(c)) throw new FixedAssetsRuleError("INVALID_AMOUNT", "salvage must be in [0, cost)");
}

/** SoD (AUTHORIZATION_MATRIX §4): creator cannot approve/post own disposal. */
export function assertSeparationOfDuties(creatorId: string, approverId: string): void {
  if (creatorId === approverId) {
    throw new FixedAssetsRuleError("SOD_VIOLATION", "Disposal requires a second user (creator ≠ approver)");
  }
}
