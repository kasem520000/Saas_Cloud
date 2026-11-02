/**
 * PHASE-023 T1/T2 — the submission orchestrator: drives the legal lifecycle
 * (domain/submission-lifecycle) through an EInvoicingAdapter, with registry
 * idempotency (one submission per (tenant, sourceType, sourceId) — duplicate
 * submission attempts dedupe, no double-clearance), retry per policy,
 * dead-letter after maxAttempts, circuit breaker degrading only the feature,
 * and an audit event on EVERY transition. Storage-agnostic (in-memory
 * reference for tests; the real store is tax.store).
 */

import {
  assertTransition,
  isDeadLetter,
  retryDelayMs,
  CircuitBreaker,
  type RetryPolicy,
  type SubmissionStatus,
  DEFAULT_SUBMISSION_RETRY,
} from "../domain/submission-lifecycle";
import type { EInvoicingAdapter, SubmissionOutcome, SubmissionPayload } from "../domain/adapter-port";

export interface SubmissionRecord {
  id: string;
  sourceType: string;
  sourceId: string;
  adapterId: string;
  status: SubmissionStatus;
  attempts: number;
  nextAttemptAt: number;
  authorityReference: string | null;
  payloadDigest: string | null;
  error: Record<string, unknown> | null;
  deadLettered: boolean;
}

export interface SubmissionStore {
  findBySource(sourceType: string, sourceId: string): Promise<SubmissionRecord | undefined>;
  create(rec: Omit<SubmissionRecord, "status" | "attempts" | "nextAttemptAt" | "deadLettered">): Promise<SubmissionRecord>;
  update(id: string, patch: Partial<SubmissionRecord>): Promise<void>;
}

export interface AuditSink {
  record(event: { action: string; entityId: string; after: Record<string, unknown> }): Promise<void> | void;
}

export class SubmissionOrchestrator {
  private readonly breaker: CircuitBreaker;

  constructor(
    private readonly adapter: EInvoicingAdapter,
    private readonly store: SubmissionStore,
    private readonly audit: AuditSink,
    private readonly retry: RetryPolicy = DEFAULT_SUBMISSION_RETRY,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.breaker = new CircuitBreaker(5, 10 * 60_000, this.now);
  }

  /** Registry idempotency: one submission per source document ever. */
  async ensureRegistered(sourceType: string, sourceId: string, payloadDigest: string | null): Promise<SubmissionRecord> {
    const existing = await this.store.findBySource(sourceType, sourceId);
    if (existing !== undefined) return existing; // duplicate push → same registry row, no double submission
    return this.store.create({ id: `sub-${sourceType}-${sourceId}`, sourceType, sourceId, adapterId: this.adapter.id, authorityReference: null, payloadDigest, error: null });
  }

  private async transition(rec: SubmissionRecord, to: SubmissionStatus, patch: Partial<SubmissionRecord> = {}): Promise<void> {
    assertTransition(rec.status, to);
    await this.store.update(rec.id, { status: to, ...patch });
    await this.audit.record({
      action: `einvoice.submission.${to.toLowerCase()}`,
      entityId: rec.id,
      after: { from: rec.status, to, adapterId: rec.adapterId },
    });
  }

  /** One submit attempt: GENERATED → SUBMITTED → ACCEPTED/REJECTED/FAILED. */
  async runOnce(rec: SubmissionRecord, payload: SubmissionPayload): Promise<SubmissionRecord> {
    if (rec.deadLettered) return rec;
    if (this.breaker.isOpen) return rec; // feature degraded, platform unaffected
    let status = rec.status;
    if (status === "PENDING") {
      await this.transition(rec, "GENERATED", { payloadDigest: rec.payloadDigest });
      status = "GENERATED";
    }
    if (status === "GENERATED") {
      await this.transition({ ...rec, status }, "SUBMITTED");
      status = "SUBMITTED";
    }
    const outcome: SubmissionOutcome = await this.adapter.submit(payload);
    if (outcome.status === "ACCEPTED") {
      this.breaker.recordSuccess();
      await this.transition({ ...rec, status }, "ACCEPTED", { authorityReference: outcome.authorityReference, error: null });
    } else if (outcome.status === "REJECTED") {
      this.breaker.recordSuccess(); // authority answered — not an outage
      await this.transition({ ...rec, status }, "REJECTED", { error: outcome.error });
    } else {
      this.breaker.recordFailure();
      const attempts = rec.attempts + 1;
      if (isDeadLetter(attempts, this.retry)) {
        await this.store.update(rec.id, { deadLettered: true, attempts });
        await this.audit.record({ action: "einvoice.submission.dead_letter", entityId: rec.id, after: { attempts } });
      } else {
        await this.store.update(rec.id, { status: "FAILED", attempts, nextAttemptAt: this.now() + retryDelayMs(attempts, this.retry), error: outcome.error });
        await this.audit.record({ action: "einvoice.submission.failed", entityId: rec.id, after: { attempts, retryInMs: retryDelayMs(attempts, this.retry) } });
      }
    }
    return (await this.store.findBySource(rec.sourceType, rec.sourceId)) ?? rec;
  }
}
