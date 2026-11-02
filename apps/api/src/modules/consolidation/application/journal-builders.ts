/**
 * PHASE-034 — pure JournalSpec builders for G-32 (ADR-0007: consolidation
 * never touches GL tables; the engine is the only writer). Canonical decimal
 * strings (ADR-0009).
 *
 * G-32 (JOURNAL_RULES §7): consolidation elimination of intercompany AR/AP —
 * posted ONLY in the parent/owner tenant's consolidation books:
 *   DR INTERCOMPANY_AP (entity B intercompany) · CR INTERCOMPANY_AR (entity A)
 * source_type CONSOLIDATION_ELIMINATION; reversal-only by counter-entry
 * (BR-056) — buildG32Reversal mirrors every line.
 */
import type { JournalLineSpec, JournalSpec } from "../../accounting/domain/posting-engine/journal-spec";

export interface EliminationLeg {
  memberTenantId: string;
  purpose: "INTERCOMPANY_AR" | "INTERCOMPANY_AP" | "INVESTMENT_EQUITY";
  direction: "DEBIT" | "CREDIT";
  amount: string;
  memo?: string;
}

/** G-32: one balanced elimination journal in the owner's books. */
export function buildG32Elimination(input: {
  eliminationId: string;
  entryDate: string;
  currency: string;
  description: string;
  legs: readonly EliminationLeg[];
}): JournalSpec {
  const lines: JournalLineSpec[] = input.legs.map((leg) => ({
    purpose: leg.purpose,
    direction: leg.direction,
    amount: leg.amount,
    memo: { en: leg.memo ?? `member ${leg.memberTenantId}`, ar: leg.memo },
  }));
  return {
    source: { docType: "consolidation_elimination", docId: input.eliminationId, operation: "post" },
    entryDate: input.entryDate,
    currency: input.currency,
    description: { en: input.description, ar: input.description },
    reference: `ELIM-${input.eliminationId.slice(0, 8).toUpperCase()}`,
    lines,
  };
}

/** BR-056: reversal-only counter-entry — every leg mirrored. */
export function buildG32Reversal(input: {
  eliminationId: string;
  entryDate: string;
  currency: string;
  legs: readonly EliminationLeg[];
}): JournalSpec {
  const lines: JournalLineSpec[] = input.legs.map((leg) => ({
    purpose: leg.purpose,
    direction: leg.direction === "DEBIT" ? "CREDIT" : "DEBIT",
    amount: leg.amount,
    memo: { en: `Reversal of elimination ${input.eliminationId}`, ar: `عكس قيد Elimination` },
  }));
  return {
    source: { docType: "consolidation_elimination", docId: input.eliminationId, operation: "reverse" },
    entryDate: input.entryDate,
    currency: input.currency,
    description: { en: "Elimination reversal (counter-entry, BR-056)" },
    lines,
  };
}
