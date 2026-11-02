/**
 * PHASE-019 T2 — lead pipeline state machine (pure).
 * NEW → QUALIFIED → CONVERTED / LOST(with reason). A CONVERTED lead is
 * immutable and links its partner forever (audit-clean provenance).
 */

export type LeadStatus = "NEW" | "QUALIFIED" | "CONVERTED" | "LOST";

export type LeadEvent = "QUALIFY" | "CONVERT" | "LOSE" | "REOPEN";

const TRANSITIONS: Record<LeadStatus, Partial<Record<LeadEvent, LeadStatus>>> = {
  NEW: { QUALIFY: "QUALIFIED", CONVERT: "CONVERTED", LOSE: "LOST" },
  QUALIFIED: { CONVERT: "CONVERTED", LOSE: "LOST" },
  CONVERTED: {}, // immutable
  LOST: { REOPEN: "NEW" },
};

export class LeadTransitionError extends Error {
  readonly code = "ILLEGAL_LEAD_TRANSITION";
  constructor(
    readonly from: LeadStatus,
    readonly event: LeadEvent,
  ) {
    super(`lead cannot ${event} from ${from}`);
    this.name = "LeadTransitionError";
  }
}

export class LeadConvertedImmutableError extends Error {
  readonly code = "LEAD_CONVERTED_IMMUTABLE";
  constructor() {
    super("converted lead is immutable");
    this.name = "LeadConvertedImmutableError";
  }
}

export function transitionLead(status: LeadStatus, event: LeadEvent, lostReason?: string): LeadStatus {
  if (status === "CONVERTED") throw new LeadConvertedImmutableError();
  if (event === "LOSE" && (lostReason === undefined || lostReason.trim() === "")) {
    throw new LeadTransitionError(status, event);
  }
  const next = TRANSITIONS[status][event];
  if (next === undefined) throw new LeadTransitionError(status, event);
  return next;
}
