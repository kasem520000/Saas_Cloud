/**
 * Public surface of the tenancy module (DEPENDENCY_RULES §1 `api/`):
 * PHASE-014 additions — the usage/limit port consumed by the posting engine
 * and resource-creation services (counters NEVER gate posting — INV-022),
 * and the subscription read-only projection used by the HTTP guard.
 */
export { UsageService, type UsageSnapshot, type HardBlockKind } from "../application/usage-service";
export {
  tenantSubscriptionReadOnly,
  PLATFORM_TENANT_ID,
} from "../infrastructure/subscription-guard-projection";
