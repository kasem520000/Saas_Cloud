import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";

import { ZodError } from "zod";

import { DomainError } from "@erp/domain-core";

import { getCorrelationId } from "../observability/request-context";
import { setRetryAfter } from "./envelope";
import {
  AccountLockedError,
  ForbiddenError,
  InvalidCredentialsError,
  InvalidResetTokenError,
  InvalidTotpCodeError,
  InvitationNotAcceptableError,
  MfaRequiredError,
  NotFoundError,
  RateLimitedError,
  StaleVersionError,
  TenantContextRequiredError,
  TenantSuspendedError,
  UnauthenticatedError,
} from "../../modules/identity/domain/identity-errors";
import { InvalidAuditEventError } from "../../modules/audit/api/audit";
import { WeakPasswordError } from "../../modules/identity/domain/password-policy";
import {
  BranchCodeTakenError,
  BranchNotActiveError,
  BranchScopeViolationError,
  EmailAlreadyRegisteredError,
  FeatureDependenciesMissingError,
  FeatureNotEntitledError,
  InvalidRegistrationInputError,
  InvalidTenantTransitionError,
  ManualGrantExpiryRequiredError,
  PlanClosureInvalidError,
  PlanNotFoundError,
  SupportAccessDeniedError,
  SupportSessionExpiredError,
  SupportSessionNotActiveError,
  UnknownFeatureKeyError,
} from "../../modules/tenancy/domain/tenancy-errors";
import {
  InvalidSettingValueError,
  UnknownSettingKeyError,
} from "../../modules/configuration/api";
import {
  AttachmentNotFoundError,
  AttachmentOwnerNotFoundError,
  CreditTermsCodeTakenError,
  CreditTermsNotFoundError,
  OpeningBalanceDraftError,
  OpeningBalanceDraftExistsError,
  PartnerArchivedError,
  PartnerCodeTakenError,
  PartnerInvalidTransitionError,
  PartnerKindChangeForbiddenError,
  PartnerNotFoundError,
  PriceListNotFoundError as PartnerPriceListNotFound,
  SystemCreditTermsImmutableError,
} from "../../modules/partners/domain/partner-errors";
import {
  BarcodeNotFoundError,
  BarcodeTakenError,
  CategoryCodeTakenError,
  CategoryCycleError,
  CategoryNotFoundError,
  CategoryParentArchivedError,
  ConversionDuplicateError,
  ConversionNotFoundError,
  ImportCommitConflictError,
  ImportFileInvalidError,
  ImportJobNotFoundError,
  ImportNotPreviewedError,
  ItemArchivedError,
  ItemNotFoundError,
  ItemSkuTakenError,
  PriceListInvalidError,
  PriceListNotFoundError,
  PriceListRowNotFoundError,
  SystemUomImmutableError,
  TrackingFlagsInvalidError,
  UomCodeTakenError,
  UomNotFoundError,
} from "../../modules/items/domain/items-errors";
import { PostingError } from "../../modules/accounting/domain/posting-engine/posting-errors";
import {
  StatementAlreadyReconciledError,
  BankRecPeriodLockedError,
  CashAccountAlreadyExistsError,
  CashAccountNotCloseableError,
  CashAccountClosedError,
  CashAccountCurrencyMismatchError,
  CashAccountTypeInvalidError,
  ExpenseCategoryCodeTakenError,
  MovementAlreadyMatchedError,
  PettyCashLimitExceededError,
  ShiftAlreadyOpenError,
  ShiftSupervisorPinInvalidError,
  ShiftSupervisorRequiredError,
  ShiftReasonRequiredError,
  StatementTooLargeError,
  StatementFormatInvalidError,
  TREASURY_NOT_FOUND_ERRORS,
  TreasuryDocumentStateError,
} from "../../modules/treasury/domain/treasury-errors";
import {
  AccountNotFoundError,
  FiscalYearNotFoundError,
  GlAccountNotFoundError,
  JournalDraftNotFoundError,
  PeriodNotFoundError,
  RecurringJournalNotFoundError,
} from "../../modules/accounting/domain/accounting-errors";
import {
  PurchasingDocumentStateError,
  PurchaseRequestNotFoundError,
  PurchaseOrderNotFoundError,
  GoodsReceiptNotFoundError,
  SupplierInvoiceNotFoundError,
  DebitNoteNotFoundError,
  LandedCostNotFoundError,
  SupplierNotFoundError,
} from "../../modules/purchasing/domain/purchasing-errors";
import {
  ForbiddenAtRunError,
  AssertionFailedExportBlockedError,
  ReportNotFoundError,
  ReportRunNotFoundError,
  ReportParamsInvalidError,
  ContractVersionMismatchError,
} from "../../modules/reporting/domain/reporting-errors";

/**
 * ERROR_MODEL exception filter: the single error envelope —
 * `{ error: { code, message, details, traceId, retryable } }`. Codes are
 * contracts; messages are display-only. Domain errors map to their stable
 * HTTP statuses (§2); lockout stays indistinguishable from credential
 * failure (§5.2); 429 always carries Retry-After; anything unmapped is a
 * 500 INTERNAL_ERROR that never leaks internals.
 */

const log = new Logger("http-errors");

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
  retryable: boolean;
}

interface ErrorEnvelope {
  error: ErrorBody & { traceId: string };
}

@Catch()
export class ErrorModelFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const { status, body, retryAfter } = this.map(exception);

    if (status >= 500) {
      log.error(exception instanceof Error ? exception.stack : String(exception));
    } else {
      log.debug(
        `http ${status} ${body.code} — ${exception instanceof Error ? exception.message : String(exception)}`,
      );
    }
    if (retryAfter !== undefined) {
      setRetryAfter(response, retryAfter);
    }
    const envelope: ErrorEnvelope = {
      error: { ...body, traceId: getCorrelationId() ?? "" },
    };
    response.status(status).json(envelope);
  }

  private map(exception: unknown): { status: number; body: ErrorBody; retryAfter?: number } {
    if (exception instanceof ZodError) {
      // API_CONVENTIONS §3: unknown/malformed fields are rejected loudly —
      // zod issues surface as typed fieldErrors inside details.
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        body: {
          code: "VALIDATION_ERROR",
          message: "request payload failed validation",
          details: {
            fieldErrors: exception.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
              code: issue.code,
            })),
          },
          retryable: false,
        },
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (exception instanceof InternalServerErrorException) {
        return internal();
      }
      return {
        status,
        body: {
          code: nestCode(status),
          message: exception.message,
          retryable: status >= 500,
        },
      };
    }
    if (exception instanceof DomainError) {
      return { status: domainStatus(exception), body: fromDomain(exception), retryAfter: retryAfterOf(exception) };
    }
    return internal();
  }
}

function internal(): { status: number; body: ErrorBody } {
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { code: "INTERNAL_ERROR", message: "internal server error", retryable: true },
  };
}

function nestCode(status: number): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return "UNAUTHENTICATED";
    case HttpStatus.FORBIDDEN:
      return "FORBIDDEN";
    case HttpStatus.NOT_FOUND:
      return "NOT_FOUND";
    case HttpStatus.CONFLICT:
      return "STALE_VERSION";
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return "VALIDATION_ERROR";
    case HttpStatus.SERVICE_UNAVAILABLE:
      return "SERVICE_UNAVAILABLE";
    case HttpStatus.BAD_REQUEST:
      return "BAD_REQUEST";
    default:
      return "INTERNAL_ERROR";
  }
}

function domainStatus(error: DomainError): number {
  if (
    error instanceof InvalidCredentialsError ||
    error instanceof AccountLockedError ||
    error instanceof UnauthenticatedError
  ) {
    return HttpStatus.UNAUTHORIZED;
  }
  if (error instanceof RateLimitedError) {
    return HttpStatus.TOO_MANY_REQUESTS;
  }
  if (error instanceof MfaRequiredError) {
    return HttpStatus.LOCKED; // 423 per ERROR_MODEL §2
  }
  if (
    error instanceof ForbiddenError ||
    error instanceof TenantContextRequiredError ||
    error instanceof WeakPasswordError ||
    error instanceof BranchScopeViolationError ||
    error instanceof BranchNotActiveError ||
    error instanceof FeatureNotEntitledError ||
    error instanceof ForbiddenAtRunError ||
    error instanceof SupportAccessDeniedError ||
    error instanceof SupportSessionExpiredError
  ) {
    return HttpStatus.FORBIDDEN;
  }
  if (
    error instanceof NotFoundError ||
    error instanceof PlanNotFoundError ||
    // PHASE-006 master-data not-founds (404; A7 404-parity).
    error instanceof PartnerNotFoundError ||
    error instanceof CreditTermsNotFoundError ||
    error instanceof ItemNotFoundError ||
    error instanceof CategoryNotFoundError ||
    error instanceof BarcodeNotFoundError ||
    error instanceof UomNotFoundError ||
    error instanceof PriceListNotFoundError ||
    error instanceof PartnerPriceListNotFound ||
    error instanceof PriceListRowNotFoundError ||
    error instanceof ImportJobNotFoundError ||
    error instanceof AttachmentNotFoundError ||
    error instanceof AttachmentOwnerNotFoundError ||
    // PHASE-013 reporting not-founds (404-shaped; A-series parity).
    error instanceof ReportNotFoundError ||
    error instanceof ReportRunNotFoundError ||
    error instanceof ConversionNotFoundError
  ) {
    return HttpStatus.NOT_FOUND;
  }
  // PHASE-007 accounting not-founds (404; A7 404-parity — identical shape
  // for unknown-vs-foreign ids, no existence disclosure).
  if (
    error instanceof AccountNotFoundError ||
    error instanceof FiscalYearNotFoundError ||
    error instanceof PeriodNotFoundError ||
    error instanceof JournalDraftNotFoundError ||
    error instanceof RecurringJournalNotFoundError ||
    error instanceof GlAccountNotFoundError
  ) {
    return HttpStatus.NOT_FOUND;
  }
  // PHASE-008 treasury not-founds (404; same A7 parity).
  if (TREASURY_NOT_FOUND_ERRORS.some((type) => error instanceof type)) {
    return HttpStatus.NOT_FOUND;
  }
  // PHASE-011 purchasing not-founds (404; A7 parity — identical shape for
  // unknown-vs-foreign ids, no existence disclosure).
  if (
    error instanceof PurchaseRequestNotFoundError ||
    error instanceof PurchaseOrderNotFoundError ||
    error instanceof GoodsReceiptNotFoundError ||
    error instanceof SupplierInvoiceNotFoundError ||
    error instanceof DebitNoteNotFoundError ||
    error instanceof LandedCostNotFoundError ||
    error instanceof SupplierNotFoundError
  ) {
    return HttpStatus.NOT_FOUND;
  }
  // Purchasing lifecycle conflicts (409): wrong-state transitions,
  // immutable posted documents, duplicate invoices (BR-011), GRN over-
  // receipt, PO state.
  if (error instanceof PurchasingDocumentStateError) {
    return HttpStatus.CONFLICT;
  }
  // BR-022 fixed: the period lock + the reconcile-once rule are conflicts.
  if (
    error instanceof StatementAlreadyReconciledError ||
    error instanceof BankRecPeriodLockedError ||
    error instanceof MovementAlreadyMatchedError
  ) {
    return HttpStatus.CONFLICT;
  }
  // Treasury lifecycle conflicts (409): duplicate names/codes, closed
  // accounts, a not-closeable account, an OPEN shift, IMMUTABLE_DOCUMENT-
  // style state violations.
  if (
    error instanceof CashAccountAlreadyExistsError ||
    error instanceof ExpenseCategoryCodeTakenError ||
    error instanceof CashAccountClosedError ||
    error instanceof CashAccountNotCloseableError ||
    error instanceof ShiftAlreadyOpenError ||
    error instanceof TreasuryDocumentStateError
  ) {
    return HttpStatus.CONFLICT;
  }
  // Treasury policy rejections (422): caps, attestation, format, currency
  // compatibility (INV-005-style), bounds.
  if (
    error instanceof PettyCashLimitExceededError ||
    error instanceof ShiftSupervisorRequiredError ||
    error instanceof ShiftSupervisorPinInvalidError ||
    error instanceof ShiftReasonRequiredError ||
    error instanceof StatementTooLargeError ||
    error instanceof StatementFormatInvalidError ||
    error instanceof CashAccountCurrencyMismatchError ||
    error instanceof CashAccountTypeInvalidError
  ) {
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }
  // Posting-engine taxonomy (POSTING_ENGINE §3; ERROR_MODEL §2): stable
  // codes with their documented statuses.
  if (error instanceof PostingError) {
    if (error.code === "ALREADY_POSTED" || error.code === "ALREADY_REVERSED") {
      return HttpStatus.CONFLICT;
    }
    if (
      error.code === "PERIOD_NOT_FOUND" ||
      error.code === "ACCOUNT_NOT_POSTABLE" ||
      error.code === "ACCOUNT_ARCHIVED" ||
      error.code === "PURPOSE_NOT_MAPPED"
    ) {
      return HttpStatus.NOT_FOUND;
    }
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }
  if (
    error instanceof StaleVersionError ||
    error instanceof EmailAlreadyRegisteredError ||
    error instanceof BranchCodeTakenError ||
    error instanceof InvalidTenantTransitionError ||
    error instanceof SupportSessionNotActiveError ||
    // PHASE-006 natural-key conflicts + lifecycle states (409).
    error instanceof PartnerCodeTakenError ||
    error instanceof CreditTermsCodeTakenError ||
    error instanceof ItemSkuTakenError ||
    error instanceof CategoryCodeTakenError ||
    error instanceof BarcodeTakenError ||
    error instanceof UomCodeTakenError ||
    error instanceof ConversionDuplicateError ||
    error instanceof ImportCommitConflictError ||
    error instanceof PartnerKindChangeForbiddenError ||
    error instanceof OpeningBalanceDraftExistsError ||
    error instanceof PartnerArchivedError ||
    error instanceof ItemArchivedError ||
    error instanceof PartnerInvalidTransitionError
  ) {
    return HttpStatus.CONFLICT;
  }
  if (error instanceof TenantSuspendedError) {
    return HttpStatus.SERVICE_UNAVAILABLE;
  }
  if (
    error instanceof InvalidResetTokenError ||
    error instanceof InvalidTotpCodeError ||
    error instanceof InvitationNotAcceptableError ||
    error instanceof InvalidAuditEventError ||
    error instanceof UnknownSettingKeyError ||
    error instanceof InvalidSettingValueError ||
    error instanceof InvalidRegistrationInputError ||
    error instanceof FeatureDependenciesMissingError ||
    error instanceof UnknownFeatureKeyError ||
    error instanceof ManualGrantExpiryRequiredError ||
    error instanceof PlanClosureInvalidError ||
    // PHASE-006 rule violations (422): draft shapes/signs, tracking flags,
    // price-list windows, import files, immutable seeds, category trees.
    error instanceof OpeningBalanceDraftError ||
    error instanceof TrackingFlagsInvalidError ||
    error instanceof PriceListInvalidError ||
    error instanceof ImportFileInvalidError ||
    error instanceof ImportNotPreviewedError ||
    error instanceof CategoryCycleError ||
    error instanceof CategoryParentArchivedError ||
    error instanceof SystemCreditTermsImmutableError ||
    error instanceof SystemUomImmutableError
  ) {
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }
  // PHASE-013 reporting policy rejections (422): params, export block,
  // version mismatch (ERROR_MODEL; ASSERTION_FAILED export block).
  if (
    error instanceof AssertionFailedExportBlockedError ||
    error instanceof ReportParamsInvalidError ||
    error instanceof ContractVersionMismatchError
  ) {
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }
  return HttpStatus.UNPROCESSABLE_ENTITY;
}

function fromDomain(error: DomainError): ErrorBody {
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    retryable: false,
  };
}

function retryAfterOf(error: DomainError): number | undefined {
  if (error instanceof RateLimitedError) {
    return error.retryAfterSeconds;
  }
  if (error instanceof AccountLockedError) {
    return error.retryAfterSeconds; // header only — body stays uniform (§5.2)
  }
  return undefined;
}
