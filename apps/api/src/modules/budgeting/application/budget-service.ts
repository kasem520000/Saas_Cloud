/**
 * PHASE-028 T2/T3/T4/T6 — budget service over ports (store + GL read port).
 * Read-only against the GL (ADR-0007): the consumption port is a pure read;
 * the negative test proves no GL write call exists.
 */
import {
  assertApprovalSoD,
  assertLineEditable,
  assertSingleActive,
  evaluateControl,
  transitionBudget,
  variance,
  type BudgetScope,
  type BudgetStatus,
  type ControlMode,
} from "../domain/budget-rules";

export interface BudgetRow {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  fiscalYearId: string;
  scope: BudgetScope;
  version: number;
  status: BudgetStatus;
  supersedesId: string | null;
  createdBy: string;
}
export interface BudgetLineRow {
  id: string;
  budgetId: string;
  fiscalPeriodId: string;
  accountId: string;
  amount: string;
}

export interface BudgetStore {
  findBudget(tenantId: string, id: string): Promise<BudgetRow | undefined>;
  activeCount(tenantId: string, fiscalYearId: string, scope: BudgetScope): Promise<number>;
  saveBudget(b: BudgetRow): Promise<void>;
  lines(budgetId: string): Promise<BudgetLineRow[]>;
  saveLine(l: BudgetLineRow): Promise<void>;
  deleteLines(budgetId: string): Promise<void>;
  findPeriod(tenantId: string, periodId: string): Promise<{ id: string; fiscalYearId: string } | undefined>;
  findAccount(tenantId: string, accountId: string): Promise<unknown | undefined>;
  /** GL read port: actuals per (account, period) — READ-ONLY. */
  actuals(tenantId: string, accountId: string, fiscalPeriodId: string): Promise<string>;
  /** ACTIVE budget amount per (account, period) across scopes — read model. */
  budgetAmount(tenantId: string, accountId: string, fiscalPeriodId: string): Promise<string>;
}

export class BudgetNotFoundError extends Error {
  constructor(kind: string, id: string) {
    super(`${kind} not found in this tenant: ${id}`);
    this.name = "BudgetNotFoundError"; // typed 404 (S-04/A7)
  }
}

export class BudgetingService {
  constructor(private readonly store: BudgetStore) {}

  async createBudget(tenantId: string, input: Omit<BudgetRow, "id" | "tenantId" | "status" | "version" | "supersedesId"> & { createdBy: string }) {
    const budget: BudgetRow = { ...input, id: `budget-${input.code}`, tenantId, status: "DRAFT", version: 1, supersedesId: null };
    await this.store.saveBudget(budget);
    return budget;
  }

  /** Submit → approve (SoD) → activate (BR-050 single ACTIVE) → supersede → close. */
  async changeStatus(tenantId: string, budgetId: string, to: BudgetStatus, actor: { id: string; action: "submit" | "approve" | "activate" | "supersede" | "close" }) {
    const b = await this.store.findBudget(tenantId, budgetId);
    if (!b) throw new BudgetNotFoundError("budget", budgetId);
    transitionBudget(b.status, to);
    if (actor.action === "approve") assertApprovalSoD(b.createdBy, actor.id);
    if (to === "ACTIVE") {
      assertSingleActive((await this.store.activeCount(tenantId, b.fiscalYearId, b.scope)) + (b.status === "ACTIVE" ? 0 : 1));
    }
    b.status = to;
    await this.store.saveBudget(b);
    return b;
  }

  /** Line edits only in DRAFT; period must belong to the budget's fiscal year;
   *  foreign account → typed 404, zero partial. */
  async upsertLine(tenantId: string, budgetId: string, line: Omit<BudgetLineRow, "id" | "budgetId">) {
    const b = await this.store.findBudget(tenantId, budgetId);
    if (!b) throw new BudgetNotFoundError("budget", budgetId);
    assertLineEditable(b.status);
    const period = await this.store.findPeriod(tenantId, line.fiscalPeriodId);
    if (!period || period.fiscalYearId !== b.fiscalYearId) {
      throw new BudgetNotFoundError("fiscal_period", line.fiscalPeriodId);
    }
    if ((await this.store.findAccount(tenantId, line.accountId)) === undefined) {
      throw new BudgetNotFoundError("account", line.accountId);
    }
    const row: BudgetLineRow = { ...line, id: `${budgetId}-${line.fiscalPeriodId}-${line.accountId}`, budgetId };
    await this.store.saveLine(row);
    return row;
  }

  /** Supersede: new DRAFT version copying lines, chain via supersedes_id. */
  async supersede(tenantId: string, budgetId: string, actorId: string) {
    const b = await this.store.findBudget(tenantId, budgetId);
    if (!b) throw new BudgetNotFoundError("budget", budgetId);
    transitionBudget(b.status, "REVISED");
    b.status = "REVISED";
    await this.store.saveBudget(b);
    const revision: BudgetRow = { ...b, id: `${b.id}-v${b.version + 1}`, version: b.version + 1, status: "DRAFT", supersedesId: b.id, createdBy: actorId };
    await this.store.saveBudget(revision);
    for (const l of await this.store.lines(b.id)) {
      await this.store.saveLine({ ...l, id: `${revision.id}-${l.fiscalPeriodId}-${l.accountId}`, budgetId: revision.id });
    }
    return revision;
  }

  /** BR-051 advisory control evaluation at DRAFT-stage saves. */
  async evaluateControl(tenantId: string, input: { stage: "DRAFT_SAVE" | "POSTED"; accountId: string; fiscalPeriodId: string; projectedAmount: string; mode: ControlMode; warnThresholdPercent: number }) {
    const budget = await this.store.budgetAmount(tenantId, input.accountId, input.fiscalPeriodId);
    return evaluateControl({ mode: input.mode, stage: input.stage, projectedConsumption: input.projectedAmount, budgetAmount: budget, warnThresholdPercent: input.warnThresholdPercent });
  }

  private async budgetFor(tenantId: string, accountId: string, fiscalPeriodId: string): Promise<string> {
    return this.store.budgetAmount(tenantId, accountId, fiscalPeriodId);
  }

  /** Variance read: budget vs GL actual (read-only), per account+period. */
  async budgetVsActual(tenantId: string, accountId: string, fiscalPeriodId: string) {
    const budget = await this.budgetFor(tenantId, accountId, fiscalPeriodId);
    const actual = await this.store.actuals(tenantId, accountId, fiscalPeriodId);
    return { budget, actual, ...variance(budget, actual) };
  }
}
