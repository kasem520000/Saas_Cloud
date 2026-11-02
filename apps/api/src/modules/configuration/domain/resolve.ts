import { createHash } from "node:crypto";

import { DomainError } from "@erp/domain-core";

import type { IndustryManifest } from "./industry-manifest";
import { SETTINGS_REGISTRY } from "./settings-schema";

/**
 * PHASE-015 T1 — the ten-layer resolution engine core
 * (CONFIGURATION_ENGINE §3 resolution algorithm + precedence table, §5
 * effective-config shape, §6 safety rules). Pure functions over layer inputs —
 * the stores/services feed it; determinism and fail-closed validation are
 * property-tested (resolution-engine.spec).
 *
 * Layer order (tenant-static): L1 template → L2 jurisdiction → L3 plan →
 * L4 entitlements → L5 tenant settings → L7 branch → L8 modules → L10 policy.
 * L6 (request overlay) and L9 (nav derivation) are computed per request on top
 * and are NEVER part of the cached/hashed tenant-static result.
 */

export class ConfigurationResolutionError extends DomainError {
  constructor(readonly issues: readonly string[]) {
    super(
      "configuration/resolution-failed",
      `Effective config resolution failed closed: ${issues.join("; ")}`,
    );
    this.name = "ConfigurationResolutionError";
  }
}

export interface L1Input {
  templateKey: string;
  version: string;
  manifest: IndustryManifest;
}

export interface L2Input {
  countryCode: string;
  packVersion: string;
  vatStatus: string;
  tenantRegistration: string;
}

export interface L3Input {
  planKey: string;
  limits: Record<string, number | null>;
}

export interface L4Input {
  active: readonly string[];
  sources: Readonly<Record<string, string>>;
}

export interface L7BranchInput {
  branchId: string;
  code: string;
  numberingSeries?: string;
  defaultWarehouseId?: string;
  cashAccountId?: string;
}

export interface LayerInputs {
  tenantId: string;
  industryTemplate: string | null;
  jurisdiction: string;
  baseCurrency: string;
  l1: L1Input | null;
  l2: L2Input;
  l3: L3Input;
  l4: L4Input;
  l5: Readonly<Record<string, unknown>>;
  l7: readonly L7BranchInput[];
  l8: Readonly<Record<string, boolean>>;
  l10: Readonly<Record<string, unknown>>;
}

export interface EffectiveConfig {
  configVersion: 3;
  resolvedHash: string;
  tenant: {
    id: string;
    industryTemplate: string | null;
    jurisdiction: string;
    baseCurrency: string;
  };
  layers: {
    l1Template: { key: string; version: string; manifestHash: string } | null;
    l2JurisdictionPack: L2Input;
    l3Plan: L3Input;
    l4Entitlements: { active: string[]; sources: Record<string, string> };
    l7BranchDefaults: Record<string, Omit<L7BranchInput, "branchId" | "code">>;
    l8Installed: Record<string, boolean>;
  };
  policies: Record<string, string | number | boolean>;
  ui: {
    terminology: Record<string, { en: string; ar: string }>;
    navigationGroups: string[];
    emphasis: string[];
    reportPins: string[];
  };
  invariantsNote: string;
}

const PLATFORM_POLICY_DEFAULTS: Readonly<Record<string, string | number | boolean>> = {
  "sales.cash_autopost": false,
  "inventory.allow_negative_stock": false,
  "inventory.fefo_for_expiry_items": true,
  "numbering.sales_invoice.assign_at": "posting",
};

/** Keys that only L2 may publish (CONFIGURATION_ENGINE §3 precedence: tax = L2 only). */
const L2_ONLY_PREFIXES = ["tax.rates", "tax.treatments", "tax.invoice_legal"];

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Merge the tenant-static layers into the effective config. Fail-closed:
 * any unknown/untypeable key in the merged policy set throws — a partially
 * resolved config never reaches a module (§6.6).
 */
export function resolveEffectiveConfig(inputs: LayerInputs): EffectiveConfig {
  const issues: string[] = [];

  // L5 tenant settings must be known, typed keys (§4 governance).
  for (const [key, value] of Object.entries(inputs.l5)) {
    const def = SETTINGS_REGISTRY[key];
    if (def === undefined) {
      issues.push(`L5 unknown setting key: ${key}`);
      continue;
    }
    const parsed = def.schema.safeParse(value);
    if (!parsed.success) {
      issues.push(`L5 ${key}: type violation`);
    }
  }
  // L10 policy keys must be known settings or template-published policies.
  const templatePolicies = inputs.l1 !== null ? inputs.l1.manifest.workflow_policies : {};
  for (const key of Object.keys(inputs.l10)) {
    if (SETTINGS_REGISTRY[key] === undefined && templatePolicies[key] === undefined) {
      issues.push(`L10 unknown policy key: ${key}`);
    }
  }
  // Tax facts are L2-only: tenant layers may never carry them (§3 precedence).
  for (const key of [...Object.keys(inputs.l5), ...Object.keys(inputs.l10)]) {
    if (L2_ONLY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      issues.push(`tax key ${key} is L2-only; tenant layers may not set it`);
    }
  }
  if (issues.length > 0) {
    throw new ConfigurationResolutionError(issues);
  }

  // Policy merge per precedence: L10 > L5 > L1 template defaults > platform default.
  const policies: Record<string, string | number | boolean> = {
    ...PLATFORM_POLICY_DEFAULTS,
    ...(inputs.l1 !== null ? templatePolicies : {}),
    ...(inputs.l5 as Record<string, string | number | boolean>),
    ...(inputs.l10 as Record<string, string | number | boolean>),
  };

  const l4active = [...inputs.l4.active].sort();
  const ui = {
    terminology:
      inputs.l1 !== null
        ? (Object.fromEntries(
            Object.entries(inputs.l1.manifest.terminology_overrides),
          ) as Record<string, { en: string; ar: string }>)
        : {},
    navigationGroups:
      inputs.l1 !== null
        ? [...inputs.l1.manifest.navigation_manifest.groups]
            .sort((a, b) => a.order - b.order)
            .map((g) => g.id)
        : [],
    emphasis:
      inputs.l1 !== null
        ? [...inputs.l1.manifest.navigation_manifest.groups]
            .sort((a, b) => a.order - b.order)
            .slice(0, 2)
            .map((g) => g.id)
        : [],
    reportPins:
      inputs.l1 !== null
        ? inputs.l1.manifest.report_defaults.filter((r) => r.pinned).map((r) => r.report_key)
        : [],
  };

  const tenantStatic = {
    tenant: {
      id: inputs.tenantId,
      industryTemplate: inputs.industryTemplate,
      jurisdiction: inputs.jurisdiction,
      baseCurrency: inputs.baseCurrency,
    },
    layers: {
      l1Template:
        inputs.l1 !== null
          ? {
              key: inputs.l1.templateKey,
              version: inputs.l1.version,
              manifestHash: sha256Hex(canonicalJson(inputs.l1.manifest)),
            }
          : null,
      l2JurisdictionPack: inputs.l2,
      l3Plan: inputs.l3,
      l4Entitlements: { active: l4active, sources: { ...inputs.l4.sources } },
      l7BranchDefaults: Object.fromEntries(
        inputs.l7.map((b) => [
          b.code,
          {
            ...(b.numberingSeries !== undefined ? { numberingSeries: b.numberingSeries } : {}),
            ...(b.defaultWarehouseId !== undefined
              ? { defaultWarehouseId: b.defaultWarehouseId }
              : {}),
            ...(b.cashAccountId !== undefined ? { cashAccountId: b.cashAccountId } : {}),
          },
        ]),
      ),
      l8Installed: { ...inputs.l8 },
    },
    policies,
    ui,
  };

  return {
    configVersion: 3,
    resolvedHash: `sha256:${sha256Hex(canonicalJson(tenantStatic))}`,
    ...tenantStatic,
    invariantsNote: "INV-001…INV-022 are NOT part of config; they are enforced below it.",
  };
}

/** L6 request overlay (never cached): intersect actions with permissions + branch scope. */
export function applyRequestOverlay(
  config: EffectiveConfig,
  overlay: { userId: string; role: string; branchScope: readonly string[]; permissions: readonly string[] },
): EffectiveConfig & { requestOverlay: unknown } {
  return {
    ...config,
    requestOverlay: {
      userId: overlay.userId,
      role: overlay.role,
      branchScope: [...overlay.branchScope],
      actions: [...overlay.permissions].sort(),
    },
  };
}
