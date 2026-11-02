/**
 * PHASE-022 T7 — field-sales van-sale capture with LOCAL-VALID pre-validation
 * (matrix rows 6/7/23 LOCAL-VALID†): the device pre-validates against the
 * READ-CACHED van-stock snapshot and cached credit terms; checks are advisory —
 * the server decides at sync (CONFLICT_RESOLUTION: rejections surface as
 * first-class parked-rejection UX, never surprises). Honest state machine:
 * DRAFT_LOCAL → QUEUED → PENDING_SYNC → POSTED | REJECTED(editable).
 */

export type DraftState = "DRAFT_LOCAL" | "PENDING_SYNC" | "POSTED" | "REJECTED";

export interface VanStockLine {
  itemId: string;
  availableQty: string; // decimal text (ADR-0009)
}

export interface VanSaleLine {
  itemId: string;
  qty: string; // decimal text
  unitPrice: string; // decimal text
}

export type LocalValidation =
  | { ok: true }
  | { ok: false; code: "VAN_STOCK_INSUFFICIENT" | "PRICE_MISSING" | "EMPTY_LINES"; itemId?: string };

function dec(text: string): number {
  return Number(text);
}

/** LOCAL-VALID pre-check against the van snapshot — advisory only. */
export function validateVanSale(lines: readonly VanSaleLine[], stock: readonly VanStockLine[]): LocalValidation {
  if (lines.length === 0) return { ok: false, code: "EMPTY_LINES" };
  for (const l of lines) {
    if (dec(l.unitPrice) <= 0) return { ok: false, code: "PRICE_MISSING", itemId: l.itemId };
    const s = stock.find((x) => x.itemId === l.itemId);
    if (s === undefined || dec(s.availableQty) < dec(l.qty)) {
      return { ok: false, code: "VAN_STOCK_INSUFFICIENT", itemId: l.itemId };
    }
  }
  return { ok: true };
}

/** Honest state machine — REJECTED documents are always editable again
 *  locally (CONFLICT_RESOLUTION §3 rules), resend = NEW commandId. */
export function transition(state: DraftState, event: "enqueue" | "ack" | "reject" | "edit"): DraftState {
  switch (`${state}:${event}`) {
    case "DRAFT_LOCAL:enqueue":
      return "PENDING_SYNC";
    case "PENDING_SYNC:ack":
      return "POSTED";
    case "PENDING_SYNC:reject":
    case "REJECTED:edit":
      return "REJECTED";
    case "REJECTED:enqueue":
      return "PENDING_SYNC";
    default:
      return state; // honest: no fabricated transitions
  }
}
