-- PHASE-016 · migration 0023 · POS module + narrow offline sync slice
--
-- Purpose (PHASE-016 §4; SYNC_PROTOCOL §11 boundary — binding):
-- - `pos_terminals` — terminal registry per branch: code, device link (one
--   terminal = one device), till cash account, receipt size, lifecycle.
-- - `sales_invoices` POS channel columns: pos_terminal_id, order_type,
--   table_ref (offline_receipt_no already exists from PHASE-012).
-- - `cashier_shifts` gains pos_terminal_id (runtime writes stay treasury-owned).
-- - Narrow sync slice: `change_log` (POS feed-group writer target),
--   `sync_cursors`, `sync_commands` (per-command idempotency + result replay —
--   the second dedupe layer required by §11; full inbox_commands is PHASE-020).
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pos_terminals" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "branch_id" uuid NOT NULL REFERENCES "branches" ("id") ON DELETE RESTRICT,
  "device_id" uuid REFERENCES "devices" ("id") ON DELETE SET NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "cash_account_id" uuid NOT NULL REFERENCES "cash_accounts" ("id") ON DELETE RESTRICT,
  "receipt_size_mm" integer NOT NULL DEFAULT 80,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "activated_at" timestamptz NOT NULL DEFAULT now(),
  "deactivated_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_pos_terminals_code_shape CHECK ("code" ~ '^[A-Z0-9-]{2,20}$'),
  CONSTRAINT ck_pos_terminals_size CHECK ("receipt_size_mm" IN (80, 58)),
  CONSTRAINT ck_pos_terminals_status CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT uq_pos_terminals_tenant_code UNIQUE ("tenant_id", "code")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_pos_terminals_tenant_branch" ON "pos_terminals" ("tenant_id", "branch_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"pos_terminals"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "pos_terminals" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "pos_terminals" TO erp_readonly;
--> statement-breakpoint
-- POS channel fields on the sales invoice chain (additive).
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "pos_terminal_id" uuid REFERENCES "pos_terminals" ("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "order_type" text;
--> statement-breakpoint
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "table_ref" text;
--> statement-breakpoint
ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "sync_state" text NOT NULL DEFAULT 'SYNCED';
--> statement-breakpoint
ALTER TABLE "sales_invoices" ADD CONSTRAINT ck_sales_invoices_sync_state CHECK ("sync_state" IN ('SYNCED', 'PENDING_SYNC', 'POSTED'));
--> statement-breakpoint
ALTER TABLE "sales_invoices" ADD CONSTRAINT ck_sales_invoices_order_type CHECK ("order_type" IS NULL OR "order_type" IN ('DINE_IN', 'TAKEAWAY', 'DELIVERY', 'COUNTER'));
--> statement-breakpoint
-- Treasury shift gains terminal linkage (writes remain treasury-owned).
ALTER TABLE "cashier_shifts" ADD COLUMN IF NOT EXISTS "pos_terminal_id" uuid REFERENCES "pos_terminals" ("id") ON DELETE SET NULL;
--> statement-breakpoint
-- Narrow sync slice (SYNC_PROTOCOL §11): POS feed group only.
CREATE TABLE IF NOT EXISTS "change_log" (
  "seq" bigserial NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "op" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_change_log PRIMARY KEY ("tenant_id", "seq"),
  CONSTRAINT ck_change_log_entity CHECK ("entity_type" ~ '^[a-z_]{2,40}$'),
  CONSTRAINT ck_change_log_op CHECK ("op" IN ('INSERT', 'UPDATE', 'DELETE'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_change_log_tenant_seq" ON "change_log" ("tenant_id", "seq");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"change_log"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "change_log" TO erp_app; -- RLS confines; append-only enforced by trigger in the sync writer contract
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_cursors" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "device_id" uuid NOT NULL REFERENCES "devices" ("id") ON DELETE CASCADE,
  "entity_type" text NOT NULL,
  "cursor" bigint NOT NULL DEFAULT 0,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sync_cursors UNIQUE ("tenant_id", "device_id", "entity_type")
);
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"sync_cursors"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "sync_cursors" TO erp_app;
--> statement-breakpoint
-- Per-command idempotency + result replay (INV-013 second layer; §11 dedupe).
CREATE TABLE IF NOT EXISTS "sync_commands" (
  "idempotency_key" text NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "device_id" uuid REFERENCES "devices" ("id") ON DELETE SET NULL,
  "command_type" text NOT NULL,
  "client_id" uuid NOT NULL,
  "status" text NOT NULL,
  "result" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_sync_commands PRIMARY KEY ("tenant_id", "idempotency_key"),
  CONSTRAINT ck_sync_commands_type CHECK ("command_type" IN ('pos_sale', 'cashier_shift', 'partner_create')),
  CONSTRAINT ck_sync_commands_status CHECK ("status" IN ('ACCEPTED', 'REJECTED', 'DEFERRED'))
);
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"sync_commands"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "sync_commands" TO erp_app; -- RLS confines; result rows are replaced only via idempotent replay
--> statement-breakpoint
-- PHASE-016 T2/T5 permission keys (normative seed rows live in 0004).
INSERT INTO "permissions" ("key", "module", "description") VALUES
('pos.terminals.manage', 'pos', 'Register/activate POS terminals / تسجيل وتفعيل أجهزة نقاط البيع'),
('pos.sales.sell', 'pos', 'Operate the POS sale screen / شاشة البيع السريع'),
('pos.shifts.manage', 'pos', 'Open/close POS shifts with variance / ورديات نقاط البيع'),
('pos.receipts.print', 'pos', 'Print POS receipts 80/58 mm / طباعة الإيصالات')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
-- owner role template receives the new tenant-plane keys (0005's CROSS JOIN predates them).
INSERT INTO "role_permissions" ("role_id", "tenant_id", "permission_id")
SELECT r."id", NULL, p."key"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."key" = 'owner' AND r."tenant_id" IS NULL
  AND p."key" IN ('pos.terminals.manage', 'pos.sales.sell', 'pos.shifts.manage', 'pos.receipts.print')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
--> statement-breakpoint
-- POS-terminal device class (SYNC_PROTOCOL §11: manual enrollment, one terminal = one device).
ALTER TABLE "devices" DROP CONSTRAINT IF EXISTS ck_devices_platform_values;
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT ck_devices_platform_values
  CHECK ("platform" IN ('DESKTOP', 'ANDROID', 'POS_TERMINAL'));
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "change_log_seq_seq" TO erp_app;
--> statement-breakpoint
INSERT INTO erp._schema_state (key, value) VALUES ('schema_version', 23)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
