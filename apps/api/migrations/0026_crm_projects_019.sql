-- PHASE-019 · migration 0026 · CRM module (leads, tasks/activities, service
-- contracts + billing schedule, service orders, time entries) + the
-- accounting-owned `projects` analytical dimension (journal_lines.project_id)
-- + full `industry.professional_services` manifest seed.
--
-- Purpose (PHASE-019 §4; ADR-0007 — contracts post nothing; only their
-- generated invoices do, through the ordinary sales invoice chain):
-- - crm-owned `leads` (pipeline NEW/QUALIFIED/CONVERTED/LOST, source, owner,
--   converted-to partner provenance link),
-- - `tasks` + `activities` (reminders via the notifications rails; no ledger),
-- - `service_contracts` + `contract_schedule_lines` (fee model: RETAINER /
--   MILESTONE / HOURLY; renewal state),
-- - `service_orders` + `service_order_lines` (generalization of PHASE-017
--   job cards: service/labor + optional parts lines),
-- - `time_entries` (case/project + fee item, billable flag, narrative),
-- - accounting-owned `projects` (analytical dimension, cost-centers pattern)
--   + `journal_lines.project_id` (additive analytical stamp, engine-written).
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "name_ar" text,
  "status" text NOT NULL DEFAULT 'OPEN',
  "parent_id" uuid REFERENCES "projects" ("id") ON DELETE SET NULL,
  "contract_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_projects_tenant_code UNIQUE ("tenant_id", "code"),
  CONSTRAINT ck_projects_status CHECK ("status" IN ('OPEN', 'CLOSED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_projects_tenant" ON "projects" ("tenant_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"projects"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "projects" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "projects" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "branch_id" uuid NOT NULL REFERENCES "branches" ("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "name_ar" text,
  "source" text NOT NULL DEFAULT 'WALK_IN',
  "status" text NOT NULL DEFAULT 'NEW',
  "owner_rep_id" uuid REFERENCES "sales_reps" ("id") ON DELETE SET NULL,
  "partner_id" uuid REFERENCES "partners" ("id") ON DELETE SET NULL,
  "lost_reason" text,
  "converted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_leads_source CHECK ("source" IN ('WALK_IN', 'WEB', 'REFERRAL', 'CAMPAIGN', 'OTHER')),
  CONSTRAINT ck_leads_status CHECK ("status" IN ('NEW', 'QUALIFIED', 'CONVERTED', 'LOST')),
  CONSTRAINT ck_leads_converted CHECK (("status" = 'CONVERTED') = (converted_at IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_leads_tenant_status" ON "leads" ("tenant_id", "status");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"leads"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "leads" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "leads" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "due_date" date,
  "status" text NOT NULL DEFAULT 'OPEN',
  "lead_id" uuid REFERENCES "leads" ("id") ON DELETE SET NULL,
  "partner_id" uuid REFERENCES "partners" ("id") ON DELETE SET NULL,
  "contract_id" uuid,
  "assigned_to" uuid,
  "reminder_sent" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_tasks_status CHECK ("status" IN ('OPEN', 'DONE', 'CANCELLED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_tasks_tenant_due" ON "tasks" ("tenant_id", "due_date");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"tasks"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "tasks" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "tasks" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activities" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "kind" text NOT NULL DEFAULT 'NOTE',
  "body" text NOT NULL,
  "lead_id" uuid REFERENCES "leads" ("id") ON DELETE SET NULL,
  "partner_id" uuid REFERENCES "partners" ("id") ON DELETE SET NULL,
  "contract_id" uuid,
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_activities_kind CHECK ("kind" IN ('NOTE', 'CALL', 'MEETING', 'EMAIL'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_activities_tenant_partner" ON "activities" ("tenant_id", "partner_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"activities"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "activities" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "activities" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_contracts" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "branch_id" uuid NOT NULL REFERENCES "branches" ("id") ON DELETE RESTRICT,
  "contract_no" text NOT NULL,
  "partner_id" uuid NOT NULL REFERENCES "partners" ("id") ON DELETE RESTRICT,
  "project_id" uuid REFERENCES "projects" ("id") ON DELETE SET NULL,
  "fee_model" text NOT NULL DEFAULT 'RETAINER',
  "status" text NOT NULL DEFAULT 'DRAFT',
  "start_date" date NOT NULL,
  "end_date" date,
  "renewal_state" text NOT NULL DEFAULT 'NONE',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_contracts_tenant_no UNIQUE ("tenant_id", "contract_no"),
  CONSTRAINT ck_contracts_fee_model CHECK ("fee_model" IN ('RETAINER', 'MILESTONE', 'HOURLY')),
  CONSTRAINT ck_contracts_status CHECK ("status" IN ('DRAFT', 'ACTIVE', 'EXPIRED', 'CANCELLED')),
  CONSTRAINT ck_contracts_renewal CHECK ("renewal_state" IN ('NONE', 'AUTO', 'MANUAL'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_contracts_tenant_partner" ON "service_contracts" ("tenant_id", "partner_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"service_contracts"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "service_contracts" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "service_contracts" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contract_schedule_lines" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "contract_id" uuid NOT NULL REFERENCES "service_contracts" ("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "amount" numeric(19,4) NOT NULL,
  "due_date" date,
  "billed_invoice_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_schedule_amount CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_schedule_tenant_contract" ON "contract_schedule_lines" ("tenant_id", "contract_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"contract_schedule_lines"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "contract_schedule_lines" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "contract_schedule_lines" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_orders" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "branch_id" uuid NOT NULL REFERENCES "branches" ("id") ON DELETE RESTRICT,
  "order_no" text NOT NULL,
  "contract_id" uuid REFERENCES "service_contracts" ("id") ON DELETE SET NULL,
  "partner_id" uuid NOT NULL REFERENCES "partners" ("id") ON DELETE RESTRICT,
  "project_id" uuid REFERENCES "projects" ("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_service_orders_tenant_no UNIQUE ("tenant_id", "order_no"),
  CONSTRAINT ck_service_orders_status CHECK ("status" IN ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_service_orders_tenant_status" ON "service_orders" ("tenant_id", "status");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"service_orders"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "service_orders" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "service_orders" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_order_lines" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "service_order_id" uuid NOT NULL REFERENCES "service_orders" ("id") ON DELETE CASCADE,
  "line_type" text NOT NULL DEFAULT 'SERVICE',
  "description" text NOT NULL,
  "qty" numeric(19,6) NOT NULL DEFAULT 1,
  "unit_price" numeric(19,4) NOT NULL DEFAULT 0,
  "item_id" uuid REFERENCES "items" ("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_order_lines_type CHECK ("line_type" IN ('SERVICE', 'PARTS'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_order_lines_tenant_order" ON "service_order_lines" ("tenant_id", "service_order_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"service_order_lines"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "service_order_lines" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "service_order_lines" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "time_entries" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects" ("id") ON DELETE RESTRICT,
  "fee_item_id" uuid NOT NULL REFERENCES "items" ("id") ON DELETE RESTRICT,
  "hours" numeric(9,4) NOT NULL,
  "billable" boolean NOT NULL DEFAULT true,
  "narrative" text,
  "billed" boolean NOT NULL DEFAULT false,
  "entry_date" date NOT NULL,
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_time_hours CHECK ("hours" > 0),
  CONSTRAINT ck_time_billed_narrative CHECK (NOT billable OR narrative IS NOT NULL OR billed)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_time_tenant_project" ON "time_entries" ("tenant_id", "project_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"time_entries"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "time_entries" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "time_entries" TO erp_readonly;
--> statement-breakpoint
-- Projects as an analytical stamp on journal lines (engine-written, not a GL split).
ALTER TABLE "journal_lines" ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "projects" ("id") ON DELETE SET NULL;
--> statement-breakpoint
-- PHASE-019 T11: full `industry.professional_services` v1.0.0 manifest seed
-- (docs/industries/templates/manifests/manifest.professional_services.json is
-- the source of truth; replaces the 0008 registry stub).
INSERT INTO "industry_templates" ("key", "name", "name_ar", "version", "manifest", "is_active")
VALUES ('industry.professional_services', 'Professional Services', 'المكاتب المهنية', '1.0.0', '{"id":"industry.professional_services","name":"Professional Services","name_ar":"المكاتب المهنية","version":"1.0.0","required_feature_keys":["industry.template_engine","items.item_master","crm.service_contracts","crm.recurring_billing","accounting.projects","sales.invoices","partners.statements"],"default_modules_enabled":["accounting","partners","items","sales","treasury","tax","reporting","crm","configuration"],"terminology_overrides":{"svc.case":{"en":"Case / Matter","ar":"القضية / الملف"},"svc.time_entry":{"en":"Time entry","ar":"تسجيل الوقت"},"svc.timesheet":{"en":"Timesheet","ar":"كشف الساعات"},"svc.billable":{"en":"Billable","ar":"قابل للفوترة"},"fee.fixed_fee":{"en":"Fixed fee","ar":"أتعاب مقطوعة"},"fee.hourly":{"en":"Hourly fee","ar":"أتعاب بالساعة"},"fee.retainer":{"en":"Retainer","ar":"أتعاب دورية"},"billing.milestone":{"en":"Milestone","ar":"دفعة مرحلية"},"doc.contract":{"en":"Service contract","ar":"عقد الخدمات"},"acc.project":{"en":"Project","ar":"المشروع"}},"navigation_manifest":{"groups":[{"id":"practice","label":{"en":"Practice","ar":"المكتب"},"order":1,"items":[{"id":"cases","label":{"en":"Cases / Projects","ar":"القضايا / المشاريع"},"target":"accounting.projects"},{"id":"timesheets","label":{"en":"Time & timesheets","ar":"الوقت وكشوف الساعات"},"target":"crm.time"},{"id":"contracts","label":{"en":"Service contracts","ar":"عقود الخدمات"},"target":"crm.contracts"}]},{"id":"billing","label":{"en":"Billing","ar":"الفوترة"},"order":2,"items":[{"id":"recurring","label":{"en":"Recurring invoices","ar":"الفواتير الدورية"},"target":"crm.recurring_billing"},{"id":"invoices","label":{"en":"Invoices","ar":"الفواتير"},"target":"sales.invoices"},{"id":"statements","label":{"en":"Client statements","ar":"كشوف حسابات العملاء"},"target":"partners.statements"}]}]},"workflow_policies":{"contract_billing_mode":"retainer_or_milestones","time_entries_require_case":true,"unbilled_time_review_before_invoice":true,"invoice_approval_required":true,"invoice_numbering_per_series":false,"narrative_required_on_time_billing":true},"document_numbering_defaults":{"contract_invoice":{"prefix":"INV","format":"INV-{yyyy}-{seq:6}","per_branch":false,"reserve_on_approval":false},"sales_invoice":{"prefix":"INV","format":"INV-{yyyy}-{seq:6}","per_branch":false,"reserve_on_approval":false},"receipt":{"prefix":"RCP","format":"RCP-{yyyy}-{seq:6}","per_branch":false,"reserve_on_approval":false},"credit_note":{"prefix":"CN","format":"CN-{yyyy}-{seq:5}","per_branch":false,"reserve_on_approval":false}},"inventory_policy_defaults":{"costing_method":"WAC","default_track_batch":false,"default_track_expiry":false,"default_track_serial":false,"default_imei_tracking":false,"fefo_picking":false,"allow_negative_stock":false},"report_defaults":[{"report_key":"services.contract_revenue_schedule","pinned":true,"dashboard":true,"default_period":"this_month"},{"report_key":"services.time_billing_summary","pinned":true,"dashboard":true,"default_period":"this_month"},{"report_key":"partners.ar_aging","pinned":true,"dashboard":false,"default_period":"this_month"},{"report_key":"sales.commissions_due","pinned":true,"dashboard":false,"default_period":"this_month"}],"onboarding_steps":[{"id":"coa_confirm","title":{"en":"Confirm chart of accounts (fee revenue natures)","ar":"تأكيد دليل الحسابات (طبيعة إيرادات الأتعاب)"},"required":true},{"id":"clients","title":{"en":"Clients & engagement contacts","ar":"العملاء وجهات التعامل"},"required":true},{"id":"fee_items","title":{"en":"Fee items (hourly, fixed, disbursements)","ar":"بنود الأتعاب (بالساعة، مقطوعة، مصروفات نائبة)"},"required":true},{"id":"first_contract","title":{"en":"First service contract","ar":"أول عقد خدمات"},"required":true},{"id":"billing_run","title":{"en":"Run first recurring billing cycle","ar":"تشغيل أول دورة فوترة دورية"},"required":false},{"id":"projects","title":{"en":"Open projects/cases","ar":"فتح المشاريع/القضايا"},"required":false}],"capability_prerequisites":{"service_contracts":{"level":"REQUIRED","feature_keys":["crm.service_contracts"],"available_from_phase":"PHASE-019"},"recurring_billing":{"level":"REQUIRED","feature_keys":["crm.recurring_billing"],"available_from_phase":"PHASE-019"},"deposits_late_fees":{"level":"OPTIONAL","feature_keys":["crm.contract_deposits","crm.late_fees"],"available_from_phase":"PHASE-019"},"commissions":{"level":"OPTIONAL","feature_keys":["sales.commissions"],"available_from_phase":"PHASE-017"},"job_cards":{"level":"OPTIONAL","feature_keys":["sales.job_cards"],"available_from_phase":"PHASE-017"}}}', true)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name", "name_ar" = EXCLUDED."name_ar",
  "version" = EXCLUDED."version", "manifest" = EXCLUDED."manifest", "is_active" = true;
--> statement-breakpoint
-- Schema-state marker for /health/ready (mirrors the migration manifest).
INSERT INTO erp._schema_state (key, value) VALUES ('schema_version', 26)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--> statement-breakpoint
