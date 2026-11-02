/**
 * PHASE-026 T5 — purchasing capitalization hook: a GRN line flagged
 * capital-expense routes its debit to the category's FIXED_ASSET account
 * instead of inventory (DR FIXED_ASSET · CR GRNI); the supplier invoice then
 * completes the chain (GRNI → AP_CONTROL, VAT recoverable per PHASE-009).
 * Pure mapping + unit-tested; the purchasing module calls this extension
 * point at GRN posting time.
 */
import type { JournalLineSpec } from "../../accounting/domain/posting-engine/journal-spec";

export interface GrnLineInput {
  lineId: string;
  amount: string; // net, canonical decimal string
  capitalExpense: boolean;
  categoryPurpose?: string; // FIXED_ASSET purpose key of the bound category
}

/** Debit line for a GRN line: FIXED_ASSET when capital-expense, else INVENTORY. */
export function grnDebitLine(line: GrnLineInput): JournalLineSpec {
  if (!line.capitalExpense) return { purpose: "INVENTORY", direction: "DEBIT", amount: line.amount };
  if (!line.categoryPurpose) throw new Error("capital-expense GRN line requires categoryPurpose (BR-041)");
  return { purpose: line.categoryPurpose, direction: "DEBIT", amount: line.amount };
}

/** Bind the asset to its source documents (PO/GRN/invoice refs). */
export function bindAssetRefs(input: { poId?: string; grnId: string; invoiceId?: string }) {
  return { sourceType: "grn", sourceId: input.grnId, refs: { poId: input.poId ?? null, grnId: input.grnId, invoiceId: input.invoiceId ?? null } };
}
