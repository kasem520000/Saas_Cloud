import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateManifest } from "../domain/industry-manifest";
import { REPORT_CONTRACTS } from "../../reporting/registry";

/**
 * PHASE-031 T2/T9/T10 — the healthcare manifest (seeded by migration 0034):
 * schema-valid, report pins resolve against the live report registry, the
 * capability_prerequisites match the CAPABILITY_MATRIX HLT column, series +
 * inventory defaults (batch+expiry+FEFO on, serial off) are present, and the
 * zero-clinical-surface gate holds (no clinical terminology keys).
 */

function seeded031(): Record<string, unknown> {
  const sql = readFileSync(
    join(__dirname, "../../../../migrations/0034_industry_healthcare_031.sql"),
    "utf8",
  );
  const blocks = [...sql.matchAll(/\$\$({.*?})\$\$::jsonb/gs)];
  expect(blocks.length).toBe(1);
  const manifest = JSON.parse(blocks[0]?.[1] ?? "{}") as Record<string, unknown> & { id: string };
  return { [manifest.id]: manifest };
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

describe("PHASE-031 manifest (migration 0034)", () => {
  it("industry.healthcare validates against the schema, v1.0.0", () => {
    const manifests = seeded031();
    const hlt = validateManifest(manifests["industry.healthcare"]);
    expect(hlt.id).toBe("industry.healthcare");
    expect(hlt.version).toBe("1.0.0");
  });

  it("T9: every report_defaults pin resolves in the live report registry", () => {
    const manifests = seeded031();
    const hlt = validateManifest(manifests["industry.healthcare"]);
    const pins = hlt.report_defaults;
    expect(pins.length).toBeGreaterThanOrEqual(4);
    for (const pin of pins) {
      expect(resolvesInRegistry(pin.report_key), `pin ${pin.report_key} must resolve in REPORT_CONTRACTS`).toBe(true);
    }
  });

  it("T9: capability_prerequisites match the CAPABILITY_MATRIX HLT column", () => {
    const manifests = seeded031();
    const hlt = validateManifest(manifests["industry.healthcare"]);
    const caps = hlt.capability_prerequisites;
    expect(caps["insurance_claim_billing"]?.level).toBe("REQUIRED");
    expect(caps["pdc_notes"]?.level).toBe("REQUIRED");
    expect(caps["expiry_tracking_fefo"]?.level).toBe("REQUIRED");
    expect(caps["job_cards"]?.level).toBe("REQUIRED");
    expect(caps["installment_terms"]?.level).toBe("OPTIONAL");
  });

  it("T7: series INV/CN/RCP/GRN + pharmacy inventory defaults (batch+expiry+FEFO on, serial off)", () => {
    const manifests = seeded031();
    const hlt = validateManifest(manifests["industry.healthcare"]);
    const prefixes = Object.values(hlt.document_numbering_defaults).map((s) => s.prefix);
    for (const p of ["INV", "CN", "RCP", "GRN"]) {
      expect(prefixes).toContain(p);
    }
    expect(hlt.inventory_policy_defaults["costing_method"]).toBe("WAC");
    expect(hlt.inventory_policy_defaults["default_track_batch"]).toBe(true);
    expect(hlt.inventory_policy_defaults["default_track_expiry"]).toBe(true);
    expect(hlt.inventory_policy_defaults["fefo_picking"]).toBe(true);
    expect(hlt.inventory_policy_defaults["default_track_serial"]).toBe(false);
    expect(hlt.inventory_policy_defaults["allow_negative_stock"]).toBe(false);
  });

  it("T10: zero clinical surface — no clinical terminology keys anywhere in the manifest", () => {
    const raw = readFileSync(
      join(__dirname, "../../../../migrations/0034_industry_healthcare_031.sql"),
      "utf8",
    );
    const clinicalTerms = [
      "diagnosis", "prescription", "appointment", "clinical_note", "lab_result",
      "تشخيص", "روشتة", "موعد", "سجل سريري", "نتيجة مختبر",
    ];
    for (const term of clinicalTerms) {
      expect(raw.toLowerCase()).not.toContain(term.toLowerCase());
    }
    // the six workflow policies are exactly the documented set
    const hlt = validateManifest(seeded031()["industry.healthcare"]);
    expect(Object.keys(hlt.workflow_policies).sort()).toEqual([
      "claim_ref_required_for_insured_invoices",
      "dunning_by_claim_enabled",
      "insurance_credit_limit_per_company",
      "insurance_invoice_billed_to_company_partner",
      "patient_file_financial_only",
      "pharmacy_fefo_enforced",
    ]);
  });
});
