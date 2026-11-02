import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { manifestHash, validateManifest, type IndustryManifest } from "../domain/industry-manifest";

/**
 * PHASE-018 T11 — the `industry.food_manufacturing` manifest (migration 0025,
 * source of truth docs/industries/templates/manifests/manifest.food_manufacturing.json)
 * must validate fail-closed through the UNMODIFIED PHASE-015 engine.
 */

function seeded018Manifests(): Record<string, unknown> {
  const sql = readFileSync(
    join(__dirname, "../../../../migrations/0025_manufacturing_018.sql"),
    "utf8",
  );
  const blocks = [...sql.matchAll(/\$\$({.*?})\$\$::jsonb/gs)];
  expect(blocks.length).toBe(1);
  const manifest = JSON.parse(blocks[0]?.[1] as string);
  return { [manifest.id]: manifest };
}

describe("PHASE-018 food_manufacturing manifest (T11)", () => {
  it("industry.food_manufacturing v1.0.0 validates and hashes deterministically", () => {
    const manifests = seeded018Manifests();
    expect(Object.keys(manifests)).toEqual(["industry.food_manufacturing"]);
    for (const raw of Object.values(manifests)) {
      const manifest = raw as IndustryManifest;
      const valid = validateManifest(manifest);
      expect(valid.id).toBe("industry.food_manufacturing");
      expect(valid.version).toBe("1.0.0");
      expect(valid.required_feature_keys).toContain("manufacturing.bom");
      expect(valid.required_feature_keys).toContain("manufacturing.batch_genealogy");
      expect(manifestHash(manifest)).toBe(manifestHash(manifest));
      expect(manifestHash(manifest)).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it("carries production policies, PRD- numbering, and onboarding steps", () => {
    const [raw] = Object.values(seeded018Manifests());
    const valid = validateManifest(raw as IndustryManifest);
    expect(valid.document_numbering_defaults["production_order"]?.prefix).toBe("PRD");
    expect(valid.workflow_policies["production_qc_gate"]).toBe("required");
    expect(valid.workflow_policies["scrap_reason_required"]).toBe(true);
    expect(valid.onboarding_steps.length).toBeGreaterThan(0);
  });
});
