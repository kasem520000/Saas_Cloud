/**
 * PHASE-027 T12 — RC-11: notes register ↔ GL tie (RECONCILIATION notes
 * subledger row). Σ open received-note balances = NOTES_RECEIVABLE balance;
 * issued mirror on NOTES_PAYABLE. Pure + unit-tested; wired into
 * ReconciliationService (BROKEN blocks period LOCK, PC-04).
 */
import { Decimal } from "@erp/domain-core";

export interface Rc11Input {
  openReceivedSum: string; // Σ amount of RECEIVED notes not COLLECTED/DISHONORED/DISCOUNTED/RETURNED
  openIssuedSum: string; // Σ amount of ISSUED notes not yet paid/returned
  glNotesReceivable: string;
  glNotesPayable: string;
}

export type Rc11Result =
  | { state: "OK" }
  | { state: "BROKEN"; receivableDiff: string; payableDiff: string };

export function rc11Check(input: Rc11Input): Rc11Result {
  const receivableDiff = new Decimal(input.openReceivedSum).minus(input.glNotesReceivable).toFixed(4);
  const payableDiff = new Decimal(input.openIssuedSum).minus(input.glNotesPayable).toFixed(4);
  if (receivableDiff === "0.0000" && payableDiff === "0.0000") return { state: "OK" };
  return { state: "BROKEN", receivableDiff, payableDiff };
}
