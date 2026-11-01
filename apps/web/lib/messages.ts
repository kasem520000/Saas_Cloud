/**
 * Pure presentation helpers shared by server pages and client forms:
 * message templates, error-code localization, status localization,
 * bilingual (EN/AR) name selection and date formatting.
 */
import { isRecord, type ApiErrorBody } from "./api-types";
import type { Dictionary, Locale } from "../i18n/dictionaries";

/** Replaces `{placeholder}` tokens — the only templating the UI needs. */
export function formatMessage(template: string, vars: Record<string, string | number>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, String(value));
  }
  return out;
}

/** Generic localized message for an API error (code → dictionary string). */
export function localizedApiError(
  d: Dictionary,
  error: ApiErrorBody,
  retryAfterSeconds?: number,
): string {
  switch (error.code) {
    case "NETWORK_ERROR":
      return d.errorsNetwork;
    case "UNAUTHENTICATED":
      return d.errorsUnauthorized;
    case "FORBIDDEN":
      return d.errorsForbidden;
    case "RATE_LIMITED":
      return formatMessage(d.errorsRateLimited, { seconds: retryAfterSeconds ?? 0 });
    case "VALIDATION_ERROR":
      return d.errorsValidation;
    case "NOT_FOUND":
      return d.errorsNotFound;
    default:
      return d.errorsGeneric;
  }
}

/** Login-specific mapping (INVALID_CREDENTIALS / MFA_REQUIRED / lockout). */
export function localizedLoginError(
  d: Dictionary,
  error: ApiErrorBody,
  retryAfterSeconds?: number,
): string {
  switch (error.code) {
    case "INVALID_CREDENTIALS":
      return d.loginErrorInvalidCredentials;
    case "MFA_REQUIRED":
      return d.loginErrorMfaRequired;
    case "RATE_LIMITED":
      return formatMessage(d.loginErrorRateLimited, { seconds: retryAfterSeconds ?? 0 });
    case "UNAUTHENTICATED":
      // On the login route a 401 UNAUTHENTICATED means the account is
      // temporarily locked (details.retryAfterSeconds carries the window).
      return formatMessage(d.loginErrorAccountLocked, { seconds: retryAfterSeconds ?? 0 });
    default:
      return d.loginErrorGeneric;
  }
}

/** Invitation-specific mapping (not acceptable: expired / revoked / accepted). */
export function localizedInvitationError(d: Dictionary, error: ApiErrorBody): string {
  switch (error.code) {
    case "NOT_FOUND":
      return d.acceptErrorNotFound;
    case "VALIDATION_ERROR": {
      const reason = reasonOf(error.details);
      if (reason === "expired") {
        return d.acceptErrorExpired;
      }
      if (reason === "revoked") {
        return d.acceptErrorRevoked;
      }
      if (reason === "accepted") {
        return d.acceptErrorAccepted;
      }
      return d.acceptErrorGeneric;
    }
    default:
      return d.acceptErrorGeneric;
  }
}

/**
 * P4-T12a — tenancy/platform error mapping. Known contract codes get a
 * localized message; unknown codes fall back to the API's display-safe
 * `error.message` (ERROR_MODEL §2), then to the generic message.
 */
export function localizedTenancyError(
  d: Dictionary,
  error: ApiErrorBody,
  retryAfterSeconds?: number,
): string {
  switch (error.code) {
    case "NETWORK_ERROR":
      return d.errorsNetwork;
    case "UNAUTHENTICATED":
      return d.errorsUnauthorized;
    case "FORBIDDEN":
      return d.errorsForbidden;
    case "RATE_LIMITED":
      return formatMessage(d.errorsRateLimited, { seconds: retryAfterSeconds ?? 0 });
    case "VALIDATION_ERROR":
      return d.errorsValidation;
    case "NOT_FOUND":
      return d.errorsNotFound;
    case "tenancy/email-already-registered":
      return d.registerErrorEmailTaken;
    case "tenancy/invalid-registration-input":
      // The API guarantees this message is display-safe (contract §T4).
      return error.message !== "" ? error.message : d.errorsValidation;
    case "tenancy/branch-code-taken":
      return d.branchesErrorCodeTaken;
    case "tenancy/feature-not-entitled":
      return d.tenancyErrorFeatureNotEntitled;
    case "tenancy/feature-dependencies-missing":
      return formatMessage(d.tenancyErrorDependenciesMissing, {
        keys: missingKeysOf(error.details).join(", ") || "—",
      });
    case "tenancy/manual-grant-expiry-required":
      return d.platformGrantExpiryRequired;
    case "tenancy/unknown-feature-key":
      return d.platformGrantUnknownKey;
    case "tenancy/invalid-setting-value":
      return d.settingsErrorInvalidValue;
    case "tenancy/unknown-setting-key":
      return d.errorsGeneric;
    case "tenancy/support-access-denied":
      return d.supportErrorAccessDenied;
    case "tenancy/support-session-expired":
      return d.supportErrorExpired;
    case "tenancy/support-session-not-active":
      return d.supportErrorNotActive;
    case "tenancy/invalid-tenant-transition":
      return d.platformErrorInvalidTransition;
    case "tenancy/plan-not-found":
      return d.platformErrorPlanNotFound;
    default:
      return error.message !== "" ? error.message : d.errorsGeneric;
  }
}

/** `details.missing` (dependency-closure rejections list the keys). */
export function missingKeysOf(details: unknown): string[] {
  if (isRecord(details) && Array.isArray(details.missing)) {
    return details.missing.filter((key: unknown): key is string => typeof key === "string");
  }
  return [];
}

function reasonOf(details: unknown): string | undefined {
  if (typeof details === "object" && details !== null && "reason" in details) {
    const value = (details as { reason: unknown }).reason;
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

/** Localizes row statuses; unknown statuses pass through verbatim. */
export function localizedStatus(d: Dictionary, status: string): string {
  switch (status.toUpperCase()) {
    case "ACTIVE":
      return d.statusActive;
    case "PENDING":
    case "INVITED":
      return d.statusPending;
    case "REVOKED":
      return d.statusRevoked;
    case "EXPIRED":
      return d.statusExpired;
    case "ACCEPTED":
      return d.statusAccepted;
    case "SUSPENDED":
      return d.statusSuspended;
    case "CLOSED":
      return d.statusClosed;
    case "TERMINATED":
      return d.statusTerminated;
    case "OFFBOARDED":
      return d.statusOffboarded;
    default:
      return status;
  }
}

/**
 * P5-T12 — Badge tone for a row status (non-document vocabularies render via
 * `Badge`, which exposes the neutral/primary tones; neutral keeps the text
 * label as the differentiator). ACTIVE-family statuses read as primary.
 */
export function statusTone(status: string): "primary" | "neutral" {
  switch (status.toUpperCase()) {
    case "ACTIVE":
    case "ACCEPTED":
      return "primary";
    default:
      return "neutral";
  }
}

/**
 * P6-T11a — PHASE-006 master-data error mapping (partners + items error
 * registries, ERROR_MODEL module-scoped codes). Known contract codes get a
 * localized message; unknown codes fall back to the API's display-safe
 * `error.message`, then to the generic message (same policy as tenancy).
 */
export function localizedMasterDataError(
  d: Dictionary,
  error: ApiErrorBody,
  retryAfterSeconds?: number,
): string {
  switch (error.code) {
    case "NETWORK_ERROR":
      return d.errorsNetwork;
    case "UNAUTHENTICATED":
      return d.errorsUnauthorized;
    case "FORBIDDEN":
      return d.errorsForbidden;
    case "RATE_LIMITED":
      return formatMessage(d.errorsRateLimited, { seconds: retryAfterSeconds ?? 0 });
    case "VALIDATION_ERROR":
      return d.errorsValidation;
    case "NOT_FOUND":
    case "PARTNER_NOT_FOUND":
    case "CREDIT_TERMS_NOT_FOUND":
    case "ITEM_NOT_FOUND":
    case "CATEGORY_NOT_FOUND":
    case "BARCODE_NOT_FOUND":
    case "UOM_NOT_FOUND":
    case "PRICE_LIST_NOT_FOUND":
    case "PRICE_LIST_ROW_NOT_FOUND":
    case "IMPORT_JOB_NOT_FOUND":
    case "ATTACHMENT_NOT_FOUND":
    case "ATTACHMENT_OWNER_NOT_FOUND":
      return d.errorsNotFound;
    case "STALE_VERSION":
      return d.commonVersionConflict;
    case "PARTNER_CODE_TAKEN":
      return d.partnerCodeTaken;
    case "ITEM_SKU_TAKEN":
      return d.itemSkuTaken;
    case "BARCODE_TAKEN":
      return d.barcodeTaken;
    case "PARTNER_ARCHIVED":
      return d.partnerArchivedError;
    case "ITEM_ARCHIVED":
      return d.itemArchivedError;
    case "PARTNER_KIND_IMMUTABLE":
      return d.partnerKindImmutable;
    case "OPENING_BALANCE_DUPLICATE":
      return d.obDuplicateError;
    case "OPENING_BALANCE_INVALID":
    case "TRACKING_FLAGS_INVALID":
    case "PRICE_LIST_INVALID":
      return d.errorsValidation;
    case "IMPORT_FILE_INVALID":
      return d.importErrorFileInvalid;
    case "files/upload-rejected":
      return d.attachmentIssueFailed;
    default:
      return error.message !== "" ? error.message : d.errorsGeneric;
  }
}

/** Picks the localized variant of a bilingual name (tenant/role). */
export function localizedName(name: string, nameAr: string | null, locale: Locale): string {
  return locale === "ar" && nameAr !== null && nameAr !== "" ? nameAr : name;
}

/** Medium date+time in the page locale; dashes for missing values. */
export function formatDateTime(iso: string | null | undefined, locale: Locale): string {
  if (iso === null || iso === undefined || iso === "") {
    return "—";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * P7-T18 — DOCUMENT_LIFECYCLE status vocabulary for the accounting surfaces
 * (manual journals, ledger entries). Feeds DocumentStatusBadge labels; the
 * component ships the tone mapping, the app ships the translation.
 */
export function localizedDocumentStatus(d: Dictionary, status: string): string {
  switch (status.toUpperCase()) {
    case "DRAFT":
      return d.statusDraft;
    case "PENDING_APPROVAL":
      return d.statusPendingApproval;
    case "APPROVED":
      return d.statusApproved;
    case "POSTED":
      return d.statusPosted;
    case "REVERSED":
      return d.statusReversed;
    case "CANCELLED":
      return d.statusCancelled;
    default:
      return status;
  }
}

/** P7-T18 — fiscal-period states (PERIOD_CLOSING.md state machine). */
export function localizedPeriodStatus(d: Dictionary, status: string): string {
  switch (status.toUpperCase()) {
    case "OPEN":
      return d.accountingStatusOpen;
    case "SOFT_CLOSED":
      return d.accountingStatusSoftClosed;
    case "LOCKED":
      return d.accountingStatusLocked;
    default:
      return status;
  }
}

/** P7-T18 — fiscal-period kinds (REGULAR / OPENING / CLOSING windows). */
export function localizedPeriodKind(d: Dictionary, kind: string): string {
  switch (kind.toUpperCase()) {
    case "REGULAR":
      return d.accountingKindRegular;
    case "OPENING":
      return d.accountingKindOpening;
    case "CLOSING":
      return d.accountingKindClosing;
    default:
      return kind;
  }
}

/**
 * P7-T18 — posting-engine error taxonomy (POSTING_ENGINE.md §error-taxonomy):
 * stable codes → localized messages. Unknown codes fall back to the API's
 * display-safe `error.message` (same policy as the master-data mapper).
 */
export function localizedAccountingError(
  d: Dictionary,
  error: ApiErrorBody,
  retryAfterSeconds?: number,
): string {
  switch (error.code) {
    case "NETWORK_ERROR":
      return d.errorsNetwork;
    case "UNAUTHENTICATED":
      return d.errorsUnauthorized;
    case "FORBIDDEN":
      return d.errorsForbidden;
    case "RATE_LIMITED":
      return formatMessage(d.errorsRateLimited, { seconds: retryAfterSeconds ?? 0 });
    case "ENTRY_NOT_BALANCED":
      return d.accountingErrEntryNotBalanced;
    case "PERIOD_LOCKED":
      return d.accountingErrPeriodLocked;
    case "PERIOD_NOT_FOUND":
    case "FISCAL_YEAR_NOT_FOUND":
    case "ACCOUNT_NOT_FOUND":
    case "GL_ACCOUNT_NOT_FOUND":
    case "JOURNAL_DRAFT_NOT_FOUND":
    case "RECURRING_JOURNAL_NOT_FOUND":
      return d.errorsNotFound;
    case "ACCOUNT_NOT_POSTABLE":
    case "ACCOUNT_ARCHIVED":
      return d.accountingErrAccountNotPostable;
    case "PURPOSE_NOT_MAPPED":
      return d.accountingErrPurposeNotMapped;
    case "MISSING_PARTNER_ON_CONTROL":
      return d.accountingErrMissingPartner;
    case "MISSING_FX_RATE":
    case "EXCHANGE_RATE_INVALID":
      return d.accountingErrMissingFxRate;
    case "ALREADY_POSTED":
      return d.accountingErrAlreadyPosted;
    case "ALREADY_REVERSED":
      return d.accountingErrAlreadyReversed;
    case "APPROVAL_LIMIT_EXCEEDED":
      return d.accountingErrApprovalLimit;
    case "SELF_APPROVAL_BLOCKED":
      return d.accountingErrSelfApproval;
    case "IMMUTABLE_DOCUMENT":
      return d.accountingErrImmutable;
    case "JOURNAL_STATE_ERROR":
    case "PERIOD_STATE_ERROR":
    case "APPROVALS_PENDING":
      return d.accountingErrState;
    default:
      return error.message !== "" ? error.message : d.errorsGeneric;
  }
}

/**
 * T14-UI (PHASE-008) — treasury error taxonomy (treasury-errors.ts stable
 * codes → ERROR_MODEL §4): every contract code gets a localized message;
 * unknown codes fall back to the API's display-safe `error.message`, then
 * to the generic message (same policy as the accounting mapper).
 */
export function localizedTreasuryError(
  d: Dictionary,
  error: ApiErrorBody,
  retryAfterSeconds?: number,
): string {
  switch (error.code) {
    case "NETWORK_ERROR":
      return d.errorsNetwork;
    case "UNAUTHENTICATED":
      return d.errorsUnauthorized;
    case "FORBIDDEN":
      return d.errorsForbidden;
    case "RATE_LIMITED":
      return formatMessage(d.errorsRateLimited, { seconds: retryAfterSeconds ?? 0 });
    case "VALIDATION_ERROR":
      return d.errorsValidation;
    // A7-sensitive not-founds render identically (no existence disclosure).
    case "CASH_ACCOUNT_NOT_FOUND":
    case "RECEIPT_NOT_FOUND":
    case "PAYMENT_NOT_FOUND":
    case "CASH_TRANSFER_NOT_FOUND":
    case "OPEN_ITEM_NOT_FOUND":
    case "EXPENSE_CATEGORY_NOT_FOUND":
    case "EXPENSE_NOT_FOUND":
    case "SHIFT_NOT_FOUND":
    case "STATEMENT_NOT_FOUND":
    case "STATEMENT_LINE_NOT_FOUND":
    case "CASH_MOVEMENT_NOT_FOUND":
      return d.errorsNotFound;
    case "CASH_ACCOUNT_ALREADY_EXISTS":
      return d.treasuryErrAccountExists;
    case "CASH_ACCOUNT_CLOSED":
      return d.treasuryErrAccountClosed;
    case "CASH_ACCOUNT_NOT_CLOSEABLE":
      return d.treasuryErrAccountNotCloseable;
    case "CASH_ACCOUNT_CURRENCY_MISMATCH":
      return d.treasuryErrCurrencyMismatch;
    case "CASH_ACCOUNT_TYPE_INVALID":
      return d.treasuryErrTypeInvalid;
    case "INVALID_AMOUNT":
      return d.treasuryErrInvalidAmount;
    case "TREASURY_DOCUMENT_STATE_INVALID":
      return d.treasuryErrDocState;
    case "MISSING_FX_RATE":
      return d.treasuryErrMissingFxRate;
    case "ALLOCATION_EXCEEDS_DOCUMENT":
      return d.treasuryErrAllocationExceedsDoc;
    case "ALLOCATION_EXCEEDS_OPEN_ITEM":
      return d.treasuryErrAllocationExceedsItem;
    case "OPEN_ITEM_CURRENCY_MISMATCH":
      return d.treasuryErrOpenItemCurrency;
    case "OPEN_ITEM_PARTNER_MISMATCH":
      return d.treasuryErrOpenItemPartner;
    case "OPEN_ITEM_SIDE_INVALID":
      return d.treasuryErrOpenItemSide;
    case "PETTY_CASH_LIMIT_EXCEEDED":
      return d.treasuryErrPettyLimit;
    case "EXPENSE_CATEGORY_CODE_TAKEN":
      return d.treasuryErrCategoryTaken;
    case "EXPENSE_RECEIPT_REQUIRED":
      return d.treasuryErrReceiptRequired;
    case "EXPENSE_APPROVAL_REQUIRED":
      return d.treasuryErrApprovalRequired;
    case "SHIFT_ALREADY_OPEN":
      return d.treasuryErrShiftAlreadyOpen;
    case "SHIFT_SUPERVISOR_REQUIRED":
      return d.treasuryErrSupervisorRequired;
    case "SHIFT_SUPERVISOR_PIN_INVALID":
      return d.treasuryErrSupervisorPin;
    case "SHIFT_REASON_REQUIRED":
      return d.treasuryErrShiftReason;
    case "STATEMENT_TOO_LARGE":
      return d.treasuryErrStatementTooLarge;
    case "STATEMENT_FORMAT_INVALID":
      return d.treasuryErrStatementFormat;
    case "STATEMENT_ALREADY_RECONCILED":
      return d.treasuryErrStatementReconciled;
    case "BANK_REC_PERIOD_LOCKED":
      return d.treasuryErrPeriodLocked;
    case "MOVEMENT_ALREADY_MATCHED":
      return d.treasuryErrMovementMatched;
    default:
      return error.message !== "" ? error.message : d.errorsGeneric;
  }
}

/** T14-UI — cash-account types (CASH / BANK / PETTY). */
export function localizedCashAccountType(d: Dictionary, type: string): string {
  switch (type) {
    case "CASH":
      return d.treasuryAccountTypeCash;
    case "BANK":
      return d.treasuryAccountTypeBank;
    case "PETTY":
      return d.treasuryAccountTypePetty;
    default:
      return type;
  }
}

/** T14-UI — settlement methods (money-in / money-out). */
export function localizedTreasuryMethod(d: Dictionary, method: string): string {
  switch (method) {
    case "CASH":
      return d.treasuryMethodCash;
    case "BANK":
      return d.treasuryMethodBank;
    case "CHEQUE":
      return d.treasuryMethodCheque;
    case "CARD":
      return d.treasuryMethodCard;
    case "TRANSFER":
      return d.treasuryMethodTransfer;
    default:
      return method;
  }
}

/** T14-UI — cashier-shift statuses (OPEN / CLOSED / CANCELLED). */
export function localizedShiftStatus(d: Dictionary, status: string): string {
  switch (status) {
    case "OPEN":
      return d.treasuryShiftStatusOpen;
    case "CLOSED":
      return d.treasuryShiftStatusClosed;
    case "CANCELLED":
      return d.treasuryShiftStatusCancelled;
    default:
      return status;
  }
}

/** T14-UI — bank-statement statuses (IMPORTED / RECONCILED). */
export function localizedStatementStatus(d: Dictionary, status: string): string {
  switch (status) {
    case "IMPORTED":
      return d.treasuryBankRecStatusImported;
    case "RECONCILED":
      return d.treasuryBankRecStatusReconciled;
    default:
      return status;
  }
}

/** T14-UI — statement-line match states (unmatched / matched modes). */
export function localizedMatchMode(d: Dictionary, mode: string | null): string {
  switch (mode) {
    case null:
      return d.treasuryBankRecUnmatched;
    case "AUTO":
      return d.treasuryBankRecMatchAuto;
    case "MANUAL":
      return d.treasuryBankRecMatchManual;
    default:
      return mode;
  }
}

/**
 * T15-UI (PHASE-009) — tax error taxonomy (tax-errors.ts stable codes →
 * ERROR_MODEL §4): every contract code gets a localized message; unknown
 * codes fall back to the API's display-safe `error.message`, then to the
 * generic message (same policy as the treasury mapper).
 */
export function localizedTaxError(
  d: Dictionary,
  error: ApiErrorBody,
  retryAfterSeconds?: number,
): string {
  switch (error.code) {
    case "NETWORK_ERROR":
      return d.errorsNetwork;
    case "UNAUTHENTICATED":
      return d.errorsUnauthorized;
    case "FORBIDDEN":
      return d.errorsForbidden;
    case "RATE_LIMITED":
      return formatMessage(d.errorsRateLimited, { seconds: retryAfterSeconds ?? 0 });
    case "VALIDATION_ERROR":
      return d.errorsValidation;
    // A7-sensitive not-founds render identically (no existence disclosure).
    case "TAX_CODE_NOT_FOUND":
    case "VAT_RETURN_NOT_FOUND":
      return d.errorsNotFound;
    case "TAX_CODE_TAKEN":
      return d.taxErrCodeTaken;
    case "TAX_CODE_ARCHIVED":
      return d.taxErrCodeArchived;
    case "TAX_CODE_IN_USE":
      return d.taxErrCodeInUse;
    case "TAX_CODE_STATUS_INVALID":
    case "REGISTRATION_DEREGISTERED_SHAPE_INVALID":
    case "TAX_LINE_INVALID":
    case "PRICING_MODE_INVALID":
    case "CURRENCY_MINOR_UNITS_UNKNOWN":
      return d.errorsValidation;
    case "REGISTRATION_NUMBER_REQUIRED":
    case "REGISTRATION_NUMBER_NOT_ALLOWED":
      return d.taxErrRegistrationNumber;
    case "JURISDICTION_NOT_FOUND":
      return d.taxErrJurisdiction;
    case "NO_RATE_FOR_DATE":
      return d.taxErrNoRateForDate;
    case "VAT_RETURN_WINDOW_TAKEN":
      return d.taxErrWindowTaken;
    case "VAT_RETURN_CROSS_CHECK_FAILED":
      return d.taxErrCrossCheck;
    case "VAT_RETURN_STATE_INVALID":
      return d.taxErrState;
    case "VAT_RETURN_ALREADY_FILED":
      return d.taxErrAlreadyFiled;
    case "PACK_BINDING_INVALID":
      return d.taxErrPackBinding;
    default:
      return error.message !== "" ? error.message : d.errorsGeneric;
  }
}

/** T15-UI — tax treatments (TAX_ENGINE §2.1 vocabulary). */
export function localizedTaxTreatment(d: Dictionary, treatment: string): string {
  switch (treatment) {
    case "STANDARD_RATED":
      return d.taxTreatmentStandardRated;
    case "ZERO_RATED":
      return d.taxTreatmentZeroRated;
    case "EXEMPT":
      return d.taxTreatmentExempt;
    case "OUT_OF_SCOPE":
      return d.taxTreatmentOutOfScope;
    case "REVERSE_CHARGE":
      return d.taxTreatmentReverseCharge;
    case "NOT_SUBJECT":
      return d.taxTreatmentNotSubject;
    default:
      return treatment;
  }
}

/** T15-UI — jurisdiction pack VAT statuses (COUNTRY_PACKS §3). */
export function localizedVatStatus(d: Dictionary, vatStatus: string): string {
  switch (vatStatus) {
    case "VAT_IN_FORCE":
      return d.taxPacksVatInForce;
    case "VAT_PLANNED":
      return d.taxPacksVatPlanned;
    case "NO_VAT":
      return d.taxPacksVatNoVat;
    default:
      return vatStatus;
  }
}

/** T15-UI — tax registration statuses (one per jurisdiction). */
export function localizedRegistrationStatus(d: Dictionary, status: string): string {
  switch (status) {
    case "REGISTERED":
      return d.taxRegistrationsRegistered;
    case "NOT_REGISTERED":
      return d.taxRegistrationsNotRegistered;
    case "DEREGISTERED":
      return d.taxRegistrationsDeregistered;
    default:
      return status;
  }
}

/** T15-UI — VAT return statuses (DRAFT / READY / FILED). */
export function localizedVatReturnStatus(d: Dictionary, status: string): string {
  switch (status) {
    case "DRAFT":
      return d.vatReturnDraft;
    case "READY":
      return d.vatReturnReady;
    case "FILED":
      return d.vatReturnFiled;
    default:
      return status;
  }
}

/**
 * T14-UI (PHASE-010) — inventory error taxonomy (inventory-errors.ts stable
 * codes → ERROR_MODEL §4): every contract code gets a localized message;
 * unknown codes fall back to the API's display-safe `error.message`, then
 * to the generic message (same policy as the treasury/tax mappers).
 */
export function localizedInventoryError(
  d: Dictionary,
  error: ApiErrorBody,
  retryAfterSeconds?: number,
): string {
  switch (error.code) {
    case "NETWORK_ERROR":
      return d.errorsNetwork;
    case "UNAUTHENTICATED":
      return d.errorsUnauthorized;
    case "FORBIDDEN":
      return d.errorsForbidden;
    case "RATE_LIMITED":
      return formatMessage(d.errorsRateLimited, { seconds: retryAfterSeconds ?? 0 });
    case "VALIDATION_ERROR":
    case "INVALID_QUANTITY":
    case "INVALID_COST":
    case "COSTING_METHOD_INVALID":
      return d.errorsValidation;
    // A7-sensitive not-founds render identically (no existence disclosure).
    case "WAREHOUSE_NOT_FOUND":
    case "ITEM_NOT_FOUND":
    case "BATCH_NOT_FOUND":
    case "SERIAL_NOT_FOUND":
    case "RESERVATION_NOT_FOUND":
    case "STOCK_ADJUSTMENT_NOT_FOUND":
    case "STOCK_COUNT_NOT_FOUND":
    case "STOCK_TRANSFER_NOT_FOUND":
    case "COUNT_LINE_NOT_FOUND":
      return d.errorsNotFound;
    case "WAREHOUSE_CODE_EXISTS":
      return d.inventoryErrWarehouseCodeTaken;
    case "WAREHOUSE_INACTIVE":
      return d.inventoryErrWarehouseInactive;
    case "WAREHOUSE_NOT_DEACTIVATABLE":
      return d.inventoryErrWarehouseNotDeactivatable;
    case "ITEM_NOT_STOCKED":
      return d.inventoryErrItemNotStocked;
    case "INSUFFICIENT_STOCK":
      return d.inventoryErrInsufficientStock;
    case "BATCH_INSUFFICIENT_STOCK":
      return d.inventoryErrBatchInsufficient;
    case "BATCH_REQUIRED":
      return d.inventoryErrBatchRequired;
    case "BATCH_ALREADY_EXISTS":
      return d.inventoryErrBatchTaken;
    case "SERIAL_REQUIRED":
      return d.inventoryErrSerialRequired;
    case "SERIAL_NOT_IN_STOCK":
      return d.inventoryErrSerialNotInStock;
    case "SERIAL_ALREADY_EXISTS":
      return d.inventoryErrSerialTaken;
    case "SERIAL_RETURN_BINDING_INVALID":
      return d.inventoryErrSerialReturnBinding;
    case "STOCK_TRANSFER_STATE_INVALID":
    case "STOCK_ADJUSTMENT_STATE_INVALID":
    case "STOCK_COUNT_STATE_INVALID":
    case "RESERVATION_STATE_INVALID":
      return d.inventoryErrState;
    case "STOCK_TRANSFER_EMPTY":
      return d.inventoryErrTransferEmpty;
    case "STOCK_TRANSFER_SAME_WAREHOUSE":
      return d.inventoryErrTransferSameWarehouse;
    case "COUNT_VARIANCE_TOLERANCE_EXCEEDED":
      return d.inventoryErrCountTolerance;
    case "METHOD_SWITCH_IN_FLIGHT":
      return d.inventoryErrMethodSwitchInFlight;
    case "METHOD_SWITCH_INVALID":
      return d.inventoryErrMethodSwitchInvalid;
    case "METHOD_SWITCH_SAME":
      return d.inventoryErrMethodSwitchSame;
    default:
      return error.message !== "" ? error.message : d.errorsGeneric;
  }
}

/** T14-UI (PHASE-010) — stock move direction labels. */
export function localizedMoveDirection(d: Dictionary, direction: "IN" | "OUT"): string {
  return direction === "IN" ? d.movesDirectionIn : d.movesDirectionOut;
}

/** T14-UI (PHASE-010) — stock move kind labels (receipt/issue/transfer legs/adjust). */
export function localizedMoveKind(d: Dictionary, kind: string): string {
  switch (kind) {
    case "receipt":
      return d.movesKindReceipt;
    case "issue":
      return d.movesKindIssue;
    case "transfer_in":
      return d.movesKindTransferIn;
    case "transfer_out":
      return d.movesKindTransferOut;
    case "adjust":
      return d.movesKindAdjust;
    default:
      return kind;
  }
}

/** T14-UI (PHASE-010) — movement reason codes (BR-015/DAMAGE/EXPIRED/…). */
export function localizedMoveReason(d: Dictionary, reason: string): string {
  switch (reason) {
    case "DAMAGE":
      return d.movesReasonDamage;
    case "EXPIRED":
      return d.movesReasonExpired;
    case "COUNT_LOSS":
      return d.movesReasonCountLoss;
    case "COUNT_GAIN":
      return d.movesReasonCountGain;
    case "CUSTOMER_RETURN":
      return d.movesReasonCustomerReturn;
    default:
      return d.movesReasonOther;
  }
}

/** PHASE-011 purchasing: localized API errors (matrix §3.3 codes). */
export function localizedPurchasingError(
  d: Dictionary,
  error: ApiErrorBody,
  retryAfterSeconds?: number,
): string {
  switch (error.code) {
    case "NETWORK_ERROR":
      return d.errorsNetwork;
    case "UNAUTHENTICATED":
      return d.errorsUnauthorized;
    case "FORBIDDEN":
      return d.errorsForbidden;
    case "RATE_LIMITED":
      return formatMessage(d.errorsRateLimited, { seconds: retryAfterSeconds ?? 0 });
    case "VALIDATION_ERROR":
      return d.errorsValidation;
    // A7-sensitive not-founds render identically (no existence disclosure).
    case "PURCHASE_REQUEST_NOT_FOUND":
    case "PURCHASE_ORDER_NOT_FOUND":
    case "GOODS_RECEIPT_NOT_FOUND":
    case "SUPPLIER_INVOICE_NOT_FOUND":
    case "DEBIT_NOTE_NOT_FOUND":
    case "LANDED_COST_NOT_FOUND":
    case "SUPPLIER_NOT_FOUND":
      return d.errorsNotFound;
    case "PURCHASING_DOCUMENT_STATE":
      return d.purchasingErrState;
    case "DUPLICATE_SUPPLIER_INVOICE":
      return d.purchasingErrDuplicate;
    case "MATCH_OUTCOME_MISSING":
      return d.purchasingErrMatchMissing;
    case "MATCH_EXCEPTION_UNDISPOSED":
      return d.purchasingErrMatchException;
    case "PO_LESS_GRN_FORBIDDEN":
      return d.purchasingErrPoLess;
    case "PO_LESS_REASON_REQUIRED":
      return d.purchasingErrPoLessReason;
    case "GRN_EXCEEDS_PO_LINE":
      return d.purchasingErrOverReceipt;
    case "INVOICE_GRN_ALREADY_CLEARED":
      return d.purchasingErrOverInvoice;
    case "PARTNER_NOT_SUPPLIER":
      return d.purchasingErrNotSupplier;
    case "INVOICE_GRN_SUPPLIER_MISMATCH":
      return d.purchasingErrGrnSupplier;
    case "SELF_APPROVAL_BLOCKED":
      return d.purchasingErrSelfApproval;
    case "REALLOCATION_SOURCE_INVALID":
    case "REALLOCATION_TARGET_INVALID":
    case "REALLOCATION_AMOUNT_INVALID":
      return d.purchasingErrReallocation;
    default:
      return error.message;
  }
}

/** PHASE-011 purchasing: document status → label key mapping. */
export function purchasingStatusLabel(
  d: Dictionary,
  status: string,
): string {
  const map: Record<string, string> = {
    DRAFT: d.statusDraft,
    PENDING_APPROVAL: d.statusPendingApproval,
    APPROVED: d.statusApproved,
    ISSUED: d.statusIssued,
    CLOSED: d.statusClosed,
    POSTED: d.statusPosted,
    REVERSED: d.statusReversed,
    CANCELLED: d.statusCancelled,
    REJECTED: d.statusRejected,
    CONVERTED: d.statusConverted,
  };
  return map[status] ?? status;
}

/** PHASE-011 purchasing: match status → label key mapping. */
export function matchStatusLabel(d: Dictionary, status: string): string {
  const map: Record<string, string> = {
    PENDING: d.purchasingMatchOutcomePending,
    MATCHED: d.purchasingMatchOutcomeMatched,
    EXCEPTION: d.purchasingMatchOutcomeException,
    DISPOSITIONED: d.purchasingMatchOutcomeDispositioned,
  };
  return map[status] ?? status;
}

/** PHASE-012 sales: localized API errors (matrix §3.2 codes). */
export function localizedSalesError(
  d: Dictionary,
  error: ApiErrorBody,
  retryAfterSeconds?: number,
): string {
  switch (error.code) {
    // A7-sensitive not-founds render identically (no existence disclosure).
    case "QUOTATION_NOT_FOUND":
    case "SALES_ORDER_NOT_FOUND":
    case "DELIVERY_NOTE_NOT_FOUND":
    case "SALES_INVOICE_NOT_FOUND":
    case "CREDIT_NOTE_NOT_FOUND":
    case "SALES_REP_NOT_FOUND":
    case "CUSTOMER_NOT_FOUND":
      return d.errorsNotFound;
    case "SALES_DOCUMENT_STATE":
    case "EMPTY_DOCUMENT":
    case "ORDER_LINE_INVALID":
    case "RESERVATION_INVALID":
    case "DELIVERY_LINE_INVALID":
    case "INVOICE_LINE_INVALID":
    case "CREDIT_NOTE_REF_INVALID":
    case "AR_QUERY_INVALID":
    case "PARTNER_NOT_CUSTOMER":
      return d.salesErrState;
    case "QUOTATION_EXPIRED":
      return d.salesErrQuotationExpired;
    case "CREDIT_LIMIT_EXCEEDED":
      return d.salesErrCreditLimit;
    case "RETURN_WINDOW_EXCEEDED":
      return d.salesErrReturnWindow;
    case "PRICE_CHANGED":
      return d.salesErrPriceChanged;
    case "ITEM_INACTIVE":
      return d.salesErrItemInactive;
    case "DELIVERY_ALREADY_INVOICED":
      return d.salesErrDeliveryInvoiced;
    case "CREDIT_NOTE_EXCEEDS_INVOICE":
      return d.salesErrCreditNoteExceeds;
    case "REALLOCATION_SOURCE_INVALID":
    case "REALLOCATION_TARGET_INVALID":
    case "REALLOCATION_AMOUNT_INVALID":
      return d.salesErrReallocation;
    default:
      return localizedApiError(d, error, retryAfterSeconds);
  }
}

/** PHASE-012 sales: document status → label key mapping. */
export function salesStatusLabel(d: Dictionary, status: string): string {
  const map: Record<string, string> = {
    DRAFT: d.statusDraft,
    SENT: d.salesStatusSent,
    ACCEPTED: d.statusAccepted,
    REJECTED: d.statusRejected,
    EXPIRED: d.statusExpired,
    PENDING_APPROVAL: d.statusPendingApproval,
    APPROVED: d.statusApproved,
    ISSUED: d.statusIssued,
    CLOSED: d.statusClosed,
    POSTED: d.statusPosted,
    CANCELLED: d.statusCancelled,
    CONVERTED: d.statusConverted,
  };
  return map[status] ?? status;
}
