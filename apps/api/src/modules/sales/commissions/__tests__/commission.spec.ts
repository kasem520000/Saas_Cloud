import { describe, expect, it } from "vitest";

import { accrualFor, runKey } from "../domain/commission";

/**
 * PHASE-017 T12 — commission accrual: percentage on posted, non-reversed
 * sales only; posts at run time; run key is (period) for idempotency.
 */

const SAR = "SAR" as const;

describe("commission accrual (PHASE-017 T12)", () => {
  const rule = { repId: "rep-1", basis: "COLLECTED" as const, ratePct: "5" };
  const lines = [
    { repId: "rep-1", amount: "1000.0000", reversed: false },
    { repId: "rep-1", amount: "500.0000", reversed: true }, // credited sale — excluded
    { repId: "rep-2", amount: "9999.0000", reversed: false }, // other rep — excluded
  ];

  it("accrues rate% on the rep's non-reversed base only", () => {
    expect(accrualFor(rule, lines, SAR).toString()).toBe("50.00 SAR");
  });

  it("zero rate ⇒ zero accrual; zero base ⇒ zero accrual", () => {
    expect(accrualFor({ ...rule, ratePct: "0" }, lines, SAR).toString()).toBe("0.00 SAR");
    expect(accrualFor(rule, [], SAR).toString()).toBe("0.00 SAR");
  });

  it("run key is period-scoped (re-run of the same period is the same key — idempotent)", () => {
    expect(runKey("2026-11-01", "2026-11-30")).toBe("2026-11-01..2026-11-30");
    expect(runKey("2026-11-01", "2026-11-30")).toBe(runKey("2026-11-01", "2026-11-30"));
    expect(runKey("2026-11-01", "2026-11-30")).not.toBe(runKey("2026-12-01", "2026-12-31"));
  });
});
