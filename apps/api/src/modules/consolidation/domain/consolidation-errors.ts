import { DomainError } from "@erp/domain-core";

/**
 * PHASE-034 consolidation module domain errors (ADR-0018; ERROR_MODEL §4).
 * Codes are stable API contracts; foreign-tenant references render as 404
 * (no existence disclosure, A7).
 */

export class ConsolidationGroupNotFoundError extends DomainError {
  constructor(id: string) {
    super("CONSOLIDATION_GROUP_NOT_FOUND", `consolidation group ${id} does not exist in this tenant`);
  }
}

export class ForeignTenantRefError extends DomainError {
  constructor() {
    super("FOREIGN_TENANT_REF", "referenced tenant is not a member of this consolidation group");
  }
}

export class MemberPeriodOpenError extends DomainError {
  constructor(memberTenantId: string) {
    super("MEMBER_PERIOD_OPEN", `member tenant ${memberTenantId} has an open fiscal period — runs require closed member periods (BR-056)`);
  }
}

export class EliminationNotBalancedError extends DomainError {
  constructor(difference: string) {
    super("ENTRY_NOT_BALANCED", `elimination entry is not balanced — difference ${difference}`);
  }
}

export class EliminationAlreadyPostedError extends DomainError {
  constructor(id: string) {
    super("ALREADY_POSTED", `elimination entry ${id} is already POSTED — corrections are reversal-only counter-entries (BR-056)`);
  }
}

export class EliminationNotDraftError extends DomainError {
  constructor(id: string, status: string) {
    super("ELIMINATION_NOT_DRAFT", `elimination entry ${id} is ${status} — only DRAFT entries post`);
  }
}

export class FxRateMissingError extends DomainError {
  constructor(currency: string, date: string) {
    super("RATE_MISSING", `no dated exchange rate for ${currency} as of ${date} (INV-008, fail-closed)`);
  }
}

export class RunNotCompletableError extends DomainError {
  constructor(id: string, status: string) {
    super("RUN_STATE_INVALID", `consolidation run ${id} is ${status} — only QUEUED runs execute`);
  }
}
