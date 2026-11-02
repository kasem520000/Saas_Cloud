import { describe, expect, it } from "vitest";

import { freeUnitsFor, FreeGoodsError, type FreeGoodsRule } from "../domain/free-goods";

/**
 * PHASE-017 T11 — buy-X-get-Y free-goods math (BR-008: FOC lines are
 * zero-price with a reason code but still issue stock and post COGS).
 */

const rule: FreeGoodsRule = { itemId: "it-1", buyQty: "10", getQty: "1" };

describe("free-goods rule math (PHASE-017 T11)", () => {
  it("grants floor(purchased/buy) * get units", () => {
    expect(freeUnitsFor(rule, "10")).toBe("1.000000");
    expect(freeUnitsFor(rule, "25")).toBe("2.000000");
    expect(freeUnitsFor(rule, "9.999999")).toBe("0.000000");
  });

  it("respects the per-document cap", () => {
    const capped: FreeGoodsRule = { ...rule, maxFreePerDocument: "3" };
    expect(freeUnitsFor(capped, "100")).toBe("3.000000");
  });

  it("rejects non-positive rule quantities and negative purchases", () => {
    expect(() => freeUnitsFor({ ...rule, buyQty: "0" }, "10")).toThrow(FreeGoodsError);
    expect(() => freeUnitsFor({ ...rule, getQty: "-1" }, "10")).toThrow(FreeGoodsError);
    expect(() => freeUnitsFor(rule, "-5")).toThrow(FreeGoodsError);
  });

  it("property: free units never exceed purchased/buy * get and never negative", () => {
    for (let p = 0; p <= 500; p += 7) {
      const free = Number(freeUnitsFor(rule, String(p)));
      expect(free).toBeGreaterThanOrEqual(0);
      expect(free).toBeLessThanOrEqual(Math.floor(p / 10) + 1e-9);
    }
  });
});
