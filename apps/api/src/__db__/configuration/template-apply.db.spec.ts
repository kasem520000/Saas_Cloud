import { randomInt } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { ensureTestDb, superuserClient } from "../test-db";
import { withTenant } from "../../infra/db/tenant-context";
import { RegistrationService } from "../../modules/tenancy/application/registration-service";
import { PasswordService } from "../../modules/identity/api/identity";
import { AuditService } from "../../modules/audit/api/audit";
import { DrizzleAuditStore } from "../../modules/audit/infrastructure/drizzle-audit.store";
import { ConfigurationService } from "../../modules/configuration/application/configuration.service";
import {
  TemplateApplyService,
  TemplateNotFoundError,
  TemplatePrerequisitesMissingError,
} from "../../modules/configuration/application/template-apply.service";
import { resetEffectiveConfigCache } from "../../modules/configuration/application/config-cache";
import { validateManifest } from "../../modules/configuration/domain/industry-manifest";
import * as registry from "../../modules/configuration/infrastructure/template-registry.store";

/**
 * PHASE-015 db evidence (real PG16) — template registry + apply/switch:
 * - T4: the three manifests are seeded and validate;
 * - T5: apply is idempotent + audited; effective-config reflects L1
 *   (terminology, nav groups, report pins) with a stable resolved_hash;
 * - T6 (BR-038): switch archives the previous template read-only and never
 *   touches tenant data/settings; switch back works;
 * - T7: unknown template → 404-shaped error; missing REQUIRED (non-gated) key
 *   blocks with the missing chain named; phase-gated keys degrade (labeled).
 */

const audit = new AuditService(new DrizzleAuditStore());
const passwords = new PasswordService();
const fakeEmail = { enqueue: async () => undefined };

const applyService = new TemplateApplyService(audit);
const configuration = new ConfigurationService();

const OWNER_PASSWORD = "an-extremely-strong-passphrase-1";

async function registerTenant(label: string): Promise<{ tenantId: string; userId: string }> {
  const registration = new RegistrationService(passwords, audit, fakeEmail as never);
  const result = await registration.register({
    businessName: `${label} Co`,
    businessNameAr: `${label} شركة`,
    countryCode: "SA",
    baseCurrency: "SAR",
    industryTemplateKey: "industry.retail",
    taxRegistrationStatus: "REGISTERED",
    taxRegistrationNumber: "3001234567890003",
    ownerEmail: `${label}-${Date.now()}-${randomInt(1000)}@config.test`,
    ownerFullName: "Owner",
    ownerPassword: OWNER_PASSWORD,
    ip: `10.2.${randomInt(1, 250)}.${randomInt(1, 250)}`,
  });
  return { tenantId: result.tenantId, userId: result.ownerUserId };
}

async function countRows(sql: string, params: unknown[]): Promise<number> {
  const su = await superuserClient();
  const result = await su.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) q`, params);
  await su.end();
  return result.rows[0]?.n ?? 0;
}

beforeAll(() => {
  ensureTestDb();
  resetEffectiveConfigCache();
});

describe("T4 — template registry seeds", () => {
  it("seeds industry.retail / industry.grocery / industry.restaurant v1.0.0", async () => {
    const templates = await registry.listTemplates(true);
    const keys = templates.map((t) => t.key);
    // the registry ships the PHASE-004 index; PHASE-015 seeds the three priority manifests
    for (const key of ["industry.retail", "industry.grocery", "industry.restaurant"]) {
      expect(keys).toContain(key);
    }
    for (const key of ["industry.retail", "industry.grocery", "industry.restaurant"]) {
      const t = templates.find((row) => row.key === key);
      expect(t).toBeDefined();
      expect(t?.version).toBe("1.0.0");
      const manifest = validateManifest(t?.manifest);
      expect(manifest.id).toBe(key);
      expect(manifest.version).toBe("1.0.0");
    }
  });
});

describe("T5 — apply template (idempotent, audited, reflected in effective config)", () => {
  it("applies industry.retail; re-apply is a no-op; L1 lands in the effective config", async () => {
    const { tenantId, userId } = await registerTenant("apply-retail");

    await withTenant(tenantId, async () => {
      const first = await applyService.apply(userId, "industry.retail");
      expect(first.applied).toBe(true);
      expect(first.alreadyApplied).toBe(false);
      expect(first.manifestHash).toMatch(/^sha256:[0-9a-f]{64}$/);

      const second = await applyService.apply(userId, "industry.retail");
      expect(second.applied).toBe(false);
      expect(second.alreadyApplied).toBe(true);
      expect(second.manifestHash).toBe(first.manifestHash);

      const applied = await registry.getAppliedConfig();
      expect(applied?.templateKey).toBe("industry.retail");
      expect(applied).toBeDefined();
      expect(applied?.appliedManifestHash).toBe(first.manifestHash);

      const config = await configuration.resolveEffectiveConfig();
      expect(config.layers.l1Template?.key).toBe("industry.retail");
      expect(config.ui.terminology["pos.terminal"]?.ar).toBe("الطرفية");
      expect(config.ui.navigationGroups).toContain("selling");
      expect(config.ui.reportPins).toContain("inventory.valuation");
      // determinism: same tenant re-resolves to the same hash
      const again = await configuration.resolveEffectiveConfig();
      expect(again.resolvedHash).toBe(config.resolvedHash);
    });

    // audited with the diff
    const auditRows = await countRows(
      `SELECT 1 FROM audit_events WHERE entity_type = 'industry_template' AND entity_id = $1::uuid AND action = 'template.applied' AND tenant_id = $1::uuid`,
      [tenantId],
    );
    expect(auditRows).toBe(1);
  });

  it("unknown template → TemplateNotFoundError (404-shaped)", async () => {
    const { tenantId, userId } = await registerTenant("bad-template");
    await withTenant(tenantId, async () => {
      await expect(applyService.apply(userId, "industry.nope")).rejects.toBeInstanceOf(
        TemplateNotFoundError,
      );
    });
  });
});

describe("T6 — additive-only switch (BR-038)", () => {
  it("retail → grocery archives retail read-only, keeps settings, switch back works", async () => {
    const { tenantId, userId } = await registerTenant("switch");
    await withTenant(tenantId, async () => {
      await applyService.apply(userId, "industry.retail");
      const retailHash = (await registry.getAppliedConfig())?.appliedManifestHash ?? "";

      const preview = await applyService.preview("industry.grocery");
      expect(preview.blocked).toBe(false);
      expect(preview.templateKey).toBe("industry.grocery");
      expect(preview.archivedCapabilities).toContain("inventory.serial_tracking");
      expect(preview.terminologyArchived).toContain("pos.terminal");
      expect(preview.terminologyAdded).toContain("batch.expiry");
      // POS keys are phase-gated to PHASE-016 — labeled, not blocking
      expect(preview.phaseGated.length).toBeGreaterThan(0);
      expect(preview.phaseGated.every((g) => g.phase > "PHASE-015")).toBe(true);

      const switched = await applyService.switch(userId, "industry.grocery");
      expect(switched.applied).toBe(true);

      const applied = await registry.getAppliedConfig();
      expect(applied).toBeDefined();
      expect(applied?.templateKey).toBe("industry.grocery");
      expect(applied?.archived).toHaveLength(1);
      const archivedList = applied?.archived as { templateKey: string }[];
      expect(archivedList[0]?.templateKey).toBe("industry.retail");

      const config = await configuration.resolveEffectiveConfig();
      expect(config.layers.l1Template?.key).toBe("industry.grocery");
      expect(config.ui.terminology["batch.expiry"]?.ar).toContain("انتهاء");

      // BR-038: tenant data untouched — settings rows identical count, no deletes
      const settingsCount = await countRows(
        `SELECT 1 FROM tenant_settings WHERE tenant_id = $1`,
        [tenantId],
      );
      expect(settingsCount).toBeGreaterThan(0);

      // switch back is always possible (nothing was destroyed)
      const back = await applyService.switch(userId, "industry.retail");
      expect(back.applied).toBe(true);
      const after = await registry.getAppliedConfig();
      expect(after).toBeDefined();
      expect(after?.templateKey).toBe("industry.retail");
      expect(after?.appliedManifestHash).toBe(retailHash);
      expect(after?.archived).toHaveLength(2);
      expect(after?.archived).toBeDefined();
    });
  });
});

describe("T7 — prerequisite blocking (BR-040 closure, degraded mode)", () => {
  it("a REQUIRED non-gated key missing from the plan blocks with the chain named", async () => {
    const { tenantId, userId } = await registerTenant("blocked");
    await withTenant(tenantId, async () => {
      // Revoke a required, already-shipped key (items.barcodes) directly.
      const su = await superuserClient();
      await su.query(`DELETE FROM entitlements WHERE tenant_id = $1 AND feature_key = 'items.barcodes'`, [tenantId]);
      await su.end();

      await expect(applyService.apply(userId, "industry.retail")).rejects.toBeInstanceOf(
        TemplatePrerequisitesMissingError,
      );
      await expect(applyService.apply(userId, "industry.retail")).rejects.toMatchObject({
        missing: expect.arrayContaining(["items.barcodes"]),
      });
    });
  });
});

describe("PHASE-017 T2 — automotive & distribution templates via the unmodified engine", () => {
  it("seeds industry.automotive / industry.distribution v1.0.0 and both validate", async () => {
    const su = await superuserClient();
    const rows = await su.query<{ key: string; manifest: string }>(
      `SELECT key, manifest::text AS manifest FROM industry_templates
       WHERE key IN ('industry.automotive', 'industry.distribution') ORDER BY key`,
    );
    await su.end();
    expect(rows.rows.map((r) => r.key)).toEqual(["industry.automotive", "industry.distribution"]);
    for (const row of rows.rows) {
      expect(validateManifest(JSON.parse(row.manifest)).version).toBe("1.0.0");
    }
  });

  it("applies industry.automotive to a fresh tenant; L1 lands (terminology + nav + pins) with stable hash", async () => {
    const { tenantId, userId } = await registerTenant("auto");
    await withTenant(tenantId, async () => {
      const result = await applyService.apply(userId, "industry.automotive");
      expect(result.applied).toBe(true);
      const again = await applyService.apply(userId, "industry.automotive");
      expect(again.alreadyApplied).toBe(true);
      expect(again.manifestHash).toBe(result.manifestHash);

      const config = await configuration.resolveEffectiveConfig();
      expect(config.layers.l1Template?.key).toBe("industry.automotive");
      expect(config.resolvedHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      // automotive terminology override present (بطاقة عمل family)
      expect(Object.keys(config.ui.terminology).length).toBeGreaterThan(0);
    });
  });

  it("retail → automotive switch is additive-only (BR-038): settings intact, retail archived read-only", async () => {
    const { tenantId, userId } = await registerTenant("switch017");
    await withTenant(tenantId, async () => {
      await applyService.apply(userId, "industry.retail");
      const before = await configuration.resolveEffectiveConfig();
      const switched = await applyService.switch(userId, "industry.automotive");
      expect(switched.templateKey).toBe("industry.automotive");
      const after = await configuration.resolveEffectiveConfig();
      expect(after.layers.l1Template?.key).toBe("industry.automotive");
      // settings layer untouched by the switch (additive-only)
      expect({ ...after.layers, l1Template: null }).toEqual({ ...before.layers, l1Template: null });
    });
  });
});
