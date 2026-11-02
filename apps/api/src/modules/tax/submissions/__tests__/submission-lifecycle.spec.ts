/**
 * PHASE-023 T1/T2/T4/T11 — lifecycle legality, orchestrator idempotency +
 * retry/DLQ/circuit-breaker, and the UNVERIFIED ZATCA stub refusal.
 */
import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  IllegalTransitionError,
  isDeadLetter,
  retryDelayMs,
  CircuitBreaker,
  DEFAULT_SUBMISSION_RETRY,
} from "../../domain/submission-lifecycle";
import { SubmissionOrchestrator, type SubmissionRecord, type SubmissionStore } from "../submission-orchestrator";
import { UnverifiedZatcaAdapter } from "../../adapters/zatca/unverified-zatca-adapter";
import type { EInvoicingAdapter, SubmissionOutcome, SubmissionPayload } from "../../domain/adapter-port";

describe("submission lifecycle legality", () => {
  it("allows exactly the legal transitions", () => {
    expect(canTransition("PENDING", "GENERATED")).toBe(true);
    expect(canTransition("GENERATED", "SUBMITTED")).toBe(true);
    expect(canTransition("SUBMITTED", "ACCEPTED")).toBe(true);
    expect(canTransition("SUBMITTED", "REJECTED")).toBe(true);
    expect(canTransition("ACCEPTED", "REPORTED")).toBe(true);
    expect(canTransition("REJECTED", "PENDING")).toBe(true);
    expect(canTransition("FAILED", "PENDING")).toBe(true);
    expect(canTransition("PENDING", "ACCEPTED")).toBe(false);
    expect(canTransition("REPORTED", "PENDING")).toBe(false);
    expect(canTransition("ACCEPTED", "REJECTED")).toBe(false);
    expect(() => assertTransition("PENDING", "ACCEPTED")).toThrow(IllegalTransitionError);
  });

  it("retry: exponential capped, dead-letter at maxAttempts", () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(2)).toBe(120_000);
    expect(retryDelayMs(99)).toBe(DEFAULT_SUBMISSION_RETRY.capMs);
    expect(isDeadLetter(5)).toBe(true);
    expect(isDeadLetter(4)).toBe(false);
  });

  it("circuit breaker trips after threshold and degrades only the feature", () => {
    let now = 0;
    const cb = new CircuitBreaker(3, 60_000, () => now);
    expect(cb.isOpen).toBe(false);
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen).toBe(false);
    cb.recordFailure();
    expect(cb.isOpen).toBe(true);
    now = 61_000;
    expect(cb.isOpen).toBe(false);
    cb.recordSuccess();
    expect(cb.isOpen).toBe(false);
  });
});

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

const payload: SubmissionPayload = { countryCode: "SA", sourceType: "sales_invoice", sourceId: "doc-1", document: { total: "100.00" } };

class ScriptedAdapter implements EInvoicingAdapter {
  readonly id = "scripted";
  readonly supportedCountries = ["SA"];
  readonly regimeVerified = true;
  constructor(private readonly outcomes: SubmissionOutcome[]) {}
  async submit(): Promise<SubmissionOutcome> {
    return this.outcomes.shift() ?? { status: "ACCEPTED", authorityReference: "AUTH-1", payloadDigest: null, error: null };
  }
}

describe("SubmissionOrchestrator", () => {
  it("registry idempotency: duplicate ensureRegistered returns the SAME row (no double submission)", async () => {
    const store = new MemStore();
    const audit = { events: [] as string[], record(e: { action: string }) { this.events.push(e.action); } };
    const orch = new SubmissionOrchestrator(new ScriptedAdapter([]), store, audit, DEFAULT_SUBMISSION_RETRY, () => 1000);
    const a = await orch.ensureRegistered("sales_invoice", "doc-1", "sha:1");
    const b = await orch.ensureRegistered("sales_invoice", "doc-1", "sha:1");
    expect(a.id).toBe(b.id);
    expect(store.rows.size).toBe(1);
  });

  it("happy path walks GENERATED→SUBMITTED→ACCEPTED with audit on every transition", async () => {
    const store = new MemStore();
    const events: string[] = [];
    const audit = { record(e: { action: string }) { events.push(e.action); } };
    const orch = new SubmissionOrchestrator(new ScriptedAdapter([{ status: "ACCEPTED", authorityReference: "ZATCA-UUID-1", payloadDigest: null, error: null }]), store, audit, DEFAULT_SUBMISSION_RETRY, () => 1000);
    const rec = await orch.ensureRegistered("sales_invoice", "doc-9", null);
    const done = await orch.runOnce(rec, payload);
    expect(done.status).toBe("ACCEPTED");
    expect(done.authorityReference).toBe("ZATCA-UUID-1");
    expect(events).toEqual(["einvoice.submission.generated", "einvoice.submission.submitted", "einvoice.submission.accepted"]);
  });

  it("failure path: FAILED with backoff, then dead-letter after maxAttempts", async () => {
    const store = new MemStore();
    const events: string[] = [];
    const audit = { record(e: { action: string }) { events.push(e.action); } };
    const fail: SubmissionOutcome = { status: "FAILED", authorityReference: null, payloadDigest: null, error: { code: "TIMEOUT" } };
    const orch = new SubmissionOrchestrator(new ScriptedAdapter(Array.from({ length: 9 }, () => fail)), store, audit, { baseMs: 1000, capMs: 5000, maxAttempts: 3 }, () => 1000);
    let rec = await orch.ensureRegistered("sales_invoice", "doc-dlq", null);
    for (let i = 0; i < 3; i++) {
      rec = await orch.runOnce({ ...rec, status: rec.status === "FAILED" ? "PENDING" : rec.status }, payload);
      if (rec.status === "FAILED") {
        // retry path: FAILED → PENDING then run again
        await store.update(rec.id, { status: "PENDING" });
        rec = (await store.findBySource("sales_invoice", "doc-dlq"))!;
      }
    }
    expect(rec.deadLettered).toBe(true);
    expect(events).toContain("einvoice.submission.dead_letter");
  });
});

describe("UNVERIFIED ZATCA stub (gated path — DR-001 OPEN, gate unpassed)", () => {
  it("refuses every submission with UNVERIFIED_REGIME and never an authority reference", async () => {
    const adapter = new UnverifiedZatcaAdapter();
    expect(adapter.regimeVerified).toBe(false);
    const out = await adapter.submit(payload);
    expect(out.status).toBe("FAILED");
    expect(out.authorityReference).toBeNull();
    expect(out.error?.code).toBe("UNVERIFIED_REGIME");
  });
});
