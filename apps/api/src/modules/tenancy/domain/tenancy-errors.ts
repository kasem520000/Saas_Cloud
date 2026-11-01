import { DomainError } from "@erp/domain-core";

/**
 * PHASE-004 tenancy domain errors (ERROR_MODEL §2: codes are contracts,
 * messages are display-only). HTTP statuses are mapped once in the
 * ErrorModelFilter.
 */

/** 409 — invalid tenant status transition (lifecycle state machine). */
export class InvalidTenantTransitionError extends DomainError {
  constructor(current: string, attempted: string) {
    super(
      "tenancy/invalid-tenant-transition",
      `Cannot ${attempted} a tenant in state ${current}`,
      { current, attempted },
    );
  }
}

/** 409 — business email already owns a membership account. */
export class EmailAlreadyRegisteredError extends DomainError {
  constructor() {
    super(
      "tenancy/email-already-registered",
      "This email is already registered — sign in instead",
    );
  }
}

/** 422 — country/currency/template inputs that are not seeded values. */
export class InvalidRegistrationInputError extends DomainError {
  constructor(message: string) {
    super("tenancy/invalid-registration-input", message);
  }
}

/** 409 — duplicate branch code per tenant (natural key). */
export class BranchCodeTakenError extends DomainError {
  constructor(code: string) {
    super("tenancy/branch-code-taken", `Branch code ${code} already exists`);
  }
}

/** 403 — cross-branch reference outside the membership's granted scope (§5). */
export class BranchScopeViolationError extends DomainError {
  constructor(branchId: string) {
    super(
      "tenancy/branch-scope-violation",
      "Branch is outside your granted branch scope",
      { branchId },
    );
  }
}

/** 403 — inactive branches reject new documents (acceptance 3 contract). */
export class BranchNotActiveError extends DomainError {
  constructor(branchId: string) {
    super("tenancy/branch-not-active", "Branch is inactive and rejects new documents", {
      branchId,
    });
  }
}

/**
 * 403 feature_not_entitled — BR-039 server-side enforcement: the tenant's
 * materialized entitlements do not carry the feature key.
 */
export class FeatureNotEntitledError extends DomainError {
  constructor(featureKey: string) {
    super(
      "tenancy/feature-not-entitled",
      "Feature is not enabled for this tenant",
      { featureKey },
    );
  }
}

/**
 * 422 — BR-040 dependency-closure rejection: activating the feature needs
 * keys the tenant does not carry; the details list them specifically.
 */
export class FeatureDependenciesMissingError extends DomainError {
  constructor(featureKey: string, missing: readonly string[]) {
    super(
      "tenancy/feature-dependencies-missing",
      "Feature activation requires its dependency closure",
      { featureKey, missing },
    );
  }
}

/** 422 — grant targets a key outside the FEATURE_CATALOG. */
export class UnknownFeatureKeyError extends DomainError {
  constructor(featureKey: string) {
    super("tenancy/unknown-feature-key", "Unknown feature key", { featureKey });
  }
}

/** 404 — plan key not seeded/active. */
export class PlanNotFoundError extends DomainError {
  constructor(planKey: string) {
    super("tenancy/plan-not-found", `Unknown subscription plan: ${planKey}`);
  }
}

/** 403 — support access requires opt-in or an incident ticket (§7 rule 1). */
export class SupportAccessDeniedError extends DomainError {
  constructor() {
    super(
      "tenancy/support-access-denied",
      "Support access requires a tenant opt-in or a declared incident ticket",
    );
  }
}

/** 403 — the time-box elapsed (§7 rule 2); every action re-checks expiry. */
export class SupportSessionExpiredError extends DomainError {
  constructor() {
    super("tenancy/support-session-expired", "Support session has expired");
  }
}

/** 409 — operating on a support session that is not ACTIVE. */
export class SupportSessionNotActiveError extends DomainError {
  constructor(status: string) {
    super("tenancy/support-session-not-active", `Support session is ${status}`);
  }
}

/** 422 — overrides must expire (SUBSCRIPTION §9 mandatory fields). */
export class ManualGrantExpiryRequiredError extends DomainError {
  constructor() {
    super(
      "tenancy/manual-grant-expiry-required",
      "Manual/promo/trial entitlement grants must carry an expiry (renew deliberately)",
    );
  }
}

/**
 * 409 — a plan definition whose own keys violate BR-040 cannot be assigned
 * (the seed guarantee enforced at runtime too).
 */
export class PlanClosureInvalidError extends DomainError {
  constructor(
    planKey: string,
    violations: ReadonlyArray<{ featureKey: string; missing: readonly string[] }>,
  ) {
    super("tenancy/plan-closure-invalid", "Plan feature keys violate dependency closure", {
      planKey,
      violations,
    });
  }
}

// ---------------------------------------------------------------------------
// PHASE-014 billing / usage / read-only errors (ERROR_MODEL §2: codes are
// contracts; statuses mapped once in the ErrorModelFilter).
// ---------------------------------------------------------------------------

/**
 * 403 subscription_read_only — read-only grace state (SUBSCRIPTION §8):
 * the tenant is in GRACE; state-changing routes fail with this typed error
 * naming the resolving action. Reads, reports, exports and printing stay
 * alive — they never reach this error.
 */
export class SubscriptionReadOnlyError extends DomainError {
  constructor(detail: string) {
    super(
      "subscription/read-only",
      "Subscription is in the read-only grace period — posting and changes are paused until payment",
      { resolvingAction: "pay", detail },
    );
  }
}

/** 422 limit_exceeded — hard block on a creation action (§6 matrix). */
export class LimitExceededError extends DomainError {
  constructor(counterKey: string, limit: number, current: number) {
    super(
      "subscription/limit-exceeded",
      `Limit reached for ${counterKey}: ${current}/${limit} — upgrade the plan or free a slot`,
      { counterKey, limit, current },
    );
  }
}

/** 422 — plan downgrade blocked because current usage exceeds the target plan's limits. */
export class DowngradeBlockedError extends DomainError {
  constructor(blockers: ReadonlyArray<{ counterKey: string; current: number; limit: number }>) {
    super(
      "subscription/downgrade-blocked",
      "Downgrade blocked: current usage exceeds the target plan's limits",
      { blockers },
    );
  }
}

/** 401 — webhook signature verification failed (SECRETS_MANAGEMENT; never leak which part failed). */
export class WebhookSignatureInvalidError extends DomainError {
  constructor() {
    super("billing/webhook-signature-invalid", "Webhook signature verification failed");
  }
}

/** 409 — the provider event was already processed (replay) — handled idempotently, never an error to the caller. */
export class WebhookReplayError extends DomainError {
  constructor(providerEventId: string) {
    super("billing/webhook-replay", "Provider event already processed", { providerEventId });
  }
}

/** 404 — checkout session / invoice not found in this tenant. */
export class BillingRecordNotFoundError extends DomainError {
  constructor(kind: string, id: string) {
    super("billing/not-found", `${kind} not found`, { kind, id });
  }
}

/** 409 — invalid subscription lifecycle transition (state machine). */
export class InvalidSubscriptionTransitionError extends DomainError {
  constructor(current: string, attempted: string) {
    super(
      "subscription/invalid-transition",
      `Cannot ${attempted} a subscription in state ${current}`,
      { current, attempted },
    );
  }
}

/** 422 — checkout against a plan the tenant already holds, or a malformed provider payload. */
export class CheckoutInvalidError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("billing/checkout-invalid", message, details);
  }
}
