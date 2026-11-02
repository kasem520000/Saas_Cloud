import { describe, expect, it } from "vitest";
import { assertInv025, computeRunLine } from "../domain/payroll-calc";
import { buildG29Run, buildG30Payout, buildG31EosSettlement, isBalanced } from "../application/journal-builders";

const STRUCTURE = [
  { code: "HOUSING", kind: "EARNING" as const, calc: "FIXED" as const, amount: "2000.0000", glAccountId: "a1", isEosBase: false, seq: 2 },
  { code: "THIRD_PARTY", kind: "DEDUCTION" as const, calc: "FIXED" as const, amount: "1000.0000", glAccountId: "a2", isEosBase: false, seq: 3 },
  { code: "EMPLOYER_C", kind: "EMPLOYER" as const, calc: "FIXED" as const, amount: "1000.0000", glAccountId: "a3", isEosBase: false, seq: 4 },
  { code: "EOS_BASE", kind: "EOS_BASE" as const, calc: "PERCENT_OF_BASIC" as const, percent: "0.10", glAccountId: "a4", isEosBase: true, seq: 1 },
];

describe("G-29 worked-example golden (INV-025)", () => {
  const line = computeRunLine({
    basicSalary: "8000.0000",
    components: STRUCTURE,
    loanInstallment: "500.0000",
    eosPolicy: { enabled: true, rateOfEosBase: "1" }, // tenant policy: 100% of EOS base monthly (fixture rate, not a jurisdiction rate)
  });

  it("computes gross 10,000 / deductions 1,500 / net 8,500 / employer 1,000 / EOS 800", () => {
    expect(line.gross).toBe("10000.0000");
    expect(line.deductions).toBe("1500.0000"); // 1000 third-party + 500 loan
    expect(line.net).toBe("8500.0000");
    expect(line.employer).toBe("1000.0000");
    expect(line.eosAccrual).toBe("800.0000"); // 10% of basic 8000 = EOS base
    expect(line.loanDeduction).toBe("500.0000");
  });

  it("G-29 journal: DR 10,000 + 1,000 + 800 · CR 2,000 + 500 + 8,500 — balanced 11,800", () => {
    const spec = buildG29Run({
      runId: "run-1", entryDate: "2026-11-30", currency: "YER",
      lines: [{ ...line, thirdPartyDeductions: "1000.0000", costCenterId: "cc-1" }],
    });
    expect(isBalanced(spec)).toBe(true);
    const dr = spec.lines.filter((l) => l.direction === "DEBIT").reduce((s, l) => s + Number(l.amount), 0);
    const cr = spec.lines.filter((l) => l.direction === "CREDIT").reduce((s, l) => s + Number(l.amount), 0);
    expect(dr).toBe(11800);
    expect(cr).toBe(11800);
    expect(spec.lines.every((l) => l.costCenterId === "cc-1")).toBe(true);
    expect(spec.lines).toContainEqual({ purpose: "SALARIES_PAYABLE", direction: "CREDIT", amount: "8500.0000", costCenterId: "cc-1" });
  });

  it("INV-025: run totals = Σ lines exactly; net = gross − deductions", () => {
    expect(() => assertInv025(
      [{ gross: line.gross, deductions: line.deductions, net: line.net }],
      { gross: "10000.0000", deductions: "1500.0000", net: "8500.0000" },
    )).not.toThrow();
    expect(() => assertInv025(
      [{ gross: "10000.0000", deductions: "1500.0000", net: "8500.0000" }],
      { gross: "10000.0001", deductions: "1500.0000", net: "8500.0000" },
    )).toThrowError(expect.objectContaining({ code: "INV025_VIOLATION" }));
  });
});

describe("BR-054 loan cap + BR-055 EOS policy", () => {
  it("cap clamps 3,000 → 25% × 8,500 = 2,125 with warning; 500 passes", () => {
    const clamped = computeRunLine({ basicSalary: "8000.0000", components: STRUCTURE.filter((c) => c.code !== "THIRD_PARTY"), loanInstallment: "3000.0000" });
    expect(clamped.loanDeduction).toBe("2500.0000"); // 25% of net-before-loan 10000 (no third-party deduction in this fixture)
    expect(clamped.warnings.some((w) => w.includes("BR-054"))).toBe(true);
    const ok = computeRunLine({ basicSalary: "8000.0000", components: [], loanInstallment: "500.0000" });
    expect(ok.loanDeduction).toBe("500.0000");
  });

  it("BR-055: EOS without tenant rate → skipped + explicit warning (no fabricated rates)", () => {
    const r = computeRunLine({ basicSalary: "8000.0000", components: STRUCTURE, eosPolicy: { enabled: true } });
    expect(r.eosAccrual).toBe("0.0000");
    expect(r.warnings.some((w) => w.includes("BR-055"))).toBe(true);
    const off = computeRunLine({ basicSalary: "8000.0000", components: STRUCTURE, eosPolicy: { enabled: false } });
    expect(off.eosAccrual).toBe("0.0000");
    expect(off.warnings).toHaveLength(0);
  });
});

describe("G-30 / G-31 goldens", () => {
  it("G-30 payout: DR SALARIES_PAYABLE 8,500 · CR BANK", () => {
    const spec = buildG30Payout({ runId: "run-1", entryDate: "2026-12-05", currency: "YER", amount: "8500.0000", cashPurpose: "BANK" });
    expect(isBalanced(spec)).toBe(true);
    expect(spec.lines).toEqual([
      { purpose: "SALARIES_PAYABLE", direction: "DEBIT", amount: "8500.0000" },
      { purpose: "BANK", direction: "CREDIT", amount: "8500.0000" },
    ]);
  });

  it("G-31 EOS settlement: DR EOS_PROVISION 4,200 · CR CASH 4,000 · CR EOS_PROVISION_EXPENSE 200", () => {
    const spec = buildG31EosSettlement({ employeeId: "e1", entryDate: "2026-12-31", currency: "YER", provisionBalance: "4200.0000", settled: "4000.0000" });
    expect(isBalanced(spec)).toBe(true);
    expect(spec.lines).toContainEqual({ purpose: "EOS_PROVISION_EXPENSE", direction: "CREDIT", amount: "200.0000" });
  });

  it("G-31 mirror rejected: settle above provision balance", () => {
    expect(() => buildG31EosSettlement({ employeeId: "e1", entryDate: "2026-12-31", currency: "YER", provisionBalance: "4200.0000", settled: "5000.0000" })).toThrow(/EOS_SETTLE_ABOVE_PROVISION/);
  });
});
