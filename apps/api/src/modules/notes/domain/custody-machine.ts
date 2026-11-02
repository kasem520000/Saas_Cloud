/**
 * PHASE-027 T2 — note custody state machine (DR-003). Legal transitions only;
 * RECLASSIFY is metadata-only (no journal, no custody change). INV-024: every
 * journal-bearing transition is mirrored 1:1 in note_events.
 */
export type NoteStatus =
  | "IN_CUSTODY"
  | "ENDORSED_OUT"
  | "DEPOSITED"
  | "COLLECTED"
  | "DISHONORED"
  | "DISCOUNTED"
  | "RETURNED";

export type NoteEventKind =
  | "ENDORSE"
  | "DEPOSIT"
  | "COLLECT"
  | "DISHONOR"
  | "DISCOUNT"
  | "RETURN"
  | "RECLASSIFY";

/** True when the transition posts a journal (INV-024 mirror requirement). */
export const JOURNAL_BEARING_EVENTS: ReadonlySet<NoteEventKind> = new Set([
  "COLLECT",
  "DISHONOR",
  "DISCOUNT",
  "RETURN",
]);

/** Events that never post a journal — custody only (BR-047). */
export const CUSTODY_ONLY_EVENTS: ReadonlySet<NoteEventKind> = new Set(["ENDORSE", "DEPOSIT", "RECLASSIFY"]);

const TRANSITIONS: Readonly<Record<NoteStatus, ReadonlySet<NoteEventKind>>> = {
  IN_CUSTODY: new Set(["ENDORSE", "DEPOSIT", "COLLECT", "DISHONOR", "DISCOUNT", "RETURN", "RECLASSIFY"]),
  ENDORSED_OUT: new Set(["COLLECT", "DISHONOR", "RETURN", "RECLASSIFY"]),
  DEPOSITED: new Set(["COLLECT", "DISHONOR", "RECLASSIFY"]),
  COLLECTED: new Set(["RECLASSIFY"]),
  DISHONORED: new Set(["RECLASSIFY"]),
  DISCOUNTED: new Set(["RECLASSIFY"]),
  RETURNED: new Set(["RECLASSIFY"]),
};

const EVENT_TARGET: Readonly<Record<NoteEventKind, NoteStatus>> = {
  ENDORSE: "ENDORSED_OUT",
  DEPOSIT: "DEPOSITED",
  COLLECT: "COLLECTED",
  DISHONOR: "DISHONORED",
  DISCOUNT: "DISCOUNTED",
  RETURN: "RETURNED",
  RECLASSIFY: "IN_CUSTODY", // no custody change; target unused
};

export class CustodyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CustodyError";
  }
}

/** Assert a transition is legal; returns the target status. */
export function transition(from: NoteStatus, event: NoteEventKind): NoteStatus {
  if (event === "RECLASSIFY") return from; // metadata-only, no custody change
  const allowed = TRANSITIONS[from];
  if (!allowed.has(event)) {
    throw new CustodyError(
      "INVALID_CUSTODY_TRANSITION",
      `note in ${from} cannot transition via ${event}`,
    );
  }
  return EVENT_TARGET[event];
}

/** BR-046: dishonor requires a reason. */
export function assertDishonorReason(reason: string | null | undefined): void {
  if (!reason || reason.trim().length === 0) {
    throw new CustodyError("DISHONOR_REASON_REQUIRED", "dishonor requires a reason (BR-046)");
  }
}
