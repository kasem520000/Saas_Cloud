/**
 * PHASE-018 T2 — production order state machine (pure).
 * DOCUMENT_LIFECYCLE §3: DRAFT → RELEASED → IN_PROGRESS → COMPLETED, with
 * CANCELLED allowed only before any consumption. Consumption/completion are
 * incremental inside IN_PROGRESS. No ledger before release.
 */

export type ProductionOrderStatus =
  | "DRAFT"
  | "RELEASED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type ProductionOrderEvent =
  | "RELEASE"
  | "START"
  | "CONSUME"
  | "COMPLETE"
  | "CANCEL";

const TRANSITIONS: Record<ProductionOrderStatus, Partial<Record<ProductionOrderEvent, ProductionOrderStatus>>> = {
  DRAFT: { RELEASE: "RELEASED", CANCEL: "CANCELLED" },
  RELEASED: { START: "IN_PROGRESS", CONSUME: "IN_PROGRESS", CANCEL: "CANCELLED" },
  IN_PROGRESS: { CONSUME: "IN_PROGRESS", COMPLETE: "COMPLETED", CANCEL: "CANCELLED" },
  COMPLETED: {},
  CANCELLED: {},
};

export class IllegalTransitionError extends Error {
  readonly code = "ILLEGAL_TRANSITION";
  constructor(
    readonly from: ProductionOrderStatus,
    readonly event: ProductionOrderEvent,
  ) {
    super(`production order cannot ${event} from ${from}`);
    this.name = "IllegalTransitionError";
  }
}

export class CancelAfterConsumptionError extends Error {
  readonly code = "CANCEL_AFTER_CONSUMPTION";
  constructor() {
    super("production order cannot be cancelled after any consumption");
    this.name = "CancelAfterConsumptionError";
  }
}

export function transition(
  status: ProductionOrderStatus,
  event: ProductionOrderEvent,
  consumedQty = "0",
): ProductionOrderStatus {
  if (event === "CANCEL" && Number(consumedQty) > 0) {
    throw new CancelAfterConsumptionError();
  }
  const next = TRANSITIONS[status][event];
  if (next === undefined) throw new IllegalTransitionError(status, event);
  return next;
}

/** The BOM version is bound at release and never re-resolved afterwards. */
export function bindBomVersionAtRelease<T>(releasedVersion: T, _currentVersion: T): T {
  return releasedVersion;
}
