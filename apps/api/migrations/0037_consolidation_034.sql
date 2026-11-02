-- PHASE-034 T2 — consolidation module (ED-10, ADR-0018): four tenant-owned
-- tables + RLS + grants, the SELECT-only platform-plane reader role, two
-- intercompany purpose accounts in the CoA template, and the §3.15 permission
-- keys. Legal entity = tenant unchanged (ADR-0005); zero cross-tenant writes:
-- eliminations post ONLY into the owner tenant's books via the engine
-- (source_type CONSOLIDATION_ELIMINATION, G-32, BR-056); runs are read-only
-- aggregations over member books (INV-026).

-- CoA template: intercompany control accounts (additive; fail-closed
-- PURPOSE_NOT_MAPPED elsewhere is by design until mapped).
INSERT INTO "chart_of_accounts_template" ("code", "name", "name_ar", "type", "is_group", "parent_code", "purpose_key") VALUES
  ('1160', 'Intercompany receivables', 'ذمم شركات المجموعة — مدينة', 'ASSET', false, '1150', 'INTERCOMPANY_AR'),
  ('2150', 'Intercompany payables', 'ذمم شركات المجموعة — دائنة', 'LIABILITY', false, '2100', 'INTERCOMPANY_AP')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "name_ar" = EXCLUDED."name_ar", "type" = EXCLUDED."type", "is_group" = EXCLUDED."is_group", "parent_code" = EXCLUDED."parent_code", "purpose_key" = EXCLUDED."purpose_key";
--> statement-breakpoint

-- Consolidation groups: configuration in the OWNER tenant (ADR-0018 §1).
CREATE TABLE IF NOT EXISTS "consolidation_groups" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE, -- owner tenant
  "name" text NOT NULL,
  "name_ar" text,
  "base_currency" varchar(3) NOT NULL,
  "fx_translation_method" text NOT NULL DEFAULT 'CLOSING_RATE',
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_consolidation_groups_tenant_name UNIQUE ("tenant_id", "name"),
  CONSTRAINT ck_consolidation_groups_method CHECK ("fx_translation_method" IN ('CLOSING_RATE', 'TEMPORAL')),
  CONSTRAINT ck_consolidation_groups_status CHECK ("status" IN ('ACTIVE', 'ARCHIVED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_consolidation_groups_tenant" ON "consolidation_groups" ("tenant_id", "status");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"consolidation_groups"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "consolidation_groups" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "consolidation_groups" TO erp_readonly;
--> statement-breakpoint

-- Group membership: member_tenant_id references the member legal entity.
CREATE TABLE IF NOT EXISTS "group_entities" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE, -- owner tenant
  "group_id" uuid NOT NULL REFERENCES "consolidation_groups" ("id") ON DELETE CASCADE,
  "member_tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE RESTRICT,
  "ownership_percent" numeric(7,4) NOT NULL,
  "include_from" date NOT NULL,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_group_entities_group_member UNIQUE ("group_id", "member_tenant_id"),
  CONSTRAINT ck_group_entities_ownership CHECK ("ownership_percent" > 0 AND "ownership_percent" <= 100),
  CONSTRAINT ck_group_entities_status CHECK ("status" IN ('ACTIVE', 'REMOVED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_group_entities_tenant_group" ON "group_entities" ("tenant_id", "group_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"group_entities"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "group_entities" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "group_entities" TO erp_readonly;
--> statement-breakpoint

-- Elimination entries: DRAFT authoring → POSTED (one balanced engine journal,
-- source_type CONSOLIDATION_ELIMINATION, in the OWNER's books) → reversal-only
-- counter-entry (BR-056). Lines are carried as jsonb (member-pair legs).
CREATE TABLE IF NOT EXISTS "elimination_entries" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE, -- owner tenant
  "group_id" uuid NOT NULL REFERENCES "consolidation_groups" ("id") ON DELETE CASCADE,
  "fiscal_period_id" uuid NOT NULL,
  "description" text NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "lines" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "journal_entry_id" uuid,
  "reversal_entry_id" uuid,
  "created_by" uuid,
  "posted_by" uuid,
  "posted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_elimination_entries_status CHECK ("status" IN ('DRAFT', 'POSTED', 'REVERSED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_elimination_entries_tenant_group" ON "elimination_entries" ("tenant_id", "group_id", "status");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"elimination_entries"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "elimination_entries" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "elimination_entries" TO erp_readonly;
--> statement-breakpoint

-- Consolidation runs: read-only aggregation snapshots (INV-026). Immutable
-- snapshots: completed runs are never UPDATEd except status transitions by the
-- run service; snapshot jsonb is the versioned artifact.
CREATE TABLE IF NOT EXISTS "consolidation_runs" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE, -- owner tenant
  "group_id" uuid NOT NULL REFERENCES "consolidation_groups" ("id") ON DELETE CASCADE,
  "fiscal_period_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'QUEUED',
  "snapshot" jsonb,
  "snapshot_version" integer NOT NULL DEFAULT 1,
  "error" text,
  "created_by" uuid,
  "started_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_consolidation_runs_status CHECK ("status" IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_consolidation_runs_tenant_group" ON "consolidation_runs" ("tenant_id", "group_id", "created_at" DESC);
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"consolidation_runs"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "consolidation_runs" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "consolidation_runs" TO erp_readonly;
--> statement-breakpoint

-- The SELECT-only platform-plane reader (ADR-0018 §3): the ONLY sanctioned
-- cross-tenant reader. NOLOGIN role; the consolidation reader service connects
-- as the platform and sets erp.tenant_id per member. Writes are NOT granted —
-- DB-level denial is asserted by the isolation suite.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_consolidation') THEN
    CREATE ROLE erp_consolidation NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
ALTER ROLE erp_consolidation SET row_security = on;
--> statement-breakpoint
GRANT SELECT ON "journal_entries", "journal_lines", "accounts", "account_purposes", "fiscal_periods" TO erp_consolidation;
--> statement-breakpoint

-- PHASE-034 permission keys (§3.15).
INSERT INTO "permissions" ("key", "module", "description") VALUES
('consolidation.groups.manage', 'consolidation', 'Manage consolidation groups & membership (PHASE-034)'),
('consolidation.eliminations.create', 'consolidation', 'Author elimination entries (DRAFT, PHASE-034)'),
('consolidation.eliminations.post', 'consolidation', 'Post/reverse eliminations via the engine — SoD (PHASE-034)'),
('consolidation.runs.execute', 'consolidation', 'Execute read-only consolidation runs (PHASE-034)'),
('consolidation.reports.view', 'consolidation', 'Run consolidated statements & eliminations log (PHASE-034)')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO erp._schema_state (key, value) VALUES ('schema_version', 37) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
