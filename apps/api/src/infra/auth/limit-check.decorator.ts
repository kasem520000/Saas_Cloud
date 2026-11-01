import { SetMetadata } from "@nestjs/common";

import type { HardBlockKind } from "../../modules/tenancy/api";

/**
 * PHASE-014 T6 — limit-check marker (§6 hard-block matrix): routes that
 * CREATE a limited resource declare the kind; the UsageLimitsGuard resolves
 * the tenant's plan limit and blocks at the ceiling with the typed
 * `limit_exceeded` error naming the limit and current usage. Only creation
 * actions are annotated — posting routes are NEVER annotated (the binding
 * principle: a billing counter never blocks a posting, INV-022).
 */
export const LIMIT_CHECK_KEY = "tenancy:limitCheck";

export function LimitCheck(kind: HardBlockKind): MethodDecorator {
  return SetMetadata(LIMIT_CHECK_KEY, kind) as MethodDecorator;
}
