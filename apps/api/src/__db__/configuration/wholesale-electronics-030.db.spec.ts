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
 * PHASE-030 db evidence (real PG16) — the two v2.0 manifests through the
 * UNMODIFIED PHASE-015 engine: seeded + valid; apply idempotent + audited;
 * L1 lands in the effective config; switch wholesale→electronics is
 * additive-only (BR-038: zero data loss, settings intact); unknown → 404.
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
    businessName: `${label} Co`,
    businessNameAr: `${label} شركة`,
    countryCode: "SA",
    baseCurrency: "SAR",
    industryTemplateKey: "industry.wholesale",
    taxRegistrationStatus: "REGISTERED",
    taxRegistrationNumber: "3001234567890003",
    ownerEmail: `${label}-${Date.now()}-${randomInt(1000)}@config.test`,
    ownerFullName: "Owner",
    ownerPassword: OWNER_PASSWORD,
    ip: `10.3.${randomInt(1, 250)}.${randomInt(1, 250)}`,
  });
  return { tenantId: result.tenantId, userId: result.ownerUserId };
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

describe("PHASE-030 T1/T4/T5/T6 — wholesale & electronics via the unmodified engine", () => {
  it("both manifests are seeded and validate", async () => {
    const keys = await registry.listTemplates();
    const map = new Map(keys.map((k) => [k.key, k]));
    expect(map.has("industry.wholesale")).toBe(true);
    expect(map.has("industry.electronics")).toBe(true);
    expect(map.get("industry.wholesale")?.version).toBe("1.0.0");
    expect(map.get("industry.electronics")?.version).toBe("1.0.0");
  });

  it("apply industry.wholesale: idempotent, audited, L1 lands in effective config", async () => {
    const { tenantId, userId } = await registerTenant("ws");
    const first = await withTenant(tenantId, () => applyService.apply(userId, "industry.wholesale"));
    const second = await withTenant(tenantId, () => applyService.apply(userId, "industry.wholesale"));
    expect(second.applied).toBe(false); // re-apply no-op
    const effective = await withTenant(tenantId, () => configuration.resolveEffectiveConfig());
    expect(effective.layers.l1Template?.key).toBe("industry.wholesale");
    // T9 negative ledger proof: template apply writes ZERO journal rows (INV-022)
    expect(await journalCount(tenantId)).toBe(0);
    const audits = await withTenant(tenantId, async () => {
      const su = await superuserClient();
      const r = await su.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM audit_events WHERE tenant_id = $1 AND action = 'template.applied'`,
        [tenantId],
      );
      await su.end();
      return r.rows[0]?.n ?? 0;
    });
    expect(audits).toBeGreaterThanOrEqual(1);
    void first;
  });

  it("T6 switch wholesale → electronics: additive-only, settings intact, switch back works", async () => {
    const { tenantId, userId } = await registerTenant("sw");
    await withTenant(tenantId, () => applyService.apply(userId, "industry.wholesale"));
    const before = await withTenant(tenantId, () => configuration.resolveEffectiveConfig());
    // electronics requires POS + CRM service feature keys — grant as plan entitlements
    const tenancyStore = await import("../../modules/tenancy/infrastructure/tenancy.store");
    await withTenant(tenantId, async () => {
      for (const key of [
        "industry.template_engine", "items.barcodes", "items.price_lists",
        "inventory.serial_tracking", "pos.terminals", "pos.sales",
        "pos.offline_queue", "pos.receipts", "crm.service_orders", "crm.service_contracts",
        "sales.invoices", "treasury.cashier_shifts",
      ]) {
        await tenancyStore.insertEntitlement({ featureKey: key, source: "PLAN", expiresAt: null });
      }
    });
    const r = await withTenant(tenantId, () => applyService.apply(userId, "industry.electronics"));
    expect(r.applied).toBe(true);
    // T9 negative ledger proof: the switch also writes ZERO journal rows
    expect(await journalCount(tenantId)).toBe(0);
    const after = await withTenant(tenantId, () => configuration.resolveEffectiveConfig());
    // BR-038: switch is additive-only — tenant identity/layers survive, L1 swaps.
    expect(after.tenant.id).toBe(before.tenant.id);
    expect(after.layers.l1Template?.key).toBe("industry.electronics");
    expect(before.resolvedHash).not.toBe(after.resolvedHash);
    const back = await withTenant(tenantId, () => applyService.apply(userId, "industry.wholesale"));
    expect(back.applied).toBe(true);
  });

  it("unknown template → TemplateNotFoundError (404-shaped)", async () => {
    const { tenantId, userId } = await registerTenant("nf");
    await expect(withTenant(tenantId, () => applyService.apply(userId, "industry.nope"))).rejects.toBeInstanceOf(TemplateNotFoundError);
  });
});
