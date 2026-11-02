import { describe, expect, it } from "vitest";
import { PayrollRunService, RunNotFoundError, type PayrollStore, type RunRow } from "../application/run-service";
import { isBalanced } from "../application/journal-builders";
import type { JournalSpec } from "../../../modules/accounting/domain/posting-engine/journal-spec";

function harness() {
  const runs = new Map<string, RunRow>();
  const posted: JournalSpec[] = [];
  const store: PayrollStore = {
    findRun: async (_t, id) => runs.get(id),
    saveRun: async (r) => { runs.set(r.id, r); },
    periodStatus: async () => "OPEN",
  };
  const post = async (spec: JournalSpec) => { posted.push(spec); return { entryId: `je-${posted.length}` }; };
  const run: RunRow = {
    id: "run-1", tenantId: "t1", fiscalPeriodId: "fp-1", status: "DRAFT", createdBy: "u1",
    totals: { gross: "10000.0000", deductions: "1500.0000", net: "8500.0000" },
    lines: [{ gross: "10000.0000", deductions: "1500.0000", net: "8500.0000", employer: "1000.0000", eosAccrual: "800.0000", thirdPartyDeductions: "1000.0000", loanDeduction: "500.0000", costCenterId: "cc-1" }],
    journalEntryId: null,
  };
  runs.set(run.id, run);
  return { svc: new PayrollRunService(store, post), runs, posted, store, run };
}

describe("PHASE-029 run lifecycle flows", () => {
  it("submit → approve+post (SoD): self-approve blocked; G-29 posted balanced once", async () => {
    const { svc, run, posted } = harness();
    await svc.submit("t1", "run-1", "u1");
    await expect(svc.approveAndPost("t1", "run-1", "u1", "2026-11-30", "YER")).rejects.toMatchObject({ code: "SOD_VIOLATION" });
    const { entryId } = await svc.approveAndPost("t1", "run-1", "u2", "2026-11-30", "YER", "PR-2026-11");
    expect(entryId).toBe("je-1");
    expect(run.status).toBe("POSTED");
    expect(isBalanced(posted[0]!)).toBe(true);
    expect(posted[0]!.reference).toBe("PR-2026-11");
    await expect(svc.approveAndPost("t1", "run-1", "u2", "2026-11-30", "YER")).rejects.toMatchObject({ code: "INVALID_RUN_TRANSITION" });
  });

  it("PERIOD_LOCKED blocks posting", async () => {
    const { svc, store } = harness();
    await svc.submit("t1", "run-1", "u1");
    store.periodStatus = async () => "LOCKED";
    await expect(svc.approveAndPost("t1", "run-1", "u2", "2026-11-30", "YER")).rejects.toMatchObject({ code: "PERIOD_LOCKED" });
  });

  it("G-30 payout: full → remainder zero; partial → exact remainder; unposted run rejected; foreign run → 404", async () => {
    const { svc } = harness();
    await svc.submit("t1", "run-1", "u1");
    await expect(svc.payout("t1", "run-1", "8500.0000", "2026-12-05", "YER")).rejects.toMatchObject({ code: "RUN_NOT_POSTED" });
    await svc.approveAndPost("t1", "run-1", "u2", "2026-11-30", "YER");
    const full = await svc.payout("t1", "run-1", "8500.0000", "2026-12-05", "YER");
    expect(full.remainder).toBe("0.0000");
    const partial = await svc.payout("t1", "run-1", "3500.0000", "2026-12-06", "YER");
    expect(partial.remainder).toBe("5000.0000");
    await expect(svc.payout("t1", "run-foreign", "1", "2026-12-06", "YER")).rejects.toBeInstanceOf(RunNotFoundError);
  });
});
