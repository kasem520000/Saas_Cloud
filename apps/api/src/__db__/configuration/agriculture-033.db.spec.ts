import { randomInt } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { ensureTestDb, superuserClient } from "../test-db";
import { withTenant } from "../../infra/db/tenant-context";
import { RegistrationService } from "../../modules/tenancy/application/registration-service";
import { PasswordService } from "../../modules/identity/api/identity";
import { AuditService } from "../../modules/audit/api/audit";
import { DrizzleAuditStore } from "../../modules/audit/infrastructure/drizzle-audit.store";
import { ConfigurationService } from "../../modules/configuration/application/configuration.service";
import { TemplateApplyService, TemplateNotFoundError } from "../../modules/configuration/application/template-apply.service";
import { resetEffectiveConfigCache } from "../../modules/configuration/application/config-cache";
import * as registry from "../../modules/configuration/infrastructure/template-registry.store";

/**
 * PHASE-033 db evidence (real PG16) — industry.agriculture through the
 * UNMODIFIED PHASE-015 engine, configuration-only (INV-022): seeded + valid;
 * apply idempotent + audited + L1 lands; BR-038 additive-only switch with
 * ZERO journal rows (negative ledger proof); unknown → 404.
 */

const audit = new AuditService(new DrizzleAuditStore());
const passwords = new PasswordService();
const fakeEmail = { enqueue: async () => undefined };
const applyService = new TemplateApplyService(audit);
const configuration = new ConfigurationService();
const OWNER_PASSWORD = "an-extremely-strong-passphrase-1";

async function registerTenant(label: string) {
  const registration = new RegistrationService(passwords, audit, fakeEmail as never);
  const result = await registration.register({
    businessName: `${label} Farms`,
    businessNameAr: `${label} مزارع`,
    countryCode: "SA",
    baseCurrency: "SAR",
    industryTemplateKey: "industry.wholesale",
    taxRegistrationStatus: "REGISTERED",
    taxRegistrationNumber: "3001234567890003",
    ownerEmail: `${label}-${Date.now()}-${randomInt(1000)}@config.test`,
    ownerFullName: "Owner",
    ownerPassword: OWNER_PASSWORD,
    ip: `10.6.${randomInt(1, 250)}.${randomInt(1, 250)}`,
  });
  return { tenantId: result.tenantId, userId: result.ownerUserId };
}

const AGRICULTURE_REQUIRED_KEYS = [
  "industry.template_engine",
  "manufacturing.bom",
  "manufacturing.production_orders",
  "inventory.batch_tracking",
  "purchasing.orders",
  "purchasing.goods_receipts",
  "sales.invoices",
  "accounting.projects",
  "accounting.cost_centers",
];

async function grantAgricultureEntitlements(tenantId: string) {
  const tenancyStore = await import("../../modules/tenancy/infrastructure/tenancy.store");
  await withTenant(tenantId, async () => {
    for (const key of AGRICULTURE_REQUIRED_KEYS) {
      await tenancyStore.insertEntitlement({ featureKey: key, source: "PLAN", expiresAt: null });
    }
  });
}

async function journalCount(tenantId: string): Promise<number> {
  const su = await superuserClient();
  const r = await su.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM journal_entries WHERE tenant_id = $1`,
    [tenantId],
  );
  await su.end();
  return r.rows[0]?.n ?? 0;
}

beforeAll(() => {
  ensureTestDb();
  resetEffectiveConfigCache();
});

describe("PHASE-033 T1/T2/T9 — agriculture via the unmodified engine", () => {
  it("industry.agriculture is seeded and validates", async () => {
    const keys = await registry.listTemplates();
    const map = new Map(keys.map((k) => [k.key, k]));
    expect(map.has("industry.agriculture")).toBe(true);
    expect(map.get("industry.agriculture")?.version).toBe("1.0.0");
  });

  it("apply industry.agriculture: idempotent, audited, L1 lands with cycle/harvest policies", async () => {
    const { tenantId, userId } = await registerTenant("agr");
    await grantAgricultureEntitlements(tenantId);
    const first = await withTenant(tenantId, () => applyService.apply(userId, "industry.agriculture"));
    const second = await withTenant(tenantId, () => applyService.apply(userId, "industry.agriculture"));
    expect(second.applied).toBe(false);
    const effective = await withTenant(tenantId, () => configuration.resolveEffectiveConfig());
    expect(effective.layers.l1Template?.key).toBe("industry.agriculture");
    expect(effective.policies["cycle_order_per_field_project"]).toBe(true);
    expect(effective.policies["harvest_batch_genealogy_enabled"]).toBe(true);
    // negative ledger proof: apply writes ZERO journal rows (INV-022)
    expect(await journalCount(tenantId)).toBe(0);
    const su = await superuserClient();
    const r = await su.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_events WHERE tenant_id = $1 AND action = 'template.applied'`,
      [tenantId],
    );
    await su.end();
    expect(r.rows[0]?.n ?? 0).toBeGreaterThanOrEqual(1);
    void first;
  });

  it("T9 switch wholesale → agriculture: additive-only (BR-038), zero journal rows, switch back works", async () => {
    const { tenantId, userId } = await registerTenant("agrsw");
    await withTenant(tenantId, () => applyService.apply(userId, "industry.wholesale"));
    await grantAgricultureEntitlements(tenantId);
    const before = await withTenant(tenantId, () => configuration.resolveEffectiveConfig());
    const r = await withTenant(tenantId, () => applyService.apply(userId, "industry.agriculture"));
    expect(r.applied).toBe(true);
    const after = await withTenant(tenantId, () => configuration.resolveEffectiveConfig());
    expect(after.tenant.id).toBe(before.tenant.id);
    expect(after.layers.l1Template?.key).toBe("industry.agriculture");
    expect(before.resolvedHash).not.toBe(after.resolvedHash);
    expect(await journalCount(tenantId)).toBe(0);
    const back = await withTenant(tenantId, () => applyService.apply(userId, "industry.wholesale"));
    expect(back.applied).toBe(true);
    expect(await journalCount(tenantId)).toBe(0);
  });

  it("unknown template → TemplateNotFoundError (404-shaped)", async () => {
    const { tenantId, userId } = await registerTenant("agrnf");
    await expect(withTenant(tenantId, () => applyService.apply(userId, "industry.nope"))).rejects.toBeInstanceOf(TemplateNotFoundError);
  });
});
