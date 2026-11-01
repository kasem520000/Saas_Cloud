import { DomainError } from "@erp/domain-core";

/**
 * Identity error registry (ERROR_MODEL §4: module-scoped codes are
 * contracts). HTTP mapping happens in the exception filter:
 * INVALID_CREDENTIALS → 401, MFA_REQUIRED → 423, ACCOUNT_LOCKED → 401 with
 * details.retryAfterSeconds (indistinguishable from credential failure —
 * AUTHENTICATION §5.2), RATE_LIMITED → 429 + Retry-After.
 */

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super("INVALID_CREDENTIALS", "email or password is incorrect");
  }
}

export class AccountLockedError extends DomainError {
  constructor(readonly retryAfterSeconds: number) {
    super("UNAUTHENTICATED", "email or password is incorrect", {
      retryAfterSeconds,
    });
  }
}

export class RateLimitedError extends DomainError {
  constructor(readonly retryAfterSeconds: number) {
    super("RATE_LIMITED", "too many attempts — retry later", {
      retryAfterSeconds,
    });
  }
}

export class MfaRequiredError extends DomainError {
  constructor() {
    super("MFA_REQUIRED", "a verification code from your authenticator is required");
  }
}

export class UnauthenticatedError extends DomainError {
  constructor() {
    super("UNAUTHENTICATED", "authentication is required");
  }
}

export class ForbiddenError extends DomainError {
  constructor(readonly permissionKey: string) {
    super("FORBIDDEN", "you do not have permission to perform this action", {
      permissionKey,
    });
  }
}

export class SessionRevokedError extends DomainError {
  constructor() {
    super("UNAUTHENTICATED", "session is no longer valid");
  }
}

export class TenantSuspendedError extends DomainError {
  constructor() {
    super("TENANT_SUSPENDED", "tenant is suspended — contact the platform operator");
  }
}

export class InvalidTotpCodeError extends DomainError {
  constructor() {
    super("VALIDATION_ERROR", "the verification code is not valid");
  }
}

export class InvalidResetTokenError extends DomainError {
  constructor() {
    super("VALIDATION_ERROR", "the reset link is invalid or has expired");
  }
}

export class InvitationNotAcceptableError extends DomainError {
  constructor(readonly reason: "expired" | "revoked" | "accepted") {
    super("VALIDATION_ERROR", "this invitation is no longer acceptable", { reason });
  }
}

export class NotFoundError extends DomainError {
  constructor(readonly resource: string) {
    super("NOT_FOUND", `${resource} not found`);
  }
}

export class StaleVersionError extends DomainError {
  constructor() {
    super("STALE_VERSION", "the resource changed — reload and retry");
  }
}

export class TenantContextRequiredError extends DomainError {
  constructor() {
    super("FORBIDDEN", "an active tenant membership is required");
  }
}
