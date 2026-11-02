import { createHash } from "node:crypto";

import { z } from "zod";

import { DomainError } from "@erp/domain-core";

import { FEATURE_KEYS, isKnownFeatureKey } from "./feature-catalog";

/**
 * PHASE-015 T3 — the industry-template manifest schema
 * (docs/industries/README.md §3) as zod contracts mirroring the JSON Schema,
 * plus the CAPABILITY_MATRIX §3 declared intake set (keys pending catalog
 * intake — phase-gated, resolvable for manifest validation).
 *
 * Fail-closed rule (README §3 / CONFIGURATION_ENGINE §6.6): no manifest ships
 * or upgrades without passing `validateManifest`; unknown keys, bad enums and
 * orphan module references are rejected loudly — never silently dropped.
 */

/** CAPABILITY_MATRIX §3 — proposed keys pending FEATURE_CATALOG intake. */
export const INTAKE_FEATURE_KEYS: readonly string[] = Object.freeze([
  "pos.table_service",
  "pos.kitchen_display",
  "sales.job_cards",
  "crm.rental_contracts",
  "crm.contract_deposits",
  "crm.late_fees",
  "distribution.shipment_tracking",
]);

export function isResolvableFeatureKey(key: string): boolean {
  return isKnownFeatureKey(key) || INTAKE_FEATURE_KEYS.includes(key);
}

const localizedText = z.object({ en: z.string().min(1).max(200), ar: z.string().min(1).max(200) });

const featureKey = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/, "feature key shape module.name");

const moduleName = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,30}$/, "module name shape");

const documentType = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,40}$/, "document type shape");

const numberingRule = z.object({
  prefix: z.string().min(1).max(8),
  format: z.string().min(3).max(60),
  per_branch: z.boolean().default(false),
  reserve_on_approval: z.boolean().default(false),
});

const navItem = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  label: localizedText,
  target: z.string().min(1).max(120),
  feature_key: featureKey.optional(),
});

const navGroup = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  label: localizedText,
  order: z.number().int().min(0).max(100),
  items: z.array(navItem).min(1),
});

const navigationManifest = z.object({ groups: z.array(navGroup).min(1) });

const capabilityLevel = z.enum(["REQUIRED", "OPTIONAL"]);

const capabilityPrerequisite = z.object({
  level: capabilityLevel,
  feature_keys: z.array(featureKey).min(1),
  available_from_phase: z.string().regex(/^PHASE-\d{3}$/),
});

const onboardingStep = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  title: localizedText,
  required: z.boolean(),
  feature_key: featureKey.optional(),
});

const reportDefault = z.object({
  report_key: z.string().regex(/^[a-z][a-z0-9_]*\.[a-z0-9_-]+$/),
  pinned: z.boolean(),
  dashboard: z.boolean().default(false),
  default_period: z.enum(["today", "this_week", "this_month", "this_year", "custom"]).default("custom"),
});

const inventoryPolicyDefaults = z.object({
  costing_method: z.enum(["WAC", "FIFO", "LIFO", "FEFO", "SPECIFIC"]),
  default_track_batch: z.boolean(),
  default_track_expiry: z.boolean(),
  default_track_serial: z.boolean(),
  default_imei_tracking: z.boolean(),
  fefo_picking: z.boolean(),
  allow_negative_stock: z.boolean(),
});

export const industryManifestSchema = z
  .object({
    id: z.string().regex(/^industry\.[a-z][a-z0-9_]{2,30}$/),
    name: z.string().min(1).max(80),
    name_ar: z.string().min(1).max(80),
    description: z.string().max(500).optional(),
    description_ar: z.string().max(500).optional(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    inherits: z.string().regex(/^industry\.[a-z][a-z0-9_]{2,30}$/).optional(),
    required_feature_keys: z.array(featureKey).min(1).refine((a) => new Set(a).size === a.length, "duplicate feature keys"),
    default_modules_enabled: z.array(moduleName).refine((a) => new Set(a).size === a.length, "duplicate modules"),
    terminology_overrides: z.record(
      z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/),
      localizedText,
    ),
    navigation_manifest: navigationManifest,
    workflow_policies: z.record(
      z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)?$/),
      z.union([z.string(), z.number(), z.boolean()]),
    ),
    document_numbering_defaults: z.record(documentType, numberingRule),
    inventory_policy_defaults: inventoryPolicyDefaults,
    report_defaults: z.array(reportDefault).refine((a) => new Set(a.map((r) => r.report_key)).size === a.length, "duplicate report keys"),
    onboarding_steps: z.array(onboardingStep).min(3).refine((a) => new Set(a.map((s) => s.id)).size === a.length, "duplicate step ids"),
    capability_prerequisites: z.record(z.string(), capabilityPrerequisite),
  })
  .strict();

export type IndustryManifest = z.infer<typeof industryManifestSchema>;

export class InvalidManifestError extends DomainError {
  constructor(readonly issues: readonly string[]) {
    super("configuration/invalid-manifest", `Industry template manifest invalid: ${issues.join("; ")}`);
    this.name = "InvalidManifestError";
  }
}

/**
 * Validate a raw manifest (fail closed). Beyond the zod shape, the README §3
 * governance rules are enforced here: every `required_feature_keys` entry and
 * every capability prerequisite key must resolve in FEATURE_CATALOG or the
 * declared intake set (no orphan keys), and navigation `feature_key`s must
 * resolve too.
 */
export function validateManifest(raw: unknown): IndustryManifest {
  const parsed = industryManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new InvalidManifestError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }
  const manifest = parsed.data;
  const issues: string[] = [];
  const allKeys = [
    ...manifest.required_feature_keys,
    ...Object.values(manifest.capability_prerequisites).flatMap((c) => c.feature_keys),
    ...manifest.navigation_manifest.groups.flatMap((g) =>
      g.items.flatMap((i) => (i.feature_key !== undefined ? [i.feature_key] : [])),
    ),
    ...manifest.onboarding_steps.flatMap((s) => (s.feature_key !== undefined ? [s.feature_key] : [])),
  ];
  for (const key of allKeys) {
    if (!isResolvableFeatureKey(key)) {
      issues.push(`orphan feature key: ${key}`);
    }
  }
  if (issues.length > 0) {
    throw new InvalidManifestError(issues);
  }
  return manifest;
}

/** Deep canonical JSON (object keys sorted recursively) for stable hashing. */
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

/** Stable content hash of a validated manifest (sha256 of canonical JSON). */
export function manifestHash(manifest: IndustryManifest): string {
  return `sha256:${createHash("sha256").update(canonicalJson(manifest)).digest("hex")}`;
}

/** Known catalog keys for tests/docs. */
export const KNOWN_FEATURE_KEYS: readonly string[] = FEATURE_KEYS;
