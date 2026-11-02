/**
 * PHASE-029 T5/T6/T7 — payroll run service over ports: approval SoD
 * (payroll.runs.approve, creator ≠ approver), one G-29 journal per run
 * (INV-013 idempotent via engine source key), G-30 payout. BR-053: payroll
 * postings exist only through this service — no manual journal path.
 */
import { buildG29Run, buildG30Payout } from "./journal-builders";
import type { JournalSpec } from "../../accounting/domain/posting-engine/journal-spec";

export type RunStatus = "DRAFT" | "PENDING_APPROVAL" | "POSTED";
export interface RunRow {
  id: string;
  tenantId: string;
  fiscalPeriodId: string;
  status: RunStatus;
  createdBy: string;
  totals: { gross: string; deductions: string; net: string };
  lines: Array<{ gross: string; deductions: string; net: string; employer: string; eosAccrual: string; thirdPartyDeductions: string; loanDeduction: string; costCenterId: string | null }>;
  journalEntryId: string | null;
}

export interface PayrollStore {
  findRun(tenantId: string, id: string): Promise<RunRow | undefined>;
  saveRun(r: RunRow): Promise<void>;
  periodStatus(tenantId: string, fiscalPeriodId: string): Promise<"OPEN" | "SOFT_CLOSED" | "LOCKED">;
}
export type PostPort = (spec: JournalSpec) => Promise<{ entryId: string }>;

export class PayrollRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PayrollRuleError";
  }
}

export class RunNotFoundError extends Error {
  constructor(id: string) {
    super(`payroll run not found in this tenant: ${id}`);
    this.name = "RunNotFoundError"; // typed 404
  }
}

export class PayrollRunService {
  constructor(
    private readonly store: PayrollStore,
    private readonly post: PostPort,
  ) {}

  async submit(tenantId: string, runId: string, actorId: string) {
    const run = await this.runOr404(tenantId, runId);
    if (run.status !== "DRAFT") throw new PayrollRuleError("INVALID_RUN_TRANSITION", "only DRAFT runs can be submitted");
    run.status = "PENDING_APPROVAL";
    void actorId;
    await this.store.saveRun(run);
    return run;
  }

  /** Approve + post in one SoD-checked step: G-29 via the engine only. */
  async approveAndPost(tenantId: string, runId: string, approverId: string, entryDate: string, currency: string, reference?: string) {
    const run = await this.runOr404(tenantId, runId);
    if (run.status !== "PENDING_APPROVAL") throw new PayrollRuleError("INVALID_RUN_TRANSITION", "only PENDING_APPROVAL runs can be posted");
    if (run.createdBy === approverId) throw new PayrollRuleError("SOD_VIOLATION", "run approval requires a second user (creator ≠ approver)");
    const period = await this.store.periodStatus(tenantId, run.fiscalPeriodId);
    if (period === "LOCKED") throw new PayrollRuleError("PERIOD_LOCKED", "payroll run rejected: fiscal period LOCKED (INV-011)");
    const spec = buildG29Run({ runId: run.id, entryDate, currency, lines: run.lines, reference });
    const { entryId } = await this.post(spec);
    run.status = "POSTED";
    run.journalEntryId = entryId;
    await this.store.saveRun(run);
    return { run, entryId };
  }

  /** G-30 payout: partial leaves the exact remainder on SALARIES_PAYABLE; idempotent per run. */
  async payout(tenantId: string, runId: string, amount: string, entryDate: string, currency: string, cashPurpose: "CASH" | "BANK" = "BANK") {
    const run = await this.runOr404(tenantId, runId);
    if (run.status !== "POSTED") throw new PayrollRuleError("RUN_NOT_POSTED", "payout requires a POSTED run");
    const { entryId } = await this.post(buildG30Payout({ runId: run.id, entryDate, currency, amount, cashPurpose }));
    return { entryId, remainder: (Number(run.totals.net) - Number(amount)).toFixed(4) };
  }

  private async runOr404(tenantId: string, id: string): Promise<RunRow> {
    const run = await this.store.findRun(tenantId, id);
    if (!run) throw new RunNotFoundError(id);
    return run;
  }
}
