import { describe, expect, it } from "vitest";
import * as fc from "fast-check";

import {
  ConfigurationResolutionError,
  applyRequestOverlay,
  resolveEffectiveConfig,
  type LayerInputs,
} from "../domain/resolve";
import { validateManifest } from "../domain/industry-manifest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PHASE-015 T1 — resolution engine property tests (CONFIGURATION_ENGINE §3/§6):
 * determinism (same inputs ⇒ same resolved_hash), precedence table, L2-only
 * tax keys, fail-closed on unknown keys, L6 overlay never enters the hash.
 */

function retailManifest(): ReturnType<typeof validateManifest> {
  const sql = readFileSync(
    join(__dirname, "../../../../migrations/0022_industry_configuration.sql"),
    "utf8",
  );
  const block = sql.match(/\$\$({.*?"industry\.retail".*?})\$\$::jsonb/s);
  expect(block).not.toBeNull();
  return validateManifest(JSON.parse(block![1] as string));
}

function baseInputs(overrides: Partial<LayerInputs> = {}): LayerInputs {
  return {
    tenantId: "11111111-1111-4111-8111-111111111111",
    industryTemplate: "industry.retail",
    jurisdiction: "SA",
    baseCurrency: "SAR",
    l1: { templateKey: "industry.retail", version: "1.0.0", manifest: retailManifest() },
    l2: { countryCode: "SA", packVersion: "2026.10", vatStatus: "VAT_IN_FORCE", tenantRegistration: "REGISTERED" },
    l3: { planKey: "business", limits: { users: 10, branches: 3, documents_per_month: 5000 } },
    l4: { active: ["industry.template_engine", "sales.invoices"], sources: { "sales.invoices": "PLAN" } },
    l5: { "general.default_locale": "ar" },
    l7: [{ branchId: "b1", code: "HQ", numberingSeries: "INV-HQ-" }],
    l8: { pos: false },
    l10: {},
    ...overrides,
  };
}

describe("resolveEffectiveConfig (PHASE-015 T1)", () => {
  it("is deterministic: same inputs produce the identical resolved_hash (property)", () => {
    fc.assert(
      fc.property(
        fc.record({
          locale: fc.constantFrom("ar", "en"),
          autopost: fc.boolean(),
          neg: fc.boolean(),
        }),
        (v) => {
          const inputs = baseInputs({
            l5: { "general.default_locale": v.locale, "sales.cash_autopost": v.autopost, "inventory.allow_negative_stock": v.neg },
          });
          const a = resolveEffectiveConfig(inputs);
          const b = resolveEffectiveConfig(structuredClone(inputs));
          expect(a.resolvedHash).toBe(b.resolvedHash);
          expect(a.policies["sales.cash_autopost"]).toBe(v.autopost);
        },
      ),
    );
  });

  it("precedence: L10 > L5 > L1 template default > platform default", () => {
    const manifest = retailManifest();
    expect(manifest.workflow_policies["cash_sales_autopost"]).toBe(true);
    // platform default
    const a = resolveEffectiveConfig(baseInputs({ l1: null, l5: {}, l10: {} }));
    expect(a.policies["sales.cash_autopost"]).toBe(false);
    // L1 template default (mapped policy namespace passes through)
    const b = resolveEffectiveConfig(baseInputs({ l5: {}, l10: {} }));
    expect(b.policies["cash_sales_autopost"]).toBe(true);
    // L5 wins over L1
    const c = resolveEffectiveConfig(baseInputs({ l5: { "sales.cash_autopost": false }, l10: {} }));
    expect(c.policies["sales.cash_autopost"]).toBe(false);
    // L10 wins over L5
    const d = resolveEffectiveConfig(
      baseInputs({ l5: { "sales.cash_autopost": false }, l10: { "sales.cash_autopost": true } }),
    );
    expect(d.policies["sales.cash_autopost"]).toBe(true);
  });

  it("fail-closed: unknown L5 key, type violation, and L2-only tax keys all throw", () => {
    expect(() => resolveEffectiveConfig(baseInputs({ l5: { "no.such_key": 1 } }))).toThrow(
      ConfigurationResolutionError,
    );
    expect(() =>
      resolveEffectiveConfig(baseInputs({ l5: { "general.default_locale": "fr" } })),
    ).toThrow(ConfigurationResolutionError);
    expect(() =>
      resolveEffectiveConfig(baseInputs({ l5: { "tax.rates.vat": 15 } })),
    ).toThrow(ConfigurationResolutionError);
    expect(() => resolveEffectiveConfig(baseInputs({ l10: { "mystery.policy": true } }))).toThrow(
      ConfigurationResolutionError,
    );
  });

  it("L6 request overlay is applied per request and never changes resolved_hash", () => {
    const inputs = baseInputs();
    const base = resolveEffectiveConfig(inputs);
    const withOverlay = applyRequestOverlay(base, {
      userId: "u1",
      role: "cashier",
      branchScope: ["HQ"],
      permissions: ["pos.sales.sell"],
    });
    expect(withOverlay.resolvedHash).toBe(base.resolvedHash);
    expect((withOverlay.requestOverlay as { actions: string[] }).actions).toEqual(["pos.sales.sell"]);
  });

  it("L9 derivation: terminology, navigation groups and report pins come from L1", () => {
    const config = resolveEffectiveConfig(baseInputs());
    expect(config.ui.terminology["pos.terminal"]?.ar).toBe("الطرفية");
    expect(config.ui.navigationGroups).toContain("selling");
    expect(config.ui.reportPins).toContain("inventory.valuation");
    const noTemplate = resolveEffectiveConfig(baseInputs({ l1: null, industryTemplate: null }));
    expect(noTemplate.ui.terminology).toEqual({});
    expect(noTemplate.layers.l1Template).toBeNull();
  });
});
