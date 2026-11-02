-- PHASE-017 · migration 0024 · industry templates: automotive & distribution
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
  CONSTRAINT ck_vehicles_vin_shape CHECK ("vin" IS NULL OR "vin" ~ '^[A-HJ-NPR-Z0-9]{17}$')
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
  "updated_at" timestamptz NOT NULL DEFAULT now(),
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
  "updated_at" timestamptz NOT NULL DEFAULT now(),
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
  "updated_at" timestamptz NOT NULL DEFAULT now(),
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
  "updated_at" timestamptz NOT NULL DEFAULT now(),
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
  "updated_at" timestamptz NOT NULL DEFAULT now(),
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
  "updated_at" timestamptz NOT NULL DEFAULT now(),
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
VALUES ('industry.automotive', 'Automotive & Workshop', 'قطع الغيار والالورش', '1.0.0', $${"id":"industry.automotive","name":"Automotive & Workshop","name_ar":"قطع الغيار والورش","version":"1.0.0","required_feature_keys":["industry.template_engine","items.barcodes","items.price_lists","inventory.multi_warehouse","inventory.serial_tracking","inventory.reservations","sales.quotations","sales.job_cards","sales.reps","treasury.cashier_shifts"],"default_modules_enabled":["accounting","partners","items","inventory","sales","purchasing","treasury","tax","reporting","configuration"],"terminology_overrides":{"svc.job_card":{"en":"Job card","ar":"بطاقة عمل"},"fleet.vehicle":{"en":"Vehicle","ar":"المركبة"},"svc.labor":{"en":"Labor","ar":"أجور العمل"},"vehicle.make":{"en":"Make","ar":"الصانع"},"vehicle.model":{"en":"Model","ar":"الطراز"},"vehicle.chassis_no":{"en":"Chassis number (VIN)","ar":"رقم الهيكل"},"vehicle.odometer":{"en":"Odometer","ar":"عداد المسافة"},"svc.diagnosis":{"en":"Diagnosis","ar":"الفحص والتشخيص"},"svc.technician":{"en":"Technician","ar":"الفني"},"svc.service_history":{"en":"Service history","ar":"سجل الصيانة"},"part.warranty":{"en":"Parts warranty","ar":"ضمان قطع الغيار"}},"navigation_manifest":{"groups":[{"id":"workshop","label":{"en":"Workshop","ar":"الورشة"},"order":1,"items":[{"id":"job_cards","label":{"en":"Job cards","ar":"بطاقات العمل"},"target":"sales.job_cards"},{"id":"vehicles","label":{"en":"Vehicles","ar":"المركبات"},"target":"partners.vehicles"},{"id":"quotes","label":{"en":"Diagnosis quotes","ar":"عروض التشخيص"},"target":"sales.quotations"}]},{"id":"parts","label":{"en":"Parts","ar":"قطع الغيار"},"order":2,"items":[{"id":"parts_stock","label":{"en":"Parts stock","ar":"مخزون القطع"},"target":"inventory.on_hand"},{"id":"purchasing","label":{"en":"Parts purchasing","ar":"شراء القطع"},"target":"purchasing.orders"},{"id":"counter","label":{"en":"Counter sale","ar":"بيع الكاونتر"},"target":"pos.counter","feature_key":"pos.sales"}]}]},"workflow_policies":{"job_card_parts_issue_mode":"reserve","job_card_labor_rate_source":"price_list","quotation_validity_days":7,"invoice_approval_required_over":0,"warranty_credit_note_requires_original_invoice":true,"shift_variance_approval_required":true},"document_numbering_defaults":{"job_card":{"prefix":"JC","format":"JC-{yyyy}-{seq:5}","per_branch":true,"reserve_on_approval":false},"quotation":{"prefix":"QT","format":"QT-{yyyy}-{seq:5}","per_branch":false,"reserve_on_approval":false},"sales_invoice":{"prefix":"INV","format":"INV-{yyyy}-{seq:6}","per_branch":false,"reserve_on_approval":false},"credit_note":{"prefix":"CN","format":"CN-{yyyy}-{seq:5}","per_branch":false,"reserve_on_approval":false},"purchase_order":{"prefix":"PO","format":"PO-{yyyy}-{seq:5}","per_branch":false,"reserve_on_approval":true}},"inventory_policy_defaults":{"costing_method":"WAC","default_track_batch":false,"default_track_expiry":false,"default_track_serial":false,"default_imei_tracking":false,"fefo_picking":false,"allow_negative_stock":false},"report_defaults":[{"report_key":"automotive.job_card_profitability","pinned":true,"dashboard":true,"default_period":"this_month"},{"report_key":"automotive.vehicle_service_history","pinned":true,"dashboard":false,"default_period":"custom"},{"report_key":"inventory.stock_valuation","pinned":true,"dashboard":false,"default_period":"custom"},{"report_key":"partners.ar_aging","pinned":true,"dashboard":false,"default_period":"this_month"}],"onboarding_steps":[{"id":"branch_bays","title":{"en":"Branch, workshop & bays","ar":"الفرع والورشة والمواقف"},"required":true},{"id":"coa_confirm","title":{"en":"Confirm chart of accounts (parts vs labor revenue)","ar":"تأكيد دليل الحسابات (إيراد القطع مقابل أجور العمل)"},"required":true},{"id":"labor_rates","title":{"en":"Labor rate price lists","ar":"قوائم أسعار أجور العمل"},"required":true},{"id":"parts_catalog","title":{"en":"Parts catalog & suppliers","ar":"كتالوج القطع والموردون"},"required":true},{"id":"opening_stock","title":{"en":"Opening parts stock","ar":"رصيد القطع الافتتاحي"},"required":true},{"id":"vehicles","title":{"en":"Import customer vehicles","ar":"استيراد مركبات العملاء"},"required":false},{"id":"first_job","title":{"en":"Run a first job card end-to-end","ar":"تنفيذ أول بطاقة عمل كاملة"},"required":false}],"capability_prerequisites":{"job_cards":{"level":"REQUIRED","feature_keys":["sales.job_cards"],"available_from_phase":"PHASE-017"},"commissions":{"level":"OPTIONAL","feature_keys":["sales.commissions"],"available_from_phase":"PHASE-017"},"barcode_pos":{"level":"OPTIONAL","feature_keys":["pos.terminals","pos.sales","pos.receipts"],"available_from_phase":"PHASE-016"},"service_contracts":{"level":"OPTIONAL","feature_keys":["crm.service_contracts"],"available_from_phase":"PHASE-019"},"landed_costs":{"level":"OPTIONAL","feature_keys":["purchasing.landed_costs"],"available_from_phase":"PHASE-011"},"qc_inspections":{"level":"OPTIONAL","feature_keys":["manufacturing.qc"],"available_from_phase":"PHASE-018"}}}$$::jsonb, true)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name", "name_ar" = EXCLUDED."name_ar",
  "version" = EXCLUDED."version", "manifest" = EXCLUDED."manifest", "is_active" = true;
--> statement-breakpoint
INSERT INTO "industry_templates" ("key", "name", "name_ar", "version", "manifest", "is_active")
VALUES ('industry.distribution', 'Distribution & Field Sales', 'التوزيع والمبيعات الميدانية', '1.0.0', $${"id":"industry.distribution","name":"Distribution & Field Sales","name_ar":"التوزيع والمبيعات الميدانية","version":"1.0.0","required_feature_keys":["industry.template_engine","distribution.routes","distribution.van_stock","distribution.settlements","treasury.receipts_disbursements","distribution.customer_tiers","sales.discount_management","sales.reps","sales.commissions","inventory.multi_warehouse","inventory.stock_transfers","inventory.batch_tracking","treasury.cashier_shifts"],"default_modules_enabled":["accounting","partners","items","inventory","sales","purchasing","treasury","tax","reporting","distribution","configuration"],"terminology_overrides":{"route.route":{"en":"Route","ar":"خط السير"},"route.visit":{"en":"Visit","ar":"الزيارة"},"van.van_stock":{"en":"Van stock","ar":"مخزون السيارة"},"van.load_out":{"en":"Load-out","ar":"التحميل الصباحي"},"van.unload":{"en":"Evening unload","ar":"التنزيل المسائي"},"settlement.rep_settlement":{"en":"Rep settlement","ar":"تسوية المندوب"},"settlement.variance":{"en":"Cash variance","ar":"فرق الصندوق"},"billing.collection":{"en":"Collection","ar":"التحصيل"},"price.tier":{"en":"Customer tier","ar":"فئة العميل"},"promo.free_goods":{"en":"Free goods","ar":"بضاعة مجانية"},"hr.field_rep":{"en":"Sales rep (van)","ar":"مندوب التوزيع"}},"navigation_manifest":{"groups":[{"id":"field","label":{"en":"Field operations","ar":"العمليات الميدانية"},"order":1,"items":[{"id":"routes","label":{"en":"Routes & visits","ar":"خطوط السير والزيارات"},"target":"distribution.routes"},{"id":"van_stock","label":{"en":"Van stock","ar":"مخزون السيارة"},"target":"distribution.van_stock"},{"id":"collections","label":{"en":"Collections","ar":"التحصيل"},"target":"distribution.collections"}]},{"id":"settle","label":{"en":"Settlements","ar":"التسويات"},"order":2,"items":[{"id":"rep_settlements","label":{"en":"Rep settlements","ar":"تسويات المندوبين"},"target":"distribution.settlements"},{"id":"commissions","label":{"en":"Commissions","ar":"العمولات"},"target":"sales.commissions"}]}]},"workflow_policies":{"van_loadout_requires_transfer":true,"settlement_required_daily":true,"settlement_variance_approval_required":true,"collection_receipt_at_visit":true,"tier_price_automatic_by_partner":true,"credit_sale_credit_limit_enforced":true,"free_goods_require_reason_code":true},"document_numbering_defaults":{"stock_transfer":{"prefix":"LOD","format":"LOD-{yyyy}-{seq:5}","per_branch":false,"reserve_on_approval":false},"sales_invoice":{"prefix":"INV","format":"INV-{yyyy}-{seq:6}","per_branch":false,"reserve_on_approval":false},"credit_note":{"prefix":"CN","format":"CN-{yyyy}-{seq:5}","per_branch":false,"reserve_on_approval":false},"receipt":{"prefix":"RCP","format":"RCP-{yyyy}-{seq:6}","per_branch":false,"reserve_on_approval":false},"settlement":{"prefix":"STL","format":"STL-{yyyy}-{seq:5}","per_branch":false,"reserve_on_approval":false}},"inventory_policy_defaults":{"costing_method":"WAC","default_track_batch":true,"default_track_expiry":true,"default_track_serial":false,"default_imei_tracking":false,"fefo_picking":true,"allow_negative_stock":false},"report_defaults":[{"report_key":"distribution.rep_settlement","pinned":true,"dashboard":true,"default_period":"this_week"},{"report_key":"distribution.van_stock_balances","pinned":true,"dashboard":true,"default_period":"today"},{"report_key":"distribution.route_visit_compliance","pinned":true,"dashboard":true,"default_period":"this_month"},{"report_key":"sales.discount_management_effectiveness","pinned":true,"dashboard":false,"default_period":"this_month"},{"report_key":"sales.commissions_due","pinned":true,"dashboard":false,"default_period":"this_month"}],"onboarding_steps":[{"id":"main_warehouse","title":{"en":"Main warehouse & van fleet","ar":"المستودع الرئيسي وأسطول السيارات"},"required":true},{"id":"coa_confirm","title":{"en":"Confirm chart of accounts (rep cash account)","ar":"تأكيد دليل الحسابات (حساب نقديات المندوب)"},"required":true},{"id":"reps_vans","title":{"en":"Create reps, vans & assign routes","ar":"إنشاء المندوبين والسيارات وإسناد خطوط السير"},"required":true},{"id":"tiers","title":{"en":"Customer tiers & price lists","ar":"فئات العملاء وقوائم الأسعار"},"required":true},{"id":"customers","title":{"en":"Route customers with credit terms","ar":"عملاء الخطوط وشروط الدفع"},"required":true},{"id":"opening_stock","title":{"en":"Opening stock with batches","ar":"المخزون الافتتاحي مع الدفعات"},"required":true},{"id":"first_day","title":{"en":"Run first load-out → visits → settlement","ar":"تنفيذ أول يوم: تحميل، زيارات، تسوية"},"required":false}],"capability_prerequisites":{"van_stock":{"level":"REQUIRED","feature_keys":["distribution.van_stock"],"available_from_phase":"PHASE-017"},"route_planning":{"level":"REQUIRED","feature_keys":["distribution.routes"],"available_from_phase":"PHASE-017"},"field_collections":{"level":"REQUIRED","feature_keys":["treasury.receipts_disbursements"],"available_from_phase":"PHASE-017"},"customer_price_tiers":{"level":"REQUIRED","feature_keys":["distribution.customer_tiers"],"available_from_phase":"PHASE-017"},"free_goods_promo":{"level":"REQUIRED","feature_keys":["sales.discount_management","distribution.free_goods"],"available_from_phase":"PHASE-017"},"commissions":{"level":"REQUIRED","feature_keys":["sales.commissions"],"available_from_phase":"PHASE-017"},"cashier_shifts":{"level":"REQUIRED","feature_keys":["treasury.cashier_shifts"],"available_from_phase":"PHASE-016"},"expiry_tracking_fefo":{"level":"REQUIRED","feature_keys":["inventory.batch_tracking"],"available_from_phase":"PHASE-010"},"landed_costs":{"level":"OPTIONAL","feature_keys":["purchasing.landed_costs"],"available_from_phase":"PHASE-011"}}}$$::jsonb, true)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name", "name_ar" = EXCLUDED."name_ar",
  "version" = EXCLUDED."version", "manifest" = EXCLUDED."manifest", "is_active" = true;
--> statement-breakpoint
INSERT INTO erp._schema_state (key, value) VALUES ('schema_version', 24)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
