import { describe, expect, it } from "vitest";
import {
  assertApprovalSoD,
  assertLineEditable,
  assertSingleActive,
  evaluateControl,
  ledgerTie,
  transitionBudget,
  variance,
} from "../domain/budget-rules";
import { BudgetingService, BudgetNotFoundError, type BudgetRow, type BudgetStore, type BudgetLineRow } from "../application/budget-service";

describe("PHASE-028 budget lifecycle + BR-050/051", () => {
  it("lifecycle: DRAFT→PENDING_APPROVAL→ACTIVE→REVISED→CLOSED legal; illegal rejected", () => {
    expect(() => transitionBudget("DRAFT", "PENDING_APPROVAL")).not.toThrow();
    expect(() => transitionBudget("PENDING_APPROVAL", "ACTIVE")).not.toThrow();
    expect(() => transitionBudget("ACTIVE", "REVISED")).not.toThrow();
    expect(() => transitionBudget("REVISED", "CLOSED")).not.toThrow();
    expect(() => transitionBudget("DRAFT", "ACTIVE")).toThrowError(expect.objectContaining({ code: "INVALID_BUDGET_TRANSITION" }));
    expect(() => transitionBudget("CLOSED", "DRAFT")).toThrow();
  });

  it("BR-050: single ACTIVE enforced; non-DRAFT rejects line edits; SoD on approve", () => {
    expect(() => assertSingleActive(2)).toThrowError(expect.objectContaining({ code: "MULTIPLE_ACTIVE_BUDGETS" }));
    expect(() => assertSingleActive(1)).not.toThrow();
    expect(() => assertLineEditable("ACTIVE")).toThrowError(expect.objectContaining({ code: "IMMUTABLE_DOCUMENT" }));
    expect(() => assertLineEditable("DRAFT")).not.toThrow();
    expect(() => assertApprovalSoD("u1", "u1")).toThrowError(expect.objectContaining({ code: "SOD_VIOLATION" }));
    expect(() => assertApprovalSoD("u1", "u2")).not.toThrow();
  });

  it("BR-051: advisory by default; ENFORCE_DRAFT blocks only DRAFT saves; POSTED never touched", () => {
    const base = { projectedConsumption: "1200.0000", budgetAmount: "1000.0000", warnThresholdPercent: 100 };
    expect(evaluateControl({ ...base, mode: "ADVISORY", stage: "DRAFT_SAVE" })).toEqual({ warn: true, block: false });
    expect(evaluateControl({ ...base, mode: "ENFORCE_DRAFT", stage: "DRAFT_SAVE" })).toEqual({ warn: true, block: true, reason: "BUDGET_EXCEEDED" });
    expect(evaluateControl({ ...base, mode: "ENFORCE_DRAFT", stage: "POSTED" })).toEqual({ warn: false, block: false });
    expect(evaluateControl({ ...base, projectedConsumption: "900.0000", mode: "ENFORCE_DRAFT", stage: "DRAFT_SAVE" }).block).toBe(false);
  });

  it("variance math + ledger tie", () => {
    expect(variance("1000.0000", "1200.0000")).toEqual({ variance: "200.0000", variancePct: "20.00" });
    expect(variance("1000.0000", "800.0000")).toEqual({ variance: "-200.0000", variancePct: "-20.00" });
    expect(ledgerTie("500.0000", "500.0000")).toBe(true);
    expect(ledgerTie("500.0000", "500.0001")).toBe(false);
  });
});

function harness() {
  const budgets = new Map<string, BudgetRow>();
  const lines = new Map<string, BudgetLineRow[]>();
  const store: BudgetStore = {
    findBudget: async (_t, id) => budgets.get(id),
    activeCount: async (_t, fy, scope) => [...budgets.values()].filter((b) => b.fiscalYearId === fy && b.scope === scope && b.status === "ACTIVE").length,
    saveBudget: async (b) => { budgets.set(b.id, b); },
    lines: async (budgetId) => lines.get(budgetId) ?? [],
    saveLine: async (l) => { lines.set(l.budgetId, [...(lines.get(l.budgetId) ?? []).filter((x) => x.id !== l.id), l]); },
    deleteLines: async (budgetId) => { lines.set(budgetId, []); },
    findPeriod: async (_t, pid) => (pid === "fp-1" ? { id: pid, fiscalYearId: "fy-1" } : undefined),
    findAccount: async (_t, aid) => (aid === "acc-1" ? { id: aid } : undefined),
    actuals: async () => "600.0000",
    budgetAmount: async () => "1000.0000",
  };
  return { svc: new BudgetingService(store), budgets, lines };
}

describe("PHASE-028 budget service flows", () => {
  it("create → submit → approve (SoD) → activate; second ACTIVE same year+scope rejected", async () => {
    const { svc, budgets } = harness();
    const b = await svc.createBudget("t1", { code: "B-2026", fiscalYearId: "fy-1", scope: "ACCOUNTS", name: "OPEX 2026", createdBy: "u1" });
    await svc.changeStatus("t1", b.id, "PENDING_APPROVAL", { id: "u1", action: "submit" });
    await expect(svc.changeStatus("t1", b.id, "ACTIVE", { id: "u1", action: "approve" })).rejects.toMatchObject({ code: "SOD_VIOLATION" });
    await svc.changeStatus("t1", b.id, "ACTIVE", { id: "u2", action: "approve" });
    expect(budgets.get(b.id)!.status).toBe("ACTIVE");
    const b2 = await svc.createBudget("t1", { code: "B-2026-2", fiscalYearId: "fy-1", scope: "ACCOUNTS", name: "OPEX 2", createdBy: "u1" });
    await svc.changeStatus("t1", b2.id, "PENDING_APPROVAL", { id: "u1", action: "submit" });
    await expect(svc.changeStatus("t1", b2.id, "ACTIVE", { id: "u2", action: "approve" })).rejects.toMatchObject({ code: "MULTIPLE_ACTIVE_BUDGETS" });
  });

  it("line upsert: DRAFT only; period must belong to fiscal year; foreign account → 404 zero partial", async () => {
    const { svc, lines } = harness();
    const b = await svc.createBudget("t1", { code: "B-2026", fiscalYearId: "fy-1", scope: "ACCOUNTS", name: "OPEX", createdBy: "u1" });
    const l = await svc.upsertLine("t1", b.id, { fiscalPeriodId: "fp-1", accountId: "acc-1", amount: "500.0000" });
    expect(l.amount).toBe("500.0000");
    await expect(svc.upsertLine("t1", b.id, { fiscalPeriodId: "fp-foreign", accountId: "acc-1", amount: "1" })).rejects.toBeInstanceOf(BudgetNotFoundError);
    await expect(svc.upsertLine("t1", b.id, { fiscalPeriodId: "fp-1", accountId: "acc-foreign", amount: "1" })).rejects.toBeInstanceOf(BudgetNotFoundError);
    await svc.changeStatus("t1", b.id, "PENDING_APPROVAL", { id: "u1", action: "submit" });
    await expect(svc.upsertLine("t1", b.id, { fiscalPeriodId: "fp-1", accountId: "acc-1", amount: "2" })).rejects.toMatchObject({ code: "IMMUTABLE_DOCUMENT" });
    expect(lines.get(b.id)).toHaveLength(1);
  });

  it("supersede copies lines into a new DRAFT version chained via supersedes_id", async () => {
    const { svc, budgets } = harness();
    const b = await svc.createBudget("t1", { code: "B-2026", fiscalYearId: "fy-1", scope: "ACCOUNTS", name: "OPEX", createdBy: "u1" });
    await svc.upsertLine("t1", b.id, { fiscalPeriodId: "fp-1", accountId: "acc-1", amount: "500.0000" });
    await svc.changeStatus("t1", b.id, "PENDING_APPROVAL", { id: "u1", action: "submit" });
    await svc.changeStatus("t1", b.id, "ACTIVE", { id: "u2", action: "approve" });
    const rev = await svc.supersede("t1", b.id, "u3");
    expect(rev.status).toBe("DRAFT");
    expect(rev.version).toBe(2);
    expect(rev.supersedesId).toBe(b.id);
    expect(budgets.get(b.id)!.status).toBe("REVISED");
  });

  it("variance read: budget vs GL actual is read-only and exact", async () => {
    const { svc } = harness();
    const r = await svc.budgetVsActual("t1", "acc-1", "fp-1");
    expect(r).toEqual({ budget: "1000.0000", actual: "600.0000", variance: "-400.0000", variancePct: "-40.00" });
  });
});
