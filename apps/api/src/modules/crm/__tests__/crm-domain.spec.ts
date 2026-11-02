import { describe, expect, it } from "vitest";

import {
  LeadConvertedImmutableError,
  LeadTransitionError,
  transitionLead,
} from "../domain/lead";
import {
  expandMonthlyRetainer,
  scheduleIsDeterministic,
} from "../domain/billing-schedule";

describe("PHASE-019 lead pipeline (T2)", () => {
  it("legal transitions", () => {
    expect(transitionLead("NEW", "QUALIFY")).toBe("QUALIFIED");
    expect(transitionLead("QUALIFIED", "CONVERT")).toBe("CONVERTED");
    expect(transitionLead("NEW", "LOSE", "budget")).toBe("LOST");
    expect(transitionLead("LOST", "REOPEN")).toBe("NEW");
  });

  it("LOST requires a reason", () => {
    expect(() => transitionLead("NEW", "LOSE")).toThrow(LeadTransitionError);
    expect(() => transitionLead("NEW", "LOSE", "  ")).toThrow(LeadTransitionError);
  });

  it("CONVERTED is immutable", () => {
    expect(() => transitionLead("CONVERTED", "REOPEN")).toThrow(LeadConvertedImmutableError);
    expect(() => transitionLead("CONVERTED", "LOSE", "x")).toThrow(LeadConvertedImmutableError);
  });
});

describe("PHASE-019 billing schedule expansion (T4/T6)", () => {
  it("full months at the retainer amount", () => {
    const entries = expandMonthlyRetainer("c1", "2026-01-01", "2026-03-31", "3000");
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ periodKey: "c1:2026-01", amount: "3000.0000" });
    expect(entries[2]?.periodKey).toBe("c1:2026-03");
  });

  it("partial first/last months prorate by days", () => {
    // 2026-01-15 → 2026-02-14: Jan covers 17/31 days, Feb 14/28 days
    const entries = expandMonthlyRetainer("c1", "2026-01-15", "2026-02-14", "3100");
    expect(entries[0]?.amount).toBe((3100 * 17 / 31).toFixed(4).replace(/(\.\d{4})\d+/, "$1")); // 1700.0000
    expect(entries[0]?.amount).toBe("1700.0000");
    expect(entries[1]?.amount).toBe("1550.0000");
  });

  it("leap day month handled (Feb 2028 = 29 days)", () => {
    const entries = expandMonthlyRetainer("c1", "2028-02-01", "2028-02-29", "2900");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.amount).toBe("2900.0000");
  });

  it("deterministic (property)", () => {
    expect(scheduleIsDeterministic("c1", "2026-01-15", "2026-06-14", "3000")).toBe(true);
  });

  it("invalid range → empty; zero amount rejected", () => {
    expect(expandMonthlyRetainer("c1", "2026-03-01", "2026-01-01", "100")).toEqual([]);
    expect(() => expandMonthlyRetainer("c1", "2026-01-01", "2026-02-01", "0")).toThrow();
  });
});
