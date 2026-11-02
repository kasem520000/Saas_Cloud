-- PHASE-029 T1 — payroll (financial scope only, DR-005, ED-05; BR-052..055,
-- INV-025). Seven tenant-owned tables + RLS. PII columns (national_id, bank
-- fields) are C-PII per DATA_PROTECTION §1/§3: masked in API payloads, excluded
-- from logs/exports, audit-on-read.

CREATE TABLE IF NOT EXISTS "employees" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "name_ar" text,
  "national_id" text, -- C-PII: encrypted at rest, masked in UI, never logged
  "hire_date" date NOT NULL,
  "termination_date" date,
  "contract_type" text NOT NULL DEFAULT 'MONTHLY',
  "basic_salary" numeric(19,4) NOT NULL,
  "salary_structure_id" uuid,
  "branch_id" uuid,
  "cost_center_id" uuid,
  "bank_account" text, -- C-PII
  "bank_iban" text, -- C-PII
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_employees_tenant_code UNIQUE ("tenant_id", "code"),
  CONSTRAINT ck_employees_basic CHECK ("basic_salary" > 0),
  CONSTRAINT ck_employees_contract CHECK ("contract_type" IN ('MONTHLY', 'HOURLY', 'CONTRACT')),
  CONSTRAINT ck_employees_status CHECK ("status" IN ('ACTIVE', 'ON_LEAVE', 'TERMINATED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_employees_tenant_status" ON "employees" ("tenant_id", "status");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"employees"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "employees" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "employees" TO erp_readonly;
--> statement-breakpoint
-- Salary structures + components (BR-052 versioning: superseding rows, ARCHIVED).
CREATE TABLE IF NOT EXISTS "salary_structures" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "name_ar" text,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "supersedes_id" uuid REFERENCES "salary_structures" ("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_salary_structures_tenant_code UNIQUE ("tenant_id", "code"),
  CONSTRAINT ck_salary_structures_status CHECK ("status" IN ('ACTIVE', 'ARCHIVED'))
);
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"salary_structures"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "salary_structures" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "salary_structures" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "salary_components" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "structure_id" uuid NOT NULL REFERENCES "salary_structures" ("id"),
  "code" text NOT NULL,
  "name" text NOT NULL,
  "kind" text NOT NULL, -- EARNING | DEDUCTION | EMPLOYER | EOS_BASE
  "calc" text NOT NULL, -- FIXED | PERCENT_OF_BASIC | PERCENT_OF_GROSS
  "amount" numeric(19,4), -- FIXED amount
  "percent" numeric(9,6), -- percent rates
  "gl_account_id" uuid NOT NULL,
  "is_eos_base" boolean NOT NULL DEFAULT false,
  "seq" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_salary_components_kind CHECK ("kind" IN ('EARNING', 'DEDUCTION', 'EMPLOYER', 'EOS_BASE')),
  CONSTRAINT ck_salary_components_calc CHECK ("calc" IN ('FIXED', 'PERCENT_OF_BASIC', 'PERCENT_OF_GROSS'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_salary_components_structure" ON "salary_components" ("tenant_id", "structure_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"salary_components"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "salary_components" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "salary_components" TO erp_readonly;
--> statement-breakpoint
-- Payroll runs: DRAFT → PENDING_APPROVAL → POSTED (SoD approve); one G-29 journal per run.
CREATE TABLE IF NOT EXISTS "payroll_runs" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "fiscal_period_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "gross_total" numeric(19,4) NOT NULL DEFAULT 0,
  "deductions_total" numeric(19,4) NOT NULL DEFAULT 0,
  "net_total" numeric(19,4) NOT NULL DEFAULT 0,
  "journal_entry_id" uuid,
  "created_by" uuid,
  "approved_by" uuid,
  "posted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_payroll_runs_tenant_code UNIQUE ("tenant_id", "code"),
  CONSTRAINT uq_payroll_runs_tenant_period UNIQUE ("tenant_id", "fiscal_period_id"),
  CONSTRAINT ck_payroll_runs_status CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'POSTED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_payroll_runs_tenant" ON "payroll_runs" ("tenant_id", "fiscal_period_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"payroll_runs"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "payroll_runs" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "payroll_runs" TO erp_readonly;
--> statement-breakpoint
-- Run lines: APPEND-ONLY once posted (INV-003/INV-025 pattern; posted-run mutation rejected at DB level via trigger-free grant split).
CREATE TABLE IF NOT EXISTS "payroll_run_lines" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "run_id" uuid NOT NULL REFERENCES "payroll_runs" ("id"),
  "employee_id" uuid NOT NULL REFERENCES "employees" ("id"),
  "gross" numeric(19,4) NOT NULL,
  "deductions" numeric(19,4) NOT NULL,
  "net" numeric(19,4) NOT NULL,
  "component_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb, -- frozen at calculation
  "cost_center_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_payroll_run_lines_math CHECK ("net" = "gross" - "deductions") -- INV-025 at the row level
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_payroll_run_lines_run" ON "payroll_run_lines" ("tenant_id", "run_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"payroll_run_lines"');
--> statement-breakpoint
GRANT SELECT, INSERT ON "payroll_run_lines" TO erp_app; -- append-only
--> statement-breakpoint
GRANT SELECT ON "payroll_run_lines" TO erp_readonly;
--> statement-breakpoint
-- Employee loans + schedule (BR-054 capped deductions in runs).
CREATE TABLE IF NOT EXISTS "employee_loans" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "employees" ("id"),
  "amount" numeric(19,4) NOT NULL,
  "installment" numeric(19,4) NOT NULL,
  "start_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_employee_loans_amount CHECK ("amount" > 0 AND "installment" > 0),
  CONSTRAINT ck_employee_loans_status CHECK ("status" IN ('ACTIVE', 'CLOSED', 'WRITTEN_OFF'))
);
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"employee_loans"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "employee_loans" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "employee_loans" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "loan_schedule_lines" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "loan_id" uuid NOT NULL REFERENCES "employee_loans" ("id"),
  "seq" integer NOT NULL,
  "due_date" date NOT NULL,
  "amount" numeric(19,4) NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_loan_schedule_loan_seq UNIQUE ("tenant_id", "loan_id", "seq"),
  CONSTRAINT ck_loan_schedule_status CHECK ("status" IN ('PENDING', 'DEDUCTED', 'WAIVED', 'WRITTEN_OFF'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_loan_schedule_loan" ON "loan_schedule_lines" ("tenant_id", "loan_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"loan_schedule_lines"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "loan_schedule_lines" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "loan_schedule_lines" TO erp_readonly;
--> statement-breakpoint
-- PHASE-029 permission keys (§3.14; employees.view is PII-restricted).
INSERT INTO "permissions" ("key", "module", "description") VALUES
('payroll.employees.view', 'payroll', 'View employee files (PII-restricted, PHASE-029)'),
('payroll.employees.manage', 'payroll', 'Manage employee files (PHASE-029)'),
('payroll.structures.manage', 'payroll', 'Manage salary structures (PHASE-029)'),
('payroll.runs.run', 'payroll', 'Calculate payroll runs (PHASE-029)'),
('payroll.runs.approve', 'payroll', 'Approve/post runs (SoD, PHASE-029)'),
('payroll.loans.manage', 'payroll', 'Manage employee loans (PHASE-029)'),
('reports.payroll.read', 'payroll', 'Run payroll reports (PHASE-029)')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO erp._schema_state (key, value) VALUES ('schema_version', 31) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--> statement-breakpoint
