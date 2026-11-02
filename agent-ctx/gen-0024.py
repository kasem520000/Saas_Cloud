import io, json, os

root = "apps/api"
mig_dir = os.path.join(root, "migrations")

def manifest_json(name):
    p = os.path.join("docs/industries/templates/manifests", name)
    return json.dumps(json.load(io.open(p, encoding="utf-8")), ensure_ascii=False, separators=(",", ":"))

auto = manifest_json("manifest.automotive.json")
dist = manifest_json("manifest.distribution.json")

sql = f"""-- PHASE-017 · migration 0024 · industry templates: automotive & distribution
--
-- Purpose (PHASE-017 §4; industries/templates/manifests/*.json are the source of
-- truth, CI-validated by the manifest schema specs):
-- - seeds `industry.automotive` and `industry.distribution` v1.0.0 full manifests
--   into the platform-owned `industry_templates` registry (applicable via the
--   unmodified PHASE-015 engine).
-- - sales-owned job cards: `job_cards` + `job_card_lines` (lifecycle
--   DRAFT/IN_PROGRESS/COMPLETED/INVOICED/CANCELLED, vehicle ref, parts vs labor
--   line types, issue-mode policy, linked quotation/invoice/credit-note ids).
-- - partners-owned `vehicles` (make/model/VIN/plate/odometer readings).
-- - distribution-owned `routes`, `route_visits`, `rep_settlements`, `van_stocks`
--   read model; `warehouses` gains type VAN + rep binding (additive).
-- - sales-owned `commission_rules` + `commission_runs`.
--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT 'MAIN';
--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN IF NOT EXISTS "rep_id" uuid REFERENCES "sales_reps" ("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "warehouses" DROP CONSTRAINT IF EXISTS ck_warehouses_type;
--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT ck_warehouses_type CHECK ("type" IN ('MAIN', 'VAN'));
--> statement-breakpoint
ALTER TABLE "warehouses" DROP CONSTRAINT IF EXISTS ck_warehouses_van_rep;
--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT ck_warehouses_van_rep CHECK ("type" <> 'VAN' OR "rep_id" IS NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vehicles" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "partner_id" uuid NOT NULL REFERENCES "partners" ("id") ON DELETE CASCADE,
  "make" text NOT NULL,
  "model" text NOT NULL,
  "vin" text,
  "plate" text,
  "odometer_km" integer,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_vehicles_tenant_vin UNIQUE ("tenant_id", "vin"),
  CONSTRAINT ck_vehicles_vin_shape CHECK ("vin" IS NULL OR "vin" ~ '^[A-HJ-NPR-Z0-9]{{17}}$')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_vehicles_tenant_partner" ON "vehicles" ("tenant_id", "partner_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"vehicles"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "vehicles" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "vehicles" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_cards" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "branch_id" uuid NOT NULL REFERENCES "branches" ("id") ON DELETE RESTRICT,
  "card_no" text NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "partners" ("id") ON DELETE RESTRICT,
  "vehicle_id" uuid REFERENCES "vehicles" ("id") ON DELETE SET NULL,
  "sales_rep_id" uuid REFERENCES "sales_reps" ("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "issue_mode" text NOT NULL DEFAULT 'reserve',
  "quotation_id" uuid REFERENCES "quotations" ("id") ON DELETE SET NULL,
  "invoice_id" uuid REFERENCES "sales_invoices" ("id") ON DELETE SET NULL,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_job_cards_tenant_no UNIQUE ("tenant_id", "card_no"),
  CONSTRAINT ck_job_cards_status CHECK ("status" IN ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'CANCELLED')),
  CONSTRAINT ck_job_cards_issue_mode CHECK ("issue_mode" IN ('reserve', 'issue_immediate')),
  CONSTRAINT ck_job_cards_no_invoice_before_completed CHECK ("invoice_id" IS NULL OR "status" IN ('INVOICED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_job_cards_tenant_customer" ON "job_cards" ("tenant_id", "customer_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"job_cards"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "job_cards" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "job_cards" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_card_lines" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "job_card_id" uuid NOT NULL REFERENCES "job_cards" ("id") ON DELETE CASCADE,
  "line_type" text NOT NULL,
  "item_id" uuid REFERENCES "items" ("id") ON DELETE RESTRICT,
  "description" text,
  "qty" numeric(19, 6) NOT NULL,
  "unit_price" numeric(19, 6) NOT NULL,
  "discount_amount" numeric(19, 4) NOT NULL DEFAULT 0,
  "tax_code_id" uuid REFERENCES "tax_codes" ("id") ON DELETE SET NULL,
  "batch_id" uuid REFERENCES "item_batches" ("id") ON DELETE SET NULL,
  "labor_hours" numeric(8, 3),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_jcl_line_type CHECK ("line_type" IN ('PARTS', 'LABOR')),
  CONSTRAINT ck_jcl_parts_item CHECK ("line_type" <> 'PARTS' OR "item_id" IS NOT NULL),
  CONSTRAINT ck_jcl_labor_item CHECK ("line_type" <> 'LABOR' OR "item_id" IS NULL),
  CONSTRAINT ck_jcl_qty CHECK ("qty" > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_jcl_tenant_card" ON "job_card_lines" ("tenant_id", "job_card_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"job_card_lines"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "job_card_lines" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "job_card_lines" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "routes" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "rep_id" uuid NOT NULL REFERENCES "sales_reps" ("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "day_pattern" text NOT NULL DEFAULT 'DAILY',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_routes_day_pattern CHECK ("day_pattern" IN ('DAILY', 'WEEKDAYS', 'CUSTOM'))
);
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"routes"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "routes" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "routes" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "route_visits" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "route_id" uuid NOT NULL REFERENCES "routes" ("id") ON DELETE CASCADE,
  "customer_id" uuid NOT NULL REFERENCES "partners" ("id") ON DELETE CASCADE,
  "planned_date" date NOT NULL,
  "visited_at" timestamptz,
  "source_document_type" text,
  "source_document_id" uuid,
  CONSTRAINT ck_route_visits_source CHECK ("visited_at" IS NULL OR "source_document_id" IS NOT NULL OR "source_document_type" = 'CHECK_IN')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_route_visits_tenant_route_date" ON "route_visits" ("tenant_id", "route_id", "planned_date");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"route_visits"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "route_visits" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "route_visits" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rep_settlements" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "rep_id" uuid NOT NULL REFERENCES "sales_reps" ("id") ON DELETE RESTRICT,
  "settlement_no" text NOT NULL,
  "settlement_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'OPEN',
  "expected_cash" numeric(19, 4) NOT NULL DEFAULT 0,
  "counted_cash" numeric(19, 4),
  "variance_amount" numeric(19, 4),
  "approved_by" uuid,
  "posted_journal_id" uuid REFERENCES "journal_entries" ("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_settlements_tenant_no UNIQUE ("tenant_id", "settlement_no"),
  CONSTRAINT uq_settlements_rep_day UNIQUE ("tenant_id", "rep_id", "settlement_date"),
  CONSTRAINT ck_settlements_status CHECK ("status" IN ('OPEN', 'COUNTED', 'POSTED'))
);
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"rep_settlements"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "rep_settlements" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "rep_settlements" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "van_stocks" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "warehouse_id" uuid NOT NULL REFERENCES "warehouses" ("id") ON DELETE CASCADE,
  "item_id" uuid NOT NULL REFERENCES "items" ("id") ON DELETE CASCADE,
  "qty" numeric(19, 6) NOT NULL,
  "value_amount" numeric(19, 4) NOT NULL,
  "as_of" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_van_stocks PRIMARY KEY ("tenant_id", "warehouse_id", "item_id")
);
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"van_stocks"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "van_stocks" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "van_stocks" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commission_rules" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "rep_id" uuid NOT NULL REFERENCES "sales_reps" ("id") ON DELETE CASCADE,
  "basis" text NOT NULL DEFAULT 'COLLECTED',
  "rate_pct" numeric(7, 4) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_commission_basis CHECK ("basis" IN ('COLLECTED', 'INVOICED')),
  CONSTRAINT ck_commission_rate CHECK ("rate_pct" >= 0 AND "rate_pct" <= 100)
);
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"commission_rules"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "commission_rules" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "commission_rules" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commission_runs" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "run_no" text NOT NULL,
  "period_from" date NOT NULL,
  "period_to" date NOT NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "total_accrual" numeric(19, 4) NOT NULL DEFAULT 0,
  "posted_journal_id" uuid REFERENCES "journal_entries" ("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_commission_runs_tenant_no UNIQUE ("tenant_id", "run_no"),
  CONSTRAINT ck_commission_runs_status CHECK ("status" IN ('DRAFT', 'POSTED'))
);
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"commission_runs"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "commission_runs" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "commission_runs" TO erp_readonly;
--> statement-breakpoint
INSERT INTO "industry_templates" ("key", "name", "name_ar", "version", "manifest", "is_active")
VALUES ('industry.automotive', 'Automotive & Workshop', 'قطع الغيار والورش', '1.0.0', $${auto}$$:jsonb, true)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name", "name_ar" = EXCLUDED."name_ar",
  "version" = EXCLUDED."version", "manifest" = EXCLUDED."manifest", "is_active" = true;
--> statement-breakpoint
INSERT INTO "industry_templates" ("key", "name", "name_ar", "version", "manifest", "is_active")
VALUES ('industry.distribution', 'Distribution & Field Sales', 'التوزيع والمبيعات الميدانية', '1.0.0', $${dist}$$:jsonb, true)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name", "name_ar" = EXCLUDED."name_ar",
  "version" = EXCLUDED."version", "manifest" = EXCLUDED."manifest", "is_active" = true;
--> statement-breakpoint
INSERT INTO erp._schema_state (key, value) VALUES ('schema_version', 24)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
"""

out = os.path.join(mig_dir, "0024_industry_templates_017.sql")
io.open(out, "w", encoding="utf-8").write(sql)
print("wrote", out, len(sql), "bytes")

# journal entry
jp = os.path.join(mig_dir, "meta", "_journal.json")
j = json.load(io.open(jp, encoding="utf-8"))
j["entries"].append({
    "idx": 23,
    "version": "5",
    "when": 1793600000000,
    "tag": "0024_industry_templates_017",
    "breakpoints": True,
})
io.open(jp, "w", encoding="utf-8").write(json.dumps(j, indent=2) + "\n")
print("journal updated, entries:", len(j["entries"]))

# MIGRATIONS manifest
mp = os.path.join(root, "src/infra/db/migrations.ts")
s = io.open(mp, encoding="utf-8").read()
old = '  "0023_pos_offline_slice",\n'
assert old in s
s = s.replace(old, old + '  "0024_industry_templates_017",\n', 1)
io.open(mp, "w", encoding="utf-8").write(s)
print("MIGRATIONS updated")
