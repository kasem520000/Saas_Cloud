import { describe, expect, it } from "vitest";

import { computeProductionCost, wipNetsToZero } from "../domain/costing";

describe("PHASE-018 production costing (T4)", () => {
  it("cost = materials + labor + overhead, exact 4-dp", () => {
    const result = computeProductionCost({
      consumptions: [
        { qty: "10", unitCost: "2.5000" },
        { qty: "4", unitCost: "1.2500" },
      ],
      actualQty: "100",
      laborRatePerUnit: "0.5000",
      overheadRatePerUnit: "0.2500",
    });
    // materials 25 + 5 = 30; labor 50; overhead 25 → 105 → unit 1.05
    expect(result.materialsCost).toBe("30.0000");
    expect(result.laborCost).toBe("50.0000");
    expect(result.overheadCost).toBe("25.0000");
    expect(result.totalCost).toBe("105.0000");
    expect(result.unitCost).toBe("1.0500");
  });

  it("WIP nets to exactly zero (INV-010)", () => {
    expect(wipNetsToZero("0")).toBe(true);
    expect(wipNetsToZero("0.0000")).toBe(true);
    expect(wipNetsToZero("0.0001")).toBe(false);
  });

  it("rejects zero actual qty at completion", () => {
    expect(() =>
      computeProductionCost({ consumptions: [], actualQty: "0", laborRatePerUnit: "0", overheadRatePerUnit: "0" }),
    ).toThrow();
  });
});
