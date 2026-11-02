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
import { ClaimRefRequiredError } from "../../modules/sales/domain/sales-errors";
import {
  S_SALES,
  TENANT_S,
  salesInvoices,
  setupSalesFixture,
  type SalesFixture,
} from "../sales/fixtures";

/**
 * PHASE-031 db evidence (real PG16) — industry.healthcare through the
 * UNMODIFIED PHASE-015 engine plus the single additive claim_ref column:
 * seeded + valid; apply idempotent + audited + L1 lands; BR-038 additive-only
 * switch with ZERO journal rows (T9 negative ledger proof, INV-022);
 * policy-gated CLAIM_REF_REQUIRED enforcement on the existing save path
 * (capture only — DRAFT creates write no journals); unknown → 404.
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
    businessName: `${label} Clinic`,
    businessNameAr: `${label} عيادة`,
    countryCode: "SA",
    baseCurrency: "SAR",
    industryTemplateKey: "industry.wholesale",
    taxRegistrationStatus: "REGISTERED",
    taxRegistrationNumber: "3001234567890003",
    ownerEmail: `${label}-${Date.now()}-${randomInt(1000)}@config.test`,
    ownerFullName: "Owner",
    ownerPassword: OWNER_PASSWORD,
    ip: `10.4.${randomInt(1, 250)}.${randomInt(1, 250)}`,
  });
  return { tenantId: result.tenantId, userId: result.ownerUserId };
}

const HEALTHCARE_REQUIRED_KEYS = [
  "industry.template_engine",
  "partners.directory",
  "partners.statements",
  "sales.invoices",
  "sales.credit_limits",
  "notes.received",
  "notes.pdc_calendar",
  "inventory.batch_tracking",
  "crm.service_orders",
  "crm.service_contracts",
  // base platform keys the sales-fixture tenant also needs
  "accounting.chart_of_accounts",
  "accounting.journal_entries",
  "inventory.multi_warehouse",
  "inventory.stock_ledger",
  "items.item_master",
  "items.price_lists",
  "partners.credit_management",
  "partners.credit_terms",
  "platform.branches",
  "platform.onboarding",
  "platform.registration",
  "platform.tenant_lifecycle",
  "sales.orders",
  "sales.quotations",
  "tax.engine",
  "treasury.accounts",
  "treasury.receipts_disbursements",
];

async function grantHealthcareEntitlements(tenantId: string) {
  const tenancyStore = await import("../../modules/tenancy/infrastructure/tenancy.store");
  await withTenant(tenantId, async () => {
    for (const key of HEALTHCARE_REQUIRED_KEYS) {
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

let fixture: SalesFixture;

beforeAll(async () => {
  ensureTestDb();
  resetEffectiveConfigCache();
  fixture = await setupSalesFixture();
});

describe("PHASE-031 T1/T2 — healthcare template + claim_ref column via the unmodified engine", () => {
  it("industry.healthcare is seeded; claim_ref column exists and is nullable", async () => {
    const keys = await registry.listTemplates();
    const map = new Map(keys.map((k) => [k.key, k]));
    expect(map.has("industry.healthcare")).toBe(true);
    expect(map.get("industry.healthcare")?.version).toBe("1.0.0");
    const su = await superuserClient();
    const col = await su.query<{ nullable: string; maxlen: number | null }>(
      `SELECT is_nullable AS nullable, character_maximum_length AS maxlen
         FROM information_schema.columns
        WHERE table_name = 'sales_invoices' AND column_name = 'claim_ref'`,
    );
    await su.end();
    expect(col.rows[0]?.nullable).toBe("YES");
    expect(col.rows[0]?.maxlen).toBe(64);
  });

  it("apply industry.healthcare: idempotent, audited, L1 lands in effective config", async () => {
    const { tenantId, userId } = await registerTenant("hc");
    await grantHealthcareEntitlements(tenantId);
    const first = await withTenant(tenantId, () => applyService.apply(userId, "industry.healthcare"));
    const second = await withTenant(tenantId, () => applyService.apply(userId, "industry.healthcare"));
    expect(second.applied).toBe(false);
    const effective = await withTenant(tenantId, () => configuration.resolveEffectiveConfig());
    expect(effective.layers.l1Template?.key).toBe("industry.healthcare");
    expect(effective.policies["claim_ref_required_for_insured_invoices"]).toBe(true);
    // T9 negative ledger proof: apply writes ZERO journal rows (INV-022)
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

  it("T6/T11 switch wholesale → healthcare: additive-only (BR-038), zero journal rows, switch back works", async () => {
    const { tenantId, userId } = await registerTenant("hcsw");
    await withTenant(tenantId, () => applyService.apply(userId, "industry.wholesale"));
    await grantHealthcareEntitlements(tenantId);
    const before = await withTenant(tenantId, () => configuration.resolveEffectiveConfig());
    const r = await withTenant(tenantId, () => applyService.apply(userId, "industry.healthcare"));
    expect(r.applied).toBe(true);
    const after = await withTenant(tenantId, () => configuration.resolveEffectiveConfig());
    expect(after.tenant.id).toBe(before.tenant.id);
    expect(after.layers.l1Template?.key).toBe("industry.healthcare");
    expect(before.resolvedHash).not.toBe(after.resolvedHash);
    expect(await journalCount(tenantId)).toBe(0);
    const back = await withTenant(tenantId, () => applyService.apply(userId, "industry.wholesale"));
    expect(back.applied).toBe(true);
    expect(await journalCount(tenantId)).toBe(0);
  });

  it("unknown template → TemplateNotFoundError (404-shaped)", async () => {
    const { tenantId, userId } = await registerTenant("hcnf");
    await expect(withTenant(tenantId, () => applyService.apply(userId, "industry.nope"))).rejects.toBeInstanceOf(TemplateNotFoundError);
  });

  it("T4 claim-ref enforcement on the existing save path: policy-gated CLAIM_REF_REQUIRED, self-pay null, claim persisted; zero journals (DRAFT)", async () => {
    await grantHealthcareEntitlements(TENANT_S);
    await withTenant(TENANT_S, () => applyService.apply(S_SALES, "industry.healthcare"));
    const base = {
      branchId: fixture.branchId,
      customerId: fixture.customerId,
      salesRepId: null,
      kind: "CREDIT" as const,
      invoiceDate: "2026-01-15",
      dueDate: null,
      currencyCode: "SAR",
      exchangeRate: null,
      orderId: null,
      deliveryId: null,
      warehouseId: fixture.warehouseId,
      cashAccountId: null,
      note: null,
      noteAr: null,
      actorId: S_SALES,
      lines: [
        {
          itemId: fixture.items.a,
          accountId: null,
          deliveryLineId: null,
          description: null,
          descriptionAr: null,
          qty: "1",
          unitPrice: "100.000000",
          discountAmount: null,
          taxCodeId: fixture.taxCodeIds.standard,
          batchId: null,
          serialIds: null,
          note: null,
        },
      ],
    };
    const journalsBefore = await journalCount(TENANT_S);
    // insured invoice with an explicitly blank claim ref → typed rejection
    await expect(
      withTenant(TENANT_S, () => salesInvoices.create({ ...base, claimRef: "" })),
    ).rejects.toBeInstanceOf(ClaimRefRequiredError);
    await expect(
      withTenant(TENANT_S, () => salesInvoices.create({ ...base, claimRef: "   " })),
    ).rejects.toBeInstanceOf(ClaimRefRequiredError);
    // self-pay: claimRef absent → saves with null
    const selfPay = await withTenant(TENANT_S, () => salesInvoices.create({ ...base }));
    expect(selfPay.claimRef).toBeNull();
    // insured: claim ref provided → persisted
    const claim = await withTenant(TENANT_S, () => salesInvoices.create({ ...base, claimRef: "CLM-2026-001" }));
    expect(claim.claimRef).toBe("CLM-2026-001");
    const readBack = await withTenant(TENANT_S, () => salesInvoices.find(claim.id));
    expect(readBack.claimRef).toBe("CLM-2026-001");
    // capture only: DRAFT creates post nothing — zero journal delta (INV-022)
    expect(await journalCount(TENANT_S)).toBe(journalsBefore);
  });
});
