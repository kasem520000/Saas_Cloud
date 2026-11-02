import { describe, expect, it } from "vitest";
import {
  buildG21Cash,
  buildG21Credit,
  buildG21Opening,
  buildG22Run,
  buildG23Disposal,
  buildRevaluation,
  isBalanced,
  type CategoryAccounts,
} from "../application/journal-builders";
import {
  assertCategoryUsable,
  assertDisposable,
  assertRevaluable,
  assertRunPostable,
  assertSeparationOfDuties,
  assertValidCostSalage,
  FixedAssetsRuleError,
} from "../domain/fixed-assets-rules";
import { disposalGainLoss } from "../domain/depreciation-math";

const ACCTS: CategoryAccounts = {
  assetPurpose: "FIXED_ASSET",
  accumPurpose: "ACCUM_DEPRECIATION",
  expensePurpose: "DEPRECIATION_EXPENSE",
};

describe("G-21 capitalization goldens", () => {
  it("credit: DR FIXED_ASSET 12,000 · CR AP_CONTROL 12,000 with partner line (INV-009)", () => {
    const spec = buildG21Credit({
      docId: "cap-1", entryDate: "2026-11-01", currency: "YER", amount: "12000.0000",
      partnerId: "p-1", accounts: ACCTS,
    });
    expect(isBalanced(spec)).toBe(true);
    expect(spec.lines).toEqual([
      { purpose: "FIXED_ASSET", direction: "DEBIT", amount: "12000.0000" },
      { purpose: "AP_CONTROL", direction: "CREDIT", amount: "12000.0000", partnerId: "p-1" },
    ]);
  });

  it("cash variant: DR FIXED_ASSET · CR CASH", () => {
    const spec = buildG21Cash({
      docId: "cap-2", entryDate: "2026-11-01", currency: "YER", amount: "5000", accounts: ACCTS,
    });
    expect(isBalanced(spec)).toBe(true);
    expect(spec.lines[1]).toEqual({ purpose: "CASH", direction: "CREDIT", amount: "5000" });
  });

  it("opening variant: accumulated-to-date via OPENING_EQUITY/ACCUM_DEPRECIATION (INV-023 from day one)", () => {
    const spec = buildG21Opening({
      docId: "cap-3", entryDate: "2026-01-01", currency: "YER",
      cost: "12000", accumulatedToDate: "2400", accounts: ACCTS,
    });
    expect(isBalanced(spec)).toBe(true);
    expect(spec.lines).toHaveLength(4);
    expect(spec.lines[2]).toEqual({ purpose: "OPENING_EQUITY", direction: "DEBIT", amount: "2400" });
    expect(spec.lines[3]).toEqual({ purpose: "ACCUM_DEPRECIATION", direction: "CREDIT", amount: "2400" });
  });
});

describe("G-22 depreciation run golden", () => {
  it("one journal per run: 12,000/0/60-month asset => DR EXPENSE 200 · CR ACCUM 200; multi-category stays one journal", () => {
    const spec = buildG22Run({
      runId: "run-1", entryDate: "2026-11-30", currency: "YER",
      categoryTotals: [
        { accounts: ACCTS, amount: "200.0000" },
        { accounts: { assetPurpose: "FA2", accumPurpose: "ACC2", expensePurpose: "EXP2" }, amount: "50.0000" },
      ],
    });
    expect(isBalanced(spec)).toBe(true);
    expect(spec.lines).toHaveLength(4);
    expect(spec.source).toEqual({ docType: "depreciation_run", docId: "run-1", operation: "post" });
  });
});

describe("G-23 disposal goldens", () => {
  it("sale above NBV: DR CASH · DR ACCUM · CR FIXED_ASSET · CR ASSET_DISPOSAL_GAIN", () => {
    const gl = disposalGainLoss("5000", "3200"); // +1800
    const spec = buildG23Disposal({
      docId: "disp-1", entryDate: "2026-11-02", currency: "YER",
      proceeds: "5000", accumulated: "8800", cost: "12000", gainLoss: gl, accounts: ACCTS,
    });
    expect(isBalanced(spec)).toBe(true);
    expect(spec.lines).toContainEqual({ purpose: "ASSET_DISPOSAL_GAIN", direction: "CREDIT", amount: "1800.0000" });
  });

  it("loss mirror is mandatory: DR ASSET_DISPOSAL_LOSS", () => {
    const gl = disposalGainLoss("1000", "3200"); // −2200
    const spec = buildG23Disposal({
      docId: "disp-2", entryDate: "2026-11-02", currency: "YER",
      proceeds: "1000", accumulated: "8800", cost: "12000", gainLoss: gl, accounts: ACCTS,
    });
    expect(isBalanced(spec)).toBe(true);
    expect(spec.lines).toContainEqual({ purpose: "ASSET_DISPOSAL_LOSS", direction: "DEBIT", amount: "2200.0000" });
  });

  it("SCRAP with explicit 0 proceeds: no CASH line, loss mirror posts", () => {
    const gl = disposalGainLoss("0", "500");
    const spec = buildG23Disposal({
      docId: "disp-3", entryDate: "2026-11-02", currency: "YER",
      proceeds: "0", accumulated: "11500", cost: "12000", gainLoss: gl, accounts: ACCTS,
    });
    expect(isBalanced(spec)).toBe(true);
    expect(spec.lines.some((l) => l.purpose === "CASH")).toBe(false);
    expect(spec.lines).toContainEqual({ purpose: "ASSET_DISPOSAL_LOSS", direction: "DEBIT", amount: "500.0000" });
  });
});

describe("BR-044 revaluation golden (both mirrors)", () => {
  it("up-revaluation: DR FIXED_ASSET · CR REVALUATION_RESERVE (balanced)", () => {
    const spec = buildRevaluation({
      docId: "rev-1", entryDate: "2026-11-02", currency: "YER",
      grossDelta: "2000", accumDelta: "0", reserveDelta: "-2000", accounts: ACCTS,
    });
    expect(isBalanced(spec)).toBe(true);
    expect(spec.lines).toContainEqual({ purpose: "REVALUATION_RESERVE", direction: "CREDIT", amount: "2000" });
  });

  it("down-revaluation: CR FIXED_ASSET · DR REVALUATION_RESERVE", () => {
    const spec = buildRevaluation({
      docId: "rev-2", entryDate: "2026-11-02", currency: "YER",
      grossDelta: "-1500", accumDelta: "500", reserveDelta: "1000", accounts: ACCTS,
    });
    expect(isBalanced(spec)).toBe(true);
    expect(spec.lines).toContainEqual({ purpose: "REVALUATION_RESERVE", direction: "DEBIT", amount: "1000" });
    expect(spec.lines).toContainEqual({ purpose: "FIXED_ASSET", direction: "CREDIT", amount: "1500" });
    expect(spec.lines).toContainEqual({ purpose: "ACCUM_DEPRECIATION", direction: "DEBIT", amount: "500" });
  });
});

describe("BR-041…044 rule guards", () => {
  it("BR-041: unmapped category is unusable (PURPOSE_NOT_MAPPED)", () => {
    expect(() => assertCategoryUsable({ assetAccountActive: true, accumAccountActive: false, expenseAccountActive: true }))
      .toThrowError(expect.objectContaining({ code: "PURPOSE_NOT_MAPPED" } as Partial<FixedAssetsRuleError>));
    expect(() => assertCategoryUsable({ assetAccountActive: true, accumAccountActive: true, expenseAccountActive: true })).not.toThrow();
  });

  it("BR-042: LOCKED period rejects run posting (PERIOD_LOCKED)", () => {
    expect(() => assertRunPostable("LOCKED")).toThrowError(expect.objectContaining({ code: "PERIOD_LOCKED" }));
    expect(() => assertRunPostable("OPEN")).not.toThrow();
    expect(() => assertRunPostable("SOFT_CLOSED")).not.toThrow();
  });

  it("BR-043/INV-023: disposal exactly once, only from ACTIVE/FULLY_DEPRECIATED; NBV floor", () => {
    expect(() => assertDisposable({ status: "DISPOSED", salvageValue: "0", netBookValue: "100" }))
      .toThrowError(expect.objectContaining({ code: "ALREADY_DISPOSED" }));
    expect(() => assertDisposable({ status: "ACTIVE", salvageValue: "500", netBookValue: "100" }))
      .toThrowError(expect.objectContaining({ code: "NBV_FLOOR_VIOLATION" }));
    expect(() => assertDisposable({ status: "FULLY_DEPRECIATED", salvageValue: "100", netBookValue: "100" })).not.toThrow();
  });

  it("BR-044: revaluation rejected on DISPOSED asset", () => {
    expect(() => assertRevaluable("DISPOSED")).toThrowError(expect.objectContaining({ code: "ASSET_LOCKED" }));
    expect(() => assertRevaluable("ACTIVE")).not.toThrow();
  });

  it("INVALID_AMOUNT: negative cost, salvage ≥ cost rejected", () => {
    expect(() => assertValidCostSalage("-5", "0")).toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() => assertValidCostSalage("100", "100")).toThrowError(expect.objectContaining({ code: "INVALID_AMOUNT" }));
    expect(() => assertValidCostSalage("100", "99.9999")).not.toThrow();
  });

  it("SoD: creator cannot approve own disposal", () => {
    expect(() => assertSeparationOfDuties("u-1", "u-1")).toThrowError(expect.objectContaining({ code: "SOD_VIOLATION" }));
    expect(() => assertSeparationOfDuties("u-1", "u-2")).not.toThrow();
  });
});
