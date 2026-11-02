import { describe, expect, it } from "vitest";

import { explodeBom, explosionIsDeterministic, type BomLineInput } from "../domain/bom";

describe("PHASE-018 BOM explosion (T1)", () => {
  const lines: BomLineInput[] = [
    { componentItemId: "flour", qtyPerOutput: "0.5", scrapFactorPct: "2" },
    { componentItemId: "yeast", qtyPerOutput: "0.01", scrapFactorPct: "0" },
  ];

  it("applies yield and scrap factors exactly (6-dp ceiling)", () => {
    // 1000 units output, yield 950 per execution → 1000/950 executions
    // flour: 0.5 × (1000/950) × 1.02 = 0.536842... → ceil 6dp = 0.536843
    const rows = explodeBom(lines, "1000", "950");
    const flour = rows.find((r) => r.componentItemId === "flour")!;
    expect(flour.grossQty).toBe("0.536843");
    expect(flour.netQty).toBe("0.526316");
    const yeast = rows.find((r) => r.componentItemId === "yeast")!;
    expect(yeast.grossQty).toBe("0.010527");
  });

  it("is deterministic (property)", () => {
    expect(explosionIsDeterministic(lines, "333.333", "950")).toBe(true);
  });

  it("rejects invalid inputs", () => {
    expect(() => explodeBom(lines, "0")).toThrow();
    expect(() => explodeBom(lines, "10", "0")).toThrow();
    expect(() => explodeBom([{ componentItemId: "x", qtyPerOutput: "-1", scrapFactorPct: "0" }], "10")).toThrow();
    expect(() => explodeBom([{ componentItemId: "x", qtyPerOutput: "1", scrapFactorPct: "100" }], "10")).toThrow();
  });
});
