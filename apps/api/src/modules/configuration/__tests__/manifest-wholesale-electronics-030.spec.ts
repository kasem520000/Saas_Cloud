import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { manifestHash, validateManifest } from "../domain/industry-manifest";
import { REPORT_CONTRACTS } from "../../reporting/registry";

/**
 * PHASE-030 T2/T7/T10 — the two v2.0 manifests (seeded by migration 0032):
 * schema-valid, report pins resolve against the live report registry, and
 * capability_prerequisites match the CAPABILITY_MATRIX WHL/ELC columns
 * (T7 mapping from the phase doc).
 */

function seeded030(): Record<string, unknown> {
  const sql = readFileSync(
    join(__dirname, "../../../../migrations/0032_industry_wholesale_electronics_030.sql"),
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

const registryIds = new Set(REPORT_CONTRACTS.map((c) => c.id));

/** v2.0 logical report key → registry contract id (docs/industries/reports/README §v2.0 mapping). */
const V2_KEY_TO_REGISTRY_ID: Record<string, string> = {
  "partners.ar_aging": "ar.aging",
  "inventory.stock_valuation": "inventory.valuation",
};
function resolvesInRegistry(key: string): boolean {
  return registryIds.has(key) || registryIds.has(V2_KEY_TO_REGISTRY_ID[key] ?? "");
}

describe("PHASE-030 manifests (migration 0032)", () => {
  it("industry.wholesale + industry.electronics validate against the schema, v1.0.0", () => {
    const manifests = seeded030();
    for (const key of ["industry.wholesale", "industry.electronics"]) {
      const m = validateManifest(manifests[key]);
      expect(m.id).toBe(key);
      expect(m.version).toBe("1.0.0");
      expect(m.onboarding_steps.length).toBeGreaterThanOrEqual(3);
      expect(manifestHash(m)).toBe(manifestHash(validateManifest(manifests[key])));
    }
  });

  it("T10: every report_defaults pin resolves in the live report registry", () => {
    const manifests = seeded030();
    for (const key of ["industry.wholesale", "industry.electronics"]) {
      const m = validateManifest(manifests[key]);
      for (const pin of m.report_defaults) {
        expect(resolvesInRegistry(pin.report_key), `pin ${pin.report_key} must resolve in REPORT_CONTRACTS`).toBe(true);
      }
    }
  });

  it("T7: capability_prerequisites match the CAPABILITY_MATRIX WHL/ELC columns", () => {
    const manifests = seeded030();
    const whl = validateManifest(manifests["industry.wholesale"]).capability_prerequisites;
    const elc = validateManifest(manifests["industry.electronics"]).capability_prerequisites;
    // phase-doc T7 mapping: pdc_notes REQ/OPT, installment_terms OPT/OPT, imei OPT/REQ, job_cards N/A/REQ, price_tiers REQ/OPT
    expect(whl["pdc_notes"]?.level).toBe("REQUIRED");
    expect(elc["pdc_notes"]?.level).toBe("OPTIONAL");
    expect(whl["installment_terms"]?.level).toBe("OPTIONAL");
    expect(elc["installment_terms"]?.level).toBe("OPTIONAL");
    expect(whl["imei_tracking"]?.level).toBe("OPTIONAL");
    expect(elc["imei_tracking"]?.level).toBe("REQUIRED");
    expect(whl["job_cards"]).toBeUndefined(); // N/A for wholesale
    expect(elc["job_cards"]?.level).toBe("REQUIRED");
    expect(whl["customer_price_tiers"]?.level).toBe("REQUIRED");
    expect(elc["customer_price_tiers"]?.level).toBe("OPTIONAL");
  });

  it("T4/T5: numbering series and inventory defaults are present per template", () => {
    const manifests = seeded030();
    const whl = validateManifest(manifests["industry.wholesale"]);
    const elc = validateManifest(manifests["industry.electronics"]);
    for (const s of ["QT", "ORD", "DLV", "INV", "CN", "RCP", "GRN", "TRF"]) {
      expect(Object.keys(whl.document_numbering_defaults).some((k) => whl.document_numbering_defaults[k]?.prefix === s)).toBe(true);
    }
    expect(elc.inventory_policy_defaults["default_track_serial"]).toBe(true);
    expect(elc.inventory_policy_defaults["default_imei_tracking"]).toBe(true);
    expect(whl.inventory_policy_defaults["costing_method"]).toBe("WAC");
  });
});
