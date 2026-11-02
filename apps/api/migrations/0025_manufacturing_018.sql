-- PHASE-018 · migration 0025 · manufacturing module (BOM, production orders,
-- batch-tracked consumption, costing, scrap, QC, genealogy) + food-manufacturing
-- template wiring.
--
-- Purpose (PHASE-018 §4; ADR-0007 — every ledger effect flows through the
-- centralized posting engine; manufacturing never writes journal tables):
-- - manufacturing-owned `bills_of_materials` + `bom_versions` + `bom_lines`
--   (versioned multi-level recipes: components with qty per output UoM, yield,
--   per-component scrap factor, effective dates; a production order binds the
--   BOM version at release).
-- - `production_orders` (lifecycle DRAFT → RELEASED → IN_PROGRESS → COMPLETED /
--   CANCELLED-before-consumption; PRD-{yyyy}-{seq:5} reserved at release,
--   INV-021) with planned vs actual qty, configured labor/overhead absorption
--   rates, journal-entry references per posting step.
-- - `production_consumptions` (order, item, batch, qty, unit cost, journal ref)
--   — the genealogy upstream edges.
-- - `inspections` (QC: target GRN/production order, pass/fail/sampled result,
--   disposition, quarantined batch ref).
-- - `item_batches` gains produced-batch provenance (`production_order_id`) and a
--   QUARANTINED stock status (stock flag, not a ledger state).
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bills_of_materials" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "item_id" uuid NOT NULL REFERENCES "items" ("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "uom" text NOT NULL DEFAULT 'EA',
  "is_active" boolean NOT NULL DEFAULT true,
  "current_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_bom_tenant_item UNIQUE ("tenant_id", "item_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_bom_tenant_item" ON "bills_of_materials" ("tenant_id", "item_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"bills_of_materials"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "bills_of_materials" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "bills_of_materials" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bom_versions" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "bom_id" uuid NOT NULL REFERENCES "bills_of_materials" ("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "effective_from" date NOT NULL,
  "yield_qty" numeric(19,6) NOT NULL DEFAULT 1,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_bom_versions_bom_version UNIQUE ("bom_id", "version"),
  CONSTRAINT ck_bom_versions_yield CHECK ("yield_qty" > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_bom_versions_tenant_bom" ON "bom_versions" ("tenant_id", "bom_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"bom_versions"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "bom_versions" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "bom_versions" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bom_lines" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "bom_version_id" uuid NOT NULL REFERENCES "bom_versions" ("id") ON DELETE CASCADE,
  "component_item_id" uuid NOT NULL REFERENCES "items" ("id") ON DELETE RESTRICT,
  "qty_per_output" numeric(19,6) NOT NULL,
  "scrap_factor_pct" numeric(7,4) NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_bom_lines_version_component UNIQUE ("bom_version_id", "component_item_id"),
  CONSTRAINT ck_bom_lines_qty CHECK ("qty_per_output" > 0),
  CONSTRAINT ck_bom_lines_scrap CHECK ("scrap_factor_pct" >= 0 AND "scrap_factor_pct" < 100)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_bom_lines_tenant_version" ON "bom_lines" ("tenant_id", "bom_version_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"bom_lines"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "bom_lines" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "bom_lines" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "production_orders" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "branch_id" uuid NOT NULL REFERENCES "branches" ("id") ON DELETE RESTRICT,
  "order_no" text NOT NULL,
  "bom_version_id" uuid NOT NULL REFERENCES "bom_versions" ("id") ON DELETE RESTRICT,
  "fg_item_id" uuid NOT NULL REFERENCES "items" ("id") ON DELETE RESTRICT,
  "materials_warehouse_id" uuid NOT NULL REFERENCES "warehouses" ("id") ON DELETE RESTRICT,
  "fg_warehouse_id" uuid NOT NULL REFERENCES "warehouses" ("id") ON DELETE RESTRICT,
  "planned_qty" numeric(19,6) NOT NULL,
  "actual_qty" numeric(19,6) NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'DRAFT',
  "planned_date" date,
  "labor_rate" numeric(19,4) NOT NULL DEFAULT 0,
  "overhead_rate" numeric(19,4) NOT NULL DEFAULT 0,
  "fg_batch_id" uuid,
  "release_journal_entry_id" uuid,
  "completion_journal_entry_id" uuid,
  "released_at" timestamptz,
  "completed_at" timestamptz,
  "cancelled_at" timestamptz,
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_production_orders_tenant_no UNIQUE ("tenant_id", "order_no"),
  CONSTRAINT ck_production_orders_status CHECK ("status" IN ('DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT ck_production_orders_qty CHECK ("planned_qty" > 0 AND "actual_qty" >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_production_orders_tenant_status" ON "production_orders" ("tenant_id", "status");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"production_orders"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "production_orders" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "production_orders" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "production_consumptions" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "production_order_id" uuid NOT NULL REFERENCES "production_orders" ("id") ON DELETE CASCADE,
  "item_id" uuid NOT NULL REFERENCES "items" ("id") ON DELETE RESTRICT,
  "batch_id" uuid REFERENCES "item_batches" ("id") ON DELETE RESTRICT,
  "qty" numeric(19,6) NOT NULL,
  "unit_cost" numeric(19,4) NOT NULL,
  "planned_qty" numeric(19,6),
  "journal_entry_id" uuid,
  "consumed_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_production_consumptions_qty CHECK ("qty" > 0 AND "unit_cost" >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_consumptions_tenant_order" ON "production_consumptions" ("tenant_id", "production_order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_consumptions_tenant_batch" ON "production_consumptions" ("tenant_id", "batch_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"production_consumptions"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "production_consumptions" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "production_consumptions" TO erp_readonly;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspections" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "inspection_no" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "batch_id" uuid REFERENCES "item_batches" ("id") ON DELETE SET NULL,
  "result" text NOT NULL,
  "sample_size" integer NOT NULL DEFAULT 1,
  "disposition" text NOT NULL DEFAULT 'ACCEPT',
  "notes" text,
  "journal_entry_id" uuid,
  "inspected_by" uuid,
  "inspected_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_inspections_tenant_no UNIQUE ("tenant_id", "inspection_no"),
  CONSTRAINT ck_inspections_target CHECK ("target_type" IN ('GRN', 'PRODUCTION_ORDER')),
  CONSTRAINT ck_inspections_result CHECK ("result" IN ('PASS', 'FAIL', 'SAMPLED')),
  CONSTRAINT ck_inspections_disposition CHECK ("disposition" IN ('ACCEPT', 'SCRAP', 'REWORK', 'RETURN_TO_SUPPLIER'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_inspections_tenant_target" ON "inspections" ("tenant_id", "target_type", "target_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"inspections"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "inspections" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "inspections" TO erp_readonly;
--> statement-breakpoint
-- Batch provenance + quarantine status (stock flag, not a ledger state).
ALTER TABLE "item_batches" ADD COLUMN IF NOT EXISTS "production_order_id" uuid REFERENCES "production_orders" ("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "item_batches" DROP CONSTRAINT IF EXISTS ck_item_batches_status_values;
--> statement-breakpoint
ALTER TABLE "item_batches" ADD CONSTRAINT ck_item_batches_status_values CHECK ("status" IN ('ACTIVE', 'QUARANTINED', 'WRITTEN_OFF'));
--> statement-breakpoint
--> statement-breakpoint
-- PHASE-018 T11: full `industry.food_manufacturing` v1.0.0 manifest seed
-- (docs/industries/templates/manifests/manifest.food_manufacturing.json is the
-- source of truth; replaces the 0008 registry stub so the unmodified PHASE-015
-- engine can apply it).
INSERT INTO "industry_templates" ("key", "name", "name_ar", "version", "manifest", "is_active")
VALUES ('industry.food_manufacturing', 'Food Manufacturing', 'التصنيع الغذائي', '1.0.0', $${"id":"industry.food_manufacturing","name":"Food Manufacturing","name_ar":"التصنيع الغذائي","version":"1.0.0","required_feature_keys":["industry.template_engine","manufacturing.bom","manufacturing.production_orders","manufacturing.qc","manufacturing.batch_genealogy","inventory.multi_warehouse","inventory.batch_tracking","inventory.stock_counts","items.price_lists","purchasing.landed_costs"],"default_modules_enabled":["accounting","partners","items","inventory","sales","purchasing","treasury","tax","reporting","manufacturing","configuration"],"terminology_overrides":{"mfg.recipe":{"en":"Recipe (BOM)","ar":"الوصفة (قائمة المواد)"},"mfg.production_order":{"en":"Production order","ar":"أمر الإنتاج"},"mfg.yield":{"en":"Yield","ar":"المردود"},"mfg.scrap":{"en":"Scrap","ar":"الهالك"},"mfg.qc_gate":{"en":"QC gate","ar":"بوابة فحص الجودة"},"mfg.batch_genealogy":{"en":"Batch genealogy","ar":"شجرة الدفعات"},"mfg.semi_finished":{"en":"Semi-finished","ar":"نصف مصنّع"},"item.shelf_life":{"en":"Shelf life (days)","ar":"مدة الصلاحية (أيام)"},"mfg.production_line":{"en":"Production line","ar":"خط الإنتاج"}},"navigation_manifest":{"groups":[{"id":"production","label":{"en":"Production","ar":"الإنتاج"},"order":1,"items":[{"id":"recipes","label":{"en":"Recipes (BOM)","ar":"الوصفات (قائمة المواد)"},"target":"manufacturing.bom"},{"id":"orders","label":{"en":"Production orders","ar":"أوامر الإنتاج"},"target":"manufacturing.orders"},{"id":"qc","label":{"en":"QC inspections","ar":"فحوصات الجودة"},"target":"manufacturing.qc"}]},{"id":"trace","label":{"en":"Traceability","ar":"التتبع"},"order":2,"items":[{"id":"genealogy","label":{"en":"Batch genealogy","ar":"شجرة الدفعات"},"target":"manufacturing.genealogy"},{"id":"expiry","label":{"en":"Expiry control","ar":"الرقابة على الصلاحية"},"target":"inventory.expiry_list"}]}]},"workflow_policies":{"production_qc_gate":"required","fg_batch_expiry_from_shelf_life":true,"scrap_reason_required":true,"consumption_variance_threshold_pct":5,"expiry_writeoff_requires_approval":true,"markdown_requires_approval":false},"document_numbering_defaults":{"production_order":{"prefix":"PRD","format":"PRD-{yyyy}-{seq:5}","per_branch":true,"reserve_on_approval":true},"goods_receipt":{"prefix":"GRN","format":"GRN-{yyyy}-{seq:6}","per_branch":false,"reserve_on_approval":false},"sales_invoice":{"prefix":"INV","format":"INV-{yyyy}-{seq:6}","per_branch":false,"reserve_on_approval":false},"delivery_note":{"prefix":"DLV","format":"DLV-{yyyy}-{seq:5}","per_branch":false,"reserve_on_approval":false},"stock_adjustment":{"prefix":"ADJ","format":"ADJ-{yyyy}-{seq:5}","per_branch":false,"reserve_on_approval":false}},"inventory_policy_defaults":{"costing_method":"WAC","default_track_batch":true,"default_track_expiry":true,"default_track_serial":false,"default_imei_tracking":false,"fefo_picking":true,"allow_negative_stock":false},"report_defaults":[{"report_key":"manufacturing.production_cost","pinned":true,"dashboard":true,"default_period":"this_month"},{"report_key":"manufacturing.batch_genealogy","pinned":true,"dashboard":false,"default_period":"custom"},{"report_key":"manufacturing.qc_inspection_log","pinned":true,"dashboard":false,"default_period":"this_month"},{"report_key":"inventory.expiry_list","pinned":true,"dashboard":true,"default_period":"this_week"},{"report_key":"grocery.expiry_writeoff","pinned":true,"dashboard":false,"default_period":"this_month"}],"onboarding_steps":[{"id":"warehouses","title":{"en":"Raw materials, WIP and finished-goods warehouses","ar":"مستودعات المواد الخام والتشغيل والإنتاج التام"},"required":true},{"id":"coa_confirm","title":{"en":"Confirm chart of accounts (WIP, scrap accounts)","ar":"تأكيد دليل الحسابات (حسابات تحت التشغيل والهالك)"},"required":true},{"id":"recipes","title":{"en":"Recipes with yield","ar":"الوصفات مع المردود"},"required":true},{"id":"materials","title":{"en":"Materials with batches & suppliers","ar":"المواد مع الدفعات والموردون"},"required":true},{"id":"fg_shelf_life","title":{"en":"Finished goods & shelf-life defaults","ar":"المنتجات التامة ومدد الصلاحية"},"required":true},{"id":"first_run","title":{"en":"Run first production order end-to-end","ar":"تنفيذ أول أمر إنتاج كامل"},"required":false},{"id":"outlet","title":{"en":"Optional factory outlet counter","ar":"كاونتر منفذ بيع المصنع (اختياري)"},"required":false,"feature_key":"pos.sales"}],"capability_prerequisites":{"bom_production":{"level":"REQUIRED","feature_keys":["manufacturing.bom","manufacturing.production_orders"],"available_from_phase":"PHASE-018"},"qc_inspections":{"level":"REQUIRED","feature_keys":["manufacturing.qc"],"available_from_phase":"PHASE-018"},"batch_genealogy":{"level":"REQUIRED","feature_keys":["manufacturing.batch_genealogy"],"available_from_phase":"PHASE-018"},"expiry_tracking_fefo":{"level":"REQUIRED","feature_keys":["inventory.batch_tracking"],"available_from_phase":"PHASE-010"},"landed_costs":{"level":"REQUIRED","feature_keys":["purchasing.landed_costs"],"available_from_phase":"PHASE-011"},"barcode_pos":{"level":"OPTIONAL","feature_keys":["pos.terminals","pos.sales","pos.receipts"],"available_from_phase":"PHASE-016"},"cashier_shifts":{"level":"OPTIONAL","feature_keys":["treasury.cashier_shifts"],"available_from_phase":"PHASE-016"},"customer_price_tiers":{"level":"OPTIONAL","feature_keys":["distribution.customer_tiers"],"available_from_phase":"PHASE-017"}}}$$::jsonb, true)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name", "name_ar" = EXCLUDED."name_ar",
  "version" = EXCLUDED."version", "manifest" = EXCLUDED."manifest", "is_active" = true;
--> statement-breakpoint
-- Schema-state marker for /health/ready (mirrors the migration manifest).
INSERT INTO erp._schema_state (key, value) VALUES ('schema_version', 25)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--> statement-breakpoint
