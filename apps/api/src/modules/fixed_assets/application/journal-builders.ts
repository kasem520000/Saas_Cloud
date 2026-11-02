/**
 * PHASE-026 — pure JournalSpec builders for G-21/G-22/G-23 (ADR-0007: the
 * fixed_assets module never touches GL tables; it only emits JournalSpec).
 * Money as canonical decimal strings (ADR-0009).
 */
import type { JournalLineSpec, JournalSpec } from "../../accounting/domain/posting-engine/journal-spec";

export interface CategoryAccounts {
  assetPurpose: string; // FIXED_ASSET
  accumPurpose: string; // ACCUM_DEPRECIATION
  expensePurpose: string; // DEPRECIATION_EXPENSE
}

/** G-21 direct capitalization on credit: DR FIXED_ASSET · CR AP_CONTROL (partner). */
export function buildG21Credit(input: {
  docId: string;
  entryDate: string;
  currency: string;
  amount: string;
  partnerId: string;
  accounts: CategoryAccounts;
  reference?: string;
}): JournalSpec {
  const lines: JournalLineSpec[] = [
    { purpose: input.accounts.assetPurpose, direction: "DEBIT", amount: input.amount },
    { purpose: "AP_CONTROL", direction: "CREDIT", amount: input.amount, partnerId: input.partnerId },
  ];
  return {
    source: { docType: "fixed_asset_capitalization", docId: input.docId, operation: "post" },
    entryDate: input.entryDate,
    reference: input.reference,
    currency: input.currency,
    description: { en: "Fixed asset capitalization (credit)" },
    lines,
  };
}

/** G-21 cash variant: DR FIXED_ASSET · CR CASH. */
export function buildG21Cash(input: {
  docId: string;
  entryDate: string;
  currency: string;
  amount: string;
  accounts: CategoryAccounts;
  reference?: string;
}): JournalSpec {
  return {
    ...buildG21Credit({ ...input, partnerId: "" }),
    lines: [
      { purpose: input.accounts.assetPurpose, direction: "DEBIT", amount: input.amount },
      { purpose: "CASH", direction: "CREDIT", amount: input.amount },
    ],
  };
}

/** G-21 opening variant: DR FIXED_ASSET · CR OPENING_EQUITY, plus accumulated-to-date
 *  DR OPENING_EQUITY · CR ACCUM_DEPRECIATION so future runs resume from true NBV. */
export function buildG21Opening(input: {
  docId: string;
  entryDate: string;
  currency: string;
  cost: string;
  accumulatedToDate: string;
  accounts: CategoryAccounts;
}): JournalSpec {
  const lines: JournalLineSpec[] = [
    { purpose: input.accounts.assetPurpose, direction: "DEBIT", amount: input.cost },
    { purpose: "OPENING_EQUITY", direction: "CREDIT", amount: input.cost },
  ];
  if (Number(input.accumulatedToDate) > 0) {
    lines.push(
      { purpose: "OPENING_EQUITY", direction: "DEBIT", amount: input.accumulatedToDate },
      { purpose: input.accounts.accumPurpose, direction: "CREDIT", amount: input.accumulatedToDate },
    );
  }
  return {
    source: { docType: "fixed_asset_capitalization", docId: input.docId, operation: "post" },
    entryDate: input.entryDate,
    currency: input.currency,
    description: { en: "Opening fixed asset onboarding" },
    lines,
  };
}

/** G-22 depreciation run: ONE journal per run — DR DEPRECIATION_EXPENSE · CR ACCUM_DEPRECIATION
 *  per category, aggregated; per-asset detail lives in depreciation_lines. */
export function buildG22Run(input: {
  runId: string;
  entryDate: string;
  currency: string;
  /** per-category totals: [expensePurpose, accumPurpose, amount] */
  categoryTotals: Array<{ accounts: CategoryAccounts; amount: string }>;
}): JournalSpec {
  const lines: JournalLineSpec[] = [];
  for (const t of input.categoryTotals) {
    if (Number(t.amount) <= 0) continue;
    lines.push({ purpose: t.accounts.expensePurpose, direction: "DEBIT", amount: t.amount });
    lines.push({ purpose: t.accounts.accumPurpose, direction: "CREDIT", amount: t.amount });
  }
  return {
    source: { docType: "depreciation_run", docId: input.runId, operation: "post" },
    entryDate: input.entryDate,
    currency: input.currency,
    description: { en: "Monthly depreciation run" },
    lines,
  };
}

/** G-23 disposal: DR CASH (proceeds) · DR ACCUM_DEPRECIATION · CR FIXED_ASSET (cost) ·
 *  gain → CR ASSET_DISPOSAL_GAIN / loss → DR ASSET_DISPOSAL_LOSS (mandatory mirror). */
export function buildG23Disposal(input: {
  docId: string;
  entryDate: string;
  currency: string;
  proceeds: string;
  accumulated: string;
  cost: string;
  gainLoss: string; // signed
  accounts: CategoryAccounts;
  reference?: string;
}): JournalSpec {
  const lines: JournalLineSpec[] = [];
  if (Number(input.proceeds) > 0) lines.push({ purpose: "CASH", direction: "DEBIT", amount: input.proceeds });
  if (Number(input.accumulated) > 0) lines.push({ purpose: input.accounts.accumPurpose, direction: "DEBIT", amount: input.accumulated });
  lines.push({ purpose: input.accounts.assetPurpose, direction: "CREDIT", amount: input.cost });
  const gl = Number(input.gainLoss);
  if (gl > 0) lines.push({ purpose: "ASSET_DISPOSAL_GAIN", direction: "CREDIT", amount: input.gainLoss });
  else if (gl < 0) lines.push({ purpose: "ASSET_DISPOSAL_LOSS", direction: "DEBIT", amount: negate(input.gainLoss) });
  return {
    source: { docType: "asset_disposal", docId: input.docId, operation: "post" },
    entryDate: input.entryDate,
    reference: input.reference,
    currency: input.currency,
    description: { en: "Asset disposal" },
    lines,
  };
}

/** BR-044 revaluation: gross + accumulated restatement, residual to REVALUATION_RESERVE. */
export function buildRevaluation(input: {
  docId: string;
  entryDate: string;
  currency: string;
  grossDelta: string; // signed
  accumDelta: string; // signed
  reserveDelta: string; // signed (net NBV delta)
  accounts: CategoryAccounts;
}): JournalSpec {
  const lines: JournalLineSpec[] = [];
  pushSigned(lines, input.accounts.assetPurpose, input.grossDelta);
  pushSigned(lines, input.accounts.accumPurpose, input.accumDelta);
  pushSigned(lines, "REVALUATION_RESERVE", input.reserveDelta);
  return {
    source: { docType: "asset_revaluation", docId: input.docId, operation: "post" },
    entryDate: input.entryDate,
    currency: input.currency,
    description: { en: "Asset revaluation" },
    lines,
  };
}

function pushSigned(lines: JournalLineSpec[], purpose: string, signed: string) {
  const v = Number(signed);
  if (v > 0) lines.push({ purpose, direction: "DEBIT", amount: signed });
  else if (v < 0) lines.push({ purpose, direction: "CREDIT", amount: negate(signed) });
}

function negate(s: string): string {
  return s.startsWith("-") ? s.slice(1) : `-${s}`;
}

/** Balance check helper for tests: Σ DR == Σ CR (INV-002). */
export function isBalanced(spec: JournalSpec): boolean {
  let dr = 0;
  let cr = 0;
  for (const l of spec.lines) {
    if (l.direction === "DEBIT") dr += Number(l.amount);
    else cr += Number(l.amount);
  }
  return Math.abs(dr - cr) < 1e-9;
}
