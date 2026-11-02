import { describe, expect, it } from "vitest";

import { Money } from "@erp/domain-core";

import { expectedCash, requiresApproval, variance } from "../domain/settlement";

/**
 * PHASE-017 T10 — settlement math: expected = opening + cash sales +
 * collections − refunds − approved expenses; variance always posts with a
 * direction; beyond tolerance ⇒ supervisor approval (BR-021 family).
 */

const SAR = "SAR" as const;

describe("rep settlement math (PHASE-017 T10)", () => {
  const day = {
    openingCash: "500.0000",
    cashSales: "1200.0000",
    collections: "300.0000",
    cashRefunds: "50.0000",
    approvedExpenses: "20.0000",
    currency: SAR,
  };

  it("expected cash = opening + sales + collections − refunds − expenses", () => {
    expect(expectedCash(day).toString()).toBe("1930.00 SAR");
  });

  it("counted == expected ⇒ NONE variance", () => {
    const v = variance(expectedCash(day), Money.fromString("1930.0000", SAR));
    expect(v.kind).toBe("NONE");
    expect(v.amount.toString()).toBe("0.00 SAR");
  });

  it("counted < expected ⇒ SHORTAGE with positive amount (posts DR expense · CR rep cash)", () => {
    const v = variance(expectedCash(day), Money.fromString("1925.0000", SAR));
    expect(v.kind).toBe("SHORTAGE");
    expect(v.amount.toString()).toBe("5.00 SAR");
  });

  it("counted > expected ⇒ OVERAGE (inverse posting)", () => {
    const v = variance(expectedCash(day), Money.fromString("1935.5000", SAR));
    expect(v.kind).toBe("OVERAGE");
    expect(v.amount.toString()).toBe("5.50 SAR");
  });

  it("beyond tolerance requires approval; within tolerance does not", () => {
    const five = Money.fromString("5.0000", SAR);
    expect(requiresApproval(five, "10.0000")).toBe(false);
    expect(requiresApproval(five, "5.0000")).toBe(false); // strictly greater
    expect(requiresApproval(Money.fromString("10.01", SAR), "10.0000")).toBe(true);
  });
});
