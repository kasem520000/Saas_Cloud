import { beforeAll, describe, expect, it } from "vitest";

import { appClient, ensureTestDb, seedTenants, superuserClient, TENANT_A, TENANT_B } from "../test-db";
import {
  TENANT_TABLE_NAMES,
  TENANT_TABLES_REGISTRY,
} from "./tables.registry";

/**
 * PHASE-003 T13 — the FIRST FULL RUN of the tenant-isolation attack suite
 * (TENANT_ISOLATION_TESTS §2; SECURITY_TEST_PLAN §2) over every registered
 * tenant-owned table, generated from the registry:
 *
 * - A1 no-GUC reads fail closed                     - A7 id-based probes see nothing
 * - A2 foreign-GUC reads never leak this tenant     - A8 aggregates stay empty
 * - A3 mismatched-tenant INSERTs are policy-denied  - A9 join shapes stay confined
 * - A4 foreign-GUC UPDATEs touch 0 rows             - A10 union/CTE shapes confined
 * - A5 DELETE is denied by grants (no DELETE grant)
 * - Structural: FORCE RLS + USING/WITH CHECK per table; registry completeness
 *   (a tenant-owned table missing from the registry fails the build).
 *
 * Fixtures are seeded by the bootstrap role (superuser) exactly like a
 * migration would; every ATTACK runs as `erp_app` (RLS enforced).
 *
 * Variant-policy tables (roles, role_permissions): template rows
 * (tenant_id IS NULL) are intentionally readable by every tenant — the
 * generated A2 expectation for them counts ONLY tenant-owned rows, and the
 * write attacks still must not cross tenants. Dedicated template-guard
 * tests prove the app role can never INSERT/UPDATE/DELETE a template row.
 */

const VARIANT = new Set(
  TENANT_TABLES_REGISTRY.filter((row) => row.variantTemplateRows).map((row) => row.table),
);

/** Tables whose app-role DELETE grant is by-design (A5: 0 foreign rows). */
const DELETE_GRANTED = new Set(
  TENANT_TABLES_REGISTRY.filter((row) => row.deleteGranted).map((row) => row.table),
);

/** Tables with NO app-role UPDATE grant at all (A4: the denial itself proves
 * the row cannot be touched — journal_lines/partner_subledger_entries are
 * append-only by grants per INV-003/INV-009, like audit_events). */
const NO_UPDATE_GRANT = new Set([
  "audit_events",
  "depreciation_lines", // PHASE-026: append-only (INV-003 pattern)
  "note_events", // PHASE-027: append-only custody log (INV-003/INV-024)
  "journal_lines",
  "partner_subledger_entries",
  "cash_movements",
  "treasury_allocations",
  // PHASE-009 (migration 0013): INV-012's append-only substrate.
  "tax_document_summaries",
  // PHASE-010 (migration 0014): the append-only stock ledger (INV-010/
  // INV-017 — grants + guard trigger mirror cash_movements).
  "stock_moves",
  // PHASE-011 (migration 0017): the audited re-allocation documents are
  // INSERT-only by grants (status CHECK admits only POSTED — the trail
  // cannot be rewritten).
  "purchase_reallocations",
  "purchase_reallocation_lines",
  // PHASE-012 (migration 0019): the sales mirror — INSERT-only by grants.
  "sales_reallocations",
  "sales_reallocation_lines",
  // PHASE-014 (migration 0021): the billing event log is append-only by
  // grants (SELECT + INSERT only — replay-protected webhook ingestion).
  "billing_events",
  // PHASE-020 (migration 0027): the tombstone feed is append-only by grants.
  "tombstones",
]);

/** Fixture rows seeded per tenant (A2's total-count expectation). The
 * default is exactly one per registered table; uoms carries two (KG + G —
 * the conversion fixture needs a valid from≠to pair); journal_lines carries
 * two (a balanced DEBIT+CREDIT pair — the INV-001/002 deferred trigger
 * enforces balance on every committed entry, fixture or not). */
const EXPECTED_ROWS_PER_TENANT: Record<string, number> = {
  uoms: 2,
  journal_lines: 2,
  // PHASE-008: two GL hosts (the 1:1 cash-account link needs distinct
  // accounts) + two treasury accounts (CASH + BANK — transfers require
  // from ≠ to).
  accounts: 2,
  cash_accounts: 2,
  // PHASE-010: two warehouses per tenant (transfers require from ≠ to).
  warehouses: 2,
};
function expectedRowsFor(table: string): number {
  return EXPECTED_ROWS_PER_TENANT[table] ?? 1;
}

/** A tenant-owned row per registered table, seeded as the bootstrap role. */
async function seedFixtures(superuser: {
  query: (sql: string, values?: unknown[]) => Promise<{ rowCount: number | null }>;
}): Promise<void> {
  await seedTenants(superuser as never);
  await superuser.query(
    `INSERT INTO roles (id, tenant_id, key, name, name_ar, is_system)
     VALUES
       ('dddddddd-0000-4000-8000-000000000001', $1, 'owner_a', 'Owner A', 'مالك أ', false),
       ('dddddddd-0000-4000-8000-000000000002', $2, 'owner_b', 'Owner B', 'مالك ب', false)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO role_permissions (role_id, tenant_id, permission_id)
     VALUES ('dddddddd-0000-4000-8000-000000000001', $1, 'partners.view'),
            ('dddddddd-0000-4000-8000-000000000002', $2, 'partners.view')
     ON CONFLICT (role_id, permission_id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  // users are global; one per tenant for memberships/invitations/sessions.
  await superuser.query(
    `INSERT INTO users (id, email, full_name, password_hash, status)
     VALUES
       ('eeeeeeee-0000-4000-8000-000000000001', 'iso-a@test', 'A', 'x', 'ACTIVE'),
       ('eeeeeeee-0000-4000-8000-000000000002', 'iso-b@test', 'B', 'x', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`,
  );
  // PHASE-004 fixtures (migrations 0006/0007): one row per registered
  // table per tenant, FK-consistent, idempotent.
  await superuser.query(
    `INSERT INTO branches (id, tenant_id, code, name, name_ar)
     VALUES
       ('abababab-0000-4000-8000-000000000001', $1, 'MAIN', 'Branch A', 'فرع أ'),
       ('abababab-0000-4000-8000-000000000002', $2, 'MAIN', 'Branch B', 'فرع ب')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO tenant_settings (id, tenant_id, key, value)
     VALUES
       ('acacacac-0000-4000-8000-000000000001', $1, 'general.default_locale', '"ar"'::jsonb),
       ('acacacac-0000-4000-8000-000000000002', $2, 'general.default_locale', '"ar"'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO subscriptions (id, tenant_id, plan_id, period_start, period_end)
     VALUES
       ('adadadad-0000-4000-8000-000000000001', $1,
        '30000000-0000-4000-8000-000000000002', '2026-01-01', '2026-12-31'),
       ('adadadad-0000-4000-8000-000000000002', $2,
        '30000000-0000-4000-8000-000000000002', '2026-01-01', '2026-12-31')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO entitlements (id, tenant_id, feature_key, source)
     VALUES
       ('aeaeaeae-0000-4000-8000-000000000001', $1, 'platform.branches', 'PLAN'),
       ('aeaeaeae-0000-4000-8000-000000000002', $2, 'platform.branches', 'PLAN')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO support_sessions (id, tenant_id, platform_user_id, opt_in, ticket_ref, reason, expires_at)
     VALUES
       ('afafafaf-0000-4000-8000-000000000001', $1,
        'eeeeeeee-0000-4000-8000-000000000001', false, 'ISO-1', 'iso fixture',
        now() + interval '4 hours'),
       ('afafafaf-0000-4000-8000-000000000002', $2,
        'eeeeeeee-0000-4000-8000-000000000002', false, 'ISO-2', 'iso fixture',
        now() + interval '4 hours')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO accounts (id, tenant_id, code, name, name_ar, type, is_postable)
     VALUES
       ('b0b0b0b0-0000-4000-8000-000000000001', $1, '1000', 'Assets A', 'الأصول', 'ASSET', false),
       ('b0b0b0b0-0000-4000-8000-000000000002', $2, '1000', 'Assets B', 'الأصول', 'ASSET', false)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO account_purposes (id, tenant_id, purpose_key, account_id, active_from)
     VALUES
       ('b1b1b1b1-0000-4000-8000-000000000001', $1, 'AR_CONTROL',
        'b0b0b0b0-0000-4000-8000-000000000001', '2026-01-01'),
       ('b1b1b1b1-0000-4000-8000-000000000002', $2, 'AR_CONTROL',
        'b0b0b0b0-0000-4000-8000-000000000002', '2026-01-01')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO memberships (id, tenant_id, user_id, role_id)
     VALUES
       ('ffffffff-0000-4000-8000-000000000001', $1, 'eeeeeeee-0000-4000-8000-000000000001',
        'dddddddd-0000-4000-8000-000000000001'),
       ('ffffffff-0000-4000-8000-000000000002', $2, 'eeeeeeee-0000-4000-8000-000000000002',
        'dddddddd-0000-4000-8000-000000000002')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO invitations (id, tenant_id, email, role_id, token_hash, expires_at, invited_by)
     VALUES
       ('eeeeeeee-1000-4000-8000-000000000001', $1, 'iso-a@test',
        'dddddddd-0000-4000-8000-000000000001', 'iso-token-a', now() + interval '72 hours',
        'eeeeeeee-0000-4000-8000-000000000001'),
       ('eeeeeeee-1000-4000-8000-000000000002', $2, 'iso-b@test',
        'dddddddd-0000-4000-8000-000000000002', 'iso-token-b', now() + interval '72 hours',
        'eeeeeeee-0000-4000-8000-000000000002')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO audit_events (id, tenant_id, action, entity_type, entity_id)
     VALUES
       ('eeeeeeee-2000-4000-8000-000000000001', $1, 'iso.seed', 'iso_fixture', $1),
       ('eeeeeeee-2000-4000-8000-000000000002', $2, 'iso.seed', 'iso_fixture', $2)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  // PHASE-006 fixtures (migration 0009): one row per registered table per
  // tenant, FK-consistent, idempotent. (The migration's per-tenant uom/
  // credit-terms backfill only covers tenants existing at migration time —
  // the suite's tenants are created after the fresh boot, so the canonical
  // `is_system` rows are instantiated here exactly like onboarding does.)
  await superuser.query(
    `INSERT INTO uoms (id, tenant_id, code, name, name_ar, is_system)
     VALUES
       ('b2b2b2b2-0000-4000-8000-000000000001', $1, 'KG', 'Kilogram', 'كيلوجرام', true),
       ('b2b2b2b2-0000-4000-8000-000000000002', $2, 'KG', 'Kilogram', 'كيلوجرام', true)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO uoms (id, tenant_id, code, name, name_ar, is_system)
     VALUES
       ('b2b2b2b2-1000-4000-8000-000000000001', $1, 'G', 'Gram', 'جرام', true),
       ('b2b2b2b2-1000-4000-8000-000000000002', $2, 'G', 'Gram', 'جرام', true)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO credit_terms (id, tenant_id, code, name, name_ar, days, is_system)
     VALUES
       ('b3b3b3b3-0000-4000-8000-000000000001', $1, 'NET-30', 'Net 30 days', 'صافي 30 يومًا', 30, true),
       ('b3b3b3b3-0000-4000-8000-000000000002', $2, 'NET-30', 'Net 30 days', 'صافي 30 يومًا', 30, true)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO price_lists (id, tenant_id, name, name_ar, kind, currency_code)
     VALUES
       ('b4b4b4b4-0000-4000-8000-000000000001', $1, 'ISO List A', 'قائمة أ', 'SALE', 'SAR'),
       ('b4b4b4b4-0000-4000-8000-000000000002', $2, 'ISO List B', 'قائمة ب', 'SALE', 'SAR')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO partners (id, tenant_id, kind, code, name, name_ar, credit_terms_id, price_list_id)
     VALUES
       ('b5b5b5b5-0000-4000-8000-000000000001', $1, 'CUSTOMER', 'ISO-A', 'Partner A', 'جهة أ',
        'b3b3b3b3-0000-4000-8000-000000000001', 'b4b4b4b4-0000-4000-8000-000000000001'),
       ('b5b5b5b5-0000-4000-8000-000000000002', $2, 'CUSTOMER', 'ISO-B', 'Partner B', 'جهة ب',
        'b3b3b3b3-0000-4000-8000-000000000002', 'b4b4b4b4-0000-4000-8000-000000000002')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO partner_contacts (id, tenant_id, partner_id, name)
     VALUES
       ('b6b6b6b6-0000-4000-8000-000000000001', $1, 'b5b5b5b5-0000-4000-8000-000000000001', 'Contact A'),
       ('b6b6b6b6-0000-4000-8000-000000000002', $2, 'b5b5b5b5-0000-4000-8000-000000000002', 'Contact B')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO partner_addresses (id, tenant_id, partner_id, type, line1)
     VALUES
       ('b7b7b7b7-0000-4000-8000-000000000001', $1, 'b5b5b5b5-0000-4000-8000-000000000001', 'BILLING', 'Line A'),
       ('b7b7b7b7-0000-4000-8000-000000000002', $2, 'b5b5b5b5-0000-4000-8000-000000000002', 'BILLING', 'Line B')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO item_categories (id, tenant_id, code, name, name_ar)
     VALUES
       ('b8b8b8b8-0000-4000-8000-000000000001', $1, 'CAT-A', 'Category A', 'فئة أ'),
       ('b8b8b8b8-0000-4000-8000-000000000002', $2, 'CAT-B', 'Category B', 'فئة ب')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO uom_conversions (id, tenant_id, from_uom_id, to_uom_id, factor)
     VALUES
       ('b9b9b9b9-0000-4000-8000-000000000001', $1,
        'b2b2b2b2-0000-4000-8000-000000000001', 'b2b2b2b2-1000-4000-8000-000000000001', 1000),
       ('b9b9b9b9-0000-4000-8000-000000000002', $2,
        'b2b2b2b2-0000-4000-8000-000000000002', 'b2b2b2b2-1000-4000-8000-000000000002', 1000)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO items (id, tenant_id, sku, name, name_ar, kind, uom_id, category_id)
     VALUES
       ('babababa-0000-4000-8000-000000000001', $1, 'ISO-ITEM-A', 'Item A', 'صنف أ', 'STOCK',
        'b2b2b2b2-0000-4000-8000-000000000001', 'b8b8b8b8-0000-4000-8000-000000000001'),
       ('babababa-0000-4000-8000-000000000002', $2, 'ISO-ITEM-B', 'Item B', 'صنف ب', 'STOCK',
        'b2b2b2b2-0000-4000-8000-000000000002', 'b8b8b8b8-0000-4000-8000-000000000002')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO barcodes (id, tenant_id, item_id, uom_id, code)
     VALUES
       ('bbbbbbbb-0000-4000-8000-000000000001', $1,
        'babababa-0000-4000-8000-000000000001', 'b2b2b2b2-0000-4000-8000-000000000001', '1234567890128'),
       ('bbbbbbbb-0000-4000-8000-000000000002', $2,
        'babababa-0000-4000-8000-000000000002', 'b2b2b2b2-0000-4000-8000-000000000002', '1234567890129')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO price_list_items (id, tenant_id, price_list_id, item_id, uom_id, unit_price)
     VALUES
       ('bcbcbcbc-0000-4000-8000-000000000001', $1,
        'b4b4b4b4-0000-4000-8000-000000000001', 'babababa-0000-4000-8000-000000000001',
        'b2b2b2b2-0000-4000-8000-000000000001', 10),
       ('bcbcbcbc-0000-4000-8000-000000000002', $2,
        'b4b4b4b4-0000-4000-8000-000000000002', 'babababa-0000-4000-8000-000000000002',
        'b2b2b2b2-0000-4000-8000-000000000002', 10)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO partner_balances (id, tenant_id, partner_id, draft_balance)
     VALUES
       ('bdbdbdbd-0000-4000-8000-000000000001', $1, 'b5b5b5b5-0000-4000-8000-000000000001', 100),
       ('bdbdbdbd-0000-4000-8000-000000000002', $2, 'b5b5b5b5-0000-4000-8000-000000000002', 100)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO opening_balance_docs (id, tenant_id, kind, partner_id, amount, currency_code)
     VALUES
       ('bebebebe-0000-4000-8000-000000000001', $1, 'PARTNER',
        'b5b5b5b5-0000-4000-8000-000000000001', 100, 'SAR'),
       ('bebebebe-0000-4000-8000-000000000002', $2, 'PARTNER',
        'b5b5b5b5-0000-4000-8000-000000000002', 100, 'SAR')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO file_objects (id, tenant_id, owner_type, owner_id, storage_key, name, size_bytes, content_type)
     VALUES
       ('bfbfbfbf-0000-4000-8000-000000000001', $1, 'PARTNER', 'b5b5b5b5-0000-4000-8000-000000000001',
        'iso/fixture-a.pdf', 'fixture-a.pdf', 1234, 'application/pdf'),
       ('bfbfbfbf-0000-4000-8000-000000000002', $2, 'PARTNER', 'b5b5b5b5-0000-4000-8000-000000000002',
        'iso/fixture-b.pdf', 'fixture-b.pdf', 1234, 'application/pdf')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO import_jobs (id, tenant_id, kind, format, upload_token, file_key, created_by)
     VALUES
       ('c0c0c0c0-0000-4000-8000-000000000001', $1, 'PARTNERS', 'CSV', 'iso-token-a',
        'iso/partners-a.csv', 'eeeeeeee-0000-4000-8000-000000000001'),
       ('c0c0c0c0-0000-4000-8000-000000000002', $2, 'PARTNERS', 'CSV', 'iso-token-b',
        'iso/partners-b.csv', 'eeeeeeee-0000-4000-8000-000000000002')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  // PHASE-007 fixtures (migrations 0010/0011): one row per registered table
  // per tenant, FK-consistent, idempotent. journal_lines carries the
  // balanced DEBIT+CREDIT pair the deferred INV-001/002 trigger demands;
  // partner_subledger_entries references the AR line (INV-009 shape).
  await superuser.query(
    `INSERT INTO fiscal_years (id, tenant_id, name, start_date, end_date)
     VALUES
       ('b5b5b5b5-0000-4000-8000-000000000001', $1, 'FY2026', '2026-01-01', '2026-12-31'),
       ('b5b5b5b5-0000-4000-8000-000000000002', $2, 'FY2026', '2026-01-01', '2026-12-31')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO fiscal_periods (id, tenant_id, fiscal_year_id, name, kind, start_date, end_date)
     VALUES
       ('c2c2c2c2-0000-4000-8000-000000000001', $1, 'b5b5b5b5-0000-4000-8000-000000000001',
        '2026-01', 'REGULAR', '2026-01-01', '2026-01-31'),
       ('c2c2c2c2-0000-4000-8000-000000000002', $2, 'b5b5b5b5-0000-4000-8000-000000000002',
        '2026-01', 'REGULAR', '2026-01-01', '2026-01-31')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO exchange_rates (id, tenant_id, currency_code, rate_date, rate)
     VALUES
       ('c3c3c3c3-0000-4000-8000-000000000001', $1, 'USD', '2026-01-15', 3.75),
       ('c3c3c3c3-0000-4000-8000-000000000002', $2, 'USD', '2026-01-15', 3.75)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO cost_centers (id, tenant_id, code, name, name_ar)
     VALUES
       ('c4c4c4c4-0000-4000-8000-000000000001', $1, 'CC-A', 'HQ', 'المركز الرئيسي'),
       ('c4c4c4c4-0000-4000-8000-000000000002', $2, 'CC-A', 'HQ', 'المركز الرئيسي')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO recurring_journals (id, tenant_id, name, template, schedule, start_date, next_run_date)
     VALUES
       ('c5c5c5c5-0000-4000-8000-000000000001', $1, 'ISO rent',
        '{"lines": []}'::jsonb, 'MONTHLY', '2026-01-01', '2026-02-01'),
       ('c5c5c5c5-0000-4000-8000-000000000002', $2, 'ISO rent',
        '{"lines": []}'::jsonb, 'MONTHLY', '2026-01-01', '2026-02-01')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO approval_policies (id, tenant_id, doc_type, policy, applies_from)
     VALUES
       ('c6c6c6c6-0000-4000-8000-000000000001', $1, 'journal_entry',
        '{"mode": "single-approver"}'::jsonb, '2026-01-01'),
       ('c6c6c6c6-0000-4000-8000-000000000002', $2, 'journal_entry',
        '{"mode": "single-approver"}'::jsonb, '2026-01-01')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO numbering_sequences (id, tenant_id, doc_type, period_key, next_value)
     VALUES
       ('c7c7c7c7-0000-4000-8000-000000000001', $1, 'journal_entry', '2026', 2),
       ('c7c7c7c7-0000-4000-8000-000000000002', $2, 'journal_entry', '2026', 2)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO number_assignments (id, tenant_id, doc_type, period_key, number, value)
     VALUES
       ('c8c8c8c8-0000-4000-8000-000000000001', $1, 'journal_entry', '2026', 'JE-2026-000001', 1),
       ('c8c8c8c8-0000-4000-8000-000000000002', $2, 'journal_entry', '2026', 'JE-2026-000001', 1)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO manual_journals (id, tenant_id, created_by, status, entry_date, currency_code)
     VALUES
       ('c9c9c9c9-0000-4000-8000-000000000001', $1, 'eeeeeeee-0000-4000-8000-000000000001',
        'DRAFT', '2026-01-20', 'SAR'),
       ('c9c9c9c9-0000-4000-8000-000000000002', $2, 'eeeeeeee-0000-4000-8000-000000000002',
        'DRAFT', '2026-01-20', 'SAR')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO manual_journal_lines (id, tenant_id, manual_journal_id, line_no, account_id, direction, amount)
     VALUES
       ('cacacaca-0000-4000-8000-000000000001', $1, 'c9c9c9c9-0000-4000-8000-000000000001',
        1, 'b0b0b0b0-0000-4000-8000-000000000001', 'DEBIT', 50),
       ('cacacaca-0000-4000-8000-000000000002', $2, 'c9c9c9c9-0000-4000-8000-000000000002',
        1, 'b0b0b0b0-0000-4000-8000-000000000002', 'DEBIT', 50)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO journal_templates (id, tenant_id, created_by, name, lines)
     VALUES
       ('cbcbcbcb-0000-4000-8000-000000000001', $1, 'eeeeeeee-0000-4000-8000-000000000001',
        'ISO template', '[{"direction": "DEBIT"}]'::jsonb),
       ('cbcbcbcb-0000-4000-8000-000000000002', $2, 'eeeeeeee-0000-4000-8000-000000000002',
        'ISO template', '[{"direction": "DEBIT"}]'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO journal_entries (id, tenant_id, entry_no, entry_date, fiscal_period_id,
                                  currency_code, source_type, operation)
     VALUES
       ('cccccccc-0000-4000-8000-000000000001', $1, 'JE-2026-000001', '2026-01-20',
        'c2c2c2c2-0000-4000-8000-000000000001', 'SAR', 'iso_fixture', 'post'),
       ('cccccccc-0000-4000-8000-000000000002', $2, 'JE-2026-000001', '2026-01-20',
        'c2c2c2c2-0000-4000-8000-000000000002', 'SAR', 'iso_fixture', 'post')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO journal_lines (id, tenant_id, journal_entry_id, line_no, account_id,
                               direction, amount, base_amount, partner_id)
     VALUES
       ('cdcdcdcd-0000-4000-8000-000000000001', $1, 'cccccccc-0000-4000-8000-000000000001',
        1, 'b0b0b0b0-0000-4000-8000-000000000001', 'DEBIT', 50, 50,
        'b5b5b5b5-0000-4000-8000-000000000001'),
       ('cdcdcdcd-1000-4000-8000-000000000001', $1, 'cccccccc-0000-4000-8000-000000000001',
        2, 'b0b0b0b0-0000-4000-8000-000000000001', 'CREDIT', 50, 50, NULL),
       ('cdcdcdcd-0000-4000-8000-000000000002', $2, 'cccccccc-0000-4000-8000-000000000002',
        1, 'b0b0b0b0-0000-4000-8000-000000000002', 'DEBIT', 50, 50,
        'b5b5b5b5-0000-4000-8000-000000000002'),
       ('cdcdcdcd-1000-4000-8000-000000000002', $2, 'cccccccc-0000-4000-8000-000000000002',
        2, 'b0b0b0b0-0000-4000-8000-000000000002', 'CREDIT', 50, 50, NULL)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO partner_subledger_entries (id, tenant_id, partner_id, journal_entry_id,
                                            journal_line_id, entry_date, direction, amount,
                                            base_amount, currency_code, source_type)
     VALUES
       ('cececece-0000-4000-8000-000000000001', $1, 'b5b5b5b5-0000-4000-8000-000000000001',
        'cccccccc-0000-4000-8000-000000000001', 'cdcdcdcd-0000-4000-8000-000000000001',
        '2026-01-20', 'DEBIT', 50, 50, 'SAR', 'iso_fixture'),
       ('cececece-0000-4000-8000-000000000002', $2, 'b5b5b5b5-0000-4000-8000-000000000002',
        'cccccccc-0000-4000-8000-000000000002', 'cdcdcdcd-0000-4000-8000-000000000002',
        '2026-01-20', 'DEBIT', 50, 50, 'SAR', 'iso_fixture')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO reconciliation_runs (id, tenant_id, kind, as_of, status, control_balance, subledger_balance)
     VALUES
       ('cfcfcfcf-0000-4000-8000-000000000001', $1, 'AR', '2026-01-31', 'OK', 50, 50),
       ('cfcfcfcf-0000-4000-8000-000000000002', $2, 'AR', '2026-01-31', 'OK', 50, 50)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  // PHASE-008 fixtures (migration 0012): two GL hosts per tenant (the
  // treasury 1:1 account link requires distinct accounts) + the eleven
  // treasury tables' FK-consistent rows, seeded exactly like onboarding.
  await superuser.query(
    `INSERT INTO accounts (id, tenant_id, code, name, name_ar, type, is_postable)
     VALUES
       ('b0b0b0b0-1000-4000-8000-000000000001', $1, '1001', 'Cash Host A', 'نقدي أ', 'ASSET', false),
       ('b0b0b0b0-1000-4000-8000-000000000002', $2, '1001', 'Cash Host B', 'نقدي ب', 'ASSET', false)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO cash_accounts (id, tenant_id, name, name_ar, type, account_id, currency_code)
     VALUES
       ('d0d0d0d0-0000-4000-8000-000000000001', $1, 'Main Cash A', 'الصندوق أ', 'CASH',
        'b0b0b0b0-0000-4000-8000-000000000001', 'SAR'),
       ('d0d0d0d0-0000-4000-8000-000000000002', $2, 'Main Cash B', 'الصندوق ب', 'CASH',
        'b0b0b0b0-0000-4000-8000-000000000002', 'SAR'),
       ('d1d1d1d1-0000-4000-8000-000000000001', $1, 'Bank A', 'بنك أ', 'BANK',
        'b0b0b0b0-1000-4000-8000-000000000001', 'SAR'),
       ('d1d1d1d1-0000-4000-8000-000000000002', $2, 'Bank B', 'بنك ب', 'BANK',
        'b0b0b0b0-1000-4000-8000-000000000002', 'SAR')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO cash_movements (id, tenant_id, cash_account_id, direction, amount, currency_code,
                                 exchange_rate, base_amount, source_type, source_id, value_date)
     VALUES
       ('d2d2d2d2-0000-4000-8000-000000000001', $1, 'd0d0d0d0-0000-4000-8000-000000000001', 'IN',
        100, 'SAR', 1, 100, 'receipt', 'd3d3d3d3-0000-4000-8000-000000000001', '2027-01-05'),
       ('d2d2d2d2-0000-4000-8000-000000000002', $2, 'd0d0d0d0-0000-4000-8000-000000000002', 'IN',
        100, 'SAR', 1, 100, 'receipt', 'd3d3d3d3-0000-4000-8000-000000000002', '2027-01-05')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO receipts (id, tenant_id, status, cash_account_id, partner_id, method, currency_code,
                           amount, value_date, allocated_amount)
     VALUES
       ('d3d3d3d3-0000-4000-8000-000000000001', $1, 'DRAFT', 'd0d0d0d0-0000-4000-8000-000000000001',
        'b5b5b5b5-0000-4000-8000-000000000001', 'CASH', 'SAR', 100, '2027-01-05', 0),
       ('d3d3d3d3-0000-4000-8000-000000000002', $2, 'DRAFT', 'd0d0d0d0-0000-4000-8000-000000000002',
        'b5b5b5b5-0000-4000-8000-000000000002', 'CASH', 'SAR', 100, '2027-01-05', 0)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO payments (id, tenant_id, status, cash_account_id, partner_id, method, currency_code,
                           amount, value_date, allocated_amount)
     VALUES
       ('d4d4d4d4-0000-4000-8000-000000000001', $1, 'DRAFT', 'd0d0d0d0-0000-4000-8000-000000000001',
        'b5b5b5b5-0000-4000-8000-000000000001', 'CASH', 'SAR', 50, '2027-01-06', 0),
       ('d4d4d4d4-0000-4000-8000-000000000002', $2, 'DRAFT', 'd0d0d0d0-0000-4000-8000-000000000002',
        'b5b5b5b5-0000-4000-8000-000000000002', 'CASH', 'SAR', 50, '2027-01-06', 0)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO treasury_allocations (id, tenant_id, receipt_id, open_item_id, amount)
     VALUES
       ('d5d5d5d5-0000-4000-8000-000000000001', $1, 'd3d3d3d3-0000-4000-8000-000000000001',
        'cececece-0000-4000-8000-000000000001', 40),
       ('d5d5d5d5-0000-4000-8000-000000000002', $2, 'd3d3d3d3-0000-4000-8000-000000000002',
        'cececece-0000-4000-8000-000000000002', 40)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO expense_categories (id, tenant_id, code, name, name_ar, account_id)
     VALUES
       ('d6d6d6d6-0000-4000-8000-000000000001', $1, 'RENT-A', 'Rent A', 'إيجار أ',
        'b0b0b0b0-0000-4000-8000-000000000001'),
       ('d6d6d6d6-0000-4000-8000-000000000002', $2, 'RENT-B', 'Rent B', 'إيجار ب',
        'b0b0b0b0-0000-4000-8000-000000000002')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO expenses (id, tenant_id, status, category_id, cash_account_id, payee_name,
                           currency_code, amount, value_date)
     VALUES
       ('d7d7d7d7-0000-4000-8000-000000000001', $1, 'DRAFT', 'd6d6d6d6-0000-4000-8000-000000000001',
        'd0d0d0d0-0000-4000-8000-000000000001', 'Landlord A', 'SAR', 25, '2027-01-07'),
       ('d7d7d7d7-0000-4000-8000-000000000002', $2, 'DRAFT', 'd6d6d6d6-0000-4000-8000-000000000002',
        'd0d0d0d0-0000-4000-8000-000000000002', 'Landlord B', 'SAR', 25, '2027-01-07')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO cash_transfers (id, tenant_id, status, from_account_id, to_account_id, currency_code,
                                 amount, fee_amount, value_date)
     VALUES
       ('d8d8d8d8-0000-4000-8000-000000000001', $1, 'DRAFT', 'd0d0d0d0-0000-4000-8000-000000000001',
        'd1d1d1d1-0000-4000-8000-000000000001', 'SAR', 80, 2, '2027-01-08'),
       ('d8d8d8d8-0000-4000-8000-000000000002', $2, 'DRAFT', 'd0d0d0d0-0000-4000-8000-000000000002',
        'd1d1d1d1-0000-4000-8000-000000000002', 'SAR', 80, 2, '2027-01-08')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO cashier_shifts (id, tenant_id, status, cash_account_id, currency_code, opening_amount, closed_at)
     VALUES
       ('d9d9d9d9-0000-4000-8000-000000000001', $1, 'CLOSED', 'd0d0d0d0-0000-4000-8000-000000000001',
        'SAR', 50, now()),
       ('d9d9d9d9-0000-4000-8000-000000000002', $2, 'CLOSED', 'd0d0d0d0-0000-4000-8000-000000000002',
        'SAR', 50, now())
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO bank_statements (id, tenant_id, status, cash_account_id, period_start, period_end,
                                  file_name, file_hash, adapter_id, line_count)
     VALUES
       ('dadadada-0000-4000-8000-000000000001', $1, 'IMPORTED', 'd1d1d1d1-0000-4000-8000-000000000001',
        '2027-01-01', '2027-01-31', 'iso-a.csv', 'a' || repeat('0', 63), 'generic-csv', 1),
       ('dadadada-0000-4000-8000-000000000002', $2, 'IMPORTED', 'd1d1d1d1-0000-4000-8000-000000000002',
        '2027-01-01', '2027-01-31', 'iso-b.csv', 'b' || repeat('0', 63), 'generic-csv', 1)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO bank_statement_lines (id, tenant_id, bank_statement_id, line_no, line_date, amount)
     VALUES
       ('dbdbdbdb-0000-4000-8000-000000000001', $1, 'dadadada-0000-4000-8000-000000000001',
        1, '2027-01-10', 100),
       ('dbdbdbdb-0000-4000-8000-000000000002', $2, 'dadadada-0000-4000-8000-000000000002',
        1, '2027-01-10', 100)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );

  // PHASE-009 tax cluster (migration 0013): one row per registered table
  // per tenant, FK-consistent, idempotent. The summary references the
  // tenant's own tax_codes row (composite FK) and the vat_return carries
  // the neutral DRAFT shape (summary/cross_check '{}').
  await superuser.query(
    `INSERT INTO tax_codes (id, tenant_id, code, name, country_code, default_treatment)
     VALUES
       ('e0e0e0e0-0000-4000-8000-000000000001', $1, 'ATK-TAX', 'Attack Tax A', 'SA', 'STANDARD_RATED'),
       ('e0e0e0e0-0000-4000-8000-000000000002', $2, 'ATK-TAX', 'Attack Tax B', 'SA', 'STANDARD_RATED')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO tax_registrations (id, tenant_id, country_code, status, registration_number, effective_from)
     VALUES
       ('e1e1e1e1-0000-4000-8000-000000000001', $1, 'SA', 'REGISTERED', '300000000000003', '2026-01-01'),
       ('e1e1e1e1-0000-4000-8000-000000000002', $2, 'SA', 'REGISTERED', '300000000000004', '2026-01-01')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO tax_pack_bindings (id, tenant_id, country_code, pack_version)
     VALUES
       ('e2e2e2e2-0000-4000-8000-000000000001', $1, 'SA', '1.0.0-baseline'),
       ('e2e2e2e2-0000-4000-8000-000000000002', $2, 'SA', '1.0.0-baseline')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO tax_document_summaries (id, tenant_id, source_type, source_id, document_date,
        country_code, direction, treatment, rate, taxable_base, tax_amount, snapshot, tax_code_id)
     VALUES
       ('e3e3e3e3-0000-4000-8000-000000000001', $1, 'iso_fixture', $1, '2027-01-10', 'SA',
        'OUTPUT', 'STANDARD_RATED', 15.0000, 100, 15, '{"treatment":"STANDARD_RATED"}'::jsonb,
        'e0e0e0e0-0000-4000-8000-000000000001'),
       ('e3e3e3e3-0000-4000-8000-000000000002', $2, 'iso_fixture', $2, '2027-01-10', 'SA',
        'OUTPUT', 'STANDARD_RATED', 15.0000, 100, 15, '{"treatment":"STANDARD_RATED"}'::jsonb,
        'e0e0e0e0-0000-4000-8000-000000000002')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO vat_returns (id, tenant_id, country_code, period_start, period_end, summary, cross_check)
     VALUES
       ('e4e4e4e4-0000-4000-8000-000000000001', $1, 'SA', '2027-01-01', '2027-01-31', '{}'::jsonb, '{}'::jsonb),
       ('e4e4e4e4-0000-4000-8000-000000000002', $2, 'SA', '2027-01-01', '2027-01-31', '{}'::jsonb, '{}'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO e_invoicing_submissions (id, tenant_id, country_code, adapter_id, source_type, source_id, status)
     VALUES
       ('e5e5e5e5-0000-4000-8000-000000000001', $1, 'SA', 'fake', 'iso_fixture', $1, 'PENDING'),
       ('e5e5e5e5-0000-4000-8000-000000000002', $2, 'SA', 'fake', 'iso_fixture', $2, 'PENDING')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );

  // PHASE-010 inventory cluster (migrations 0014/0015): two warehouses per
  // tenant (transfers require from ≠ to) + one FK-consistent row per
  // registered table, idempotent. The stock_move references the tenant's
  // own item + warehouse (composite FKs); its layer rides that move; the
  // transfer stays DRAFT (no dispatch shape needed for isolation math).
  await superuser.query(
    `INSERT INTO warehouses (id, tenant_id, branch_id, code, name)
     VALUES
       ('f0f0f0f0-1000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001', 'WH1', 'Main WH A'),
       ('f0f0f0f0-1000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002', 'WH1', 'Main WH B'),
       ('f0f0f0f0-2000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001', 'WH2', 'Second WH A'),
       ('f0f0f0f0-2000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002', 'WH2', 'Second WH B')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO item_warehouse_settings (id, tenant_id, item_id, warehouse_id, reorder_level, min_qty)
     VALUES
       ('f1f1f1f1-0000-4000-8000-000000000001', $1, 'babababa-0000-4000-8000-000000000001',
        'f0f0f0f0-1000-4000-8000-000000000001', 5, 2),
       ('f1f1f1f1-0000-4000-8000-000000000002', $2, 'babababa-0000-4000-8000-000000000002',
        'f0f0f0f0-1000-4000-8000-000000000002', 5, 2)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO item_batches (id, tenant_id, item_id, batch_no, expiry_date)
     VALUES
       ('f2f2f2f2-0000-4000-8000-000000000001', $1, 'babababa-0000-4000-8000-000000000001', 'B-001', '2027-06-30'),
       ('f2f2f2f2-0000-4000-8000-000000000002', $2, 'babababa-0000-4000-8000-000000000002', 'B-001', '2027-06-30')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO item_serials (id, tenant_id, item_id, serial_no, status)
     VALUES
       ('f3f3f3f3-0000-4000-8000-000000000001', $1, 'babababa-0000-4000-8000-000000000001', 'SN-001', 'in_stock'),
       ('f3f3f3f3-0000-4000-8000-000000000002', $2, 'babababa-0000-4000-8000-000000000002', 'SN-001', 'in_stock')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO stock_moves (id, tenant_id, item_id, warehouse_id, direction, move_kind, qty,
                              unit_cost, value_amount, source_type, source_id, moved_at)
     VALUES
       ('f4f4f4f4-0000-4000-8000-000000000001', $1, 'babababa-0000-4000-8000-000000000001',
        'f0f0f0f0-1000-4000-8000-000000000001', 'IN', 'receipt', 10, 2.5, 25,
        'manual_receipt', 'f4f4f4f4-0000-4000-8000-000000000001', '2027-01-05'),
       ('f4f4f4f4-0000-4000-8000-000000000002', $2, 'babababa-0000-4000-8000-000000000002',
        'f0f0f0f0-1000-4000-8000-000000000002', 'IN', 'receipt', 10, 2.5, 25,
        'manual_receipt', 'f4f4f4f4-0000-4000-8000-000000000002', '2027-01-05')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO stock_layers (id, tenant_id, item_id, warehouse_id, remaining_qty, unit_cost,
                               source_move_id, received_at)
     VALUES
       ('f5f5f5f5-0000-4000-8000-000000000001', $1, 'babababa-0000-4000-8000-000000000001',
        'f0f0f0f0-1000-4000-8000-000000000001', 10, 2.5,
        'f4f4f4f4-0000-4000-8000-000000000001', '2027-01-05'),
       ('f5f5f5f5-0000-4000-8000-000000000002', $2, 'babababa-0000-4000-8000-000000000002',
        'f0f0f0f0-1000-4000-8000-000000000002', 10, 2.5,
        'f4f4f4f4-0000-4000-8000-000000000002', '2027-01-05')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO item_stock (id, tenant_id, item_id, warehouse_id, qty, avg_cost)
     VALUES
       ('f6f6f6f6-0000-4000-8000-000000000001', $1, 'babababa-0000-4000-8000-000000000001',
        'f0f0f0f0-1000-4000-8000-000000000001', 10, 2.5),
       ('f6f6f6f6-0000-4000-8000-000000000002', $2, 'babababa-0000-4000-8000-000000000002',
        'f0f0f0f0-1000-4000-8000-000000000002', 10, 2.5)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO stock_transfers (id, tenant_id, from_warehouse_id, to_warehouse_id, status)
     VALUES
       ('f7f7f7f7-0000-4000-8000-000000000001', $1, 'f0f0f0f0-1000-4000-8000-000000000001',
        'f0f0f0f0-2000-4000-8000-000000000001', 'DRAFT'),
       ('f7f7f7f7-0000-4000-8000-000000000002', $2, 'f0f0f0f0-1000-4000-8000-000000000002',
        'f0f0f0f0-2000-4000-8000-000000000002', 'DRAFT')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO stock_transfer_lines (id, tenant_id, transfer_id, line_no, item_id, qty)
     VALUES
       ('f8f8f8f8-0000-4000-8000-000000000001', $1, 'f7f7f7f7-0000-4000-8000-000000000001', 1,
        'babababa-0000-4000-8000-000000000001', 4),
       ('f8f8f8f8-0000-4000-8000-000000000002', $2, 'f7f7f7f7-0000-4000-8000-000000000002', 1,
        'babababa-0000-4000-8000-000000000002', 4)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO stock_adjustments (id, tenant_id, warehouse_id, item_id, reason, delta_qty)
     VALUES
       ('f9f9f9f9-0000-4000-8000-000000000001', $1, 'f0f0f0f0-1000-4000-8000-000000000001',
        'babababa-0000-4000-8000-000000000001', 'DAMAGE', -1),
       ('f9f9f9f9-0000-4000-8000-000000000002', $2, 'f0f0f0f0-1000-4000-8000-000000000002',
        'babababa-0000-4000-8000-000000000002', 'DAMAGE', -1)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO stock_reservations (id, tenant_id, item_id, warehouse_id, qty, holder_type)
     VALUES
       ('fafafafa-0000-4000-8000-000000000001', $1, 'babababa-0000-4000-8000-000000000001',
        'f0f0f0f0-1000-4000-8000-000000000001', 2, 'MANUAL'),
       ('fafafafa-0000-4000-8000-000000000002', $2, 'babababa-0000-4000-8000-000000000002',
        'f0f0f0f0-1000-4000-8000-000000000002', 2, 'MANUAL')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO stock_counts (id, tenant_id, warehouse_id, status, snapshot_at)
     VALUES
       ('fbfbfbfb-0000-4000-8000-000000000001', $1, 'f0f0f0f0-1000-4000-8000-000000000001',
        'DRAFT', '2027-01-10T09:00:00Z'),
       ('fbfbfbfb-0000-4000-8000-000000000002', $2, 'f0f0f0f0-1000-4000-8000-000000000002',
        'DRAFT', '2027-01-10T09:00:00Z')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO stock_count_lines (id, tenant_id, stock_count_id, line_no, item_id, system_qty)
     VALUES
       ('fcfcfcfc-0000-4000-8000-000000000001', $1, 'fbfbfbfb-0000-4000-8000-000000000001', 1,
        'babababa-0000-4000-8000-000000000001', 10),
       ('fcfcfcfc-0000-4000-8000-000000000002', $2, 'fbfbfbfb-0000-4000-8000-000000000002', 1,
        'babababa-0000-4000-8000-000000000002', 10)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );

  // PHASE-011 purchasing cluster (migrations 0016/0017): one DRAFT
  // document chain per tenant — PR → PO → GRN → supplier invoice → debit
  // note (referencing the invoice) + landed cost on the GRN + a POSTED
  // re-allocation document on the tenant's fixture payment. All FKs stay
  // within the tenant's own fixture rows (composite tenant FKs).
  await superuser.query(
    `INSERT INTO purchase_requests (id, tenant_id, branch_id, needed_by, status)
     VALUES
       ('5a5a5a5a-0000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001', '2027-03-01', 'DRAFT'),
       ('5a5a5a5a-0000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002', '2027-03-01', 'DRAFT')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO purchase_request_lines (id, tenant_id, request_id, line_no, item_id, qty)
     VALUES
       ('5b5b5b5b-0000-4000-8000-000000000001', $1, '5a5a5a5a-0000-4000-8000-000000000001', 1,
        'babababa-0000-4000-8000-000000000001', 5),
       ('5b5b5b5b-0000-4000-8000-000000000002', $2, '5a5a5a5a-0000-4000-8000-000000000002', 1,
        'babababa-0000-4000-8000-000000000002', 5)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO purchase_orders (id, tenant_id, branch_id, supplier_id, order_date, currency_code, status)
     VALUES
       ('5c5c5c5c-0000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001',
        'b5b5b5b5-0000-4000-8000-000000000001', '2027-02-01', 'SAR', 'DRAFT'),
       ('5c5c5c5c-0000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002',
        'b5b5b5b5-0000-4000-8000-000000000002', '2027-02-01', 'SAR', 'DRAFT')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO purchase_order_lines (id, tenant_id, order_id, line_no, item_id, qty, unit_price, net_amount)
     VALUES
       ('5d5d5d5d-0000-4000-8000-000000000001', $1, '5c5c5c5c-0000-4000-8000-000000000001', 1,
        'babababa-0000-4000-8000-000000000001', 5, 2.5, 12.5),
       ('5d5d5d5d-0000-4000-8000-000000000002', $2, '5c5c5c5c-0000-4000-8000-000000000002', 1,
        'babababa-0000-4000-8000-000000000002', 5, 2.5, 12.5)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO goods_receipts (id, tenant_id, branch_id, supplier_id, po_id, warehouse_id, receipt_date, status, total_value)
     VALUES
       ('5e5e5e5e-0000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001',
        'b5b5b5b5-0000-4000-8000-000000000001', '5c5c5c5c-0000-4000-8000-000000000001',
        'f0f0f0f0-1000-4000-8000-000000000001', '2027-02-05', 'DRAFT', 12.5),
       ('5e5e5e5e-0000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002',
        'b5b5b5b5-0000-4000-8000-000000000002', '5c5c5c5c-0000-4000-8000-000000000002',
        'f0f0f0f0-1000-4000-8000-000000000002', '2027-02-05', 'DRAFT', 12.5)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO goods_receipt_lines (id, tenant_id, receipt_id, line_no, po_line_id, item_id, qty, unit_cost, value_amount)
     VALUES
       ('5f5f5f5f-0000-4000-8000-000000000001', $1, '5e5e5e5e-0000-4000-8000-000000000001', 1,
        '5d5d5d5d-0000-4000-8000-000000000001', 'babababa-0000-4000-8000-000000000001', 5, 2.5, 12.5),
       ('5f5f5f5f-0000-4000-8000-000000000002', $2, '5e5e5e5e-0000-4000-8000-000000000002', 1,
        '5d5d5d5d-0000-4000-8000-000000000002', 'babababa-0000-4000-8000-000000000002', 5, 2.5, 12.5)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO supplier_invoices (id, tenant_id, branch_id, supplier_id, invoice_no, invoice_date, due_date, currency_code, status, total_net, total_tax, total_gross)
     VALUES
       ('60606060-0000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001',
        'b5b5b5b5-0000-4000-8000-000000000001', 'ISO-001', '2027-02-10', '2027-03-12', 'SAR', 'DRAFT', 12.5, 0, 12.5),
       ('60606060-0000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002',
        'b5b5b5b5-0000-4000-8000-000000000002', 'ISO-001', '2027-02-10', '2027-03-12', 'SAR', 'DRAFT', 12.5, 0, 12.5)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO supplier_invoice_lines (id, tenant_id, invoice_id, line_no, grn_line_id, item_id, qty, unit_price, net_amount)
     VALUES
       ('61616161-0000-4000-8000-000000000001', $1, '60606060-0000-4000-8000-000000000001', 1,
        '5f5f5f5f-0000-4000-8000-000000000001', 'babababa-0000-4000-8000-000000000001', 5, 2.5, 12.5),
       ('61616161-0000-4000-8000-000000000002', $2, '60606060-0000-4000-8000-000000000002', 1,
        '5f5f5f5f-0000-4000-8000-000000000002', 'babababa-0000-4000-8000-000000000002', 5, 2.5, 12.5)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO debit_notes (id, tenant_id, branch_id, supplier_id, ref_invoice_id, note_date, currency_code, status, total_net, total_tax, total_gross)
     VALUES
       ('62626262-0000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001',
        'b5b5b5b5-0000-4000-8000-000000000001', '60606060-0000-4000-8000-000000000001', '2027-02-15', 'SAR', 'DRAFT', 1, 0, 1),
       ('62626262-0000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002',
        'b5b5b5b5-0000-4000-8000-000000000002', '60606060-0000-4000-8000-000000000002', '2027-02-15', 'SAR', 'DRAFT', 1, 0, 1)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO debit_note_lines (id, tenant_id, note_id, line_no, item_id, qty, unit_price, net_amount)
     VALUES
       ('63636363-0000-4000-8000-000000000001', $1, '62626262-0000-4000-8000-000000000001', 1,
        'babababa-0000-4000-8000-000000000001', 1, 1, 1),
       ('63636363-0000-4000-8000-000000000002', $2, '62626262-0000-4000-8000-000000000002', 1,
        'babababa-0000-4000-8000-000000000002', 1, 1, 1)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO landed_costs (id, tenant_id, grn_id, cost_type, amount, allocation_method, charge_account_id, status)
     VALUES
       ('64646464-0000-4000-8000-000000000001', $1, '5e5e5e5e-0000-4000-8000-000000000001',
        'freight', 2, 'VALUE', 'b0b0b0b0-0000-4000-8000-000000000001', 'DRAFT'),
       ('64646464-0000-4000-8000-000000000002', $2, '5e5e5e5e-0000-4000-8000-000000000002',
        'freight', 2, 'VALUE', 'b0b0b0b0-0000-4000-8000-000000000002', 'DRAFT')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO landed_cost_allocations (id, tenant_id, landed_cost_id, grn_line_id, item_id, warehouse_id, qty_at_allocation, remaining_qty, allocated_amount)
     VALUES
       ('65656565-0000-4000-8000-000000000001', $1, '64646464-0000-4000-8000-000000000001',
        '5f5f5f5f-0000-4000-8000-000000000001', 'babababa-0000-4000-8000-000000000001',
        'f0f0f0f0-1000-4000-8000-000000000001', 5, 5, 2),
       ('65656565-0000-4000-8000-000000000002', $2, '64646464-0000-4000-8000-000000000002',
        '5f5f5f5f-0000-4000-8000-000000000002', 'babababa-0000-4000-8000-000000000002',
        'f0f0f0f0-1000-4000-8000-000000000002', 5, 5, 2)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO purchase_reallocations (id, tenant_id, doc_no, payment_id, supplier_id, reason, total_amount)
     VALUES
       ('66666666-0000-4000-8000-000000000001', $1, 'RAL-ISO-1', 'd4d4d4d4-0000-4000-8000-000000000001',
        'b5b5b5b5-0000-4000-8000-000000000001', 'iso fixture re-allocation', 1),
       ('66666666-0000-4000-8000-000000000002', $2, 'RAL-ISO-1', 'd4d4d4d4-0000-4000-8000-000000000002',
        'b5b5b5b5-0000-4000-8000-000000000002', 'iso fixture re-allocation', 1)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO purchase_reallocation_lines (id, tenant_id, reallocation_id, line_no, to_open_item_id, amount)
     VALUES
       ('67676767-0000-4000-8000-000000000001', $1, '66666666-0000-4000-8000-000000000001', 1,
        'cececece-0000-4000-8000-000000000001', 1),
       ('67676767-0000-4000-8000-000000000002', $2, '66666666-0000-4000-8000-000000000002', 1,
        'cececece-0000-4000-8000-000000000002', 1)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );

  // PHASE-012 sales cluster (migrations 0018/0019): one FK-consistent
  // DRAFT row per registered table per tenant (the B row doubles as the
  // A4/A7 foreign probe target). Re-allocations are POSTED-at-create
  // documents (the INSERT-only audit trail).
  await superuser.query(
    `INSERT INTO sales_reps (id, tenant_id, code, name, status)
     VALUES
       ('70707070-0000-4000-8000-000000000001', $1, 'REP-ISO', 'Iso Rep A', 'ACTIVE'),
       ('70707070-0000-4000-8000-000000000002', $2, 'REP-ISO', 'Iso Rep B', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO quotations (id, tenant_id, branch_id, customer_id, sales_rep_id, quote_date,
                            valid_until, currency_code, status, total_net, total_tax, total_gross)
     VALUES
       ('71717171-0000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001',
        'b5b5b5b5-0000-4000-8000-000000000001', '70707070-0000-4000-8000-000000000001',
        '2027-02-01', '2027-03-03', 'SAR', 'DRAFT', 100, 15, 115),
       ('71717171-0000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002',
        'b5b5b5b5-0000-4000-8000-000000000002', '70707070-0000-4000-8000-000000000002',
        '2027-02-01', '2027-03-03', 'SAR', 'DRAFT', 100, 15, 115)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO quotation_lines (id, tenant_id, quotation_id, line_no, item_id, qty, unit_price, net_amount)
     VALUES
       ('72727272-0000-4000-8000-000000000001', $1, '71717171-0000-4000-8000-000000000001', 1,
        'babababa-0000-4000-8000-000000000001', 5, 2.5, 12.5),
       ('72727272-0000-4000-8000-000000000002', $2, '71717171-0000-4000-8000-000000000002', 1,
        'babababa-0000-4000-8000-000000000002', 5, 2.5, 12.5)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO sales_orders (id, tenant_id, branch_id, customer_id, warehouse_id, quotation_id,
                              order_date, currency_code, status, total_net, total_tax, total_gross)
     VALUES
       ('73737373-0000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001',
        'b5b5b5b5-0000-4000-8000-000000000001', 'f0f0f0f0-1000-4000-8000-000000000001',
        '71717171-0000-4000-8000-000000000001', '2027-02-02', 'SAR', 'DRAFT', 100, 15, 115),
       ('73737373-0000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002',
        'b5b5b5b5-0000-4000-8000-000000000002', 'f0f0f0f0-1000-4000-8000-000000000002',
        '71717171-0000-4000-8000-000000000002', '2027-02-02', 'SAR', 'DRAFT', 100, 15, 115)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO sales_order_lines (id, tenant_id, order_id, line_no, item_id, qty, unit_price, net_amount)
     VALUES
       ('74747474-0000-4000-8000-000000000001', $1, '73737373-0000-4000-8000-000000000001', 1,
        'babababa-0000-4000-8000-000000000001', 5, 2.5, 12.5),
       ('74747474-0000-4000-8000-000000000002', $2, '73737373-0000-4000-8000-000000000002', 1,
        'babababa-0000-4000-8000-000000000002', 5, 2.5, 12.5)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO delivery_notes (id, tenant_id, branch_id, customer_id, order_id, warehouse_id,
                                 delivery_date, currency_code, status, total_net, total_tax, total_gross, cogs_value)
     VALUES
       ('75757575-0000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001',
        'b5b5b5b5-0000-4000-8000-000000000001', '73737373-0000-4000-8000-000000000001',
        'f0f0f0f0-1000-4000-8000-000000000001', '2027-02-05', 'SAR', 'DRAFT', 12.5, 0, 12.5, 0),
       ('75757575-0000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002',
        'b5b5b5b5-0000-4000-8000-000000000002', '73737373-0000-4000-8000-000000000002',
        'f0f0f0f0-1000-4000-8000-000000000002', '2027-02-05', 'SAR', 'DRAFT', 12.5, 0, 12.5, 0)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO delivery_note_lines (id, tenant_id, delivery_id, line_no, order_line_id, item_id, qty, unit_price, net_amount)
     VALUES
       ('76767676-0000-4000-8000-000000000001', $1, '75757575-0000-4000-8000-000000000001', 1,
        '74747474-0000-4000-8000-000000000001', 'babababa-0000-4000-8000-000000000001', 5, 2.5, 12.5),
       ('76767676-0000-4000-8000-000000000002', $2, '75757575-0000-4000-8000-000000000002', 1,
        '74747474-0000-4000-8000-000000000002', 'babababa-0000-4000-8000-000000000002', 5, 2.5, 12.5)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO sales_invoices (id, tenant_id, branch_id, customer_id, kind, invoice_date, due_date,
                                 currency_code, status, total_net, total_tax, total_gross)
     VALUES
       ('77777777-0000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001',
        'b5b5b5b5-0000-4000-8000-000000000001', 'CREDIT', '2027-02-10', '2027-03-12',
        'SAR', 'DRAFT', 12.5, 0, 12.5),
       ('77777777-0000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002',
        'b5b5b5b5-0000-4000-8000-000000000002', 'CREDIT', '2027-02-10', '2027-03-12',
        'SAR', 'DRAFT', 12.5, 0, 12.5)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO sales_invoice_lines (id, tenant_id, invoice_id, line_no, item_id, delivery_line_id, qty, unit_price, net_amount)
     VALUES
       ('78787878-0000-4000-8000-000000000001', $1, '77777777-0000-4000-8000-000000000001', 1,
        'babababa-0000-4000-8000-000000000001', '76767676-0000-4000-8000-000000000001', 5, 2.5, 12.5),
       ('78787878-0000-4000-8000-000000000002', $2, '77777777-0000-4000-8000-000000000002', 1,
        'babababa-0000-4000-8000-000000000002', '76767676-0000-4000-8000-000000000002', 5, 2.5, 12.5)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO credit_notes (id, tenant_id, branch_id, customer_id, invoice_id, note_date,
                               currency_code, status, total_net, total_tax, total_gross, reentry_value)
     VALUES
       ('79797979-0000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001',
        'b5b5b5b5-0000-4000-8000-000000000001', '77777777-0000-4000-8000-000000000001',
        '2027-02-15', 'SAR', 'DRAFT', 1, 0, 1, 0),
       ('79797979-0000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002',
        'b5b5b5b5-0000-4000-8000-000000000002', '77777777-0000-4000-8000-000000000002',
        '2027-02-15', 'SAR', 'DRAFT', 1, 0, 1, 0)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO credit_note_lines (id, tenant_id, note_id, line_no, invoice_line_id, item_id, qty, unit_price, net_amount, return_to_stock)
     VALUES
       ('7a7a7a7a-0000-4000-8000-000000000001', $1, '79797979-0000-4000-8000-000000000001', 1,
        '78787878-0000-4000-8000-000000000001', 'babababa-0000-4000-8000-000000000001', 1, 1, 1, false),
       ('7a7a7a7a-0000-4000-8000-000000000002', $2, '79797979-0000-4000-8000-000000000002', 1,
        '78787878-0000-4000-8000-000000000002', 'babababa-0000-4000-8000-000000000002', 1, 1, 1, false)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO sales_reallocations (id, tenant_id, doc_no, receipt_id, customer_id, reason, total_amount)
     VALUES
       ('7b7b7b7b-0000-4000-8000-000000000001', $1, 'SRAL-ISO-1', 'd3d3d3d3-0000-4000-8000-000000000001',
        'b5b5b5b5-0000-4000-8000-000000000001', 'iso fixture sales re-allocation', 1),
       ('7b7b7b7b-0000-4000-8000-000000000002', $2, 'SRAL-ISO-1', 'd3d3d3d3-0000-4000-8000-000000000002',
        'b5b5b5b5-0000-4000-8000-000000000002', 'iso fixture sales re-allocation', 1)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO sales_reallocation_lines (id, tenant_id, reallocation_id, line_no, to_open_item_id, amount)
     VALUES
       ('7c7c7c7c-0000-4000-8000-000000000001', $1, '7b7b7b7b-0000-4000-8000-000000000001', 1,
        'cececece-0000-4000-8000-000000000001', 1),
       ('7c7c7c7c-0000-4000-8000-000000000002', $2, '7b7b7b7b-0000-4000-8000-000000000002', 1,
        'cececece-0000-4000-8000-000000000002', 1)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );

  // PHASE-013 reporting cluster (migration 0020): one orchestration row
  // (a QUEUED trial-balance run) + one registry row (the a4-report
  // template) per tenant — the B rows double as the A4/A7 foreign probes.
  await superuser.query(
    `INSERT INTO report_runs (id, tenant_id, report_key, contract_version, params,
                              params_hash, execution_class, status)
     VALUES
       ('7d7d7d7d-0000-4000-8000-000000000001', $1, 'financial.trial-balance', 1,
        '{"dateFrom": "2026-01-01", "dateTo": "2026-01-31", "locale": "en"}'::jsonb,
        'iso-fixture-a', 'inline', 'QUEUED'),
       ('7d7d7d7d-0000-4000-8000-000000000002', $2, 'financial.trial-balance', 1,
        '{"dateFrom": "2026-01-01", "dateTo": "2026-01-31", "locale": "en"}'::jsonb,
        'iso-fixture-b', 'inline', 'QUEUED')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO print_templates (id, tenant_id, key, version, locale_variants)
     VALUES
       ('7e7e7e7e-0000-4000-8000-000000000001', $1, 'a4-report', 1, '{"ar": 1, "en": 1}'::jsonb),
       ('7e7e7e7e-0000-4000-8000-000000000002', $2, 'a4-report', 1, '{"ar": 1, "en": 1}'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );

  // PHASE-014 billing/usage/notifications fixtures (migration 0021).
  await superuser.query(
    `INSERT INTO subscription_invoices (id, tenant_id, subscription_id, number, amount, currency_code,
                                        period_start, period_end, due_date)
     VALUES
       ('d5d5d5d5-0000-4000-8000-000000000001', $1, 'adadadad-0000-4000-8000-000000000001',
        'SUB-INV-2026-000001', 0, 'SAR', '2026-01-01', '2026-01-31', '2026-02-14'),
       ('d5d5d5d5-0000-4000-8000-000000000002', $2, 'adadadad-0000-4000-8000-000000000002',
        'SUB-INV-2026-000001', 0, 'SAR', '2026-01-01', '2026-01-31', '2026-02-14')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO billing_events (id, tenant_id, event_type, subscription_id, invoice_id, payload)
     VALUES
       ('d6d6d6d6-0000-4000-8000-000000000001', $1, 'invoice.created',
        'adadadad-0000-4000-8000-000000000001', 'd5d5d5d5-0000-4000-8000-000000000001', '{}'::jsonb),
       ('d6d6d6d6-0000-4000-8000-000000000002', $2, 'invoice.created',
        'adadadad-0000-4000-8000-000000000002', 'd5d5d5d5-0000-4000-8000-000000000002', '{}'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO usage_counters (id, tenant_id, counter_key, period, value)
     VALUES
       ('d7d7d7d7-0000-4000-8000-000000000001', $1, 'documents_per_month', '2026-01-01', 5),
       ('d7d7d7d7-0000-4000-8000-000000000002', $2, 'documents_per_month', '2026-01-01', 7)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO notifications (id, tenant_id, type, title, body)
     VALUES
       ('d8d8d8d8-0000-4000-8000-000000000001', $1, 'invoice.overdue',
        '{"ar":"فواتير متأخرة","en":"Overdue"}'::jsonb, '{"ar":"...","en":"..."}'::jsonb),
       ('d8d8d8d8-0000-4000-8000-000000000002', $2, 'invoice.overdue',
        '{"ar":"فواتير متأخرة","en":"Overdue"}'::jsonb, '{"ar":"...","en":"..."}'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO notification_preferences (id, tenant_id, event_type, in_app, email)
     VALUES
       ('d9d9d9d9-0000-4000-8000-000000000001', $1, 'invoice.overdue', true, true),
       ('d9d9d9d9-0000-4000-8000-000000000002', $2, 'invoice.overdue', true, false)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );

  // PHASE-015 (migration 0022): the applied industry template row (PK = tenant_id).
  await superuser.query(
    `INSERT INTO tenant_industry_config (tenant_id, template_key, applied_version, applied_manifest_hash)
     VALUES ($1, 'industry.retail', '1.0.0', 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
            ($2, 'industry.retail', '1.0.0', 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
     ON CONFLICT (tenant_id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  // PHASE-017 (migration 0024): automotive & distribution fixtures (FKs reuse
  // the base branch/partner/item/warehouse/sales_reps rows seeded above).
  await superuser.query(
    `INSERT INTO vehicles (id, tenant_id, partner_id, make, model, vin, plate)
     VALUES ('a10a10a1-0000-4000-8000-000000000001', $1, 'b5b5b5b5-0000-4000-8000-000000000001', 'Toyota', 'Corolla', 'JTDBU4EE9J9000001', 'ABC-1234'),
            ('a10a10a1-0000-4000-8000-000000000002', $2, 'b5b5b5b5-0000-4000-8000-000000000002', 'Toyota', 'Corolla', 'JTDBU4EE9J9000002', 'ABC-1235')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO job_cards (id, tenant_id, branch_id, card_no, customer_id, status)
     VALUES ('b20b20b2-0000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001', 'JC-0001', 'b5b5b5b5-0000-4000-8000-000000000001', 'DRAFT'),
            ('b20b20b2-0000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002', 'JC-0001', 'b5b5b5b5-0000-4000-8000-000000000002', 'DRAFT')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO job_card_lines (id, tenant_id, job_card_id, line_type, qty, unit_price)
     VALUES ('c30c30c3-0000-4000-8000-000000000001', $1, 'b20b20b2-0000-4000-8000-000000000001', 'LABOR', 2, 50),
            ('c30c30c3-0000-4000-8000-000000000002', $2, 'b20b20b2-0000-4000-8000-000000000002', 'LABOR', 2, 50)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO routes (id, tenant_id, rep_id, name)
     VALUES ('d40d40d4-0000-4000-8000-000000000001', $1, '70707070-0000-4000-8000-000000000001', 'Route 1'),
            ('d40d40d4-0000-4000-8000-000000000002', $2, '70707070-0000-4000-8000-000000000002', 'Route 1')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO route_visits (id, tenant_id, route_id, customer_id, planned_date)
     VALUES ('e50e50e5-0000-4000-8000-000000000001', $1, 'd40d40d4-0000-4000-8000-000000000001', 'b5b5b5b5-0000-4000-8000-000000000001', '2026-11-02'),
            ('e50e50e5-0000-4000-8000-000000000002', $2, 'd40d40d4-0000-4000-8000-000000000002', 'b5b5b5b5-0000-4000-8000-000000000002', '2026-11-02')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO rep_settlements (id, tenant_id, rep_id, settlement_no, settlement_date, expected_cash)
     VALUES ('f60f60f6-0000-4000-8000-000000000001', $1, '70707070-0000-4000-8000-000000000001', 'STL-0001', '2026-11-02', 100),
            ('f60f60f6-0000-4000-8000-000000000002', $2, '70707070-0000-4000-8000-000000000002', 'STL-0001', '2026-11-02', 100)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO van_stocks (tenant_id, warehouse_id, item_id, qty, value_amount)
     VALUES ($1, 'f0f0f0f0-1000-4000-8000-000000000001', 'babababa-0000-4000-8000-000000000001', 5, 25),
            ($2, 'f0f0f0f0-1000-4000-8000-000000000002', 'babababa-0000-4000-8000-000000000002', 5, 25)
     ON CONFLICT DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO commission_rules (id, tenant_id, rep_id, basis, rate_pct)
     VALUES ('a70a70a7-0000-4000-8000-000000000001', $1, '70707070-0000-4000-8000-000000000001', 'COLLECTED', 5),
            ('a70a70a7-0000-4000-8000-000000000002', $2, '70707070-0000-4000-8000-000000000002', 'COLLECTED', 5)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO commission_runs (id, tenant_id, run_no, period_from, period_to)
     VALUES ('b80b80b8-0000-4000-8000-000000000001', $1, 'CR-0001', '2026-11-01', '2026-11-30'),
            ('b80b80b8-0000-4000-8000-000000000002', $2, 'CR-0001', '2026-11-01', '2026-11-30')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  // PHASE-018 (migration 0025): manufacturing fixtures.
  await superuser.query(
    `INSERT INTO bills_of_materials (id, tenant_id, item_id, name, current_version)
     VALUES ('c90c90c9-0000-4000-8000-000000000001', $1, 'babababa-0000-4000-8000-000000000001', 'Bread BOM', 1),
            ('c90c90c9-0000-4000-8000-000000000002', $2, 'babababa-0000-4000-8000-000000000002', 'Bread BOM', 1)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO bom_versions (id, tenant_id, bom_id, version, effective_from, yield_qty)
     VALUES ('d90d90d9-0000-4000-8000-000000000001', $1, 'c90c90c9-0000-4000-8000-000000000001', 1, '2026-11-01', 950),
            ('d90d90d9-0000-4000-8000-000000000002', $2, 'c90c90c9-0000-4000-8000-000000000002', 1, '2026-11-01', 950)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO bom_lines (id, tenant_id, bom_version_id, component_item_id, qty_per_output, scrap_factor_pct)
     VALUES ('e90e90e9-0000-4000-8000-000000000001', $1, 'd90d90d9-0000-4000-8000-000000000001', 'babababa-0000-4000-8000-000000000001', 0.5, 2),
            ('e90e90e9-0000-4000-8000-000000000002', $2, 'd90d90d9-0000-4000-8000-000000000002', 'babababa-0000-4000-8000-000000000002', 0.5, 2)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO production_orders (id, tenant_id, branch_id, order_no, bom_version_id, fg_item_id, materials_warehouse_id, fg_warehouse_id, planned_qty, status)
     VALUES ('a90a90a9-0000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001', 'PRD-2026-00001', 'd90d90d9-0000-4000-8000-000000000001', 'babababa-0000-4000-8000-000000000001', 'f0f0f0f0-1000-4000-8000-000000000001', 'f0f0f0f0-1000-4000-8000-000000000001', 1000, 'RELEASED'),
            ('a90a90a9-0000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002', 'PRD-2026-00001', 'd90d90d9-0000-4000-8000-000000000002', 'babababa-0000-4000-8000-000000000002', 'f0f0f0f0-1000-4000-8000-000000000002', 'f0f0f0f0-1000-4000-8000-000000000002', 1000, 'RELEASED')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO production_consumptions (id, tenant_id, production_order_id, item_id, qty, unit_cost, planned_qty)
     VALUES ('b90b90b9-0000-4000-8000-000000000001', $1, 'a90a90a9-0000-4000-8000-000000000001', 'babababa-0000-4000-8000-000000000001', 500, 2.5, 526.316),
            ('b90b90b9-0000-4000-8000-000000000002', $2, 'a90a90a9-0000-4000-8000-000000000002', 'babababa-0000-4000-8000-000000000002', 500, 2.5, 526.316)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO inspections (id, tenant_id, inspection_no, target_type, target_id, result, disposition)
     VALUES ('c80c80c8-0000-4000-8000-000000000001', $1, 'QC-0001', 'PRODUCTION_ORDER', 'a90a90a9-0000-4000-8000-000000000001', 'PASS', 'ACCEPT'),
            ('c80c80c8-0000-4000-8000-000000000002', $2, 'QC-0001', 'PRODUCTION_ORDER', 'a90a90a9-0000-4000-8000-000000000002', 'PASS', 'ACCEPT')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  // PHASE-019 (migration 0026): crm + projects fixtures.
  await superuser.query(
    `INSERT INTO projects (id, tenant_id, code, name)
     VALUES ('c1c1c1c1-0000-4000-8000-000000000001', $1, 'CASE-001', 'Case A'),
            ('c1c1c1c1-0000-4000-8000-000000000002', $2, 'CASE-001', 'Case B')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO leads (id, tenant_id, branch_id, name, source, status)
     VALUES ('c2c2c2c2-0000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001', 'Lead A', 'WALK_IN', 'NEW'),
            ('c2c2c2c2-0000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002', 'Lead B', 'WEB', 'QUALIFIED')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO tasks (id, tenant_id, title, due_date, status, partner_id)
     VALUES ('c3c3c3c3-0000-4000-8000-000000000001', $1, 'Follow up A', '2026-11-05', 'OPEN', 'b5b5b5b5-0000-4000-8000-000000000001'),
            ('c3c3c3c3-0000-4000-8000-000000000002', $2, 'Follow up B', '2026-11-06', 'OPEN', 'b5b5b5b5-0000-4000-8000-000000000002')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO activities (id, tenant_id, kind, body, partner_id)
     VALUES ('c4c4c4c4-0000-4000-8000-000000000001', $1, 'CALL', 'Called A', 'b5b5b5b5-0000-4000-8000-000000000001'),
            ('c4c4c4c4-0000-4000-8000-000000000002', $2, 'NOTE', 'Noted B', 'b5b5b5b5-0000-4000-8000-000000000002')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO service_contracts (id, tenant_id, branch_id, contract_no, partner_id, project_id, fee_model, status, start_date, end_date)
     VALUES ('c5c5c5c5-0000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001', 'SC-2026-0001', 'b5b5b5b5-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'RETAINER', 'ACTIVE', '2026-01-15', '2026-03-14'),
            ('c5c5c5c5-0000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002', 'SC-2026-0001', 'b5b5b5b5-0000-4000-8000-000000000002', 'c1c1c1c1-0000-4000-8000-000000000002', 'RETAINER', 'ACTIVE', '2026-01-15', '2026-03-14')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO contract_schedule_lines (id, tenant_id, contract_id, description, amount, due_date)
     VALUES ('c6c6c6c6-0000-4000-8000-000000000001', $1, 'c5c5c5c5-0000-4000-8000-000000000001', 'Retainer 2026-01', 1700.0000, '2026-01-31'),
            ('c6c6c6c6-0000-4000-8000-000000000002', $2, 'c5c5c5c5-0000-4000-8000-000000000002', 'Retainer 2026-01', 1700.0000, '2026-01-31')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO service_orders (id, tenant_id, branch_id, order_no, contract_id, partner_id, project_id, status)
     VALUES ('c7c7c7c7-0000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001', 'SO-2026-0001', 'c5c5c5c5-0000-4000-8000-000000000001', 'b5b5b5b5-0000-4000-8000-000000000001', 'c1c1c1c1-0000-4000-8000-000000000001', 'DRAFT'),
            ('c7c7c7c7-0000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002', 'SO-2026-0001', 'c5c5c5c5-0000-4000-8000-000000000002', 'b5b5b5b5-0000-4000-8000-000000000002', 'c1c1c1c1-0000-4000-8000-000000000002', 'DRAFT')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO service_order_lines (id, tenant_id, service_order_id, line_type, description, qty, unit_price)
     VALUES ('c8c8c8c8-0000-4000-8000-000000000001', $1, 'c7c7c7c7-0000-4000-8000-000000000001', 'SERVICE', 'Consulting hour', 8, 250.0000),
            ('c8c8c8c8-0000-4000-8000-000000000002', $2, 'c7c7c7c7-0000-4000-8000-000000000002', 'SERVICE', 'Consulting hour', 8, 250.0000)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO time_entries (id, tenant_id, project_id, fee_item_id, hours, billable, narrative, entry_date)
     VALUES ('c9c9c9c9-0000-4000-8000-000000000001', $1, 'c1c1c1c1-0000-4000-8000-000000000001', 'babababa-0000-4000-8000-000000000001', 8, true, 'Discovery session', '2026-11-02'),
            ('c9c9c9c9-0000-4000-8000-000000000002', $2, 'c1c1c1c1-0000-4000-8000-000000000002', 'babababa-0000-4000-8000-000000000002', 4, true, 'Draft review', '2026-11-02')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  // PHASE-016 (migration 0023): POS terminals + narrow sync slice fixtures.
  await superuser.query(
    `INSERT INTO devices (id, user_id, platform, name, device_key_hash)
     VALUES ('e9e9e9e9-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 'POS_TERMINAL', 'POS A', 'hash-iso-a')
     ON CONFLICT (id) DO NOTHING`,
  );
  await superuser.query(
    `INSERT INTO pos_terminals (id, tenant_id, branch_id, device_id, code, name, cash_account_id, receipt_size_mm, status)
     VALUES
       ('e0e0e0e0-0000-4000-8000-000000000001', $1, 'abababab-0000-4000-8000-000000000001', 'e9e9e9e9-0000-4000-8000-000000000001', 'POS-01', 'Counter A', 'd0d0d0d0-0000-4000-8000-000000000001', 80, 'ACTIVE'),
       ('e0e0e0e0-0000-4000-8000-000000000002', $2, 'abababab-0000-4000-8000-000000000002', NULL, 'POS-01', 'Counter B', 'd0d0d0d0-0000-4000-8000-000000000002', 58, 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  // PHASE-020 (migration 0027): sync foundation fixtures.
  await superuser.query(
    `INSERT INTO tombstones (seq, tenant_id, entity_type, entity_id)
     VALUES (1, $1, 'partners_lite', 'd1d1d1d1-0000-4000-8000-000000000001'),
            (2, $2, 'partners_lite', 'd1d1d1d1-0000-4000-8000-000000000002')
     ON CONFLICT DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO inbox_commands (id, tenant_id, device_id, command_id, intent, idempotency_key, status, result)
     VALUES ('d2d2d2d2-0000-4000-8000-000000000001', $1, 'e9e9e9e9-0000-4000-8000-000000000001', 'd3d3d3d3-0000-4000-8000-000000000001', 'pos_sale', 'iso-key-a', 'ACCEPTED', '{}'),
            ('d2d2d2d2-0000-4000-8000-000000000002', $2, 'e9e9e9e9-0000-4000-8000-000000000001', 'd3d3d3d3-0000-4000-8000-000000000002', 'pos_sale', 'iso-key-b', 'ACCEPTED', '{}')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO change_log (tenant_id, entity_type, entity_id, op, payload)
     VALUES
       ($1, 'pos_terminal', 'e0e0e0e0-0000-4000-8000-000000000001', 'INSERT', '{}'::jsonb),
       ($2, 'pos_terminal', 'e0e0e0e0-0000-4000-8000-000000000002', 'INSERT', '{}'::jsonb)`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO sync_cursors (id, tenant_id, device_id, entity_type, cursor)
     VALUES
       ('e1e1e1e1-0000-4000-8000-000000000001', $1, 'e9e9e9e9-0000-4000-8000-000000000001', 'items', 0),
       ('e1e1e1e1-0000-4000-8000-000000000002', $2, 'e9e9e9e9-0000-4000-8000-000000000001', 'items', 0)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO sync_commands (idempotency_key, tenant_id, device_id, command_type, client_id, status, result)
     VALUES
       ('iso-cmd-a', $1, 'e9e9e9e9-0000-4000-8000-000000000001', 'pos_sale', 'e2e2e2e2-0000-4000-8000-000000000001', 'ACCEPTED', '{}'::jsonb),
       ('iso-cmd-b', $2, NULL, 'pos_sale', 'e2e2e2e2-0000-4000-8000-000000000002', 'REJECTED', '{}'::jsonb)`,
    [TENANT_A, TENANT_B],
  );


  // PHASE-026 fixtures (migration 0028): FK-consistent chain per tenant.
  await superuser.query(
    `INSERT INTO asset_categories (id, tenant_id, code, name, useful_life_months_default, depreciation_method_default)
     VALUES
       ('d4d4d4d4-0000-4000-8000-000000000001', $1, 'MACH', 'Machinery', 60, 'STRAIGHT_LINE'),
       ('d4d4d4d4-0000-4000-8000-000000000002', $2, 'MACH', 'Machinery', 60, 'STRAIGHT_LINE')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO assets (id, tenant_id, code, name, category_id, acquisition_date, cost, salvage_value, useful_life_months, depreciation_method, status)
     VALUES
       ('d5d5d5d5-0000-4000-8000-000000000001', $1, 'A-001', 'Lathe', 'd4d4d4d4-0000-4000-8000-000000000001', '2026-01-01', 12000, 0, 60, 'STRAIGHT_LINE', 'ACTIVE'),
       ('d5d5d5d5-0000-4000-8000-000000000002', $2, 'A-001', 'Lathe', 'd4d4d4d4-0000-4000-8000-000000000002', '2026-01-01', 12000, 0, 60, 'STRAIGHT_LINE', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO depreciation_runs (id, tenant_id, fiscal_period_id, status, total_amount)
     VALUES
       ('d6d6d6d6-0000-4000-8000-000000000001', $1, '00000000-0000-4000-8000-000000000009', 'DRAFT', 200),
       ('d6d6d6d6-0000-4000-8000-000000000002', $2, '00000000-0000-4000-8000-000000000009', 'DRAFT', 200)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO depreciation_lines (id, tenant_id, run_id, asset_id, period_amount, accumulated_amount)
     VALUES
       ('d7d7d7d7-0000-4000-8000-000000000001', $1, 'd6d6d6d6-0000-4000-8000-000000000001', 'd5d5d5d5-0000-4000-8000-000000000001', 200, 200),
       ('d7d7d7d7-0000-4000-8000-000000000002', $2, 'd6d6d6d6-0000-4000-8000-000000000002', 'd5d5d5d5-0000-4000-8000-000000000002', 200, 200)
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO asset_disposals (id, tenant_id, asset_id, disposal_date, kind, proceeds, net_book_value, gain_loss, status)
     VALUES
       ('d8d8d8d8-0000-4000-8000-000000000001', $1, 'd5d5d5d5-0000-4000-8000-000000000001', '2026-11-02', 'SCRAP', 0, 11800, -11800, 'DRAFT'),
       ('d8d8d8d8-0000-4000-8000-000000000002', $2, 'd5d5d5d5-0000-4000-8000-000000000002', '2026-11-02', 'SCRAP', 0, 11800, -11800, 'DRAFT')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO asset_revaluations (id, tenant_id, asset_id, revaluation_date, new_gross_value, new_accumulated, delta, status)
     VALUES
       ('d9d9d9d9-0000-4000-8000-000000000001', $1, 'd5d5d5d5-0000-4000-8000-000000000001', '2026-11-02', 13000, 200, 800, 'DRAFT'),
       ('d9d9d9d9-0000-4000-8000-000000000002', $2, 'd5d5d5d5-0000-4000-8000-000000000002', '2026-11-02', 13000, 200, 800, 'DRAFT')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );


  // PHASE-027 fixtures (migration 0029): FK-consistent rows per tenant.
  await superuser.query(
    `INSERT INTO notes (id, tenant_id, kind, direction, number, partner_id, maturity_date, amount, currency, issue_date, status)
     VALUES
       ('e1e1e1e1-0000-4000-8000-000000000001', $1, 'CHEQUE', 'RECEIVED', 'CH-1', 'b5b5b5b5-0000-4000-8000-000000000001', '2026-12-01', 1000, 'YER', '2026-11-01', 'IN_CUSTODY'),
       ('e1e1e1e1-0000-4000-8000-000000000002', $2, 'CHEQUE', 'RECEIVED', 'CH-1', 'b5b5b5b5-0000-4000-8000-000000000002', '2026-12-01', 1000, 'YER', '2026-11-01', 'IN_CUSTODY')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO note_events (id, tenant_id, note_id, event_kind, event_date)
     VALUES
       ('e2e2e2e2-0000-4000-8000-000000000001', $1, 'e1e1e1e1-0000-4000-8000-000000000001', 'DEPOSIT', '2026-11-02'),
       ('e2e2e2e2-0000-4000-8000-000000000002', $2, 'e1e1e1e1-0000-4000-8000-000000000002', 'DEPOSIT', '2026-11-02')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO installment_plans (id, tenant_id, partner_id, source_type, source_id, total_amount, count, start_date, frequency, status)
     VALUES
       ('e3e3e3e3-0000-4000-8000-000000000001', $1, 'b5b5b5b5-0000-4000-8000-000000000001', 'sales_invoice', 'c0c0c0c0-0000-4000-8000-000000000001', 1000, 4, '2026-11-01', 'MONTHLY', 'ACTIVE'),
       ('e3e3e3e3-0000-4000-8000-000000000002', $2, 'b5b5b5b5-0000-4000-8000-000000000002', 'sales_invoice', 'c0c0c0c0-0000-4000-8000-000000000002', 1000, 4, '2026-11-01', 'MONTHLY', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  await superuser.query(
    `INSERT INTO installment_lines (id, tenant_id, plan_id, seq, due_date, amount, status)
     VALUES
       ('e4e4e4e4-0000-4000-8000-000000000001', $1, 'e3e3e3e3-0000-4000-8000-000000000001', 1, '2026-12-01', 250, 'PENDING'),
       ('e4e4e4e4-0000-4000-8000-000000000002', $2, 'e3e3e3e3-0000-4000-8000-000000000002', 1, '2026-12-01', 250, 'PENDING')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_A, TENANT_B],
  );
  // -- seedFixtures end --

}

/** Where each table's tenant-owned row id lives, per table. */
const OWN_ROW: Record<string, [string, string]> = {
  audit_events: ["eeeeeeee-2000-4000-8000-000000000001", "eeeeeeee-2000-4000-8000-000000000002"],
  memberships: ["ffffffff-0000-4000-8000-000000000001", "ffffffff-0000-4000-8000-000000000002"],
  invitations: ["eeeeeeee-1000-4000-8000-000000000001", "eeeeeeee-1000-4000-8000-000000000002"],
  roles: ["dddddddd-0000-4000-8000-000000000001", "dddddddd-0000-4000-8000-000000000002"],
  role_permissions: [
    "dddddddd-0000-4000-8000-000000000001",
    "dddddddd-0000-4000-8000-000000000002",
  ],
  branches: ["abababab-0000-4000-8000-000000000001", "abababab-0000-4000-8000-000000000002"],
  tenant_settings: ["acacacac-0000-4000-8000-000000000001", "acacacac-0000-4000-8000-000000000002"],
  subscriptions: ["adadadad-0000-4000-8000-000000000001", "adadadad-0000-4000-8000-000000000002"],
  entitlements: ["aeaeaeae-0000-4000-8000-000000000001", "aeaeaeae-0000-4000-8000-000000000002"],
  support_sessions: ["afafafaf-0000-4000-8000-000000000001", "afafafaf-0000-4000-8000-000000000002"],
  accounts: ["b0b0b0b0-0000-4000-8000-000000000001", "b0b0b0b0-0000-4000-8000-000000000002"],
  account_purposes: ["b1b1b1b1-0000-4000-8000-000000000001", "b1b1b1b1-0000-4000-8000-000000000002"],
  uoms: ["b2b2b2b2-0000-4000-8000-000000000001", "b2b2b2b2-0000-4000-8000-000000000002"],
  credit_terms: ["b3b3b3b3-0000-4000-8000-000000000001", "b3b3b3b3-0000-4000-8000-000000000002"],
  price_lists: ["b4b4b4b4-0000-4000-8000-000000000001", "b4b4b4b4-0000-4000-8000-000000000002"],
  partners: ["b5b5b5b5-0000-4000-8000-000000000001", "b5b5b5b5-0000-4000-8000-000000000002"],
  partner_contacts: ["b6b6b6b6-0000-4000-8000-000000000001", "b6b6b6b6-0000-4000-8000-000000000002"],
  partner_addresses: ["b7b7b7b7-0000-4000-8000-000000000001", "b7b7b7b7-0000-4000-8000-000000000002"],
  item_categories: ["b8b8b8b8-0000-4000-8000-000000000001", "b8b8b8b8-0000-4000-8000-000000000002"],
  uom_conversions: ["b9b9b9b9-0000-4000-8000-000000000001", "b9b9b9b9-0000-4000-8000-000000000002"],
  items: ["babababa-0000-4000-8000-000000000001", "babababa-0000-4000-8000-000000000002"],
  barcodes: ["bbbbbbbb-0000-4000-8000-000000000001", "bbbbbbbb-0000-4000-8000-000000000002"],
  price_list_items: ["bcbcbcbc-0000-4000-8000-000000000001", "bcbcbcbc-0000-4000-8000-000000000002"],
  partner_balances: ["bdbdbdbd-0000-4000-8000-000000000001", "bdbdbdbd-0000-4000-8000-000000000002"],
  opening_balance_docs: ["bebebebe-0000-4000-8000-000000000001", "bebebebe-0000-4000-8000-000000000002"],
  file_objects: ["bfbfbfbf-0000-4000-8000-000000000001", "bfbfbfbf-0000-4000-8000-000000000002"],
  import_jobs: ["c0c0c0c0-0000-4000-8000-000000000001", "c0c0c0c0-0000-4000-8000-000000000002"],
  fiscal_years: ["b5b5b5b5-0000-4000-8000-000000000001", "b5b5b5b5-0000-4000-8000-000000000002"],
  fiscal_periods: ["c2c2c2c2-0000-4000-8000-000000000001", "c2c2c2c2-0000-4000-8000-000000000002"],
  exchange_rates: ["c3c3c3c3-0000-4000-8000-000000000001", "c3c3c3c3-0000-4000-8000-000000000002"],
  cost_centers: ["c4c4c4c4-0000-4000-8000-000000000001", "c4c4c4c4-0000-4000-8000-000000000002"],
  recurring_journals: ["c5c5c5c5-0000-4000-8000-000000000001", "c5c5c5c5-0000-4000-8000-000000000002"],
  approval_policies: ["c6c6c6c6-0000-4000-8000-000000000001", "c6c6c6c6-0000-4000-8000-000000000002"],
  numbering_sequences: ["c7c7c7c7-0000-4000-8000-000000000001", "c7c7c7c7-0000-4000-8000-000000000002"],
  number_assignments: ["c8c8c8c8-0000-4000-8000-000000000001", "c8c8c8c8-0000-4000-8000-000000000002"],
  manual_journals: ["c9c9c9c9-0000-4000-8000-000000000001", "c9c9c9c9-0000-4000-8000-000000000002"],
  manual_journal_lines: ["cacacaca-0000-4000-8000-000000000001", "cacacaca-0000-4000-8000-000000000002"],
  journal_templates: ["cbcbcbcb-0000-4000-8000-000000000001", "cbcbcbcb-0000-4000-8000-000000000002"],
  journal_entries: ["cccccccc-0000-4000-8000-000000000001", "cccccccc-0000-4000-8000-000000000002"],
  journal_lines: ["cdcdcdcd-0000-4000-8000-000000000001", "cdcdcdcd-0000-4000-8000-000000000002"],
  partner_subledger_entries: [
    "cececece-0000-4000-8000-000000000001",
    "cececece-0000-4000-8000-000000000002",
  ],
  reconciliation_runs: ["cfcfcfcf-0000-4000-8000-000000000001", "cfcfcfcf-0000-4000-8000-000000000002"],
  // PHASE-008 treasury cluster: [own-A row, own-B row] per table (the B row
  // doubles as the A4/A7 foreign probe target).
  cash_accounts: [
    "d0d0d0d0-0000-4000-8000-000000000001",
    "d0d0d0d0-0000-4000-8000-000000000002",
  ],
  cash_movements: ["d2d2d2d2-0000-4000-8000-000000000001", "d2d2d2d2-0000-4000-8000-000000000002"],
  receipts: ["d3d3d3d3-0000-4000-8000-000000000001", "d3d3d3d3-0000-4000-8000-000000000002"],
  payments: ["d4d4d4d4-0000-4000-8000-000000000001", "d4d4d4d4-0000-4000-8000-000000000002"],
  treasury_allocations: ["d5d5d5d5-0000-4000-8000-000000000001", "d5d5d5d5-0000-4000-8000-000000000002"],
  expense_categories: ["d6d6d6d6-0000-4000-8000-000000000001", "d6d6d6d6-0000-4000-8000-000000000002"],
  expenses: ["d7d7d7d7-0000-4000-8000-000000000001", "d7d7d7d7-0000-4000-8000-000000000002"],
  cash_transfers: ["d8d8d8d8-0000-4000-8000-000000000001", "d8d8d8d8-0000-4000-8000-000000000002"],
  cashier_shifts: ["d9d9d9d9-0000-4000-8000-000000000001", "d9d9d9d9-0000-4000-8000-000000000002"],
  bank_statements: ["dadadada-0000-4000-8000-000000000001", "dadadada-0000-4000-8000-000000000002"],
  bank_statement_lines: ["dbdbdbdb-0000-4000-8000-000000000001", "dbdbdbdb-0000-4000-8000-000000000002"],
  // PHASE-009 tax cluster (migration 0013).
  tax_codes: ["e0e0e0e0-0000-4000-8000-000000000001", "e0e0e0e0-0000-4000-8000-000000000002"],
  tax_registrations: ["e1e1e1e1-0000-4000-8000-000000000001", "e1e1e1e1-0000-4000-8000-000000000002"],
  tax_pack_bindings: ["e2e2e2e2-0000-4000-8000-000000000001", "e2e2e2e2-0000-4000-8000-000000000002"],
  tax_document_summaries: [
    "e3e3e3e3-0000-4000-8000-000000000001",
    "e3e3e3e3-0000-4000-8000-000000000002",
  ],
  vat_returns: ["e4e4e4e4-0000-4000-8000-000000000001", "e4e4e4e4-0000-4000-8000-000000000002"],
  e_invoicing_submissions: [
    "e5e5e5e5-0000-4000-8000-000000000001",
    "e5e5e5e5-0000-4000-8000-000000000002",
  ],
  // PHASE-010 inventory cluster (migrations 0014/0015): warehouses lists
  // the [WH1-A, WH1-B] pair (the transfer fixture's from side); the second
  // warehouses (WH2) exist only for the transfer fixture's to side.
  warehouses: [
    "f0f0f0f0-1000-4000-8000-000000000001",
    "f0f0f0f0-1000-4000-8000-000000000002",
  ],
  item_warehouse_settings: [
    "f1f1f1f1-0000-4000-8000-000000000001",
    "f1f1f1f1-0000-4000-8000-000000000002",
  ],
  stock_moves: ["f4f4f4f4-0000-4000-8000-000000000001", "f4f4f4f4-0000-4000-8000-000000000002"],
  stock_layers: ["f5f5f5f5-0000-4000-8000-000000000001", "f5f5f5f5-0000-4000-8000-000000000002"],
  item_stock: ["f6f6f6f6-0000-4000-8000-000000000001", "f6f6f6f6-0000-4000-8000-000000000002"],
  stock_transfers: [
    "f7f7f7f7-0000-4000-8000-000000000001",
    "f7f7f7f7-0000-4000-8000-000000000002",
  ],
  stock_transfer_lines: [
    "f8f8f8f8-0000-4000-8000-000000000001",
    "f8f8f8f8-0000-4000-8000-000000000002",
  ],
  stock_adjustments: [
    "f9f9f9f9-0000-4000-8000-000000000001",
    "f9f9f9f9-0000-4000-8000-000000000002",
  ],
  stock_reservations: [
    "fafafafa-0000-4000-8000-000000000001",
    "fafafafa-0000-4000-8000-000000000002",
  ],
  item_batches: ["f2f2f2f2-0000-4000-8000-000000000001", "f2f2f2f2-0000-4000-8000-000000000002"],
  item_serials: ["f3f3f3f3-0000-4000-8000-000000000001", "f3f3f3f3-0000-4000-8000-000000000002"],
  stock_counts: ["fbfbfbfb-0000-4000-8000-000000000001", "fbfbfbfb-0000-4000-8000-000000000002"],
  stock_count_lines: [
    "fcfcfcfc-0000-4000-8000-000000000001",
    "fcfcfcfc-0000-4000-8000-000000000002",
  ],
  // PHASE-011 purchasing cluster (migrations 0016/0017): one FK-consistent
  // DRAFT row per registered table per tenant (the B row doubles as the
  // A4/A7 foreign probe target).
  purchase_requests: ["5a5a5a5a-0000-4000-8000-000000000001", "5a5a5a5a-0000-4000-8000-000000000002"],
  purchase_request_lines: ["5b5b5b5b-0000-4000-8000-000000000001", "5b5b5b5b-0000-4000-8000-000000000002"],
  purchase_orders: ["5c5c5c5c-0000-4000-8000-000000000001", "5c5c5c5c-0000-4000-8000-000000000002"],
  purchase_order_lines: ["5d5d5d5d-0000-4000-8000-000000000001", "5d5d5d5d-0000-4000-8000-000000000002"],
  goods_receipts: ["5e5e5e5e-0000-4000-8000-000000000001", "5e5e5e5e-0000-4000-8000-000000000002"],
  goods_receipt_lines: ["5f5f5f5f-0000-4000-8000-000000000001", "5f5f5f5f-0000-4000-8000-000000000002"],
  supplier_invoices: ["60606060-0000-4000-8000-000000000001", "60606060-0000-4000-8000-000000000002"],
  supplier_invoice_lines: ["61616161-0000-4000-8000-000000000001", "61616161-0000-4000-8000-000000000002"],
  debit_notes: ["62626262-0000-4000-8000-000000000001", "62626262-0000-4000-8000-000000000002"],
  debit_note_lines: ["63636363-0000-4000-8000-000000000001", "63636363-0000-4000-8000-000000000002"],
  landed_costs: ["64646464-0000-4000-8000-000000000001", "64646464-0000-4000-8000-000000000002"],
  landed_cost_allocations: ["65656565-0000-4000-8000-000000000001", "65656565-0000-4000-8000-000000000002"],
  purchase_reallocations: ["66666666-0000-4000-8000-000000000001", "66666666-0000-4000-8000-000000000002"],
  purchase_reallocation_lines: ["67676767-0000-4000-8000-000000000001", "67676767-0000-4000-8000-000000000002"],
  // PHASE-012 sales cluster (migrations 0018/0019): one FK-consistent
  // row per registered table per tenant (the B row doubles as the A4/A7
  // foreign probe target).
  sales_reps: ["70707070-0000-4000-8000-000000000001", "70707070-0000-4000-8000-000000000002"],
  quotations: ["71717171-0000-4000-8000-000000000001", "71717171-0000-4000-8000-000000000002"],
  quotation_lines: ["72727272-0000-4000-8000-000000000001", "72727272-0000-4000-8000-000000000002"],
  sales_orders: ["73737373-0000-4000-8000-000000000001", "73737373-0000-4000-8000-000000000002"],
  sales_order_lines: ["74747474-0000-4000-8000-000000000001", "74747474-0000-4000-8000-000000000002"],
  delivery_notes: ["75757575-0000-4000-8000-000000000001", "75757575-0000-4000-8000-000000000002"],
  delivery_note_lines: ["76767676-0000-4000-8000-000000000001", "76767676-0000-4000-8000-000000000002"],
  sales_invoices: ["77777777-0000-4000-8000-000000000001", "77777777-0000-4000-8000-000000000002"],
  sales_invoice_lines: ["78787878-0000-4000-8000-000000000001", "78787878-0000-4000-8000-000000000002"],
  credit_notes: ["79797979-0000-4000-8000-000000000001", "79797979-0000-4000-8000-000000000002"],
  credit_note_lines: ["7a7a7a7a-0000-4000-8000-000000000001", "7a7a7a7a-0000-4000-8000-000000000002"],
  sales_reallocations: ["7b7b7b7b-0000-4000-8000-000000000001", "7b7b7b7b-0000-4000-8000-000000000002"],
  sales_reallocation_lines: ["7c7c7c7c-0000-4000-8000-000000000001", "7c7c7c7c-0000-4000-8000-000000000002"],
  // PHASE-013 reporting cluster (migration 0020): one orchestration row +
  // one template registry row per tenant.
  report_runs: ["7d7d7d7d-0000-4000-8000-000000000001", "7d7d7d7d-0000-4000-8000-000000000002"],
  print_templates: ["7e7e7e7e-0000-4000-8000-000000000001", "7e7e7e7e-0000-4000-8000-000000000002"],
  subscription_invoices: ["d5d5d5d5-0000-4000-8000-000000000001", "d5d5d5d5-0000-4000-8000-000000000002"],
  billing_events: ["d6d6d6d6-0000-4000-8000-000000000001", "d6d6d6d6-0000-4000-8000-000000000002"],
  usage_counters: ["d7d7d7d7-0000-4000-8000-000000000001", "d7d7d7d7-0000-4000-8000-000000000002"],
  notifications: ["d8d8d8d8-0000-4000-8000-000000000001", "d8d8d8d8-0000-4000-8000-000000000002"],
  notification_preferences: ["d9d9d9d9-0000-4000-8000-000000000001", "d9d9d9d9-0000-4000-8000-000000000002"],
  // PK is tenant_id itself (migration 0022).
  tenant_industry_config: [TENANT_A, TENANT_B],
  // PHASE-016: pos_terminals keyed by id; change_log by entity_id (PK = tenant_id+seq);
  // sync_cursors by id; sync_commands by idempotency_key (PK = tenant_id+key).
  pos_terminals: ["e0e0e0e0-0000-4000-8000-000000000001", "e0e0e0e0-0000-4000-8000-000000000002"],
  change_log: ["e0e0e0e0-0000-4000-8000-000000000001", "e0e0e0e0-0000-4000-8000-000000000002"],
  sync_cursors: ["e1e1e1e1-0000-4000-8000-000000000001", "e1e1e1e1-0000-4000-8000-000000000002"],
  sync_commands: ["iso-cmd-a", "iso-cmd-b"],
  // PHASE-017 (migration 0024): keyed by id; van_stocks by warehouse_id (PK = tenant+warehouse+item).
  vehicles: ["a10a10a1-0000-4000-8000-000000000001", "a10a10a1-0000-4000-8000-000000000002"],
  job_cards: ["b20b20b2-0000-4000-8000-000000000001", "b20b20b2-0000-4000-8000-000000000002"],
  job_card_lines: ["c30c30c3-0000-4000-8000-000000000001", "c30c30c3-0000-4000-8000-000000000002"],
  routes: ["d40d40d4-0000-4000-8000-000000000001", "d40d40d4-0000-4000-8000-000000000002"],
  route_visits: ["e50e50e5-0000-4000-8000-000000000001", "e50e50e5-0000-4000-8000-000000000002"],
  rep_settlements: ["f60f60f6-0000-4000-8000-000000000001", "f60f60f6-0000-4000-8000-000000000002"],
  van_stocks: ["f0f0f0f0-1000-4000-8000-000000000001", "f0f0f0f0-1000-4000-8000-000000000002"],
  commission_rules: ["a70a70a7-0000-4000-8000-000000000001", "a70a70a7-0000-4000-8000-000000000002"],
  commission_runs: ["b80b80b8-0000-4000-8000-000000000001", "b80b80b8-0000-4000-8000-000000000002"],
  bills_of_materials: ["c90c90c9-0000-4000-8000-000000000001", "c90c90c9-0000-4000-8000-000000000002"],
  bom_versions: ["d90d90d9-0000-4000-8000-000000000001", "d90d90d9-0000-4000-8000-000000000002"],
  bom_lines: ["e90e90e9-0000-4000-8000-000000000001", "e90e90e9-0000-4000-8000-000000000002"],
  production_orders: ["a90a90a9-0000-4000-8000-000000000001", "a90a90a9-0000-4000-8000-000000000002"],
  production_consumptions: ["b90b90b9-0000-4000-8000-000000000001", "b90b90b9-0000-4000-8000-000000000002"],
  inspections: ["c80c80c8-0000-4000-8000-000000000001", "c80c80c8-0000-4000-8000-000000000002"],
  projects: ["c1c1c1c1-0000-4000-8000-000000000001", "c1c1c1c1-0000-4000-8000-000000000002"],
  leads: ["c2c2c2c2-0000-4000-8000-000000000001", "c2c2c2c2-0000-4000-8000-000000000002"],
  tasks: ["c3c3c3c3-0000-4000-8000-000000000001", "c3c3c3c3-0000-4000-8000-000000000002"],
  activities: ["c4c4c4c4-0000-4000-8000-000000000001", "c4c4c4c4-0000-4000-8000-000000000002"],
  service_contracts: ["c5c5c5c5-0000-4000-8000-000000000001", "c5c5c5c5-0000-4000-8000-000000000002"],
  contract_schedule_lines: ["c6c6c6c6-0000-4000-8000-000000000001", "c6c6c6c6-0000-4000-8000-000000000002"],
  service_orders: ["c7c7c7c7-0000-4000-8000-000000000001", "c7c7c7c7-0000-4000-8000-000000000002"],
  service_order_lines: ["c8c8c8c8-0000-4000-8000-000000000001", "c8c8c8c8-0000-4000-8000-000000000002"],
  time_entries: ["c9c9c9c9-0000-4000-8000-000000000001", "c9c9c9c9-0000-4000-8000-000000000002"],
  tombstones: ["d1d1d1d1-0000-4000-8000-000000000001", "d1d1d1d1-0000-4000-8000-000000000002"],
  inbox_commands: ["d2d2d2d2-0000-4000-8000-000000000001", "d2d2d2d2-0000-4000-8000-000000000002"],

  asset_categories: ["d4d4d4d4-0000-4000-8000-000000000001", "d4d4d4d4-0000-4000-8000-000000000002"],
  assets: ["d5d5d5d5-0000-4000-8000-000000000001", "d5d5d5d5-0000-4000-8000-000000000002"],
  depreciation_runs: ["d6d6d6d6-0000-4000-8000-000000000001", "d6d6d6d6-0000-4000-8000-000000000002"],
  depreciation_lines: ["d7d7d7d7-0000-4000-8000-000000000001", "d7d7d7d7-0000-4000-8000-000000000002"],
  asset_disposals: ["d8d8d8d8-0000-4000-8000-000000000001", "d8d8d8d8-0000-4000-8000-000000000002"],
  asset_revaluations: ["d9d9d9d9-0000-4000-8000-000000000001", "d9d9d9d9-0000-4000-8000-000000000002"],

  notes: ["e1e1e1e1-0000-4000-8000-000000000001", "e1e1e1e1-0000-4000-8000-000000000002"],
  note_events: ["e2e2e2e2-0000-4000-8000-000000000001", "e2e2e2e2-0000-4000-8000-000000000002"],
  installment_plans: ["e3e3e3e3-0000-4000-8000-000000000001", "e3e3e3e3-0000-4000-8000-000000000002"],
  installment_lines: ["e4e4e4e4-0000-4000-8000-000000000001", "e4e4e4e4-0000-4000-8000-000000000002"],
};


/** Mismatched-tenant INSERT shapes per table (A3) — explicit columns so the
 * attack isolates the RLS WITH CHECK, never an incidental PK conflict.
 * Single parameter $1 = the FOREIGN tenant id, applied under the caller's
 * own GUC. */
const MISMATCHED_INSERT: Record<string, string> = {
  audit_events: `INSERT INTO audit_events (id, tenant_id, action, entity_type, entity_id)
     VALUES ('eeeeeeee-3000-4000-8000-000000000003', $1, 'iso.attack', 'iso_fixture', $1)`,
  memberships: `INSERT INTO memberships (id, tenant_id, user_id, role_id)
     VALUES ('ffffffff-3000-4000-8000-000000000003', $1,
             'eeeeeeee-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000002')`,
  invitations: `INSERT INTO invitations (id, tenant_id, email, role_id, token_hash, expires_at, invited_by)
     VALUES ('eeeeeeee-4000-4000-8000-000000000003', $1, 'iso-attack@test',
             'dddddddd-0000-4000-8000-000000000002', 'iso-attack-token', now() + interval '72 hours',
             'eeeeeeee-0000-4000-8000-000000000002')`,
  roles: `INSERT INTO roles (id, tenant_id, key, name)
     VALUES ('dddddddd-3000-4000-8000-000000000003', $1, 'attack_role', 'Attack Role')`,
  role_permissions: `INSERT INTO role_permissions (role_id, tenant_id, permission_id)
     VALUES ('dddddddd-0000-4000-8000-000000000002', $1, 'partners.view')`,
  branches: `INSERT INTO branches (id, tenant_id, code, name)
     VALUES ('abababab-3000-4000-8000-000000000003', $1, 'ATK', 'Attack Branch')`,
  tenant_settings: `INSERT INTO tenant_settings (id, tenant_id, key, value)
     VALUES ('acacacac-3000-4000-8000-000000000003', $1, 'sales.credit_limit_action', '"warn"'::jsonb)`,
  subscriptions: `INSERT INTO subscriptions (id, tenant_id, plan_id, period_start, period_end)
     VALUES ('adadadad-3000-4000-8000-000000000003', $1,
             '30000000-0000-4000-8000-000000000002', '2026-01-01', '2026-12-31')`,
  entitlements: `INSERT INTO entitlements (id, tenant_id, feature_key, source)
     VALUES ('aeaeaeae-3000-4000-8000-000000000003', $1, 'pos.sales', 'MANUAL')`,
  support_sessions: `INSERT INTO support_sessions (id, tenant_id, platform_user_id, opt_in, ticket_ref, reason, expires_at)
     VALUES ('afafafaf-3000-4000-8000-000000000003', $1,
             'eeeeeeee-0000-4000-8000-000000000001', false, 'ISO-ATK', 'attack fixture',
             now() + interval '4 hours')`,
  accounts: `INSERT INTO accounts (id, tenant_id, code, name, name_ar, type, is_postable)
     VALUES ('b0b0b0b0-3000-4000-8000-000000000003', $1, '2000', 'Attack Account', 'حساب هجوم', 'ASSET', false)`,
  account_purposes: `INSERT INTO account_purposes (id, tenant_id, purpose_key, account_id, active_from)
     VALUES ('b1b1b1b1-3000-4000-8000-000000000003', $1, 'AP_CONTROL',
             'b0b0b0b0-0000-4000-8000-000000000002', '2026-01-01')`,
  uoms: `INSERT INTO uoms (id, tenant_id, code, name)
     VALUES ('b2b2b2b2-3000-4000-8000-000000000003', $1, 'ATK-U', 'Attack Unit')`,
  credit_terms: `INSERT INTO credit_terms (id, tenant_id, code, name, days)
     VALUES ('b3b3b3b3-3000-4000-8000-000000000003', $1, 'ATK-NET', 'Attack Terms', 90)`,
  price_lists: `INSERT INTO price_lists (id, tenant_id, name, kind, currency_code)
     VALUES ('b4b4b4b4-3000-4000-8000-000000000003', $1, 'Attack List', 'SALE', 'SAR')`,
  partners: `INSERT INTO partners (id, tenant_id, kind, code, name)
     VALUES ('b5b5b5b5-3000-4000-8000-000000000003', $1, 'CUSTOMER', 'ATK-P', 'Attack Partner')`,
  partner_contacts: `INSERT INTO partner_contacts (id, tenant_id, partner_id, name)
     VALUES ('b6b6b6b6-3000-4000-8000-000000000003', $1,
             'b5b5b5b5-0000-4000-8000-000000000002', 'Attack Contact')`,
  partner_addresses: `INSERT INTO partner_addresses (id, tenant_id, partner_id, type, line1)
     VALUES ('b7b7b7b7-3000-4000-8000-000000000003', $1,
             'b5b5b5b5-0000-4000-8000-000000000002', 'SHIPPING', 'Attack Line')`,
  item_categories: `INSERT INTO item_categories (id, tenant_id, code, name)
     VALUES ('b8b8b8b8-3000-4000-8000-000000000003', $1, 'ATK-CAT', 'Attack Category')`,
  uom_conversions: `INSERT INTO uom_conversions (id, tenant_id, from_uom_id, to_uom_id, factor)
     VALUES ('b9b9b9b9-3000-4000-8000-000000000003', $1,
             'b2b2b2b2-0000-4000-8000-000000000002', 'b2b2b2b2-1000-4000-8000-000000000002', 999)`,
  items: `INSERT INTO items (id, tenant_id, sku, name, kind, uom_id)
     VALUES ('babababa-3000-4000-8000-000000000003', $1, 'ATK-ITEM', 'Attack Item', 'STOCK',
             'b2b2b2b2-0000-4000-8000-000000000002')`,
  barcodes: `INSERT INTO barcodes (id, tenant_id, item_id, uom_id, code)
     VALUES ('bbbbbbbb-3000-4000-8000-000000000003', $1,
             'babababa-0000-4000-8000-000000000002', 'b2b2b2b2-0000-4000-8000-000000000002', '9999999999999')`,
  price_list_items: `INSERT INTO price_list_items (id, tenant_id, price_list_id, item_id, uom_id, unit_price, min_qty)
     VALUES ('bcbcbcbc-3000-4000-8000-000000000003', $1,
             'b4b4b4b4-0000-4000-8000-000000000002', 'babababa-0000-4000-8000-000000000002',
             'b2b2b2b2-0000-4000-8000-000000000002', 42, 99)`,
  partner_balances: `INSERT INTO partner_balances (id, tenant_id, partner_id, draft_balance)
     VALUES ('bdbdbdbd-3000-4000-8000-000000000003', $1,
             'b5b5b5b5-0000-4000-8000-000000000002', 777)`,
  opening_balance_docs: `INSERT INTO opening_balance_docs (id, tenant_id, kind, account_id, amount, currency_code)
     VALUES ('bebebebe-3000-4000-8000-000000000003', $1, 'ACCOUNT',
             'b0b0b0b0-0000-4000-8000-000000000002', 100, 'SAR')`,
  file_objects: `INSERT INTO file_objects (id, tenant_id, owner_type, owner_id, storage_key, name, size_bytes, content_type)
     VALUES ('bfbfbfbf-3000-4000-8000-000000000003', $1, 'PARTNER',
             'b5b5b5b5-0000-4000-8000-000000000002', 'iso/attack.pdf', 'attack.pdf', 10, 'application/pdf')`,
  import_jobs: `INSERT INTO import_jobs (id, tenant_id, kind, format, upload_token, file_key)
     VALUES ('c0c0c0c0-3000-4000-8000-000000000003', $1, 'ITEMS', 'CSV', 'iso-attack-token',
             'iso/attack.csv')`,
  fiscal_years: `INSERT INTO fiscal_years (id, tenant_id, name, start_date, end_date)
     VALUES ('c1c1c1c1-3000-4000-8000-000000000003', $1, 'ATK', '2027-01-01', '2027-12-31')`,
  fiscal_periods: `INSERT INTO fiscal_periods (id, tenant_id, fiscal_year_id, name, kind, start_date, end_date)
     VALUES ('c2c2c2c2-3000-4000-8000-000000000003', $1, 'b5b5b5b5-0000-4000-8000-000000000002',
             '2027-01', 'REGULAR', '2027-01-01', '2027-01-31')`,
  exchange_rates: `INSERT INTO exchange_rates (id, tenant_id, currency_code, rate_date, rate)
     VALUES ('c3c3c3c3-3000-4000-8000-000000000003', $1, 'EUR', '2026-02-01', 4.05)`,
  cost_centers: `INSERT INTO cost_centers (id, tenant_id, code, name)
     VALUES ('c4c4c4c4-3000-4000-8000-000000000003', $1, 'ATK', 'Attack Center')`,
  recurring_journals: `INSERT INTO recurring_journals (id, tenant_id, name, template, schedule, start_date, next_run_date)
     VALUES ('c5c5c5c5-3000-4000-8000-000000000003', $1, 'ATK', '{"lines": []}'::jsonb,
             'MONTHLY', '2026-02-01', '2026-03-01')`,
  approval_policies: `INSERT INTO approval_policies (id, tenant_id, doc_type, policy, applies_from)
     VALUES ('c6c6c6c6-3000-4000-8000-000000000003', $1, 'journal_entry',
             '{"mode": "none"}'::jsonb, '2026-02-01')`,
  numbering_sequences: `INSERT INTO numbering_sequences (id, tenant_id, doc_type, period_key, next_value)
     VALUES ('c7c7c7c7-3000-4000-8000-000000000003', $1, 'journal_entry', '2027', 1)`,
  number_assignments: `INSERT INTO number_assignments (id, tenant_id, doc_type, period_key, number, value)
     VALUES ('c8c8c8c8-3000-4000-8000-000000000003', $1, 'journal_entry', '2027', 'JE-2027-000001', 1)`,
  manual_journals: `INSERT INTO manual_journals (id, tenant_id, status, entry_date, currency_code)
     VALUES ('c9c9c9c9-3000-4000-8000-000000000003', $1, 'DRAFT', '2026-02-05', 'SAR')`,
  manual_journal_lines: `INSERT INTO manual_journal_lines (id, tenant_id, manual_journal_id, line_no, account_id, direction, amount)
     VALUES ('cacacaca-3000-4000-8000-000000000003', $1, 'c9c9c9c9-0000-4000-8000-000000000002',
             1, 'b0b0b0b0-0000-4000-8000-000000000002', 'DEBIT', 10)`,
  journal_templates: `INSERT INTO journal_templates (id, tenant_id, name, lines)
     VALUES ('cbcbcbcb-3000-4000-8000-000000000003', $1, 'ATK template', '[{"direction": "DEBIT"}]'::jsonb)`,
  journal_entries: `INSERT INTO journal_entries (id, tenant_id, entry_date, fiscal_period_id, currency_code, source_type, operation)
     VALUES ('cccccccc-3000-4000-8000-000000000003', $1, '2026-02-05',
             'c2c2c2c2-0000-4000-8000-000000000002', 'SAR', 'iso_attack', 'post')`,
  journal_lines: `INSERT INTO journal_lines (id, tenant_id, journal_entry_id, line_no, account_id, direction, amount, base_amount)
     VALUES ('cdcdcdcd-3000-4000-8000-000000000003', $1, 'cccccccc-0000-4000-8000-000000000002',
             3, 'b0b0b0b0-0000-4000-8000-000000000002', 'DEBIT', 10, 10)`,
  partner_subledger_entries: `INSERT INTO partner_subledger_entries (id, tenant_id, partner_id, journal_entry_id,
                                            journal_line_id, entry_date, direction, amount, base_amount, currency_code, source_type)
     VALUES ('cececece-3000-4000-8000-000000000003', $1, 'b5b5b5b5-0000-4000-8000-000000000002',
             'cccccccc-0000-4000-8000-000000000002', 'cdcdcdcd-0000-4000-8000-000000000002',
             '2026-01-20', 'DEBIT', 10, 10, 'SAR', 'iso_attack')`,
  reconciliation_runs: `INSERT INTO reconciliation_runs (id, tenant_id, kind, as_of, status, control_balance, subledger_balance)
     VALUES ('cfcfcfcf-3000-4000-8000-000000000003', $1, 'AP', '2026-02-28', 'OK', 0, 0)`,
  cash_accounts: `INSERT INTO cash_accounts (id, tenant_id, name, type, account_id, currency_code)
     VALUES ('d0d0d0d0-3000-4000-8000-000000000003', $1, 'Attack Cash', 'CASH',
             'b0b0b0b0-0000-4000-8000-000000000002', 'SAR')`,
  cash_movements: `INSERT INTO cash_movements (id, tenant_id, cash_account_id, direction, amount, currency_code, exchange_rate, base_amount, source_type, source_id, value_date)
     VALUES ('d2d2d2d2-3000-4000-8000-000000000003', $1, 'd0d0d0d0-0000-4000-8000-000000000002', 'OUT',
             10, 'SAR', 1, 10, 'expense', 'd0d0d0d0-0000-4000-8000-000000000002', '2027-02-01')`,
  receipts: `INSERT INTO receipts (id, tenant_id, status, cash_account_id, partner_id, method, currency_code, amount, value_date)
     VALUES ('d3d3d3d3-3000-4000-8000-000000000003', $1, 'DRAFT', 'd0d0d0d0-0000-4000-8000-000000000002',
             'b5b5b5b5-0000-4000-8000-000000000002', 'CASH', 'SAR', 10, '2027-02-01')`,
  payments: `INSERT INTO payments (id, tenant_id, status, cash_account_id, partner_id, method, currency_code, amount, value_date)
     VALUES ('d4d4d4d4-3000-4000-8000-000000000003', $1, 'DRAFT', 'd0d0d0d0-0000-4000-8000-000000000002',
             'b5b5b5b5-0000-4000-8000-000000000002', 'CASH', 'SAR', 10, '2027-02-01')`,
  treasury_allocations: `INSERT INTO treasury_allocations (id, tenant_id, receipt_id, open_item_id, amount)
     VALUES ('d5d5d5d5-3000-4000-8000-000000000003', $1, 'd3d3d3d3-0000-4000-8000-000000000002',
             'cececece-0000-4000-8000-000000000002', 5)`,
  expense_categories: `INSERT INTO expense_categories (id, tenant_id, code, name, name_ar, account_id)
     VALUES ('d6d6d6d6-3000-4000-8000-000000000003', $1, 'ATK', 'Attack', 'هجوم',
             'b0b0b0b0-0000-4000-8000-000000000002')`,
  expenses: `INSERT INTO expenses (id, tenant_id, status, category_id, cash_account_id, payee_name, currency_code, amount, value_date)
     VALUES ('d7d7d7d7-3000-4000-8000-000000000003', $1, 'DRAFT', 'd6d6d6d6-0000-4000-8000-000000000002',
             'd0d0d0d0-0000-4000-8000-000000000002', 'Attack Payee', 'SAR', 10, '2027-02-01')`,
  cash_transfers: `INSERT INTO cash_transfers (id, tenant_id, status, from_account_id, to_account_id, currency_code, amount, fee_amount, value_date)
     VALUES ('d8d8d8d8-3000-4000-8000-000000000003', $1, 'DRAFT', 'd0d0d0d0-0000-4000-8000-000000000002',
             'd1d1d1d1-0000-4000-8000-000000000002', 'SAR', 10, 0, '2027-02-01')`,
  cashier_shifts: `INSERT INTO cashier_shifts (id, tenant_id, status, cash_account_id, currency_code, opening_amount)
     VALUES ('d9d9d9d9-3000-4000-8000-000000000003', $1, 'OPEN', 'd0d0d0d0-0000-4000-8000-000000000002',
             'SAR', 10)`,
  bank_statements: `INSERT INTO bank_statements (id, tenant_id, status, cash_account_id, period_start, period_end, file_name, file_hash, adapter_id)
     VALUES ('dadadada-3000-4000-8000-000000000003', $1, 'IMPORTED', 'd1d1d1d1-0000-4000-8000-000000000002',
             '2027-02-01', '2027-02-28', 'attack.csv', repeat('c', 64), 'generic-csv')`,
  bank_statement_lines: `INSERT INTO bank_statement_lines (id, tenant_id, bank_statement_id, line_no, line_date, amount)
     VALUES ('dbdbdbdb-3000-4000-8000-000000000003', $1, 'dadadada-0000-4000-8000-000000000002',
             2, '2027-02-05', 25)`,
  // PHASE-009 tax cluster (migration 0013) — FK targets are the FOREIGN
  // tenant's own rows so the RLS WITH CHECK is the isolated rejection.
  tax_codes: `INSERT INTO tax_codes (id, tenant_id, code, name, country_code, default_treatment)
     VALUES ('e0e0e0e0-3000-4000-8000-000000000003', $1, 'ATK-INS', 'Attack Insert', 'SA', 'STANDARD_RATED')`,
  tax_registrations: `INSERT INTO tax_registrations (id, tenant_id, country_code, status, registration_number, effective_from)
     VALUES ('e1e1e1e1-3000-4000-8000-000000000003', $1, 'SA', 'REGISTERED', '300000000000009', '2026-01-01')`,
  tax_pack_bindings: `INSERT INTO tax_pack_bindings (id, tenant_id, country_code, pack_version)
     VALUES ('e2e2e2e2-3000-4000-8000-000000000003', $1, 'SA', '1.0.0-baseline')`,
  tax_document_summaries: `INSERT INTO tax_document_summaries (id, tenant_id, source_type, source_id, document_date,
        country_code, direction, treatment, rate, taxable_base, tax_amount, snapshot, tax_code_id)
     VALUES ('e3e3e3e3-3000-4000-8000-000000000003', $1, 'iso_fixture', $1, '2027-02-01', 'SA',
        'INPUT', 'STANDARD_RATED', 15.0000, 100, 15, '{"treatment":"STANDARD_RATED"}'::jsonb,
        'e0e0e0e0-0000-4000-8000-000000000002')`,
  vat_returns: `INSERT INTO vat_returns (id, tenant_id, country_code, period_start, period_end, summary, cross_check)
     VALUES ('e4e4e4e4-3000-4000-8000-000000000003', $1, 'SA', '2027-02-01', '2027-02-28', '{}'::jsonb, '{}'::jsonb)`,
  e_invoicing_submissions: `INSERT INTO e_invoicing_submissions (id, tenant_id, country_code, adapter_id, source_type, source_id, status)
     VALUES ('e5e5e5e5-3000-4000-8000-000000000003', $1, 'SA', 'fake', 'iso_fixture', $1, 'PENDING')`,
  // PHASE-010 inventory cluster (migrations 0014/0015) — warehouse refs
  // point at the FOREIGN tenant's own fixture rows so the RLS WITH CHECK
  // is the only failing constraint (FKs would otherwise fire first).
  warehouses: `INSERT INTO warehouses (id, tenant_id, branch_id, code, name)
     VALUES ('f0f0f0f0-3000-4000-8000-000000000003', $1,
             'abababab-0000-4000-8000-000000000002', 'ATK', 'Attack WH')`,
  item_warehouse_settings: `INSERT INTO item_warehouse_settings (id, tenant_id, item_id, warehouse_id, reorder_level, min_qty)
     VALUES ('f1f1f1f1-3000-4000-8000-000000000003', $1, 'babababa-0000-4000-8000-000000000002',
             'f0f0f0f0-2000-4000-8000-000000000002', 5, 2)`,
  stock_moves: `INSERT INTO stock_moves (id, tenant_id, item_id, warehouse_id, direction, move_kind, qty, unit_cost, value_amount, source_type, source_id, moved_at)
     VALUES ('f4f4f4f4-3000-4000-8000-000000000003', $1, 'babababa-0000-4000-8000-000000000002',
             'f0f0f0f0-2000-4000-8000-000000000002', 'IN', 'receipt', 10, 2.5, 25,
             'manual_receipt', 'f4f4f4f4-3000-4000-8000-000000000003', '2027-01-05')`,
  stock_layers: `INSERT INTO stock_layers (id, tenant_id, item_id, warehouse_id, remaining_qty, unit_cost, source_move_id, received_at)
     VALUES ('f5f5f5f5-3000-4000-8000-000000000003', $1, 'babababa-0000-4000-8000-000000000002',
             'f0f0f0f0-2000-4000-8000-000000000002', 10, 2.5,
             'f4f4f4f4-3000-4000-8000-000000000003', '2027-01-05')`,
  item_stock: `INSERT INTO item_stock (id, tenant_id, item_id, warehouse_id, qty, avg_cost)
     VALUES ('f6f6f6f6-3000-4000-8000-000000000003', $1, 'babababa-0000-4000-8000-000000000002',
             'f0f0f0f0-2000-4000-8000-000000000002', 10, 2.5)`,
  stock_transfers: `INSERT INTO stock_transfers (id, tenant_id, from_warehouse_id, to_warehouse_id, status)
     VALUES ('f7f7f7f7-3000-4000-8000-000000000003', $1, 'f0f0f0f0-1000-4000-8000-000000000002',
             'f0f0f0f0-2000-4000-8000-000000000002', 'DRAFT')`,
  stock_transfer_lines: `INSERT INTO stock_transfer_lines (id, tenant_id, transfer_id, line_no, item_id, qty)
     VALUES ('f8f8f8f8-3000-4000-8000-000000000003', $1, 'f7f7f7f7-0000-4000-8000-000000000002', 2,
             'babababa-0000-4000-8000-000000000002', 4)`,
  stock_adjustments: `INSERT INTO stock_adjustments (id, tenant_id, warehouse_id, item_id, reason, delta_qty)
     VALUES ('f9f9f9f9-3000-4000-8000-000000000003', $1, 'f0f0f0f0-2000-4000-8000-000000000002',
             'babababa-0000-4000-8000-000000000002', 'DAMAGE', -1)`,
  stock_reservations: `INSERT INTO stock_reservations (id, tenant_id, item_id, warehouse_id, qty, holder_type)
     VALUES ('fafafafa-3000-4000-8000-000000000003', $1, 'babababa-0000-4000-8000-000000000002',
             'f0f0f0f0-2000-4000-8000-000000000002', 2, 'MANUAL')`,
  item_batches: `INSERT INTO item_batches (id, tenant_id, item_id, batch_no)
     VALUES ('f2f2f2f2-3000-4000-8000-000000000003', $1, 'babababa-0000-4000-8000-000000000002', 'ATK-B')`,
  item_serials: `INSERT INTO item_serials (id, tenant_id, item_id, serial_no)
     VALUES ('f3f3f3f3-3000-4000-8000-000000000003', $1, 'babababa-0000-4000-8000-000000000002', 'ATK-SN')`,
  stock_counts: `INSERT INTO stock_counts (id, tenant_id, warehouse_id, status, snapshot_at)
     VALUES ('fbfbfbfb-3000-4000-8000-000000000003', $1, 'f0f0f0f0-2000-4000-8000-000000000002',
             'DRAFT', '2027-01-10T09:00:00Z')`,
  stock_count_lines: `INSERT INTO stock_count_lines (id, tenant_id, stock_count_id, line_no, item_id, batch_id, system_qty)
     VALUES ('fcfcfcfc-3000-4000-8000-000000000003', $1, 'fbfbfbfb-0000-4000-8000-000000000002', 2,
             'babababa-0000-4000-8000-000000000002', 'f2f2f2f2-0000-4000-8000-000000000002', 10)`,
  // PHASE-011 purchasing cluster (migrations 0016/0017) — FK targets are
  // the FOREIGN tenant's own fixture rows so the RLS WITH CHECK is the
  // isolated rejection.
  purchase_requests: `INSERT INTO purchase_requests (id, tenant_id, branch_id, status)
     VALUES ('5a5a5a5a-3000-4000-8000-000000000003', $1, 'abababab-0000-4000-8000-000000000002', 'DRAFT')`,
  purchase_request_lines: `INSERT INTO purchase_request_lines (id, tenant_id, request_id, line_no, item_id, qty)
     VALUES ('5b5b5b5b-3000-4000-8000-000000000003', $1, '5a5a5a5a-0000-4000-8000-000000000002', 2,
             'babababa-0000-4000-8000-000000000002', 5)`,
  purchase_orders: `INSERT INTO purchase_orders (id, tenant_id, branch_id, supplier_id, order_date, currency_code, status)
     VALUES ('5c5c5c5c-3000-4000-8000-000000000003', $1, 'abababab-0000-4000-8000-000000000002',
             'b5b5b5b5-0000-4000-8000-000000000002', '2027-02-01', 'SAR', 'DRAFT')`,
  purchase_order_lines: `INSERT INTO purchase_order_lines (id, tenant_id, order_id, line_no, item_id, qty, unit_price, net_amount)
     VALUES ('5d5d5d5d-3000-4000-8000-000000000003', $1, '5c5c5c5c-0000-4000-8000-000000000002', 2,
             'babababa-0000-4000-8000-000000000002', 5, 2.5, 12.5)`,
  goods_receipts: `INSERT INTO goods_receipts (id, tenant_id, branch_id, supplier_id, po_id, warehouse_id, receipt_date, status)
     VALUES ('5e5e5e5e-3000-4000-8000-000000000003', $1, 'abababab-0000-4000-8000-000000000002',
             'b5b5b5b5-0000-4000-8000-000000000002', '5c5c5c5c-0000-4000-8000-000000000002',
             'f0f0f0f0-2000-4000-8000-000000000002', '2027-02-05', 'DRAFT')`,
  goods_receipt_lines: `INSERT INTO goods_receipt_lines (id, tenant_id, receipt_id, line_no, item_id, qty, unit_cost, value_amount)
     VALUES ('5f5f5f5f-3000-4000-8000-000000000003', $1, '5e5e5e5e-0000-4000-8000-000000000002', 2,
             'babababa-0000-4000-8000-000000000002', 5, 2.5, 12.5)`,
  supplier_invoices: `INSERT INTO supplier_invoices (id, tenant_id, branch_id, supplier_id, invoice_no, invoice_date, due_date, currency_code, status)
     VALUES ('60606060-3000-4000-8000-000000000003', $1, 'abababab-0000-4000-8000-000000000002',
             'b5b5b5b5-0000-4000-8000-000000000002', 'ATK-001', '2027-02-10', '2027-03-12', 'SAR', 'DRAFT')`,
  supplier_invoice_lines: `INSERT INTO supplier_invoice_lines (id, tenant_id, invoice_id, line_no, item_id, qty, unit_price, net_amount)
     VALUES ('61616161-3000-4000-8000-000000000003', $1, '60606060-0000-4000-8000-000000000002', 2,
             'babababa-0000-4000-8000-000000000002', 5, 2.5, 12.5)`,
  debit_notes: `INSERT INTO debit_notes (id, tenant_id, branch_id, supplier_id, ref_invoice_id, note_date, currency_code, status)
     VALUES ('62626262-3000-4000-8000-000000000003', $1, 'abababab-0000-4000-8000-000000000002',
             'b5b5b5b5-0000-4000-8000-000000000002', '60606060-0000-4000-8000-000000000002', '2027-02-15', 'SAR', 'DRAFT')`,
  debit_note_lines: `INSERT INTO debit_note_lines (id, tenant_id, note_id, line_no, item_id, qty, unit_price, net_amount)
     VALUES ('63636363-3000-4000-8000-000000000003', $1, '62626262-0000-4000-8000-000000000002', 2,
             'babababa-0000-4000-8000-000000000002', 1, 1, 1)`,
  landed_costs: `INSERT INTO landed_costs (id, tenant_id, grn_id, cost_type, amount, allocation_method, charge_account_id, status)
     VALUES ('64646464-3000-4000-8000-000000000003', $1, '5e5e5e5e-0000-4000-8000-000000000002',
             'freight', 2, 'VALUE', 'b0b0b0b0-0000-4000-8000-000000000002', 'DRAFT')`,
  landed_cost_allocations: `INSERT INTO landed_cost_allocations (id, tenant_id, landed_cost_id, grn_line_id, item_id, warehouse_id, qty_at_allocation, remaining_qty, allocated_amount)
     VALUES ('65656565-3000-4000-8000-000000000003', $1, '64646464-0000-4000-8000-000000000002',
             '5f5f5f5f-0000-4000-8000-000000000002', 'babababa-0000-4000-8000-000000000002',
             'f0f0f0f0-2000-4000-8000-000000000002', 5, 5, 2)`,
  purchase_reallocations: `INSERT INTO purchase_reallocations (id, tenant_id, doc_no, payment_id, supplier_id, reason, total_amount)
     VALUES ('66666666-3000-4000-8000-000000000003', $1, 'RAL-ATK-1', 'd4d4d4d4-0000-4000-8000-000000000002',
             'b5b5b5b5-0000-4000-8000-000000000002', 'attack re-allocation', 1)`,
  purchase_reallocation_lines: `INSERT INTO purchase_reallocation_lines (id, tenant_id, reallocation_id, line_no, to_open_item_id, amount)
     VALUES ('67676767-3000-4000-8000-000000000003', $1, '66666666-0000-4000-8000-000000000002', 2,
             'cececece-0000-4000-8000-000000000002', 1)`,
  // PHASE-012 sales cluster (migrations 0018/0019) — FK targets are the
  // FOREIGN tenant's own fixture rows so the RLS WITH CHECK is the
  // isolated rejection.
  sales_reps: `INSERT INTO sales_reps (id, tenant_id, code, name, status)
     VALUES ('70707070-3000-4000-8000-000000000003', $1, 'ATK-REP', 'Attack Rep', 'ACTIVE')`,
  quotations: `INSERT INTO quotations (id, tenant_id, branch_id, customer_id, quote_date, valid_until, currency_code, status)
     VALUES ('71717171-3000-4000-8000-000000000003', $1, 'abababab-0000-4000-8000-000000000002',
             'b5b5b5b5-0000-4000-8000-000000000002', '2027-02-01', '2027-03-03', 'SAR', 'DRAFT')`,
  quotation_lines: `INSERT INTO quotation_lines (id, tenant_id, quotation_id, line_no, item_id, qty, unit_price, net_amount)
     VALUES ('72727272-3000-4000-8000-000000000003', $1, '71717171-0000-4000-8000-000000000002', 2,
             'babababa-0000-4000-8000-000000000002', 5, 2.5, 12.5)`,
  sales_orders: `INSERT INTO sales_orders (id, tenant_id, branch_id, customer_id, warehouse_id, order_date, currency_code, status)
     VALUES ('73737373-3000-4000-8000-000000000003', $1, 'abababab-0000-4000-8000-000000000002',
             'b5b5b5b5-0000-4000-8000-000000000002', 'f0f0f0f0-1000-4000-8000-000000000002',
             '2027-02-02', 'SAR', 'DRAFT')`,
  sales_order_lines: `INSERT INTO sales_order_lines (id, tenant_id, order_id, line_no, item_id, qty, unit_price, net_amount)
     VALUES ('74747474-3000-4000-8000-000000000003', $1, '73737373-0000-4000-8000-000000000002', 2,
             'babababa-0000-4000-8000-000000000002', 5, 2.5, 12.5)`,
  delivery_notes: `INSERT INTO delivery_notes (id, tenant_id, branch_id, customer_id, warehouse_id, delivery_date, currency_code, status)
     VALUES ('75757575-3000-4000-8000-000000000003', $1, 'abababab-0000-4000-8000-000000000002',
             'b5b5b5b5-0000-4000-8000-000000000002', 'f0f0f0f0-1000-4000-8000-000000000002',
             '2027-02-05', 'SAR', 'DRAFT')`,
  delivery_note_lines: `INSERT INTO delivery_note_lines (id, tenant_id, delivery_id, line_no, item_id, qty, unit_price, net_amount)
     VALUES ('76767676-3000-4000-8000-000000000003', $1, '75757575-0000-4000-8000-000000000002', 2,
             'babababa-0000-4000-8000-000000000002', 5, 2.5, 12.5)`,
  sales_invoices: `INSERT INTO sales_invoices (id, tenant_id, branch_id, customer_id, kind, invoice_date, due_date, currency_code, status)
     VALUES ('77777777-3000-4000-8000-000000000003', $1, 'abababab-0000-4000-8000-000000000002',
             'b5b5b5b5-0000-4000-8000-000000000002', 'CREDIT', '2027-02-10', '2027-03-12', 'SAR', 'DRAFT')`,
  sales_invoice_lines: `INSERT INTO sales_invoice_lines (id, tenant_id, invoice_id, line_no, item_id, qty, unit_price, net_amount)
     VALUES ('78787878-3000-4000-8000-000000000003', $1, '77777777-0000-4000-8000-000000000002', 2,
             'babababa-0000-4000-8000-000000000002', 5, 2.5, 12.5)`,
  credit_notes: `INSERT INTO credit_notes (id, tenant_id, branch_id, customer_id, invoice_id, note_date, currency_code, status)
     VALUES ('79797979-3000-4000-8000-000000000003', $1, 'abababab-0000-4000-8000-000000000002',
             'b5b5b5b5-0000-4000-8000-000000000002', '77777777-0000-4000-8000-000000000002',
             '2027-02-15', 'SAR', 'DRAFT')`,
  credit_note_lines: `INSERT INTO credit_note_lines (id, tenant_id, note_id, line_no, invoice_line_id, item_id, qty, unit_price, net_amount)
     VALUES ('7a7a7a7a-3000-4000-8000-000000000003', $1, '79797979-0000-4000-8000-000000000002', 2,
             '78787878-0000-4000-8000-000000000002', 'babababa-0000-4000-8000-000000000002', 1, 1, 1)`,
  sales_reallocations: `INSERT INTO sales_reallocations (id, tenant_id, doc_no, receipt_id, customer_id, reason, total_amount)
     VALUES ('7b7b7b7b-3000-4000-8000-000000000003', $1, 'SRAL-ATK-1', 'd3d3d3d3-0000-4000-8000-000000000002',
             'b5b5b5b5-0000-4000-8000-000000000002', 'attack sales re-allocation', 1)`,
  sales_reallocation_lines: `INSERT INTO sales_reallocation_lines (id, tenant_id, reallocation_id, line_no, to_open_item_id, amount)
     VALUES ('7c7c7c7c-3000-4000-8000-000000000003', $1, '7b7b7b7b-0000-4000-8000-000000000002', 2,
             'cececece-0000-4000-8000-000000000002', 1)`,
  // PHASE-013 reporting cluster (migration 0020) — the attack rows carry
  // distinct params_hash / template keys so the RLS WITH CHECK is the
  // isolated rejection, never the (tenant, key) unique constraint.
  report_runs: `INSERT INTO report_runs (id, tenant_id, report_key, contract_version, params,
                                      params_hash, execution_class, status)
     VALUES ('7d7d7d7d-3000-4000-8000-000000000003', $1, 'financial.trial-balance', 1,
             '{"locale": "ar"}'::jsonb, 'iso-attack', 'inline', 'QUEUED')`,
  print_templates: `INSERT INTO print_templates (id, tenant_id, key, version, locale_variants)
     VALUES ('7e7e7e7e-3000-4000-8000-000000000003', $1, 'receipt-58', 1, '{"ar": 1}'::jsonb)`,
  subscription_invoices: `INSERT INTO subscription_invoices (id, tenant_id, subscription_id, number, amount, currency_code,
                                              period_start, period_end, due_date)
     VALUES ('d5d5d5d5-3000-4000-8000-000000000003', $1, 'adadadad-0000-4000-8000-000000000001',
             'SUB-INV-2026-000099', 0, 'SAR', '2026-01-01', '2026-01-31', '2026-02-14')`,
  billing_events: `INSERT INTO billing_events (id, tenant_id, event_type, subscription_id, payload)
     VALUES ('d6d6d6d6-3000-4000-8000-000000000003', $1, 'subscription.suspended',
             'adadadad-0000-4000-8000-000000000001', '{"attack": true}'::jsonb)`,
  usage_counters: `INSERT INTO usage_counters (id, tenant_id, counter_key, period, value)
     VALUES ('d7d7d7d7-3000-4000-8000-000000000003', $1, 'users', '2026-01-01', 99)`,
  notifications: `INSERT INTO notifications (id, tenant_id, type, title, body)
     VALUES ('d8d8d8d8-3000-4000-8000-000000000003', $1, 'invoice.overdue',
             '{"ar":"x","en":"x"}'::jsonb, '{"ar":"x","en":"x"}'::jsonb)`,
  notification_preferences: `INSERT INTO notification_preferences (id, tenant_id, event_type, in_app, email)
     VALUES ('d9d9d9d9-3000-4000-8000-000000000003', $1, 'limit.warning', false, false)`,
  tenant_industry_config: `INSERT INTO tenant_industry_config (tenant_id, template_key, applied_version, applied_manifest_hash)
     VALUES ($1, 'industry.grocery', '1.0.0', 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')`,
  pos_terminals: `INSERT INTO pos_terminals (id, tenant_id, branch_id, code, name, cash_account_id)
     VALUES ('e0e0e0e0-3000-4000-8000-000000000003', $1, 'abababab-0000-4000-8000-000000000001', 'POS-XX', 'X', 'd0d0d0d0-0000-4000-8000-000000000001')`,
  vehicles: `INSERT INTO vehicles (id, tenant_id, partner_id, make, model, vin)
     VALUES ('a10a10a1-3000-4000-8000-000000000003', $1, 'b5b5b5b5-0000-4000-8000-000000000001', 'Kia', 'Rio', 'KNADC5A19N6000003')`,
  job_cards: `INSERT INTO job_cards (id, tenant_id, branch_id, card_no, customer_id)
     VALUES ('b20b20b2-3000-4000-8000-000000000003', $1, 'abababab-0000-4000-8000-000000000001', 'JC-ISO', 'b5b5b5b5-0000-4000-8000-000000000001')`,
  job_card_lines: `INSERT INTO job_card_lines (id, tenant_id, job_card_id, line_type, qty, unit_price)
     VALUES ('c30c30c3-3000-4000-8000-000000000003', $1, 'b20b20b2-0000-4000-8000-000000000001', 'LABOR', 1, 10)`,
  routes: `INSERT INTO routes (id, tenant_id, rep_id, name)
     VALUES ('d40d40d4-3000-4000-8000-000000000003', $1, '70707070-0000-4000-8000-000000000001', 'ISO-R')`,
  route_visits: `INSERT INTO route_visits (id, tenant_id, route_id, customer_id, planned_date)
     VALUES ('e50e50e5-3000-4000-8000-000000000003', $1, 'd40d40d4-0000-4000-8000-000000000001', 'b5b5b5b5-0000-4000-8000-000000000001', '2026-11-03')`,
  rep_settlements: `INSERT INTO rep_settlements (id, tenant_id, rep_id, settlement_no, settlement_date, expected_cash)
     VALUES ('f60f60f6-3000-4000-8000-000000000003', $1, '70707070-0000-4000-8000-000000000001', 'STL-ISO', '2026-11-03', 0)`,
  van_stocks: `INSERT INTO van_stocks (tenant_id, warehouse_id, item_id, qty, value_amount)
     VALUES ($1, 'f0f0f0f0-1000-4000-8000-000000000001', 'babababa-0000-4000-8000-000000000001', 1, 5)`,
  commission_rules: `INSERT INTO commission_rules (id, tenant_id, rep_id, basis, rate_pct)
     VALUES ('a70a70a7-3000-4000-8000-000000000003', $1, '70707070-0000-4000-8000-000000000001', 'INVOICED', 2)`,
  commission_runs: `INSERT INTO commission_runs (id, tenant_id, run_no, period_from, period_to)
     VALUES ('b80b80b8-3000-4000-8000-000000000003', $1, 'CR-ISO', '2026-11-01', '2026-11-30')`,
  change_log: `INSERT INTO change_log (tenant_id, entity_type, entity_id, op)
     VALUES ($1, 'pos_terminal', 'e0e0e0e0-3000-4000-8000-000000000003', 'INSERT')`,
  sync_cursors: `INSERT INTO sync_cursors (id, tenant_id, device_id, entity_type, cursor)
     VALUES ('e1e1e1e1-3000-4000-8000-000000000003', $1, 'e9e9e9e9-0000-4000-8000-000000000001', 'items', 0)`,
  sync_commands: `INSERT INTO sync_commands (idempotency_key, tenant_id, command_type, client_id, status)
     VALUES ('iso-cmd-x', $1, 'pos_sale', 'e2e2e2e2-3000-4000-8000-000000000003', 'ACCEPTED')`,
  bills_of_materials: `INSERT INTO bills_of_materials (id, tenant_id, item_id, name, current_version)
     VALUES ('c90c90c9-3000-4000-8000-000000000003', $1, 'babababa-0000-4000-8000-000000000001', 'ISO-BOM', 1)`,
  bom_versions: `INSERT INTO bom_versions (id, tenant_id, bom_id, version, effective_from, yield_qty)
     VALUES ('d90d90d9-3000-4000-8000-000000000003', $1, 'c90c90c9-0000-4000-8000-000000000001', 9, '2026-11-03', 1)`,
  bom_lines: `INSERT INTO bom_lines (id, tenant_id, bom_version_id, component_item_id, qty_per_output, scrap_factor_pct)
     VALUES ('e90e90e9-3000-4000-8000-000000000003', $1, 'd90d90d9-0000-4000-8000-000000000001', 'babababa-0000-4000-8000-000000000001', 1, 0)`,
  production_orders: `INSERT INTO production_orders (id, tenant_id, branch_id, order_no, bom_version_id, fg_item_id, materials_warehouse_id, fg_warehouse_id, planned_qty, status)
     VALUES ('a90a90a9-3000-4000-8000-000000000003', $1, 'abababab-0000-4000-8000-000000000001', 'PRD-ISO-1', 'd90d90d9-0000-4000-8000-000000000001', 'babababa-0000-4000-8000-000000000001', 'f0f0f0f0-1000-4000-8000-000000000001', 'f0f0f0f0-1000-4000-8000-000000000001', 10, 'DRAFT')`,
  production_consumptions: `INSERT INTO production_consumptions (id, tenant_id, production_order_id, item_id, qty, unit_cost)
     VALUES ('b90b90b9-3000-4000-8000-000000000003', $1, 'a90a90a9-0000-4000-8000-000000000001', 'babababa-0000-4000-8000-000000000001', 1, 1)`,
  inspections: `INSERT INTO inspections (id, tenant_id, inspection_no, target_type, target_id, result, disposition)
     VALUES ('c80c80c8-3000-4000-8000-000000000003', $1, 'QC-ISO', 'PRODUCTION_ORDER', 'a90a90a9-0000-4000-8000-000000000001', 'FAIL', 'SCRAP')`,
  projects: `INSERT INTO projects (id, tenant_id, code, name)
     VALUES ('c1c1c1c1-3000-4000-8000-000000000003', $1, 'CASE-ISO', 'Attack Case')`,
  leads: `INSERT INTO leads (id, tenant_id, branch_id, name, source)
     VALUES ('c2c2c2c2-3000-4000-8000-000000000003', $1, 'abababab-0000-4000-8000-000000000001', 'Attack Lead', 'OTHER')`,
  tasks: `INSERT INTO tasks (id, tenant_id, title, status)
     VALUES ('c3c3c3c3-3000-4000-8000-000000000003', $1, 'Attack Task', 'OPEN')`,
  activities: `INSERT INTO activities (id, tenant_id, kind, body)
     VALUES ('c4c4c4c4-3000-4000-8000-000000000003', $1, 'NOTE', 'attack')`,
  service_contracts: `INSERT INTO service_contracts (id, tenant_id, branch_id, contract_no, partner_id, fee_model, status, start_date)
     VALUES ('c5c5c5c5-3000-4000-8000-000000000003', $1, 'abababab-0000-4000-8000-000000000001', 'SC-ISO', 'b5b5b5b5-0000-4000-8000-000000000001', 'RETAINER', 'DRAFT', '2026-11-01')`,
  contract_schedule_lines: `INSERT INTO contract_schedule_lines (id, tenant_id, contract_id, description, amount)
     VALUES ('c6c6c6c6-3000-4000-8000-000000000003', $1, 'c5c5c5c5-0000-4000-8000-000000000001', 'ISO line', 100)`,
  service_orders: `INSERT INTO service_orders (id, tenant_id, branch_id, order_no, partner_id)
     VALUES ('c7c7c7c7-3000-4000-8000-000000000003', $1, 'abababab-0000-4000-8000-000000000001', 'SO-ISO', 'b5b5b5b5-0000-4000-8000-000000000001')`,
  service_order_lines: `INSERT INTO service_order_lines (id, tenant_id, service_order_id, line_type, description)
     VALUES ('c8c8c8c8-3000-4000-8000-000000000003', $1, 'c7c7c7c7-0000-4000-8000-000000000001', 'SERVICE', 'attack line')`,
  time_entries: `INSERT INTO time_entries (id, tenant_id, project_id, fee_item_id, hours, entry_date)
     VALUES ('c9c9c9c9-3000-4000-8000-000000000003', $1, 'c1c1c1c1-0000-4000-8000-000000000001', 'babababa-0000-4000-8000-000000000001', 1, '2026-11-02')`,
  tombstones: `INSERT INTO tombstones (seq, tenant_id, entity_type, entity_id)
     VALUES (99, $1, 'partners_lite', 'd1d1d1d1-0000-4000-8000-000000000001')`,
  inbox_commands: `INSERT INTO inbox_commands (id, tenant_id, device_id, command_id, intent, idempotency_key, status, result)
     VALUES ('d2d2d2d2-3000-4000-8000-000000000003', $1, 'e9e9e9e9-0000-4000-8000-000000000001', 'd3d3d3d3-3000-4000-8000-000000000003', 'pos_sale', 'iso-attack', 'ACCEPTED', '{}')`,

  asset_categories: `INSERT INTO asset_categories (id, tenant_id, code, name, useful_life_months_default)
     VALUES ('d4d4d4d4-3000-4000-8000-000000000003', $1, 'ATK', 'Attack Category', 12)`,
  assets: `INSERT INTO assets (id, tenant_id, code, name, category_id, acquisition_date, cost, useful_life_months, depreciation_method)
     VALUES ('d5d5d5d5-3000-4000-8000-000000000003', $1, 'ATK', 'Attack Asset',
             'd4d4d4d4-0000-4000-8000-000000000001', '2026-01-01', 1000, 12, 'STRAIGHT_LINE')`,
  depreciation_runs: `INSERT INTO depreciation_runs (id, tenant_id, fiscal_period_id)
     VALUES ('d6d6d6d6-3000-4000-8000-000000000003', $1, '00000000-0000-4000-8000-000000000009')`,
  depreciation_lines: `INSERT INTO depreciation_lines (id, tenant_id, run_id, asset_id, period_amount, accumulated_amount)
     VALUES ('d7d7d7d7-3000-4000-8000-000000000003', $1,
             'd6d6d6d6-0000-4000-8000-000000000001', 'd5d5d5d5-0000-4000-8000-000000000001', 10, 10)`,
  asset_disposals: `INSERT INTO asset_disposals (id, tenant_id, asset_id, disposal_date, kind, proceeds, net_book_value, gain_loss)
     VALUES ('d8d8d8d8-3000-4000-8000-000000000003', $1, 'd5d5d5d5-0000-4000-8000-000000000001',
             '2026-11-02', 'SCRAP', 0, 100, -100)`,
  asset_revaluations: `INSERT INTO asset_revaluations (id, tenant_id, asset_id, revaluation_date, new_gross_value, new_accumulated, delta)
     VALUES ('d9d9d9d9-3000-4000-8000-000000000003', $1, 'd5d5d5d5-0000-4000-8000-000000000001',
             '2026-11-02', 2000, 0, 2000)`,

  notes: `INSERT INTO notes (id, tenant_id, kind, direction, number, partner_id, maturity_date, amount, currency, issue_date, status)
     VALUES ('e1e1e1e1-3000-4000-8000-000000000003', $1, 'CHEQUE', 'RECEIVED', 'ATK-1',
             'b5b5b5b5-0000-4000-8000-000000000001', '2026-12-01', 100, 'YER', '2026-11-01', 'IN_CUSTODY')`,
  note_events: `INSERT INTO note_events (id, tenant_id, note_id, event_kind, event_date)
     VALUES ('e2e2e2e2-3000-4000-8000-000000000003', $1, 'e1e1e1e1-0000-4000-8000-000000000001', 'DEPOSIT', '2026-11-02')`,
  installment_plans: `INSERT INTO installment_plans (id, tenant_id, partner_id, source_type, source_id, total_amount, count, start_date, frequency)
     VALUES ('e3e3e3e3-3000-4000-8000-000000000003', $1, 'b5b5b5b5-0000-4000-8000-000000000001', 'sales_invoice',
             'c0c0c0c0-0000-4000-8000-000000000001', 1000, 4, '2026-11-01', 'MONTHLY')`,
  installment_lines: `INSERT INTO installment_lines (id, tenant_id, plan_id, seq, due_date, amount)
     VALUES ('e4e4e4e4-3000-4000-8000-000000000003', $1, 'e3e3e3e3-0000-4000-8000-000000000001', 1, '2026-12-01', 250)`,
};

beforeAll(async () => {
  ensureTestDb();
  const su = await superuserClient();
  await seedFixtures(su);
  await su.end();
});

describe("registry completeness (negative proof — new tenant table must register)", () => {
  it("every public table with a tenant_id column is registered", async () => {
    const su = await superuserClient();
    const tables = await su.query<{ table_name: string }>(
      `SELECT DISTINCT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'tenant_id'`,
    );
    const inDb = tables.rows.map((row) => row.table_name).sort();
    await su.end();
    expect(inDb).toEqual([...TENANT_TABLE_NAMES].sort());
  });

  it("registered names resolve to real tables (no stale registry rows)", async () => {
    const su = await superuserClient();
    const tables = await su.query<{ table_name: string }>(
      `SELECT tablename AS table_name FROM pg_tables WHERE schemaname = 'public'`,
    );
    const names = new Set(tables.rows.map((row) => row.table_name));
    await su.end();
    for (const name of TENANT_TABLE_NAMES) {
      expect(names.has(name)).toBe(true);
    }
  });
});

describe("structural catalog assertions (FORCE RLS + USING/WITH CHECK)", () => {
  it("every registered table: ENABLE+FORCE RLS with the macro policy applicable to erp_app", async () => {
    const su = await superuserClient();
    const rows = await su.query<{
      tablename: string;
      rls_forced: boolean;
      usings: string | null;
      with_checks: string | null;
      applies: boolean | null;
    }>(
      `SELECT c.relname AS tablename, c.relforcerowsecurity AS rls_forced,
              (SELECT string_agg(p.qual, ' OR ') FROM pg_policies p
                WHERE p.schemaname='public' AND p.tablename=c.relname AND p.policyname='tenant_isolation') AS usings,
              (SELECT string_agg(p.with_check, ' OR ') FROM pg_policies p
                WHERE p.schemaname='public' AND p.tablename=c.relname AND p.policyname='tenant_isolation') AS with_checks,
              (SELECT bool_or('erp_app' = ANY(p.roles)) FROM pg_policies p
                WHERE p.schemaname='public' AND p.tablename=c.relname AND p.policyname='tenant_isolation') AS applies
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND c.relname = ANY($1)`,
      [TENANT_TABLE_NAMES],
    );
    await su.end();
    expect(rows.rows).toHaveLength(TENANT_TABLE_NAMES.length);
    for (const row of rows.rows) {
      expect(row.rls_forced, `${row.tablename} FORCE RLS`).toBe(true);
      expect(row.applies, `${row.tablename} policy TO erp_app`).toBe(true);
      expect(row.usings, `${row.tablename} USING`).toMatch(/tenant_id = erp\.current_tenant_id\(\)/);
      expect(row.with_checks, `${row.tablename} WITH CHECK`).toMatch(
        /tenant_id = erp\.current_tenant_id\(\)/,
      );
    }
  });
});

describe("generated attack suite A1–A10 — as erp_app", () => {
  for (const table of TENANT_TABLE_NAMES) {
    const [, foreignRow] = OWN_ROW[table]!;
    const idColumn =
      table === "role_permissions"
        ? "role_id"
        : table === "tenant_industry_config"
          ? "tenant_id"
          : table === "change_log"
            ? "entity_id"
            : table === "sync_commands"
              ? "idempotency_key"
              : table === "van_stocks"
                ? "warehouse_id"
                : table === "tombstones"
                  ? "entity_id"
                  : "id";

    it(`A1 ${table}: SELECT without GUC → 0 tenant rows`, async () => {
      const app = await appClient();
      const result = await app.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table} WHERE tenant_id IS NOT NULL`,
      );
      await app.end();
      expect(result.rows[0]?.n).toBe(0);
    });

    it(`A2 ${table}: foreign GUC never exposes this tenant's rows`, async () => {
      const app = await appClient();
      await app.query("BEGIN");
      await app.query("SELECT set_config('erp.tenant_id', $1, true)", [TENANT_B]);
      const own = await app.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = $1`,
        [TENANT_A],
      );
      const total = await app.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table} WHERE tenant_id IS NOT NULL`,
      );
      await app.query("COMMIT");
      await app.end();
      expect(own.rows[0]?.n).toBe(0);
      // Only tenant B's own rows (variant tables additionally expose the
      // tenant_id IS NULL templates — never tenant A's rows).
      if (VARIANT.has(table)) {
        expect(total.rows[0]?.n).toBe(expectedRowsFor(table));
      } else {
        expect(total.rows[0]?.n).toBe(expectedRowsFor(table));
      }
    });

    it(`A3 ${table}: INSERT with mismatched tenant_id → 42501`, async () => {
      const app = await appClient();
      await app.query("BEGIN");
      await app.query("SELECT set_config('erp.tenant_id', $1, true)", [TENANT_A]);
      await expect(app.query(MISMATCHED_INSERT[table]!, [TENANT_B])).rejects.toMatchObject({
        code: "42501",
      });
      await app.query("ROLLBACK");
      await app.end();
    });

    it(`A4/A7 ${table}: UPDATE and id-probe under own GUC touch 0 foreign rows`, async () => {
      const app = await appClient();
      await app.query("BEGIN");
      await app.query("SELECT set_config('erp.tenant_id', $1, true)", [TENANT_A]);
      const probe = await app.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table} WHERE ${idColumn} = $1`,
        [foreignRow],
      );
      if (NO_UPDATE_GRANT.has(table)) {
        // UPDATE is grant-denied (append-only tables: audit_events per
        // PHASE-002, journal_lines/partner_subledger_entries per PHASE-007
        // INV-003/INV-009, cash_movements per PHASE-008 INV-019, and
        // treasury_allocations whose sanctioned mutation is DELETE+INSERT
        // (draft replacement)): the denial itself proves the row cannot be
        // touched. Some of these carry no updated_at column — probe a real
        // column instead.
        const column =
          table === "audit_events"
            ? "action"
            : table === "cash_movements"
              ? "memo"
              : table === "treasury_allocations"
                ? "amount"
                : table === "tax_document_summaries"
                  ? "taxable_base"
                  : table === "stock_moves"
                    ? "memo"
                    : table === "purchase_reallocations"
                      ? "reason"
                      : table === "purchase_reallocation_lines"
                        ? "amount"
                        : table === "sales_reallocations"
                          ? "reason"
                          : table === "sales_reallocation_lines"
                            ? "amount"
                            : table === "billing_events"
                              ? "event_type"
                              : table === "tombstones"
                                ? "deleted_at"
                                : table === "depreciation_lines"
                                  ? "period_amount"
                                  : table === "note_events"
                                    ? "reason"
                                    : "updated_at";
        const whereCol = table === "tombstones" ? "entity_id" : "id";
        await expect(
          app.query(`UPDATE ${table} SET ${column} = ${column} WHERE ${whereCol} = $1`, [foreignRow]),
        ).rejects.toMatchObject({ code: "42501" });
      } else if (table === "role_permissions") {
        // Association table: no UPDATE grant by design (grants change via
        // delete + insert — migration 0003) → any UPDATE is grant-denied.
        await expect(
          app.query(`UPDATE ${table} SET granted_at = granted_at WHERE role_id = $1`, [
            foreignRow,
          ]),
        ).rejects.toMatchObject({ code: "42501" });
      } else if (table === "report_runs") {
        // Orchestration state carries no updated_at (created/started/
        // finished only — migration 0020): probe the mutable stage column.
        const touched = await app.query(
          `UPDATE report_runs SET stage = stage WHERE id = $1`,
          [foreignRow],
        );
        expect(touched.rowCount).toBe(0);
      } else {
        const probeColumn =
          table === "tenant_industry_config"
            ? "applied_version"
            : table === "change_log"
              ? "op"
              : table === "sync_commands"
                ? "status"
                : table === "sync_cursors"
                  ? "cursor"
                  : table === "tombstones"
                    ? "deleted_at"
                    : table === "inbox_commands"
                      ? "processed_at"
                      : "updated_at";
        const touched = await app.query(
          `UPDATE ${table} SET ${probeColumn} = ${probeColumn} WHERE ${idColumn} = $1`,
          [foreignRow],
        );
        expect(touched.rowCount).toBe(0);
      }
      await app.query("COMMIT");
      await app.end();
      expect(probe.rows[0]?.n).toBe(0);
    });

    it(`A5 ${table}: DELETE of the OTHER tenant's row is denied or touches 0 rows`, async () => {
      const app = await appClient();
      await app.query("BEGIN");
      await app.query("SELECT set_config('erp.tenant_id', $1, true)", [TENANT_A]);
      if (VARIANT.has(table) || DELETE_GRANTED.has(table)) {
        // roles/role_permissions DO carry DELETE (custom-role lifecycle,
        // migration 0003) and entitlements carry it too (the materiali-
        // zation upsert's symmetric half) — the policy confines deletes to
        // own-tenant rows, so a foreign-row DELETE affects exactly 0 rows.
        const result = await app.query(`DELETE FROM ${table} WHERE ${idColumn} = $1`, [
          foreignRow,
        ]);
        expect(result.rowCount).toBe(0);
      } else {
        // audit_events/memberships/invitations: no DELETE grant by design.
        await expect(
          app.query(`DELETE FROM ${table} WHERE ${idColumn} = $1`, [foreignRow]),
        ).rejects.toMatchObject({ code: "42501" });
      }
      await app.query("ROLLBACK");
      await app.end();
    });

    it(`A8/A9/A10 ${table}: aggregates, joins, and union/CTE shapes stay confined`, async () => {
      const app = await appClient();
      const aggregate = await app.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table} WHERE tenant_id IS NOT NULL`,
      );
      const joined = await app.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table} t JOIN tenants x ON x.id = t.tenant_id`,
      );
      const unioned = await app.query<{ n: number }>(
        `WITH u AS (SELECT tenant_id FROM ${table} UNION ALL SELECT tenant_id FROM ${table})
         SELECT count(*)::int AS n FROM u WHERE tenant_id IS NOT NULL`,
      );
      await app.end();
      expect(aggregate.rows[0]?.n).toBe(0);
      expect(joined.rows[0]?.n).toBe(0);
      expect(unioned.rows[0]?.n).toBe(0);
    });
  }
});

describe("template guards (roles/role_permissions variant policy)", () => {
  it("erp_app can never INSERT, UPDATE, or DELETE a system-template row", async () => {
    // Each rejection runs in its OWN transaction: a denied statement aborts
    // the surrounding transaction, so a shared BEGIN would mask later codes
    // (25P02) — the same discipline as the PHASE-002 append-only proofs.
    const app = await appClient();
    const expectRejectedInTx = async (sql: string) => {
      await app.query("BEGIN");
      await app.query("SELECT set_config('erp.tenant_id', $1, true)", [TENANT_A]);
      try {
        await app.query(sql);
        expect.unreachable("must be rejected");
      } catch (error) {
        expect((error as { code?: string }).code).toBe("42501");
      } finally {
        await app.query("ROLLBACK");
      }
    };

    // INSERT forging a template row → WITH CHECK requires the own tenant.
    await expectRejectedInTx(
      `INSERT INTO roles (id, tenant_id, key, name, is_system)
       VALUES ('dddddddd-9999-4999-8999-999999999999', NULL, 'forged', 'Forged', true)`,
    );
    // UPDATE of a template row → WITH CHECK denies the NULL-tenant result.
    await expectRejectedInTx(
      `UPDATE roles SET name = 'HACKED' WHERE tenant_id IS NULL AND key = 'owner'`,
    );

    // DELETE attacks: the delete-guard policy makes template rows
    // INVISIBLE to the DELETE command — the statement succeeds but must
    // affect exactly 0 rows (nothing silently disappears for any tenant).
    const delApp = await appClient();
    await delApp.query("BEGIN");
    await delApp.query("SELECT set_config('erp.tenant_id', $1, true)", [TENANT_A]);
    const rolesDeleted = await delApp.query(
      `DELETE FROM roles WHERE tenant_id IS NULL AND key = 'owner'`,
    );
    const grantsDeleted = await delApp.query(
      `DELETE FROM role_permissions rp
         USING roles r
        WHERE r.id = rp.role_id AND r.tenant_id IS NULL AND r.key = 'owner'`,
    );
    await delApp.query("ROLLBACK");
    await delApp.end();
    expect(rolesDeleted.rowCount).toBe(0);
    expect(grantsDeleted.rowCount).toBe(0);
  });

  it("erp_migrate CAN seed template rows (template_seed policy) — and only NULL-tenant rows", async () => {
    const su = await superuserClient();
    await su.query("SET ROLE erp_migrate");
    await su.query("BEGIN");
    await expect(
      su.query(
        `INSERT INTO roles (id, tenant_id, key, name, is_system)
         VALUES ('dddddddd-8888-4888-8888-888888888888', NULL, 'seed_probe', 'Seed Probe', true)`,
      ),
    ).resolves.toBeTruthy();
    // But erp_migrate cannot forge a TENANT row through the seed path.
    await expect(
      su.query(
        `INSERT INTO roles (id, tenant_id, key, name, is_system)
         VALUES ('dddddddd-7777-4777-8777-777777777777', $1, 'tenant_probe', 'Tenant Probe', false)`,
        [TENANT_A],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await su.query("ROLLBACK");
    await su.query("RESET ROLE");
    await su.end();
  });

  it("A6 composite FK: membership cannot reference another tenant's role", async () => {
    const su = await superuserClient();
    await expect(
      su.query(
        `INSERT INTO memberships (id, tenant_id, user_id, role_id)
         VALUES ('ffffffff-1111-4111-8111-111111111111', $1,
                 'eeeeeeee-0000-4000-8000-000000000002',
                 'dddddddd-0000-4000-8000-000000000002')`,
        [TENANT_A], // tenant A membership pointing at tenant B's role id
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await su.end();
  });
});
