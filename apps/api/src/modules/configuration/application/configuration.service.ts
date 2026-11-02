import { Injectable } from "@nestjs/common";

import * as tenancyStore from "../../tenancy/infrastructure/tenancy.store";
import * as billingStore from "../../tenancy/infrastructure/billing.store";
import { resolveTenantStatic } from "./config-cache";
import type { EffectiveConfig, LayerInputs } from "../domain/resolve";
import { applyRequestOverlay } from "../domain/resolve";
import * as registry from "../infrastructure/template-registry.store";
import { validateManifest, type IndustryManifest } from "../domain/industry-manifest";

/**
 * PHASE-015 T1/T8 — the configuration module's published service
 * (DEPENDENCY_RULES §1: other modules read the effective config ONLY through
 * this surface — never the engine internals). Runs inside the ambient tenant
 * scope (like every tenancy-plane service); resolves the tenant-static merge
 * via the content-hashed cache and applies the per-request L6 overlay when a
 * principal is given (never cached).
 */

@Injectable()
export class ConfigurationService {
  /** Tenant-static effective config (cached + content-hashed; §3 step 6). */
  async resolveEffectiveConfig(): Promise<EffectiveConfig> {
    return resolveTenantStatic(await this.loadLayerInputs());
  }

  /** Request-scoped resolution: tenant-static merge + L6 overlay. */
  async resolveForRequest(principal: {
    userId: string;
    role: string;
    branchScope: readonly string[];
    permissions: readonly string[];
  }): Promise<EffectiveConfig & { requestOverlay: unknown }> {
    const config = await this.resolveEffectiveConfig();
    return applyRequestOverlay(config, principal);
  }

  /** The tenant's applied template manifest (validated), or null. */
  async appliedTemplate(): Promise<IndustryManifest | null> {
    const applied = await registry.getAppliedConfig();
    if (applied === undefined) {
      return null;
    }
    const row = await registry.findTemplate(applied.templateKey);
    if (row === undefined) {
      return null;
    }
    return validateManifest(row.manifest);
  }

  /** List the active template registry (for selection UIs). */
  async listTemplates(): Promise<registry.IndustryTemplateRow[]> {
    return registry.listTemplates(true);
  }

  private async loadLayerInputs(): Promise<LayerInputs> {
    const tenant = await tenancyStore.getOwnTenant();
    const applied = await registry.getAppliedConfig();
    const templateRow =
      applied !== undefined ? await registry.findTemplate(applied.templateKey) : undefined;
    const manifest = templateRow !== undefined ? validateManifest(templateRow.manifest) : null;

    const [settings, entitlements, branches, subscription, flags] = await Promise.all([
      tenancyStore.listSettings(),
      tenancyStore.listActiveEntitlements(),
      tenancyStore.listBranches(null),
      billingStore.liveSubscription(),
      registry.listFeatureFlags(),
    ]);
    const plan =
      subscription !== undefined ? await tenancyStore.findPlanById(subscription.planId) : undefined;

    const l5 = Object.fromEntries(settings.map((s) => [s.key, s.value])) as Record<string, unknown>;

    return {
      tenantId: tenant.id,
      industryTemplate: applied?.templateKey ?? tenant.industryTemplateKey ?? null,
      jurisdiction: tenant.countryCode,
      baseCurrency: tenant.baseCurrency,
      l1:
        manifest !== null && templateRow !== undefined
          ? { templateKey: templateRow.key, version: templateRow.version, manifest }
          : null,
      l2: {
        countryCode: tenant.countryCode,
        packVersion: "2026.10",
        vatStatus: l5["tax.registration.status"] === "REGISTERED" ? "VAT_IN_FORCE" : "NOT_REGISTERED",
        tenantRegistration: String(l5["tax.registration.status"] ?? "NOT_REGISTERED"),
      },
      l3: {
        planKey: plan?.key ?? "trial",
        limits: (plan?.limits ?? {}) as Record<string, number | null>,
      },
      l4: {
        active: entitlements.map((e) => e.featureKey),
        sources: Object.fromEntries(entitlements.map((e) => [e.featureKey, e.source])),
      },
      l5,
      l7: branches.map((b) => ({ branchId: b.id, code: b.code })),
      l8: Object.fromEntries(flags.map((f) => [f.key, f.enabled])),
      l10: {},
    } satisfies LayerInputs;
  }
}
