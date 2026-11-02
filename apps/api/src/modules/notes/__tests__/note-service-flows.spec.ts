import { describe, expect, it } from "vitest";
import { NotesService, NoteNotFoundError, type NoteRow, type NotesStore, type NoteEventRow } from "../application/note-service";
import { InstallmentsService, type PlansStore, type PlanRow, type PlanLineRow } from "../../installments/application/plan-service";
import { isBalanced } from "../application/journal-builders";
import type { JournalSpec } from "../../../modules/accounting/domain/posting-engine/journal-spec";

function notesHarness() {
  const notes = new Map<string, NoteRow>();
  const events: NoteEventRow[] = [];
  const posted: JournalSpec[] = [];
  const store: NotesStore = {
    findNote: async (_t, id) => notes.get(id),
    findPartner: async () => ({ id: "p1" }),
    findSourceDoc: async (_t, _ty, id) => (id === "inv-1" ? { id } : undefined),
    saveNote: async (n) => { notes.set(n.id, n); },
    appendEvent: async (e) => { events.push(e); },
    events: async (noteId) => events.filter((e) => e.noteId === noteId),
  };
  const post = async (spec: JournalSpec) => { posted.push(spec); return { entryId: `je-${posted.length}` }; };
  return { svc: new NotesService(store, post), notes, events, posted };
}

const baseNote = {
  kind: "CHEQUE" as const, number: "CH-100", partnerId: "p1", maturityDate: "2026-12-02",
  amount: "1000.0000", currency: "YER", issueDate: "2026-11-02", sourceType: "sales_invoice", sourceId: "inv-1",
};

describe("PHASE-027 note lifecycle flows", () => {
  it("G-24 receive against invoice posts balanced journal; custody IN_CUSTODY; foreign source → 404 zero partial", async () => {
    const { svc, posted, notes } = notesHarness();
    const { note, entryId } = await svc.receive("t1", { ...baseNote, entryDate: "2026-11-02" });
    expect(note.status).toBe("IN_CUSTODY");
    expect(entryId).toBe("je-1");
    expect(isBalanced(posted[0]!)).toBe(true);
    await expect(svc.receive("t1", { ...baseNote, number: "CH-101", sourceId: "inv-foreign", entryDate: "2026-11-02" }))
      .rejects.toBeInstanceOf(NoteNotFoundError);
    expect(notes.size).toBe(1);
  });

  it("DEPOSIT then COLLECT (G-25): deposit posts NO journal; collect posts DR CASH · CR NOTES_RECEIVABLE", async () => {
    const { svc, posted, notes } = notesHarness();
    await svc.receive("t1", { ...baseNote, entryDate: "2026-11-02" });
    const d = await svc.applyEvent("t1", "note-CH-100", "DEPOSIT", { entryDate: "2026-11-05" });
    expect(d.journalPosted).toBe(false);
    expect(notes.get("note-CH-100")!.status).toBe("DEPOSITED");
    const c = await svc.applyEvent("t1", "note-CH-100", "COLLECT", { entryDate: "2026-12-02" });
    expect(c.journalPosted).toBe(true);
    expect(posted.at(-1)!.source.operation).toBe("collect");
    expect(isBalanced(posted.at(-1)!)).toBe(true);
    expect(notes.get("note-CH-100")!.status).toBe("COLLECTED");
    // COLLECT from terminal state rejected
    await expect(svc.applyEvent("t1", "note-CH-100", "COLLECT", { entryDate: "2026-12-03" }))
      .rejects.toMatchObject({ code: "INVALID_CUSTODY_TRANSITION" });
  });

  it("G-26 dishonor: reason required; restores AR exactly with fee leg; event carries journal id (INV-024)", async () => {
    const { svc, posted, events } = notesHarness();
    await svc.receive("t1", { ...baseNote, entryDate: "2026-11-02" });
    await expect(svc.applyEvent("t1", "note-CH-100", "DISHONOR", { entryDate: "2026-12-03", reason: "" }))
      .rejects.toMatchObject({ code: "DISHONOR_REASON_REQUIRED" });
    const r = await svc.applyEvent("t1", "note-CH-100", "DISHONOR", { entryDate: "2026-12-03", reason: "insufficient funds", fee: "25.0000" });
    expect(r.journalPosted).toBe(true);
    const spec = posted.at(-1)!;
    expect(isBalanced(spec)).toBe(true);
    expect(spec.lines).toContainEqual({ purpose: "AR_CONTROL", direction: "DEBIT", amount: "1000.0000", partnerId: "p1" });
    expect(events.at(-1)!.journalEntryId).toBe(r.entryId);
  });

  it("BR-047 endorse: custody moves, ZERO journal rows (ledger-delta test)", async () => {
    const { svc, posted } = notesHarness();
    await svc.receive("t1", { ...baseNote, entryDate: "2026-11-02" });
    const before = posted.length;
    const r = await svc.applyEvent("t1", "note-CH-100", "ENDORSE", { entryDate: "2026-11-10" });
    expect(r.journalPosted).toBe(false);
    expect(posted.length).toBe(before); // zero journal rows
  });

  it("G-27 issued pair: issue posts AP/NOTES_PAYABLE; paid leg posts NOTES_PAYABLE/CASH", async () => {
    const { svc, posted } = notesHarness();
    await svc.issue("t1", { ...baseNote, number: "PN-1", entryDate: "2026-11-02" });
    await svc.applyEvent("t1", "note-PN-1", "COLLECT", { entryDate: "2026-12-02", cashPurpose: "BANK" });
    expect(posted[0]!.source.operation).toBe("issue");
    expect(posted.at(-1)!.source.operation).toBe("pay");
    expect(isBalanced(posted.at(-1)!)).toBe(true);
  });
});

function plansHarness() {
  const plans = new Map<string, PlanRow>();
  const lines = new Map<string, PlanLineRow[]>();
  const posted: JournalSpec[] = [];
  const store: PlansStore = {
    findSourceDoc: async (_t, _ty, id) => (id === "inv-1" ? { total: "1000.0000" } : undefined),
    findPlan: async (_t, id) => plans.get(id),
    savePlan: async (p) => { plans.set(p.id, p); },
    saveLines: async (ls) => { lines.set(ls[0]!.planId, ls); },
    lines: async (planId) => lines.get(planId) ?? [],
    saveLine: async (l) => {
      const arr = lines.get(l.planId)!;
      lines.set(l.planId, arr.map((x) => (x.id === l.id ? l : x)));
    },
    listActivePlans: async () => [...plans.values()].filter((p) => p.status === "ACTIVE"),
  };
  const post = async (spec: JournalSpec) => { posted.push(spec); return { entryId: `je-${posted.length}` }; };
  return { svc: new InstallmentsService(store, post), plans, lines, posted };
}

const basePlan = {
  partnerId: "p1", sourceType: "sales_invoice", sourceId: "inv-1", totalAmount: "1000.0000",
  downPayment: "100.0000", count: 3, startDate: "2026-11-01", frequency: "MONTHLY" as const,
  lateFeePolicy: { rate: "0.02", cap: "50.0000", graceDays: 3 },
};

describe("PHASE-027 installment plan flows", () => {
  it("BR-048: total mismatch rejected; foreign source → 404; activate locks schedule", async () => {
    const { svc, plans } = plansHarness();
    await expect(svc.createPlan("t1", { ...basePlan, totalAmount: "999.0000" })).rejects.toMatchObject({ code: "PLAN_TOTAL_MISMATCH" });
    await expect(svc.createPlan("t1", { ...basePlan, sourceId: "inv-foreign" })).rejects.toBeInstanceOf(Error);
    const { plan } = await svc.createPlan("t1", basePlan);
    await svc.activate("t1", plan.id);
    expect(plans.get(plan.id)!.status).toBe("ACTIVE");
    await expect(svc.activate("t1", plan.id)).rejects.toMatchObject({ code: "SCHEDULE_IMMUTABLE" });
  });

  it("collections allocate to earliest unpaid line; INV-016 bounds on overpay", async () => {
    const { svc, lines } = plansHarness();
    const { plan } = await svc.createPlan("t1", basePlan);
    await svc.activate("t1", plan.id);
    await svc.collect("t1", plan.id, "400.0000", "rcpt-1");
    const ls = lines.get(plan.id)!;
    expect(ls[0]!.status).toBe("PAID");
    expect(ls[1]!.collected).toBe("66.6667");
    await expect(svc.collect("t1", plan.id, "5000.0000", "rcpt-2")).rejects.toMatchObject({ code: "INV016_BOUNDS" });
  });

  it("OVERDUE job-derived recompute; G-28 flat fee posts only on overdue lines with cap", async () => {
    const { svc, plans, posted } = plansHarness();
    const { plan } = await svc.createPlan("t1", basePlan);
    await svc.activate("t1", plan.id);
    const r = await svc.recomputeOverdue("t1", "2026-12-10"); // all 3 lines past due+grace
    expect(r.flipped).toBe(2); // L3 due 2027-01-01 is not yet past due+grace
    const fee = await svc.chargeLateFee("t1", plan.id, `${plan.id}-L1`, "2026-12-10");
    expect(fee.fee).toBe("6.6667"); // 2% of 333.3333
    expect(isBalanced(posted.at(-1)!)).toBe(true);
    expect(posted.at(-1)!.lines[1]).toMatchObject({ purpose: "LATE_FEE_INCOME", direction: "CREDIT" });
    // not overdue → rejected
    await expect(svc.chargeLateFee("t1", plan.id, `${plan.id}-L2`, "2026-11-02")).rejects.toMatchObject({ code: "NOT_OVERDUE" });
    expect(plans.size).toBe(1);
  });
});
