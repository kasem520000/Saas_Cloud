import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Decimal } from "@erp/domain-core";
import {
  type DepreciationMethod,
  computePeriodDepreciation,
  defaultDecliningRate,
  disposalGainLoss,
  nbv,
} from "../depreciation-math";

describe("PHASE-026 depreciation math — goldens", () => {
  it("G-22 fixture: 12,000 cost / 0 salvage / 60 months SL => 200.00 per month", () => {
    const r = computePeriodDepreciation({
      cost: "12000",
      salvageValue: "0",
      usefulLifeMonths: 60,
      method: "STRAIGHT_LINE",
      openingNbv: "12000",
      accumulatedToDate: "0",
      monthsElapsed: 1,
    });
    expect(r.periodAmount).toBe("200.0000");
    expect(r.accumulatedAfter).toBe("200.0000");
    expect(r.nbvAfter).toBe("11800.0000");
    expect(r.fullyDepreciated).toBe(false);
  });

  it("final period absorbs the residual so Σ over life = cost − salvage exactly", () => {
    // 10,000 / 0 / 3 months => 3333.3333 + 3333.3333 + 3333.3334 = 10000
    let acc = "0";
    let nbvIn = "10000";
    const amounts: string[] = [];
    for (let m = 1; m <= 3; m++) {
      const r = computePeriodDepreciation({
        cost: "10000",
        salvageValue: "0",
        usefulLifeMonths: 3,
        method: "STRAIGHT_LINE",
        openingNbv: nbvIn,
        accumulatedToDate: acc,
        monthsElapsed: m,
      });
      amounts.push(r.periodAmount);
      acc = r.accumulatedAfter;
      nbvIn = r.nbvAfter;
    }
    expect(amounts).toEqual(["3333.3333", "3333.3333", "3333.3334"]);
    expect(acc).toBe("10000.0000");
    expect(nbvIn).toBe("0.0000");
  });

  it("salvage floor: accumulated never exceeds cost − salvage (INV-023)", () => {
    const r = computePeriodDepreciation({
      cost: "1000",
      salvageValue: "100",
      usefulLifeMonths: 2,
      method: "STRAIGHT_LINE",
      openingNbv: "550",
      accumulatedToDate: "440",
      monthsElapsed: 2, // final period would raw-compute 450 but base remaining = 460-440=... floor applies
    });
    // base = 900, remaining = 900-440 = 460; final period absorbs exactly 460
    expect(r.periodAmount).toBe("460.0000");
    expect(r.accumulatedAfter).toBe("900.0000");
    expect(r.nbvAfter).toBe("100.0000"); // NBV == salvage, never below
    expect(r.fullyDepreciated).toBe(true);
  });

  it("DECLINING_BALANCE uses opening NBV × monthly rate, floored at remaining base", () => {
    // rate default = 2/60; opening NBV 12000 => 400.00
    expect(defaultDecliningRate(60)).toBe("0.0333");
    const r = computePeriodDepreciation({
      cost: "12000",
      salvageValue: "0",
      usefulLifeMonths: 60,
      method: "DECLINING_BALANCE",
      openingNbv: "12000",
      accumulatedToDate: "0",
      monthsElapsed: 1,
    });
    expect(r.periodAmount).toBe("399.6000"); // 12000 × 0.0333
  });

  it("UNITS_OF_PRODUCTION: (cost − salvage) × periodUnits / totalUnits", () => {
    const r = computePeriodDepreciation({
      cost: "10000",
      salvageValue: "1000",
      usefulLifeMonths: 120,
      method: "UNITS_OF_PRODUCTION",
      periodUnits: "500",
      totalEstimatedUnits: "10000",
      openingNbv: "10000",
      accumulatedToDate: "0",
      monthsElapsed: 1,
    });
    expect(r.periodAmount).toBe("450.0000"); // 9000 × 500/10000
  });

  it("disposal gain/loss mirror (G-23): proceeds − NBV", () => {
    expect(disposalGainLoss("5000", "3200")).toBe("1800.0000"); // gain
    expect(disposalGainLoss("1000", "3200")).toBe("-2200.0000"); // loss mirror
    expect(nbv("12000", "11800")).toBe("200.0000");
  });
});

describe("PHASE-026 INV-023 property suite", () => {
  const arb = fc.record({
    cost: fc.double({ min: 1, max: 1e7, noNaN: true }).map((x) => new Decimal(x).toFixed(4)),
    salvageFrac: fc.double({ min: 0, max: 0.9, noNaN: true }),
    months: fc.integer({ min: 1, max: 600 }),
    method: fc.constantFrom<DepreciationMethod>("STRAIGHT_LINE", "DECLINING_BALANCE", "UNITS_OF_PRODUCTION"),
  });

  it("across a method mix, Σ depreciation ≤ cost − salvage and NBV ≥ salvage at every boundary", () => {
    fc.assert(
      fc.property(arb, (a) => {
        const salvage = new Decimal(a.cost).mul(a.salvageFrac).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
        let acc = new Decimal(0);
        let opening = new Decimal(a.cost);
        for (let m = 1; m <= a.months; m++) {
          const r = computePeriodDepreciation({
            cost: a.cost,
            salvageValue: salvage.toFixed(4),
            usefulLifeMonths: a.months,
            method: a.method,
            periodUnits: a.method === "UNITS_OF_PRODUCTION" ? "1" : undefined,
            totalEstimatedUnits: a.method === "UNITS_OF_PRODUCTION" ? String(a.months) : undefined,
            openingNbv: opening.toFixed(4),
            accumulatedToDate: acc.toFixed(4),
            monthsElapsed: m,
          });
          const after = new Decimal(r.accumulatedAfter);
          const base = new Decimal(a.cost).minus(salvage);
          expect(after.lte(base.plus(new Decimal("0.0001")))).toBe(true); // floor
          expect(new Decimal(r.nbvAfter).gte(salvage.minus(new Decimal("0.0001")))).toBe(true);
          acc = after;
          opening = new Decimal(r.nbvAfter);
        }
        // at end of life Σ = base exactly (final-period residual)
        const base = new Decimal(a.cost).minus(salvage).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
        expect(acc.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).eq(base)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});
