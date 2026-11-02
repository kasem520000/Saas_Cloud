/**
 * PHASE-023 T1 — the submission registry lifecycle as a LEGAL state machine
 * (E_INVOICING_ARCHITECTURE §2/§6): PENDING → GENERATED → SIGNED → SUBMITTED →
 * ACCEPTED / REJECTED → REPORTED, plus FAILED → PENDING (retry) and
 * REJECTED → PENDING (user action + resubmit). Illegal transitions throw —
 * the registry status is the sole source of authority truth and is never
 * inferred from local state.
 */

export type SubmissionStatus =
  | "PENDING"
  | "GENERATED"
  | "SIGNED"
  | "SUBMITTED"
  | "ACCEPTED"
  | "REJECTED"
  | "REPORTED"
  | "FAILED";

const LEGAL: Record<SubmissionStatus, readonly SubmissionStatus[]> = {
  PENDING: ["GENERATED", "FAILED"],
  GENERATED: ["SIGNED", "SUBMITTED", "FAILED"], // SIGNED optional where not applicable
  SIGNED: ["SUBMITTED", "FAILED"],
  SUBMITTED: ["ACCEPTED", "REJECTED", "FAILED"],
  ACCEPTED: ["REPORTED"],
  REJECTED: ["PENDING"], // resubmit after user action (CONFLICT_RESOLUTION-style UX)
  REPORTED: [],
  FAILED: ["PENDING"], // retry
};

export function canTransition(from: SubmissionStatus, to: SubmissionStatus): boolean {
  return (LEGAL[from] as readonly string[]).includes(to);
}

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: SubmissionStatus,
    readonly to: SubmissionStatus,
  ) {
    super(`illegal submission transition ${from} → ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function assertTransition(from: SubmissionStatus, to: SubmissionStatus): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

/** Retry policy: exponential with cap (SYNC-style jitter lives in sync-core;
 *  here the policy is deterministic and unit-testable). */
export interface RetryPolicy {
  baseMs: number;
  capMs: number;
  maxAttempts: number;
}

export const DEFAULT_SUBMISSION_RETRY: RetryPolicy = { baseMs: 60_000, capMs: 30 * 60_000, maxAttempts: 5 };

export function retryDelayMs(attempt: number, policy: RetryPolicy = DEFAULT_SUBMISSION_RETRY): number {
  return Math.min(policy.capMs, policy.baseMs * 2 ** Math.max(0, attempt - 1));
}

/** After maxAttempts consecutive failures the submission dead-letters. */
export function isDeadLetter(attempts: number, policy: RetryPolicy = DEFAULT_SUBMISSION_RETRY): boolean {
  return attempts >= policy.maxAttempts;
}

/** Circuit breaker: consecutive adapter failures trip it — the FEATURE
 *  degrades (submissions pause), never the platform. */
export class CircuitBreaker {
  private consecutiveFailures = 0;
  private openUntil = 0;
  constructor(
    private readonly threshold: number,
    private readonly openMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  get isOpen(): boolean {
    return this.now() < this.openUntil;
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openUntil = 0;
  }

  recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.threshold) {
      this.openUntil = this.now() + this.openMs;
      this.consecutiveFailures = 0;
    }
  }
}
