-- PHASE-028 T1 — budgeting & variance control (DR-004, ED-04, BR-050/051).
-- Budgets are PLANNING DATA, never ledger documents: no journals, no posting
-- rules; the posting engine has no budget call site (proven by negative test).
-- Two tenant-owned tables + RLS; BR-050 enforced at the DB level.

CREATE TABLE IF NOT EXISTS "budgets" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "code" text NOT NULL, -- tenant-scoped natural key; NOT an official number (ADR-0006)
  "fiscal_year_id" uuid NOT NULL,
  "scope" text NOT NULL,
  "name" text NOT NULL,
  "name_ar" text,
  "version" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "supersedes_id" uuid REFERENCES "budgets" ("id"),
  "created_by" uuid,
  "approved_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_budgets_tenant_code UNIQUE ("tenant_id", "code"),
  CONSTRAINT ck_budgets_scope CHECK ("scope" IN ('ACCOUNTS', 'COST_CENTERS', 'PROJECTS', 'BRANCHES')),
  CONSTRAINT ck_budgets_status CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'REVISED', 'CLOSED')),
  CONSTRAINT ck_budgets_version CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_budgets_tenant_year_scope" ON "budgets" ("tenant_id", "fiscal_year_id", "scope");
--> statement-breakpoint
-- BR-050: at most one ACTIVE budget version per (tenant, fiscal year, scope).
CREATE UNIQUE INDEX IF NOT EXISTS "uq_budgets_one_active_per_year_scope"
  ON "budgets" ("tenant_id", "fiscal_year_id", "scope") WHERE "status" = 'ACTIVE';
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"budgets"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "budgets" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "budgets" TO erp_readonly;
--> statement-breakpoint
-- Budget lines: one row per fiscal period per dimension key; period must belong
-- to the budget's fiscal year (service-validated + typed rejection).
CREATE TABLE IF NOT EXISTS "budget_lines" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "budget_id" uuid NOT NULL REFERENCES "budgets" ("id"),
  "fiscal_period_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "cost_center_id" uuid,
  "project_id" uuid,
  "branch_id" uuid,
  "amount" numeric(19,4) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_budget_lines_budget_period_dim UNIQUE ("tenant_id", "budget_id", "fiscal_period_id", "account_id", "cost_center_id", "project_id", "branch_id"),
  CONSTRAINT ck_budget_lines_amount CHECK ("amount" >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_budget_lines_budget" ON "budget_lines" ("tenant_id", "budget_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_budget_lines_period" ON "budget_lines" ("tenant_id", "fiscal_period_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"budget_lines"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "budget_lines" TO erp_app; -- DELETE only while budget is DRAFT
--> statement-breakpoint
GRANT SELECT ON "budget_lines" TO erp_readonly;
--> statement-breakpoint
-- PHASE-028 permission keys (§3.13).
INSERT INTO "permissions" ("key", "module", "description") VALUES
('budgeting.budgets.view', 'budgeting', 'View budgets and variance (PHASE-028)'),
('budgeting.budgets.create', 'budgeting', 'Create/edit DRAFT budgets (PHASE-028)'),
('budgeting.budgets.approve', 'budgeting', 'Approve budgets (SoD, PHASE-028)'),
('budgeting.budgets.activate', 'budgeting', 'Activate approved budgets (PHASE-028)'),
('reports.budgeting.variance.read', 'budgeting', 'Run budget variance reports (PHASE-028)')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO erp._schema_state (key, value) VALUES ('schema_version', 30) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--> statement-breakpoint
