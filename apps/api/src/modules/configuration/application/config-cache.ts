import { createHash } from "node:crypto";

import type { EffectiveConfig, LayerInputs } from "../domain/resolve";
import { resolveEffectiveConfig } from "../domain/resolve";
import { onTenancyEvent } from "./config-events";

/**
 * PHASE-015 T1/T2 — the tenant-static effective-config cache
 * (CONFIGURATION_ENGINE §3 step 6 + §9): keyed by tenant, validated against
 * the content hash of the layer INPUTS — a hash mismatch forces
 * re-resolution, so a slow/missed invalidation can never serve
 * stale-but-wrong data. Event-driven drops ride on the §9 bus
 * (config-events); L6 request overlays are never cached here.
 */

interface CacheEntry {
  inputsHash: string;
  config: EffectiveConfig;
  loadedAt: number;
}

const cache = new Map<string, CacheEntry>();

export function hashLayerInputs(inputs: LayerInputs): string {
  const canonical = JSON.stringify(inputs, (_key, value) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : value,
  );
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Resolve (or serve from cache) the tenant-static effective config. The layer
 * inputs are always loaded fresh; the cache only skips the merge+validate when
 * the inputs hash matches — determinism is therefore preserved by construction.
 */
export function resolveTenantStatic(inputs: LayerInputs): EffectiveConfig {
  const inputsHash = hashLayerInputs(inputs);
  const cached = cache.get(inputs.tenantId);
  if (cached !== undefined && cached.inputsHash === inputsHash) {
    return cached.config;
  }
  const config = resolveEffectiveConfig(inputs);
  cache.set(inputs.tenantId, { inputsHash, config, loadedAt: Date.now() });
  return config;
}

/** Drop one tenant's entry (called directly + via the §9 event bus below). */
export function dropTenantConfig(tenantId: string): void {
  cache.delete(tenantId);
}

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

// §9 event-driven invalidation of the tenant-static cache. L6 events are
// intentionally excluded — the request overlay is never cached.
for (const type of TENANT_STATIC_EVENTS) {
  onTenancyEvent(type, (event) => {
    dropTenantConfig(event.tenantId);
  });
}

/** Test hook: drop everything (between specs). */
export function resetEffectiveConfigCache(): void {
  cache.clear();
}
