/**
 * PHASE-017 T3 — job-card domain state machine (pure, no I/O).
 * Lifecycle per the automotive template: DRAFT → IN_PROGRESS → COMPLETED →
 * INVOICED, plus CANCELLED (audited, no ledger). Guards:
 * - no ledger effect before INVOICED (check-in/diagnosis/quote are planning);
 * - CANCELLED allowed only before any parts consumption (IN_PROGRESS blocks it
 *   once parts are reserved/issued — the reservation is released instead);
 * - invoicing requires COMPLETED (parts + labor finalized).
 */

export type JobCardStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "INVOICED" | "CANCELLED";
export type JobCardIssueMode = "reserve" | "issue_immediate";

export const JOB_CARD_TRANSITIONS: Readonly<Record<JobCardStatus, readonly JobCardStatus[]>> = {
  DRAFT: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["INVOICED"],
  INVOICED: [],
  CANCELLED: [],
};

export class JobCardStateError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function canTransition(from: JobCardStatus, to: JobCardStatus): boolean {
  return JOB_CARD_TRANSITIONS[from].includes(to);
}

/**
 * @param partsConsumed true once parts are reserved (reserve mode) or issued
 *   (issue_immediate mode) — cancellation after consumption is rejected; the
 *   hold is released and the card moves on instead.
 */
export function assertTransition(
  from: JobCardStatus,
  to: JobCardStatus,
  opts: { partsConsumed: boolean } = { partsConsumed: false },
): void {
  if (!canTransition(from, to)) {
    throw new JobCardStateError(
      "JOB_CARD_ILLEGAL_TRANSITION",
      `job card cannot move ${from} → ${to}`,
    );
  }
  if (to === "CANCELLED" && opts.partsConsumed) {
    throw new JobCardStateError(
      "JOB_CARD_CANCEL_AFTER_CONSUMPTION",
      "job card with consumed parts cannot be cancelled — release the hold and correct via credit note",
    );
  }
}

/** Posting guard: only a COMPLETED card may be invoiced. */
export function assertInvoiceable(status: JobCardStatus): void {
  if (status !== "COMPLETED") {
    throw new JobCardStateError(
      "JOB_CARD_NOT_COMPLETED",
      `job card in ${status} cannot be invoiced — complete it first (no ledger before INVOICED)`,
    );
  }
}
