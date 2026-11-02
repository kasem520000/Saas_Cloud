/**
 * PHASE-027 — pure JournalSpec builders for G-24…G-28 (ADR-0007: notes and
 * installments never touch GL tables). Canonical decimal strings (ADR-0009).
 */
import type { JournalLineSpec, JournalSpec } from "../../accounting/domain/posting-engine/journal-spec";

/** G-24: received note into custody settles AR open item.
 *  DR NOTES_RECEIVABLE · CR AR_CONTROL (partner line, INV-009). */
export function buildG24Receive(input: {
  noteId: string; entryDate: string; currency: string; amount: string; partnerId: string; reference?: string;
}): JournalSpec {
  return {
    source: { docType: "note", docId: input.noteId, operation: "receive" },
    entryDate: input.entryDate,
    reference: input.reference,
    currency: input.currency,
    description: { en: "Note received into custody" },
    lines: [
      { purpose: "NOTES_RECEIVABLE", direction: "DEBIT", amount: input.amount },
      { purpose: "AR_CONTROL", direction: "CREDIT", amount: input.amount, partnerId: input.partnerId },
    ],
  };
}

/** G-25: collection at maturity. DR CASH/BANK · CR NOTES_RECEIVABLE. */
export function buildG25Collect(input: {
  noteId: string; entryDate: string; currency: string; amount: string; cashPurpose: "CASH" | "BANK"; reference?: string;
}): JournalSpec {
  return {
    source: { docType: "note", docId: input.noteId, operation: "collect" },
    entryDate: input.entryDate,
    reference: input.reference,
    currency: input.currency,
    description: { en: "Note collected at maturity" },
    lines: [
      { purpose: input.cashPurpose, direction: "DEBIT", amount: input.amount },
      { purpose: "NOTES_RECEIVABLE", direction: "CREDIT", amount: input.amount },
    ],
  };
}

/** G-26: dishonor restores the AR open item EXACTLY (INV-024).
 *  DR AR_CONTROL · CR NOTES_RECEIVABLE; optional bank fee DR BANK_CHARGES · CR CASH. */
export function buildG26Dishonor(input: {
  noteId: string; entryDate: string; currency: string; amount: string; partnerId: string; fee?: string; reference?: string;
}): JournalSpec {
  const lines: JournalLineSpec[] = [
    { purpose: "AR_CONTROL", direction: "DEBIT", amount: input.amount, partnerId: input.partnerId },
    { purpose: "NOTES_RECEIVABLE", direction: "CREDIT", amount: input.amount },
  ];
  if (input.fee && Number(input.fee) > 0) {
    lines.push(
      { purpose: "BANK_CHARGES", direction: "DEBIT", amount: input.fee },
      { purpose: "CASH", direction: "CREDIT", amount: input.fee },
    );
  }
  return {
    source: { docType: "note", docId: input.noteId, operation: "dishonor" },
    entryDate: input.entryDate,
    reference: input.reference,
    currency: input.currency,
    description: { en: "Note dishonored — AR restored" },
    lines,
  };
}

/** G-27 issued-note pair. Leg 1 (issue): DR AP_CONTROL · CR NOTES_PAYABLE.
 *  Leg 2 (paid at maturity): DR NOTES_PAYABLE · CR CASH/BANK. */
export function buildG27Issue(input: {
  noteId: string; entryDate: string; currency: string; amount: string; partnerId: string; reference?: string;
}): JournalSpec {
  return {
    source: { docType: "note", docId: input.noteId, operation: "issue" },
    entryDate: input.entryDate,
    reference: input.reference,
    currency: input.currency,
    description: { en: "Note issued to supplier" },
    lines: [
      { purpose: "AP_CONTROL", direction: "DEBIT", amount: input.amount, partnerId: input.partnerId },
      { purpose: "NOTES_PAYABLE", direction: "CREDIT", amount: input.amount },
    ],
  };
}

export function buildG27Paid(input: {
  noteId: string; entryDate: string; currency: string; amount: string; cashPurpose: "CASH" | "BANK"; reference?: string;
}): JournalSpec {
  return {
    source: { docType: "note", docId: input.noteId, operation: "pay" },
    entryDate: input.entryDate,
    reference: input.reference,
    currency: input.currency,
    description: { en: "Issued note paid at maturity" },
    lines: [
      { purpose: "NOTES_PAYABLE", direction: "DEBIT", amount: input.amount },
      { purpose: input.cashPurpose, direction: "CREDIT", amount: input.amount },
    ],
  };
}

/** BR-047 discount: DR CASH (proceeds) · DR NOTES_DISCOUNT_EXPENSE (fee, explicit) ·
 *  CR NOTES_RECEIVABLE (full amount) — fee never netted silently. */
export function buildDiscount(input: {
  noteId: string; entryDate: string; currency: string; amount: string; proceeds: string; fee: string;
}): JournalSpec {
  return {
    source: { docType: "note", docId: input.noteId, operation: "discount" },
    entryDate: input.entryDate,
    currency: input.currency,
    description: { en: "Note discounted" },
    lines: [
      { purpose: "CASH", direction: "DEBIT", amount: input.proceeds },
      { purpose: "NOTES_DISCOUNT_EXPENSE", direction: "DEBIT", amount: input.fee },
      { purpose: "NOTES_RECEIVABLE", direction: "CREDIT", amount: input.amount },
    ],
  };
}

/** G-28: flat late fee (BR-049 — never interest, never compounding).
 *  DR AR_CONTROL · CR LATE_FEE_INCOME (partner line). */
export function buildG28LateFee(input: {
  planId: string; lineId: string; entryDate: string; currency: string; amount: string; partnerId: string;
}): JournalSpec {
  return {
    source: { docType: "installment_late_fee", docId: input.lineId, operation: "charge" },
    entryDate: input.entryDate,
    currency: input.currency,
    description: { en: `Flat late fee on installment plan ${input.planId}` },
    lines: [
      { purpose: "AR_CONTROL", direction: "DEBIT", amount: input.amount, partnerId: input.partnerId },
      { purpose: "LATE_FEE_INCOME", direction: "CREDIT", amount: input.amount },
    ],
  };
}

/** Balance helper (INV-002) for goldens. */
export function isBalanced(spec: JournalSpec): boolean {
  let dr = 0;
  let cr = 0;
  for (const l of spec.lines) {
    if (l.direction === "DEBIT") dr += Number(l.amount);
    else cr += Number(l.amount);
  }
  return Math.abs(dr - cr) < 1e-9;
}
