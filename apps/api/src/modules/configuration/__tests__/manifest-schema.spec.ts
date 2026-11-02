import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  InvalidManifestError,
  manifestHash,
  validateManifest,
} from "../domain/industry-manifest";
import { REPORT_CONTRACTS } from "../../reporting/registry";

/**
 * PHASE-015 T3 — manifest schema validation (industries/README §3): the three
 * seeded manifests (migration 0022, single source of truth in the SQL) must
 * validate fail-closed; negative fixtures are rejected loudly.
 */

function seededManifests(): Record<string, unknown> {
  const sql = readFileSync(
    join(__dirname, "../../../../migrations/0022_industry_configuration.sql"),
    "utf8",
  );
  const blocks = [...sql.matchAll(/\$\$({.*?})\$\$::jsonb/gs)];
  expect(blocks.length).toBe(3);
  const out: Record<string, unknown> = {};
  for (const block of blocks) {
    const manifest = JSON.parse(block[1] as string);
    out[manifest.id] = manifest;
  }
  return out;
}

describe("industry-manifest schema (PHASE-015 T3)", () => {
  it("the three seeded manifests validate against the schema", () => {
    const manifests = seededManifests();
    for (const key of ["industry.retail", "industry.grocery", "industry.restaurant"]) {
      const manifest = validateManifest(manifests[key]);
      expect(manifest.id).toBe(key);
      expect(manifest.version).toBe("1.0.0");
      expect(manifest.onboarding_steps.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("manifestHash is deterministic and content-sensitive", () => {
    const manifests = seededManifests();
    const a = validateManifest(manifests["industry.retail"]);
    const hash1 = manifestHash(a);
    const hash2 = manifestHash(validateManifest(manifests["industry.retail"]));
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256:[0-9a-f]{64}$/);
    const retail = manifests["industry.retail"] as { workflow_policies: Record<string, unknown> };
    const tweaked = validateManifest({
      ...retail,
      workflow_policies: { ...retail.workflow_policies, extra: true },
    });
    expect(manifestHash(tweaked)).not.toBe(hash1);
  });

  it("negative fixtures fail loudly (fail-closed)", () => {
    const manifests = seededManifests();
    const base = manifests["industry.retail"] as Record<string, unknown>;
    // bad id shape
    expect(() => validateManifest({ ...base, id: "Retail" })).toThrow(InvalidManifestError);
    // bad version
    expect(() => validateManifest({ ...base, version: "1.0" })).toThrow(InvalidManifestError);
    // orphan feature key
    expect(() =>
      validateManifest({ ...base, required_feature_keys: ["no.such_key"] }),
    ).toThrow(InvalidManifestError);
    // unknown extra property (strict)
    expect(() => validateManifest({ ...base, smuggled: true })).toThrow(InvalidManifestError);
    // negative stock allowed as policy but wrong type rejected
    expect(() =>
      validateManifest({
        ...base,
        inventory_policy_defaults: { ...(base.inventory_policy_defaults as object), allow_negative_stock: "yes" },
      }),
    ).toThrow(InvalidManifestError);
    // unknown costing method
    expect(() =>
      validateManifest({
        ...base,
        inventory_policy_defaults: { ...(base.inventory_policy_defaults as object), costing_method: "LOT" },
      }),
    ).toThrow(InvalidManifestError);
    // too few onboarding steps
    expect(() =>
      validateManifest({ ...base, onboarding_steps: (base.onboarding_steps as unknown[]).slice(0, 2) }),
    ).toThrow(InvalidManifestError);
  });

  it("T10: every pinned industry report key resolves to a registered report contract", () => {
    const registered = new Set(REPORT_CONTRACTS.map((c) => c.id));
    const manifests = seededManifests();
    const pins: string[] = [];
    for (const m of Object.values(manifests)) {
      const reportDefaults = (m as { report_defaults?: Array<{ report_key: string }> }).report_defaults ?? [];
      for (const r of reportDefaults) if (r.report_key) pins.push(r.report_key);
    }
    // the PHASE-015 industry pins must exist (POS keys are phase-gated PHASE-016 targets, not contracts yet)
    // POS + shift-reconciliation keys are phase-gated PHASE-016 targets (docs/industries/reports/README.md), not contracts yet
    const industryPins = pins.filter(
      (k) => !k.startsWith("pos.") && !k.startsWith("restaurant.") && k !== "treasury.shift_cash_reconciliation",
    );
    expect(industryPins.length).toBeGreaterThanOrEqual(3);
    for (const key of industryPins) expect(registered.has(key)).toBe(true);
    expect(registered.has("inventory.expiry_list")).toBe(true);
    expect(registered.has("grocery.expiry_writeoff")).toBe(true);
    expect(registered.has("retail.imei_register")).toBe(true);
  });
});
