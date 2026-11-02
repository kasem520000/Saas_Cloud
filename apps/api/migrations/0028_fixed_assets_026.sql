-- PHASE-026 T1 — fixed assets & depreciation foundation (DR-002, ED-02, BR-041..044,
-- INV-023). Six tenant-owned tables + CHECK-enum domains + RLS. Money is
-- NUMERIC(19,4) canonical strings at the API edge (ADR-0009).

-- Asset categories: purpose-linked (BR-041) — a category is unusable until all
-- three purposes resolve to active accounts.
CREATE TABLE IF NOT EXISTS "asset_categories" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "name_ar" text,
  "useful_life_months_default" integer NOT NULL,
  "depreciation_method_default" text NOT NULL DEFAULT 'STRAIGHT_LINE',
  "asset_purpose_key" text NOT NULL DEFAULT 'FIXED_ASSET',
  "accum_depreciation_purpose_key" text NOT NULL DEFAULT 'ACCUM_DEPRECIATION',
  "expense_purpose_key" text NOT NULL DEFAULT 'DEPRECIATION_EXPENSE',
  "active" boolean NOT NULL DEFAULT true, -- deactivation allowed, deletion not (INV-015)
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_asset_categories_tenant_code UNIQUE ("tenant_id", "code"),
  CONSTRAINT ck_asset_categories_life CHECK ("useful_life_months_default" > 0),
  CONSTRAINT ck_asset_categories_method CHECK ("depreciation_method_default" IN ('STRAIGHT_LINE', 'DECLINING_BALANCE', 'UNITS_OF_PRODUCTION'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_asset_categories_tenant" ON "asset_categories" ("tenant_id", "active");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"asset_categories"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "asset_categories" TO erp_app; -- no DELETE (INV-015)
--> statement-breakpoint
GRANT SELECT ON "asset_categories" TO erp_readonly;
--> statement-breakpoint
-- Asset register: status machine ACTIVE/FULLY_DEPRECIATED/DISPOSED/WRITTEN_OFF (INV-023).
CREATE TABLE IF NOT EXISTS "assets" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "name_ar" text,
  "category_id" uuid NOT NULL REFERENCES "asset_categories" ("id"),
  "acquisition_date" date NOT NULL,
  "cost" numeric(19,4) NOT NULL,
  "salvage_value" numeric(19,4) NOT NULL DEFAULT 0,
  "useful_life_months" integer NOT NULL,
  "depreciation_method" text NOT NULL,
  "branch_id" uuid,
  "custodian_user_id" uuid,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "source_type" text,
  "source_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_assets_tenant_code UNIQUE ("tenant_id", "code"),
  CONSTRAINT ck_assets_cost CHECK ("cost" > 0),
  CONSTRAINT ck_assets_salvage CHECK ("salvage_value" >= 0 AND "salvage_value" < "cost"),
  CONSTRAINT ck_assets_life CHECK ("useful_life_months" > 0),
  CONSTRAINT ck_assets_method CHECK ("depreciation_method" IN ('STRAIGHT_LINE', 'DECLINING_BALANCE', 'UNITS_OF_PRODUCTION')),
  CONSTRAINT ck_assets_status CHECK ("status" IN ('ACTIVE', 'FULLY_DEPRECIATED', 'DISPOSED', 'WRITTEN_OFF'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_assets_tenant_status" ON "assets" ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_assets_tenant_category" ON "assets" ("tenant_id", "category_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"assets"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "assets" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "assets" TO erp_readonly;
--> statement-breakpoint
-- Depreciation runs: one per (tenant, fiscal_period) — dedupe enforced in service + UNIQUE.
CREATE TABLE IF NOT EXISTS "depreciation_runs" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "fiscal_period_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "total_amount" numeric(19,4) NOT NULL DEFAULT 0,
  "journal_entry_id" uuid,
  "posted_at" timestamptz,
  "posted_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_depreciation_runs_tenant_period UNIQUE ("tenant_id", "fiscal_period_id"),
  CONSTRAINT ck_depreciation_runs_status CHECK ("status" IN ('DRAFT', 'POSTED', 'REVERSED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_depreciation_runs_tenant" ON "depreciation_runs" ("tenant_id", "fiscal_period_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"depreciation_runs"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "depreciation_runs" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "depreciation_runs" TO erp_readonly;
--> statement-breakpoint
-- Depreciation lines: APPEND-ONLY (INV-003 pattern) — posted runs reverse only via
-- the engine (INV-014); lines stay for audit.
CREATE TABLE IF NOT EXISTS "depreciation_lines" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "run_id" uuid NOT NULL REFERENCES "depreciation_runs" ("id"),
  "asset_id" uuid NOT NULL REFERENCES "assets" ("id"),
  "period_amount" numeric(19,4) NOT NULL,
  "accumulated_amount" numeric(19,4) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_depreciation_lines_amounts CHECK ("period_amount" >= 0 AND "accumulated_amount" >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_depreciation_lines_run" ON "depreciation_lines" ("tenant_id", "run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_depreciation_lines_asset" ON "depreciation_lines" ("tenant_id", "asset_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"depreciation_lines"');
--> statement-breakpoint
GRANT SELECT, INSERT ON "depreciation_lines" TO erp_app; -- append-only: no UPDATE/DELETE
--> statement-breakpoint
GRANT SELECT ON "depreciation_lines" TO erp_readonly;
--> statement-breakpoint
-- Disposals (G-23): kind SALE/SCRAP, second-user approval (SoD), locks the asset (BR-043).
CREATE TABLE IF NOT EXISTS "asset_disposals" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "asset_id" uuid NOT NULL REFERENCES "assets" ("id"),
  "disposal_date" date NOT NULL,
  "kind" text NOT NULL,
  "proceeds" numeric(19,4) NOT NULL DEFAULT 0,
  "net_book_value" numeric(19,4) NOT NULL,
  "gain_loss" numeric(19,4) NOT NULL,
  "doc_number" text,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "journal_entry_id" uuid,
  "created_by" uuid,
  "approved_by" uuid,
  "posted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_asset_disposals_asset UNIQUE ("tenant_id", "asset_id"), -- INV-023: exactly once
  CONSTRAINT ck_asset_disposals_kind CHECK ("kind" IN ('SALE', 'SCRAP')),
  CONSTRAINT ck_asset_disposals_proceeds CHECK ("proceeds" >= 0),
  CONSTRAINT ck_asset_disposals_status CHECK ("status" IN ('DRAFT', 'POSTED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_asset_disposals_tenant" ON "asset_disposals" ("tenant_id", "disposal_date");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"asset_disposals"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "asset_disposals" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "asset_disposals" TO erp_readonly;
--> statement-breakpoint
-- Revaluations (BR-044): optional, audited, delta residual to REVALUATION_RESERVE.
CREATE TABLE IF NOT EXISTS "asset_revaluations" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "asset_id" uuid NOT NULL REFERENCES "assets" ("id"),
  "revaluation_date" date NOT NULL,
  "new_gross_value" numeric(19,4) NOT NULL,
  "new_accumulated" numeric(19,4) NOT NULL,
  "delta" numeric(19,4) NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "journal_entry_id" uuid,
  "created_by" uuid,
  "posted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_asset_revaluations_status CHECK ("status" IN ('DRAFT', 'POSTED')),
  CONSTRAINT ck_asset_revaluations_gross CHECK ("new_gross_value" > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_asset_revaluations_tenant" ON "asset_revaluations" ("tenant_id", "asset_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"asset_revaluations"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "asset_revaluations" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "asset_revaluations" TO erp_readonly;
--> statement-breakpoint
-- PHASE-026 permission keys (§3.11; normative seed rows live in 0004).
INSERT INTO "permissions" ("key", "module", "description") VALUES
('fixed_assets.assets.view', 'fixed_assets', 'View asset register (PHASE-026)'),
('fixed_assets.assets.create', 'fixed_assets', 'Create and edit assets (PHASE-026)'),
('fixed_assets.assets.manage', 'fixed_assets', 'Manage categories and capitalization (PHASE-026)'),
('fixed_assets.depreciation_runs.run', 'fixed_assets', 'Assemble depreciation runs (PHASE-026)'),
('fixed_assets.depreciation_runs.post', 'fixed_assets', 'Post depreciation runs (PHASE-026)'),
('fixed_assets.disposals.approve', 'fixed_assets', 'Approve disposals, second user SoD (PHASE-026)'),
('reports.fixed-assets.register.read', 'fixed_assets', 'Run fixed-assets reports (PHASE-026)')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO erp._schema_state (key, value) VALUES ('schema_version', 28) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--> statement-breakpoint
