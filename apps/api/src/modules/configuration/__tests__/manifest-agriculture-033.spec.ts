import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateManifest } from "../domain/industry-manifest";
import { REPORT_CONTRACTS } from "../../reporting/registry";

/**
 * PHASE-033 T1/T8/T9 — the agriculture manifest (seeded by migration 0036):
 * schema-valid, report pins resolve against the live report registry, the
 * capability_prerequisites match the CAPABILITY_MATRIX AGR column, series
 * CYC/GRN/INV/DLV/TRF + batch/expiry/FEFO inventory defaults, and the
 * zero-agronomy-surface gate holds (no precision-agronomy terminology keys).
 */

function seeded033(): Record<string, unknown> {
  const sql = readFileSync(
    join(__dirname, "../../../../migrations/0036_industry_agriculture_033.sql"),
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

describe("PHASE-033 manifest (migration 0036)", () => {
  it("industry.agriculture validates against the schema, v1.0.0", () => {
    const agr = validateManifest(seeded033()["industry.agriculture"]);
    expect(agr.id).toBe("industry.agriculture");
    expect(agr.version).toBe("1.0.0");
  });

  it("T8: every report_defaults pin resolves in the live report registry", () => {
    const agr = validateManifest(seeded033()["industry.agriculture"]);
    const pins = agr.report_defaults;
    expect(pins.length).toBeGreaterThanOrEqual(4);
    for (const pin of pins) {
      expect(resolvesInRegistry(pin.report_key), `pin ${pin.report_key} must resolve in REPORT_CONTRACTS`).toBe(true);
    }
  });

  it("T9: capability_prerequisites match the CAPABILITY_MATRIX AGR column", () => {
    const agr = validateManifest(seeded033()["industry.agriculture"]);
    const caps = agr.capability_prerequisites;
    expect(caps["crop_cycle_costing"]?.level).toBe("REQUIRED");
    expect(caps["harvest_batches"]?.level).toBe("REQUIRED");
    expect(caps["bom_production"]?.level).toBe("REQUIRED");
    expect(caps["expiry_tracking_fefo"]?.level).toBe("REQUIRED");
    expect(caps["batch_genealogy"]?.level).toBe("OPTIONAL");
    expect(caps["qc_inspections"]?.level).toBe("OPTIONAL");
    expect(caps["pdc_notes"]?.level).toBe("OPTIONAL");
  });

  it("T2: series CYC/GRN/INV/DLV/TRF + batch/expiry/FEFO on, serial off, WAC; manufacturing module enabled", () => {
    const agr = validateManifest(seeded033()["industry.agriculture"]);
    const prefixes = Object.values(agr.document_numbering_defaults).map((s) => s.prefix);
    for (const p of ["CYC", "GRN", "INV", "DLV", "TRF"]) {
      expect(prefixes).toContain(p);
    }
    expect(agr.default_modules_enabled).toContain("manufacturing");
    expect(agr.default_modules_enabled).toContain("purchasing");
    expect(agr.inventory_policy_defaults["costing_method"]).toBe("WAC");
    expect(agr.inventory_policy_defaults["default_track_batch"]).toBe(true);
    expect(agr.inventory_policy_defaults["default_track_expiry"]).toBe(true);
    expect(agr.inventory_policy_defaults["fefo_picking"]).toBe(true);
    expect(agr.inventory_policy_defaults["default_track_serial"]).toBe(false);
    expect(agr.inventory_policy_defaults["allow_negative_stock"]).toBe(false);
  });

  it("T9: zero agronomy surface — no precision-agronomy terminology keys; exact six-policy set", () => {
    const raw = readFileSync(
      join(__dirname, "../../../../migrations/0036_industry_agriculture_033.sql"),
      "utf8",
    );
    const agronomyTerms = [
      "precision agriculture", "sensor", "irrigation scheduling", "pesticide schedule",
      "yield map", "soil analysis", "drone",
      "الزراعة الدقيقة", "أجهزة استشعار", "جدولة الري", "خريطة الغلة",
    ];
    for (const term of agronomyTerms) {
      expect(raw.toLowerCase()).not.toContain(term.toLowerCase());
    }
    const agr = validateManifest(seeded033()["industry.agriculture"]);
    expect(Object.keys(agr.workflow_policies).sort()).toEqual([
      "consumption_variance_threshold_pct",
      "cycle_order_per_field_project",
      "field_cost_center_mandatory_on_cycle",
      "harvest_batch_genealogy_enabled",
      "livestock_serial_per_head",
      "scrap_reason_required",
    ]);
  });
});
