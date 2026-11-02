import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { validateManifest } from "../domain/industry-manifest";
import { REPORT_CONTRACTS } from "../../reporting/registry";

/**
 * PHASE-032 T1/T8/T9 — the education manifest (seeded by migration 0035):
 * schema-valid, report pins resolve against the live report registry, the
 * capability_prerequisites match the CAPABILITY_MATRIX EDU column, series
 * INV/RCP/CN + stock modules disabled, and the zero-academic-surface gate
 * holds (no academic terminology keys).
 */

function seeded032(): Record<string, unknown> {
  const sql = readFileSync(
    join(__dirname, "../../../../migrations/0035_industry_education_032.sql"),
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

describe("PHASE-032 manifest (migration 0035)", () => {
  it("industry.education validates against the schema, v1.0.0", () => {
    const edu = validateManifest(seeded032()["industry.education"]);
    expect(edu.id).toBe("industry.education");
    expect(edu.version).toBe("1.0.0");
  });

  it("T8: every report_defaults pin resolves in the live report registry", () => {
    const edu = validateManifest(seeded032()["industry.education"]);
    const pins = edu.report_defaults;
    expect(pins.length).toBeGreaterThanOrEqual(4);
    for (const pin of pins) {
      expect(resolvesInRegistry(pin.report_key), `pin ${pin.report_key} must resolve in REPORT_CONTRACTS`).toBe(true);
    }
    const dashboards = pins.filter((p) => p.dashboard).map((p) => p.report_key);
    expect(dashboards).toContain("installments.schedule");
    expect(dashboards).toContain("installments.aging");
  });

  it("T9: capability_prerequisites match the CAPABILITY_MATRIX EDU column", () => {
    const edu = validateManifest(seeded032()["industry.education"]);
    const caps = edu.capability_prerequisites;
    expect(caps["installment_terms"]?.level).toBe("REQUIRED");
    expect(caps["service_contracts"]?.level).toBe("REQUIRED");
    expect(caps["recurring_billing"]?.level).toBe("OPTIONAL");
    expect(caps["deposits_late_fees"]?.level).toBe("OPTIONAL");
    expect(caps["pdc_notes"]?.level).toBe("OPTIONAL");
    expect(caps["customer_price_tiers"]?.level).toBe("OPTIONAL");
  });

  it("T1: series INV/RCP/CN; stock modules NOT enabled (WAC dormant, service items default)", () => {
    const edu = validateManifest(seeded032()["industry.education"]);
    const prefixes = Object.values(edu.document_numbering_defaults).map((s) => s.prefix);
    for (const p of ["INV", "RCP", "CN"]) {
      expect(prefixes).toContain(p);
    }
    for (const stockModule of ["inventory", "manufacturing", "purchasing", "pos", "distribution"]) {
      expect(edu.default_modules_enabled).not.toContain(stockModule);
    }
    expect(edu.default_modules_enabled).toContain("installments");
    expect(edu.default_modules_enabled).toContain("crm");
  });

  it("T9: zero academic surface — no academic terminology keys anywhere in the manifest; exact seven-policy set", () => {
    const raw = readFileSync(
      join(__dirname, "../../../../migrations/0035_industry_education_032.sql"),
      "utf8",
    );
    const academicTerms = [
      "timetable", "attendance", "report card", "coursework", "lms", "gradebook",
      "teacher allocation", "room planning", "bus route",
      "حضور", "كشف درجات", "واجب", "معلم", "قاعة",
    ];
    for (const term of academicTerms) {
      expect(raw.toLowerCase()).not.toContain(term.toLowerCase());
    }
    const edu = validateManifest(seeded032()["industry.education"]);
    expect(Object.keys(edu.workflow_policies).sort()).toEqual([
      "dunning_cycle_before_late_fee",
      "guardian_is_paying_partner",
      "installment_schedule_immutable_after_activation",
      "invoice_approval_required",
      "late_fee_policy_per_plan",
      "sibling_discount_line_level",
      "tuition_invoice_from_contract",
    ]);
  });
});
