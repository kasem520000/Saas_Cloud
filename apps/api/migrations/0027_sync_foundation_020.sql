-- PHASE-020 T1 — offline synchronization foundation (generalizes the PHASE-016
-- POS slice per SYNC_PROTOCOL §11): full tombstones feed, the generalized
-- inbox_commands dedupe registry, the feed index ix_change_log_tenant_entity_seq,
-- and devices sync-state columns (capabilities, contract version, trust flags).
-- Feed tables start EMPTY (expand-contract; no backfill).

-- Soft-delete markers pulled as tombstone items (SYNC_PROTOCOL §2).
CREATE TABLE IF NOT EXISTS "tombstones" (
  "seq" bigint NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "deleted_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_tombstones PRIMARY KEY ("tenant_id", "seq"),
  CONSTRAINT ck_tombstones_entity CHECK ("entity_type" ~ '^[a-z_]{2,40}$')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_tombstones_tenant_seq" ON "tombstones" ("tenant_id", "seq");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"tombstones"');
--> statement-breakpoint
GRANT SELECT, INSERT ON "tombstones" TO erp_app; -- append-only feed slice
--> statement-breakpoint
GRANT SELECT ON "tombstones" TO erp_readonly;
--> statement-breakpoint
-- Generalized inbox: durable per-command dedupe + stored-result replay
-- (SYNC_PROTOCOL §4). Retention >= 30 days enforced by the sync.inbox.retention job.
CREATE TABLE IF NOT EXISTS "inbox_commands" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "device_id" uuid NOT NULL REFERENCES "devices" ("id") ON DELETE CASCADE,
  "command_id" uuid NOT NULL,
  "intent" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "status" text NOT NULL,
  "result" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "duplicate" boolean NOT NULL DEFAULT false,
  "processed_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  CONSTRAINT uq_inbox_device_command UNIQUE ("tenant_id", "device_id", "command_id"),
  CONSTRAINT uq_inbox_tenant_key UNIQUE ("tenant_id", "idempotency_key"),
  CONSTRAINT ck_inbox_status CHECK ("status" IN ('ACCEPTED', 'REJECTED', 'DEFERRED')),
  CONSTRAINT ck_inbox_intent CHECK ("intent" ~ '^[a-z_]{2,40}$')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_inbox_tenant_processed" ON "inbox_commands" ("tenant_id", "processed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_inbox_expires" ON "inbox_commands" ("expires_at");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"inbox_commands"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "inbox_commands" TO erp_app; -- DELETE only via the audited retention job
--> statement-breakpoint
GRANT SELECT ON "inbox_commands" TO erp_readonly;
--> statement-breakpoint
-- Feed index for per-entity cursor windows (CONSTRAINTS_AND_INDEXES phase 020).
CREATE INDEX IF NOT EXISTS "ix_change_log_tenant_entity_seq" ON "change_log" ("tenant_id", "entity_type", "seq");
--> statement-breakpoint
-- Device sync-state columns (SYNC_PROTOCOL §2 / SECURITY_AND_DEVICE_MANAGEMENT §2).
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "capabilities" text[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "contract_version" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "trust_flags" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "attested_at" timestamptz;
--> statement-breakpoint
-- PHASE-020 permission keys (normative seed rows live in 0004).
INSERT INTO "permissions" ("key", "module", "description") VALUES
('sync.devices.register', 'sync', 'Self-enroll a device (attestation-lite) / تسجيل جهاز جديد (PHASE-020)'),
('sync.devices.revoke', 'sync', 'Revoke a device (kill switch) / إبطال جهاز (PHASE-020)'),
('identity.devices.manage', 'identity', 'Admin device registry management / إدارة سجل الأجهزة (PHASE-020)'),
('sync.pull', 'sync', 'Pull change feed pages / سحب صفحات التغييرات (PHASE-020)'),
('sync.push', 'sync', 'Push offline command batches / دفع دفعات الأوامر غير المتصلة (PHASE-020)'),
('sync.health.read', 'sync', 'Sync health dashboard + monitoring / لوحة صحة المزامنة (PHASE-020)')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
-- owner role template receives the new tenant-plane keys (0005's CROSS JOIN predates them).
INSERT INTO "role_permissions" ("role_id", "tenant_id", "permission_id")
SELECT r."id", NULL, p."key"
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."key" = 'owner' AND r."tenant_id" IS NULL
  AND p."key" IN ('sync.devices.register', 'sync.devices.revoke', 'identity.devices.manage', 'sync.pull', 'sync.push', 'sync.health.read')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
--> statement-breakpoint
-- Schema-state marker for /health/ready (mirrors the migration manifest).
INSERT INTO erp._schema_state (key, value) VALUES ('schema_version', 27)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--> statement-breakpoint
