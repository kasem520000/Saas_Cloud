import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { InvalidManifestError, manifestHash, validateManifest, type IndustryManifest } from "../domain/industry-manifest";

/**
 * PHASE-017 T2 — the two new template manifests (migration 0024, source of
 * truth docs/industries/templates/manifests/*.json) must validate fail-closed
 * through the UNMODIFIED PHASE-015 engine (no engine fork — AC-1).
 */

function seeded017Manifests(): Record<string, unknown> {
  const sql = readFileSync(
    join(__dirname, "../../../../migrations/0024_industry_templates_017.sql"),
    "utf8",
  );
  const blocks = [...sql.matchAll(/\$\$({.*?})\$\$::jsonb/gs)];
  expect(blocks.length).toBe(2);
  const out: Record<string, unknown> = {};
  for (const block of blocks) {
    const manifest = JSON.parse(block[1] as string);
    out[manifest.id] = manifest;
  }
  return out;
}

describe("PHASE-017 template manifests (T2)", () => {
  it("industry.automotive and industry.distribution v1.0.0 validate and hash deterministically", () => {
    const manifests = seeded017Manifests();
    expect(Object.keys(manifests).sort()).toEqual(["industry.automotive", "industry.distribution"]);
    for (const raw of Object.values(manifests)) {
      const manifest = raw as IndustryManifest;
      const valid = validateManifest(manifest);
      expect(valid.id).toMatch(/^industry\.[a-z_]+$/);
      expect(valid.version).toBe("1.0.0");
      // hash determinism (golden resolved_hash substrate)
      expect(manifestHash(manifest)).toBe(manifestHash(manifest));
      expect(manifestHash(manifest)).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it("both manifests carry their report pins and onboarding steps", () => {
    const manifests = seeded017Manifests();
    const auto = manifests["industry.automotive"] as { report_defaults: Array<{ report_key: string }> };
    const dist = manifests["industry.distribution"] as { report_defaults: Array<{ report_key: string }> };
    expect(auto.report_defaults.map((r) => r.report_key)).toContain("automotive.job_card_profitability");
    expect(dist.report_defaults.map((r) => r.report_key)).toContain("distribution.rep_settlement");
  });

  it("corrupted manifest fails closed", () => {
    const manifests = seeded017Manifests();
    const broken = { ...(manifests["industry.automotive"] as object), id: "Automotive!" };
    expect(() => validateManifest(broken)).toThrow(InvalidManifestError);
  });
});
