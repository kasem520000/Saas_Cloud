import { DomainError } from "@erp/domain-core";

/**
 * PHASE-007 posting-engine error taxonomy (POSTING_ENGINE.md §3 — the codes
 * are STABLE CONTRACTS, ERROR_MODEL §4: code is the enum, message is
 * display-only). Codes are verbatim per the phase document; each carries a
 * machine-readable `details` payload. Localized display strings live at the
 * HTTP edge (Accept-Language) — never here.
 */

export class PostingError extends DomainError {
  constructor(
    code: PostingErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(code, message, details);
  }
}

export type PostingErrorCode =
  | "ENTRY_NOT_BALANCED"
  | "PERIOD_LOCKED"
  | "PERIOD_NOT_FOUND"
  | "ACCOUNT_NOT_POSTABLE"
  | "ACCOUNT_ARCHIVED"
  | "CURRENCY_MISMATCH"
  | "PURPOSE_NOT_MAPPED"
  | "MISSING_PARTNER_ON_CONTROL"
  | "MISSING_FX_RATE"
  | "ALREADY_POSTED"
  | "ALREADY_REVERSED"
  | "INVALID_AMOUNT";

export function entryNotBalanced(details: {
  debit: string;
  credit: string;
  baseDebit?: string;
  baseCredit?: string;
}): PostingError {
  return new PostingError(
    "ENTRY_NOT_BALANCED",
    "journal entry is not balanced (Σdebit must equal Σcredit in document and base currency, 0 tolerance)",
    details,
  );
}

export function periodLocked(details: { entryDate: string; status: string }): PostingError {
  return new PostingError(
    "PERIOD_LOCKED",
    `entry date ${details.entryDate} falls in a ${details.status} fiscal period`,
    details,
  );
}

export function periodNotFound(details: { entryDate: string }): PostingError {
  return new PostingError(
    "PERIOD_NOT_FOUND",
    `no fiscal period covers entry date ${details.entryDate}`,
    details,
  );
}

export function accountNotPostable(details: { accountId: string; code?: string }): PostingError {
  return new PostingError(
    "ACCOUNT_NOT_POSTABLE",
    `account ${details.code ?? details.accountId} is a group node — only active leaf accounts accept lines (INV-004)`,
    details,
  );
}

export function accountArchived(details: { accountId: string; code?: string }): PostingError {
  return new PostingError(
    "ACCOUNT_ARCHIVED",
    `account ${details.code ?? details.accountId} is archived`,
    details,
  );
}

export function currencyMismatch(details: {
  accountId: string;
  accountCurrency: string;
  entryCurrency: string;
}): PostingError {
  return new PostingError(
    "CURRENCY_MISMATCH",
    `account ${details.accountId} is restricted to ${details.accountCurrency}; entry currency is ${details.entryCurrency} (INV-005)`,
    details,
  );
}

export function purposeNotMapped(details: { purposeKey: string }): PostingError {
  return new PostingError(
    "PURPOSE_NOT_MAPPED",
    `purpose ${details.purposeKey} has no active account mapping — posting fails closed, no fallback (CHART_OF_ACCOUNTS §2)`,
    details,
  );
}

export function missingPartnerOnControl(details: {
  accountId: string;
  purposeKey: string;
}): PostingError {
  return new PostingError(
    "MISSING_PARTNER_ON_CONTROL",
    `line hitting ${details.purposeKey} control account must carry a partner (INV-009)`,
    details,
  );
}

export function missingFxRate(details: { currency: string; base: string }): PostingError {
  return new PostingError(
    "MISSING_FX_RATE",
    `foreign-currency entry (${details.currency} on base ${details.base}) requires an exchange rate`,
    details,
  );
}

export function alreadyPosted(details: {
  sourceType: string;
  sourceId: string;
  operation: string;
}): PostingError {
  return new PostingError(
    "ALREADY_POSTED",
    `source ${details.sourceType}:${details.sourceId} operation ${details.operation} is already posted`,
    details,
  );
}

export function alreadyReversed(details: { entryId: string }): PostingError {
  return new PostingError(
    "ALREADY_REVERSED",
    `entry ${details.entryId} is already reversed (INV-014 — at most one reversal)`,
    details,
  );
}

export function invalidAmount(details: { amount: string }): PostingError {
  return new PostingError(
    "INVALID_AMOUNT",
    `amount ${details.amount} must be a positive decimal`,
    details,
  );
}
