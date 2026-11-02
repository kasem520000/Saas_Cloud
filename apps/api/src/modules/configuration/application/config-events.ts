import { EventEmitter } from "node:events";

/**
 * In-process domain events (PHASE-004 §4 module dependencies;
 * MODULE_BOUNDARIES.md; CONFIGURATION_ENGINE §9 cache-invalidation table):
 * `tenant.updated`, `tenant.suspended`, `settings.changed`,
 * `entitlements.changed`, `plan.changed`, `branch.updated` — emitted by
 * the tenancy module, consumed by configuration (config-cache
 * invalidation) and identity (suspension semantics fan-out; ADR-0008 —
 * the in-process bus is the PHASE-004 substrate, pg-boss carries the
 * job-driven variants with the later device/sync phases).
 *
 * The bus is deliberately tiny: typed publish/subscribe with no
 * persistence — consumers act inside the emitting request's envelope;
 * anything that must survive a crash belongs to a queue, not here.
 */

export type TenancyEvent =
  | { readonly type: "tenant.updated"; readonly tenantId: string }
  | { readonly type: "tenant.suspended"; readonly tenantId: string; readonly reason: string }
  | { readonly type: "tenant.restored"; readonly tenantId: string; readonly reason: string }
  | { readonly type: "settings.changed"; readonly tenantId: string; readonly key: string }
  | {
      readonly type: "entitlements.changed";
      readonly tenantId: string;
      readonly featureKey: string;
      readonly change: "granted" | "revoked";
    }
  | { readonly type: "plan.changed"; readonly tenantId: string; readonly planKey: string }
  | { readonly type: "branch.updated"; readonly tenantId: string; readonly branchId: string }
  // -- PHASE-015 additions (CONFIGURATION_ENGINE §9 full invalidation table) --
  | { readonly type: "template.applied"; readonly tenantId: string; readonly templateKey: string }
  | {
      readonly type: "template.switched";
      readonly tenantId: string;
      readonly fromKey: string;
      readonly toKey: string;
    }
  | { readonly type: "pack.upgraded"; readonly tenantId: string; readonly packVersion: string }
  | {
      readonly type: "module.installed" | "module.deactivated";
      readonly tenantId: string;
      readonly module: string;
    }
  | { readonly type: "policy.changed"; readonly tenantId: string; readonly key: string }
  // L6 events: request-overlay scope only — they must NEVER drop the
  // tenant-static cache (the overlay is computed per request, never cached).
  | { readonly type: "role.updated"; readonly tenantId: string; readonly roleId: string }
  | { readonly type: "membership.updated"; readonly tenantId: string; readonly userId: string };

const BUS = new EventEmitter();
BUS.setMaxListeners(50); // per-process consumers; leak-safe for the phase scope

/** Publish a tenancy event to every in-process consumer. */
export function publishTenancyEvent(event: TenancyEvent): void {
  BUS.emit(event.type, event);
}

/** Subscribe (returns the unsubscribe handle). Test/audit surface. */
export function onTenancyEvent(
  type: TenancyEvent["type"],
  listener: (event: TenancyEvent) => void,
): () => void {
  BUS.on(type, listener);
  return () => {
    BUS.off(type, listener);
  };
}

/**
 * Configuration cache (CONFIGURATION_ENGINE §9 "resolution" + cache
 * invalidation): tenant-static L5 snapshot keyed by tenant id, dropped
 * on every invalidating event. The full L1→L10 merge engine is PHASE-015;
 * PHASE-004 caches exactly the settings snapshot its services resolve.
 */
interface CachedSettings {
  entries: Readonly<Record<string, unknown>>;
  loadedAt: number;
}

const settingsCache = new Map<string, CachedSettings>();

export function cachedTenantSettings(
  tenantId: string,
): Readonly<Record<string, unknown>> | undefined {
  const cached = settingsCache.get(tenantId);
  if (cached === undefined) {
    return undefined;
  }
  return cached.entries;
}

export function storeTenantSettingsCache(
  tenantId: string,
  entries: Readonly<Record<string, unknown>>,
): void {
  settingsCache.set(tenantId, { entries, loadedAt: Date.now() });
}

export function invalidateTenantConfig(tenantId: string): void {
  settingsCache.delete(tenantId);
}

// Wire the §9 invalidation rules: tenant-level events drop the whole
// snapshot; settings.changed drops it too (targeted dependents — e.g.
// numbering displays — re-resolve lazily through the same cache miss).
// Tenant-static scope: dropped on every tenant-level invalidating event.
// L6 events (role.updated / membership.updated) are deliberately ABSENT —
// the request overlay is per-request and must never be cached (§9).
const TENANT_STATIC_EVENTS = [
  "tenant.updated",
  "tenant.suspended",
  "tenant.restored",
  "settings.changed",
  "entitlements.changed",
  "plan.changed",
  "branch.updated",
  "template.applied",
  "template.switched",
  "pack.upgraded",
  "module.installed",
  "module.deactivated",
  "policy.changed",
] as const;
for (const type of TENANT_STATIC_EVENTS) {
  BUS.on(type, (event: TenancyEvent) => {
    invalidateTenantConfig(event.tenantId);
  });
}

/** Test hook: drop everything (between specs). */
export function resetConfigurationCache(): void {
  settingsCache.clear();
}
