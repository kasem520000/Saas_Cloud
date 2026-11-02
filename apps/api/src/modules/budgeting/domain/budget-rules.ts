/**
 * PHASE-028 — budget lifecycle + BR-050/BR-051 guards + variance math.
 * Pure and unit-testable. Budgets are planning data: no posting path exists
 * (ADR-0007 negative test asserts the engine has no budget call site).
 */
import { Decimal } from "@erp/domain-core";

export type BudgetStatus = "DRAFT" | "PENDING_APPROVAL" | "ACTIVE" | "REVISED" | "CLOSED";
export type BudgetScope = "ACCOUNTS" | "COST_CENTERS" | "PROJECTS" | "BRANCHES";

export class BudgetRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BudgetRuleError";
  }
}

const LIFECYCLE: Readonly<Record<BudgetStatus, ReadonlySet<BudgetStatus>>> = {
  DRAFT: new Set(["PENDING_APPROVAL", "CLOSED"]),
  PENDING_APPROVAL: new Set(["ACTIVE", "DRAFT", "CLOSED"]),
  ACTIVE: new Set(["REVISED", "CLOSED"]),
  REVISED: new Set(["CLOSED"]),
  CLOSED: new Set(),
};

/** Lifecycle transition check. */
export function transitionBudget(from: BudgetStatus, to: BudgetStatus): void {
  if (!LIFECYCLE[from].has(to)) {
    throw new BudgetRuleError("INVALID_BUDGET_TRANSITION", `budget ${from} -> ${to} is not a legal lifecycle transition`);
  }
}

/** BR-050: at most one ACTIVE per (tenant, fiscal year, scope) — enforced in
 *  SQL by a partial unique index AND here for the service path. */
export function assertSingleActive(activeCount: number): void {
  if (activeCount > 1) {
    throw new BudgetRuleError("MULTIPLE_ACTIVE_BUDGETS", "at most one ACTIVE budget per (fiscal year, scope) — BR-050");
  }
}

/** Non-DRAFT budgets reject line edits (409 IMMUTABLE_DOCUMENT at the edge). */
export function assertLineEditable(status: BudgetStatus): void {
  if (status !== "DRAFT") {
    throw new BudgetRuleError("IMMUTABLE_DOCUMENT", `budget lines are editable only in DRAFT (status=${status})`);
  }
}

/** SoD: creator cannot approve (AUTHORIZATION_MATRIX §4). */
export function assertApprovalSoD(creatorId: string, approverId: string): void {
  if (creatorId === approverId) {
    throw new BudgetRuleError("SOD_VIOLATION", "budget approval requires a second user (creator ≠ approver)");
  }
}

/** BR-051: controls are advisory by default; hard-block only for DRAFT-stage
 *  saves under explicit ENFORCE_DRAFT — never an engine side-effect. */
export type ControlMode = "ADVISORY" | "ENFORCE_DRAFT";

export function evaluateControl(input: {
  mode: ControlMode;
  stage: "DRAFT_SAVE" | "POSTED";
  projectedConsumption: string;
  budgetAmount: string;
  warnThresholdPercent: number;
}): { warn: boolean; block: boolean; reason?: string } {
  const pct = new Decimal(input.budgetAmount).gt(0)
    ? new Decimal(input.projectedConsumption).div(input.budgetAmount).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    : new Decimal(0);
  const warn = pct.gte(input.warnThresholdPercent);
  // Posted documents are NEVER warned or blocked (binding honesty note).
  if (input.stage === "POSTED") return { warn: false, block: false };
  const block = warn && input.mode === "ENFORCE_DRAFT" && input.stage === "DRAFT_SAVE";
  return { warn, block, reason: block ? "BUDGET_EXCEEDED" : undefined };
}

/** Variance: actual − budget; positive = over budget. % = variance/budget. */
export function variance(budget: string, actual: string): { variance: string; variancePct: string } {
  const b = new Decimal(budget);
  const a = new Decimal(actual);
  const v = a.minus(b).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  const pct = b.eq(0) ? new Decimal(0) : v.div(b).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return { variance: v.toFixed(4), variancePct: pct.toFixed(2) };
}

/** Ledger-tie assertion for variance reports: Σ actuals per period must equal
 *  the trial balance's period movements (block-on-fail per PHASE-013). */
export function ledgerTie(sumActuals: string, tbPeriodMovement: string): boolean {
  return new Decimal(sumActuals).eq(new Decimal(tbPeriodMovement));
}
