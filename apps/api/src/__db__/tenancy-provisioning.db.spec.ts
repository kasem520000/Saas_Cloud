import { randomInt } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { ensureTestDb, superuserClient } from "./test-db";
import { RegistrationService } from "../modules/tenancy/application/registration-service";
import { OnboardingService } from "../modules/tenancy/application/onboarding-service";
import { EmailAlreadyRegisteredError, InvalidRegistrationInputError } from "../modules/tenancy/domain/tenancy-errors";
import { PasswordService } from "../modules/identity/api/identity";
import { AuditService } from "../modules/audit/api/audit";
import { DrizzleAuditStore } from "../modules/audit/infrastructure/drizzle-audit.store";
import { withTenant } from "../infra/db/tenant-context";

/**
 * PHASE-004 T4/T5 evidence — registration + onboarding on real PG16:
 * - acceptance 1: registration creates tenant + owner user + owner
 *   membership + trial subscription + materialized entitlements + audit
 *   events atomically (row-level SQL proof of the exact set);
 * - duplicate owner email → 409 EmailAlreadyRegisteredError and NO
 *   partial state (no tenant row, no user row);
 * - invalid country/currency/template/tax inputs → 422 shapes;
 * - acceptance 2: provisionWorkspace instantiates the CoA template (42
 *   accounts, 16 1:1 purpose markers), the system role templates, the
 *   numbering/fiscal/jurisdiction settings — and a re-run surfaces a
 *   created=0 diff with ZERO duplicates.
 */

const audit = new AuditService(new DrizzleAuditStore());
const passwords = new PasswordService();
const email = { enqueue: async () => undefined } as unknown as ConstructorParameters<typeof RegistrationService>[2];

let registration: RegistrationService;
let onboarding: OnboardingService;

const OWNER_PASSWORD = "an-extremely-strong-passphrase-1";

function makeRegistration(): RegistrationService {
  const service = new RegistrationService(passwords, audit, email as never);
  return service;
}

beforeAll(() => {
  ensureTestDb();
  registration = makeRegistration();
  onboarding = new OnboardingService(audit);
});

async function countRows(sql: string, params: unknown[]): Promise<number> {
  const su = await superuserClient();
  const result = await su.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) q`, params);
  await su.end();
  return result.rows[0]?.n ?? 0;
}

describe("public registration (acceptance 1)", () => {
  it("creates tenant + owner + membership + trial subscription + entitlements + audit, atomically", async () => {
    const result = await registration.register({
      businessName: "Provisioned Trading Co",
      businessNameAr: "شركة التوريدات التجارية",
      countryCode: "SA",
      baseCurrency: "SAR",
      industryTemplateKey: "industry.retail",
      taxRegistrationStatus: "REGISTERED",
      taxRegistrationNumber: "3001234567890003",
      ownerEmail: `owner-${Date.now()}@provision.test`,
      ownerFullName: "Owner One",
      ownerPassword: OWNER_PASSWORD,
      ip: `10.0.${randomInt(1, 250)}.1`,
    });

    // tenant profile per TABLES §tenants
    const tenants = await countRows(
      `SELECT 1 FROM tenants WHERE id = $1 AND status = 'ACTIVE'
         AND base_currency = 'SAR' AND country_code = 'SA'
         AND timezone = 'Asia/Riyadh' AND industry_template_key = 'industry.retail'`,
      [result.tenantId],
    );
    expect(tenants).toBe(1);

    // owner membership on the instantiated owner role
    const memberships = await countRows(
      `SELECT 1 FROM memberships m JOIN roles r ON r.id = m.role_id
        WHERE m.tenant_id = $1 AND m.user_id = $2 AND m.status = 'ACTIVE'
          AND r.key = 'owner' AND r.tenant_id = $1 AND r.is_system = false`,
      [result.tenantId, result.ownerUserId],
    );
    expect(memberships).toBe(1);

    // trial subscription (business plan) + full materialized entitlements
    const subscriptions = await countRows(
      `SELECT 1 FROM subscriptions s JOIN plans p ON p.id = s.plan_id
        WHERE s.tenant_id = $1 AND p.key = 'business' AND s.status = 'ACTIVE'`,
      [result.tenantId],
    );
    expect(subscriptions).toBe(1);
    const businessPlanKeys = await countRows(
      `SELECT 1 FROM plans WHERE key = 'business' AND cardinality(feature_keys) > 70`,
      [],
    );
    expect(businessPlanKeys).toBe(1);
    const entitlementCount = await countRows(
      `SELECT 1 FROM entitlements e
         WHERE e.tenant_id = $1 AND e.source = 'TRIAL'
           AND (SELECT cardinality(p.feature_keys) FROM plans p
                 JOIN subscriptions s ON s.plan_id = p.id
                  AND s.tenant_id = e.tenant_id AND s.status = 'ACTIVE')
               = (SELECT count(*) FROM entitlements e2
                   WHERE e2.tenant_id = e.tenant_id AND e2.source = 'TRIAL')`,
      [result.tenantId],
    );
    expect(entitlementCount).toBeGreaterThan(70);

    // registration settings defaults incl. provisional tax keys
    const settings = await countRows(
      `SELECT 1 FROM tenant_settings
        WHERE tenant_id = $1 AND key = 'tax.registration.status' AND value = '"REGISTERED"'`,
      [result.tenantId],
    );
    expect(settings).toBe(1);

    // dual audit trail: platform row (tenant_id NULL) + tenant rows
    const platformRow = await countRows(
      `SELECT 1 FROM audit_events
        WHERE tenant_id IS NULL AND action = 'tenant.created' AND entity_id = $1
          AND via_platform_admin = true`,
      [result.tenantId],
    );
    expect(platformRow).toBe(1);
    const tenantRow = await countRows(
      `SELECT 1 FROM audit_events
        WHERE tenant_id = $1 AND action IN ('tenant.created', 'membership.created',
                                            'plan.assigned', 'entitlements.materialized',
                                            'settings.initialized')`,
      [result.tenantId],
    );
    expect(tenantRow).toBe(5);
  });

  it("duplicate owner email → 409 shape and zero partial state", async () => {
    const emailTaken = `dupe-${Date.now()}@provision.test`;
    const first = await registration.register({
      businessName: "First",
      businessNameAr: null,
      countryCode: "YE",
      baseCurrency: "YER",
      industryTemplateKey: "industry.retail",
      taxRegistrationStatus: "NOT_REGISTERED",
      taxRegistrationNumber: null,
      ownerEmail: emailTaken,
      ownerFullName: "First Owner",
      ownerPassword: OWNER_PASSWORD,
      ip: `10.1.${randomInt(1, 250)}.2`,
    });
    const tenantsBefore = await countRows(`SELECT 1 FROM tenants`, []);
    await expect(
      registration.register({
        businessName: "Second",
        businessNameAr: null,
        countryCode: "YE",
        baseCurrency: "YER",
        industryTemplateKey: "industry.retail",
        taxRegistrationStatus: "NOT_REGISTERED",
        taxRegistrationNumber: null,
        ownerEmail: emailTaken,
        ownerFullName: "Second Owner",
        ownerPassword: OWNER_PASSWORD,
        ip: `10.1.${randomInt(1, 250)}.3`,
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    const tenantsAfter = await countRows(`SELECT 1 FROM tenants`, []);
    expect(tenantsAfter).toBe(tenantsBefore);
    // the first tenant is untouched by the failed attempt
    const ownerRoles = await countRows(
      `SELECT 1 FROM memberships WHERE tenant_id = $1`,
      [first.tenantId],
    );
    expect(ownerRoles).toBe(1);
  });

  it("invalid inputs → typed 422 shapes (country/currency/template/tax)", async () => {
    const base = {
      businessName: "Invalid Co",
      businessNameAr: null,
      ownerEmail: `bad-${Date.now()}@provision.test`,
      ownerFullName: "Bad Owner",
      ownerPassword: OWNER_PASSWORD,
      ip: `10.2.${randomInt(1, 250)}.4`,
    };
    await expect(
      registration.register({
        ...base,
        countryCode: "XX",
        baseCurrency: "SAR",
        industryTemplateKey: "industry.retail",
        taxRegistrationStatus: "NOT_REGISTERED",
        taxRegistrationNumber: null,
      }),
    ).rejects.toBeInstanceOf(InvalidRegistrationInputError);
    await expect(
      registration.register({
        ...base,
        countryCode: "SA",
        baseCurrency: "YER", // must match the country's seeded currency
        industryTemplateKey: "industry.retail",
        taxRegistrationStatus: "NOT_REGISTERED",
        taxRegistrationNumber: null,
      }),
    ).rejects.toBeInstanceOf(InvalidRegistrationInputError);
    await expect(
      registration.register({
        ...base,
        countryCode: "SA",
        baseCurrency: "SAR",
        industryTemplateKey: "industry.does_not_exist",
        taxRegistrationStatus: "NOT_REGISTERED",
        taxRegistrationNumber: null,
      }),
    ).rejects.toBeInstanceOf(InvalidRegistrationInputError);
    await expect(
      registration.register({
        ...base,
        countryCode: "SA",
        baseCurrency: "SAR",
        industryTemplateKey: "industry.retail",
        taxRegistrationStatus: "REGISTERED",
        taxRegistrationNumber: null, // required while REGISTERED
      }),
    ).rejects.toBeInstanceOf(InvalidRegistrationInputError);
  });
});

describe("provisionWorkspace (acceptance 2)", () => {
  const OWNER_PASSWORD2 = "an-extremely-strong-passphrase-2";

  it("instantiates CoA (42 accounts, 16 markers) + 8 system roles + defaults — idempotently", async () => {
    const created = await registration.register({
      businessName: "Onboard Co",
      businessNameAr: "شركة التهيئة",
      countryCode: "SA",
      baseCurrency: "SAR",
      industryTemplateKey: "industry.grocery",
      taxRegistrationStatus: "NOT_REGISTERED",
      taxRegistrationNumber: null,
      ownerEmail: `onboard-${Date.now()}@provision.test`,
      ownerFullName: "Onboarding Owner",
      ownerPassword: OWNER_PASSWORD2,
      ip: `10.3.${randomInt(1, 250)}.5`,
    });

    const first = await withTenant(created.tenantId, async () =>
      onboarding.provision(created.ownerUserId, { fiscalCalendarStartMonth: 4 }),
    );
    expect(first.accounts.created).toBe(42);
    expect(first.accounts.existing).toBe(0);
    expect(first.purposes.created).toBe(16);
    // owner was cloned at registration → 8 system-role clones here (owner
    // already exists: created 7, existing 1? — the registration clones
    // 'owner'; provision clones the remaining 8 keys incl. owner as skip).
    expect(first.roles.created.sort()).toEqual([
      "accountant",
      "cashier",
      "payroll_officer",
      "purchasing",
      "sales",
      "viewer",
      "warehouse",
    ]);
    expect(first.roles.existing).toEqual(["owner"]);

    // the SA/SAR workspace spot checks (acceptance 2): template accounts
    // carry bilingual names; purposes resolve 1:1.
    const su = await superuserClient();
    const accounts = await su.query<{ code: string; name_ar: string; is_postable: boolean }>(
      `SELECT code, name_ar, is_postable FROM accounts WHERE tenant_id = $1 ORDER BY code`,
      [created.tenantId],
    );
    await su.end();
    expect(accounts.rows).toHaveLength(42);
    expect(accounts.rows.find((row) => row.code === "1000")?.name_ar).toBe("الأصول");
    expect(accounts.rows.find((row) => row.code === "1111")?.is_postable).toBe(true);
    expect(accounts.rows.find((row) => row.code === "1000")?.is_postable).toBe(false);

    // re-run: zero duplicates, diff surfaced
    const second = await withTenant(created.tenantId, async () =>
      onboarding.provision(created.ownerUserId, {}),
    );
    expect(second.accounts.created).toBe(0);
    expect(second.accounts.existing).toBe(42);
    expect(second.purposes.created).toBe(0);
    expect(second.purposes.existing).toBe(16);
    expect(second.roles.created).toEqual([]);

    // still exactly 42 accounts / 16 active purposes / 9 roles
    const after = await superuserClient();
    const counts = await after.query<{
      accounts: number;
      purposes: number;
      roles: number;
    }>(
      `SELECT
         (SELECT count(*) FROM accounts WHERE tenant_id = $1)::int AS accounts,
         (SELECT count(*) FROM account_purposes WHERE tenant_id = $1 AND active_to IS NULL)::int AS purposes,
         (SELECT count(*) FROM roles WHERE tenant_id = $1 AND is_system = false)::int AS roles`,
      [created.tenantId],
    );
    await after.end();
    // 8 tenant roles: owner (registration) + the 7 business templates —
    // platform_admin is platform staff only, never a tenant role (§2).
    expect(counts.rows[0]).toEqual({ accounts: 42, purposes: 16, roles: 8 });

    // numbering + fiscal + jurisdiction settings written (policy rows only)
    const settings = await superuserClient();
    const rows = await settings.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM tenant_settings WHERE tenant_id = $1
        AND key IN ('numbering.defaults', 'fiscal_calendar.start_month', 'tax.jurisdiction.binding')`,
      [created.tenantId],
    );
    await settings.end();
    expect(rows.rows).toHaveLength(3);
    const fiscal = rows.rows.find((row) => row.key === "fiscal_calendar.start_month");
    expect((fiscal?.value as number)).toBe(4);
    const numbering = rows.rows.find((row) => row.key === "numbering.defaults");
    expect((numbering?.value as { assign_at: string }).assign_at).toBe("posting");
  });
});
