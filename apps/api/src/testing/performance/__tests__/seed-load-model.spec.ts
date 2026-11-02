import { describe, expect, it } from "vitest";
import { buildLoadModel, docTypeFor, mulberry32 } from "../seed-load-model";

describe("PHASE-025 T1: deterministic GA load model", () => {
  it("produces the required tenant mix 1 large / 50 mid / 500 small", () => {
    const m = buildLoadModel();
    const byTier = { large: 0, mid: 0, small: 0 };
    for (const t of m.tenants) byTier[t.tier]++;
    expect(byTier).toEqual({ large: 1, mid: 50, small: 500 });
    expect(m.totals.tenants).toBe(551);
  });

  it("is deterministic: same seed => identical model", () => {
    expect(buildLoadModel(42)).toEqual(buildLoadModel(42));
    expect(buildLoadModel(42)).not.toEqual(buildLoadModel(43));
  });

  it("volumes are within jitter bounds of the tier targets", () => {
    const m = buildLoadModel();
    const large = m.tenants.find((t) => t.tier === "large")!;
    expect(large.docCount).toBeGreaterThanOrEqual(95_000);
    expect(large.docCount).toBeLessThanOrEqual(105_000);
    expect(large.concurrentUsers).toBe(50);
    // total docs roughly 1*100k + 50*10k + 500*1k = 1.1M (±5%)
    expect(m.totals.docs).toBeGreaterThan(1_045_000);
    expect(m.totals.docs).toBeLessThan(1_155_000);
  });

  it("doc mix is 60/25/15", () => {
    const m = buildLoadModel();
    expect(m.docMix).toEqual({ sales: 0.6, purchases: 0.25, treasury: 0.15 });
    const rand = mulberry32(7);
    const counts = { sales: 0, purchases: 0, treasury: 0 };
    for (let i = 0; i < 10_000; i++) counts[docTypeFor(rand)]++;
    expect(counts.sales / 10_000).toBeGreaterThan(0.58);
    expect(counts.sales / 10_000).toBeLessThan(0.62);
    expect(counts.purchases / 10_000).toBeGreaterThan(0.23);
    expect(counts.treasury / 10_000).toBeGreaterThan(0.13);
  });
});
