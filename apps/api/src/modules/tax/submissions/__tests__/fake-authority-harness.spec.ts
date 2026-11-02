/**
 * PHASE-023 T11 — fake-authority harness scenario matrix: submit → ACCEPT
 * (uuid stored) / REJECT (codes surfaced) / TIMEOUT → retry per policy →
 * dead-letter + alert. Runs against the orchestrator with a scripted fake
 * authority — the same harness pattern the real ZATCA/ETA adapters will use
 * once the verification gate passes.
 */
import { describe, expect, it } from "vitest";
import { SubmissionOrchestrator, type SubmissionRecord, type SubmissionStore } from "../submission-orchestrator";
import type { EInvoicingAdapter, SubmissionOutcome, SubmissionPayload } from "../../domain/adapter-port";

class MemStore implements SubmissionStore {
  rows = new Map<string, SubmissionRecord>();
  async findBySource(sourceType: string, sourceId: string) {
    return [...this.rows.values()].find((r) => r.sourceType === sourceType && r.sourceId === sourceId);
  }
  async create(rec: Omit<SubmissionRecord, "status" | "attempts" | "nextAttemptAt" | "deadLettered">) {
    const full: SubmissionRecord = { ...rec, status: "PENDING", attempts: 0, nextAttemptAt: 0, deadLettered: false };
    this.rows.set(full.id, full);
    return full;
  }
  async update(id: string, patch: Partial<SubmissionRecord>) {
    const r = this.rows.get(id);
    if (r) this.rows.set(id, { ...r, ...patch });
  }
}

class FakeAuthority implements EInvoicingAdapter {
  readonly id = "fake-zatca";
  readonly supportedCountries = ["SA"];
  readonly regimeVerified = true; // the FAKE is verified by definition — real adapters are not
  constructor(private readonly script: SubmissionOutcome[]) {}
  async submit(): Promise<SubmissionOutcome> {
    const next = this.script.shift();
    if (next === undefined) throw new Error("fake authority script exhausted");
    return next;
  }
}

const payload: SubmissionPayload = { countryCode: "SA", sourceType: "sales_invoice", sourceId: "doc-x", document: {} };
const ok: SubmissionOutcome = { status: "ACCEPTED", authorityReference: "UUID-1234", payloadDigest: "sha256:abc", error: null };
const reject: SubmissionOutcome = { status: "REJECTED", authorityReference: null, payloadDigest: null, error: { code: "E_INVOICE_INVALID", detail: "missing field" } };
const timeout: SubmissionOutcome = { status: "FAILED", authorityReference: null, payloadDigest: null, error: { code: "TIMEOUT" } };

describe("fake-authority scenario matrix", () => {
  it("ACCEPT: authority reference stored on the registry row", async () => {
    const store = new MemStore();
    const events: string[] = [];
    const orch = new SubmissionOrchestrator(new FakeAuthority([ok]), store, { record: (e) => void events.push(e.action) }, { baseMs: 1000, capMs: 5000, maxAttempts: 5 }, () => 1000);
    const rec = await orch.ensureRegistered("sales_invoice", "doc-x", null);
    const done = await orch.runOnce(rec, payload);
    expect(done.status).toBe("ACCEPTED");
    expect(done.authorityReference).toBe("UUID-1234");
  });

  it("REJECT: reason codes surfaced on the row for user action", async () => {
    const store = new MemStore();
    const orch = new SubmissionOrchestrator(new FakeAuthority([reject]), store, { record: () => {} }, { baseMs: 1000, capMs: 5000, maxAttempts: 5 }, () => 1000);
    const rec = await orch.ensureRegistered("sales_invoice", "doc-r", null);
    const done = await orch.runOnce(rec, payload);
    expect(done.status).toBe("REJECTED");
    expect(done.error?.code).toBe("E_INVOICE_INVALID");
  });

  it("TIMEOUT ×3 → FAILED with growing backoff → dead-letter + alert event", async () => {
    const store = new MemStore();
    const events: string[] = [];
    const orch = new SubmissionOrchestrator(new FakeAuthority([timeout, timeout, timeout]), store, { record: (e) => void events.push(e.action) }, { baseMs: 1000, capMs: 8000, maxAttempts: 3 }, () => 1000);
    let rec = await orch.ensureRegistered("sales_invoice", "doc-t", null);
    const delays: number[] = [];
    for (let i = 0; i < 3; i++) {
      rec = await orch.runOnce(rec, payload);
      if (rec.status === "FAILED" && !rec.deadLettered) {
        delays.push(rec.nextAttemptAt - 1000);
        await store.update(rec.id, { status: "PENDING" }); // retry path
        rec = (await store.findBySource("sales_invoice", "doc-t"))!;
      }
    }
    expect(rec.deadLettered).toBe(true);
    expect(delays).toEqual([1000, 2000]); // exponential backoff honored
    expect(events).toContain("einvoice.submission.dead_letter");
  });
});
