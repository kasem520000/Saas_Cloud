import { describe, expect, it } from "vitest";

import { Decimal } from "@erp/domain-core";

import { buildG32Elimination, buildG32Reversal, type EliminationLeg } from "../application/journal-builders";

/**
 * PHASE-034 unit — G-32 builder shapes (JOURNAL_RULES §7) and BR-056
 * reversal mirroring. Pure: no DB.
 */

const legs: EliminationLeg[] = [
  { memberTenantId: "member-b", purpose: "INTERCOMPANY_AP", direction: "DEBIT", amount: "5000.0000" },
  { memberTenantId: "member-a", purpose: "INTERCOMPANY_AR", direction: "CREDIT", amount: "5000.0000" },
];

describe("G-32 elimination builder", () => {
  it("posts source_type CONSOLIDATION_ELIMINATION with DR INTERCOMPANY_AP · CR INTERCOMPANY_AR", () => {
    const spec = buildG32Elimination({
      eliminationId: "el-1", entryDate: "2026-03-31", currency: "SAR", description: "IC loan A→B", legs,
    });
    expect(spec.source).toEqual({ docType: "consolidation_elimination", docId: "el-1", operation: "post" });
    expect(spec.lines).toHaveLength(2);
    expect(spec.lines[0]).toMatchObject({ purpose: "INTERCOMPANY_AP", direction: "DEBIT", amount: "5000.0000" });
    expect(spec.lines[1]).toMatchObject({ purpose: "INTERCOMPANY_AR", direction: "CREDIT", amount: "5000.0000" });
    // balanced
    const dr = spec.lines.filter((l) => l.direction === "DEBIT").reduce((a, l) => a.add(new Decimal(l.amount)), new Decimal(0));
    const cr = spec.lines.filter((l) => l.direction === "CREDIT").reduce((a, l) => a.add(new Decimal(l.amount)), new Decimal(0));
    expect(dr.eq(cr)).toBe(true);
  });

  it("BR-056 reversal mirrors every leg (counter-entry)", () => {
    const spec = buildG32Reversal({ eliminationId: "el-1", entryDate: "2026-04-02", currency: "SAR", legs });
    expect(spec.source.operation).toBe("reverse");
    expect(spec.lines[0]).toMatchObject({ purpose: "INTERCOMPANY_AP", direction: "CREDIT", amount: "5000.0000" });
    expect(spec.lines[1]).toMatchObject({ purpose: "INTERCOMPANY_AR", direction: "DEBIT", amount: "5000.0000" });
  });
});
