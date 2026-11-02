-- PHASE-027 T1 — cheques, promissory notes & installments (DR-003, ED-03,
-- BR-045..049, INV-024). Four tenant-owned tables + CHECK-enum domains + RLS.
-- Money NUMERIC(19,4); FX stored per INV-008.

-- Notes register: CHEQUE / PROMISSORY_NOTE, RECEIVED / ISSUED, custody status.
CREATE TABLE IF NOT EXISTS "notes" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "direction" text NOT NULL,
  "number" text NOT NULL, -- the instrument's own number (data, not a sequence — ADR-0006)
  "partner_id" uuid NOT NULL,
  "maturity_date" date NOT NULL, -- BR-045: required
  "issuing_bank" text,
  "amount" numeric(19,4) NOT NULL,
  "currency" text NOT NULL,
  "exchange_rate" numeric(19,4), -- INV-008: stored, never recomputed
  "issue_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'IN_CUSTODY',
  "source_type" text,
  "source_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_notes_tenant_number UNIQUE ("tenant_id", "direction", "number"),
  CONSTRAINT ck_notes_kind CHECK ("kind" IN ('CHEQUE', 'PROMISSORY_NOTE')),
  CONSTRAINT ck_notes_direction CHECK ("direction" IN ('RECEIVED', 'ISSUED')),
  CONSTRAINT ck_notes_amount CHECK ("amount" > 0),
  CONSTRAINT ck_notes_status CHECK ("status" IN ('IN_CUSTODY', 'ENDORSED_OUT', 'DEPOSITED', 'COLLECTED', 'DISHONORED', 'DISCOUNTED', 'RETURNED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_notes_tenant_status" ON "notes" ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_notes_tenant_maturity" ON "notes" ("tenant_id", "maturity_date");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"notes"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "notes" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "notes" TO erp_readonly;
--> statement-breakpoint
-- note_events: APPEND-ONLY custody log (INV-003 pattern; INV-024 audit substrate).
CREATE TABLE IF NOT EXISTS "note_events" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "note_id" uuid NOT NULL REFERENCES "notes" ("id"),
  "event_kind" text NOT NULL,
  "event_date" date NOT NULL,
  "reason" text,
  "journal_entry_id" uuid,
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_note_events_kind CHECK ("event_kind" IN ('ENDORSE', 'DEPOSIT', 'COLLECT', 'DISHONOR', 'DISCOUNT', 'RETURN', 'RECLASSIFY'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_note_events_note" ON "note_events" ("tenant_id", "note_id");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"note_events"');
--> statement-breakpoint
GRANT SELECT, INSERT ON "note_events" TO erp_app; -- append-only
--> statement-breakpoint
GRANT SELECT ON "note_events" TO erp_readonly;
--> statement-breakpoint
-- Installment plans over credit sales invoices / service contracts (BR-048).
CREATE TABLE IF NOT EXISTS "installment_plans" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "partner_id" uuid NOT NULL,
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "total_amount" numeric(19,4) NOT NULL,
  "down_payment" numeric(19,4) NOT NULL DEFAULT 0,
  "count" integer NOT NULL,
  "start_date" date NOT NULL,
  "frequency" text NOT NULL,
  "late_fee_policy" jsonb NOT NULL DEFAULT '{}'::jsonb, -- PLACEHOLDER defaults (OQ-002 family); flat fees only, never interest (DR-003)
  "status" text NOT NULL DEFAULT 'DRAFT',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_installment_plans_total CHECK ("total_amount" > 0),
  CONSTRAINT ck_installment_plans_count CHECK ("count" > 0),
  CONSTRAINT ck_installment_plans_down CHECK ("down_payment" >= 0 AND "down_payment" < "total_amount"),
  CONSTRAINT ck_installment_plans_freq CHECK ("frequency" IN ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY')),
  CONSTRAINT ck_installment_plans_status CHECK ("status" IN ('DRAFT', 'ACTIVE', 'CLOSED', 'DEFAULTED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_installment_plans_tenant" ON "installment_plans" ("tenant_id", "status");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"installment_plans"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "installment_plans" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "installment_plans" TO erp_readonly;
--> statement-breakpoint
-- Installment lines: schedule immutable after activation (BR-048); OVERDUE job-derived only.
CREATE TABLE IF NOT EXISTS "installment_lines" (
  "id" uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "plan_id" uuid NOT NULL REFERENCES "installment_plans" ("id"),
  "seq" integer NOT NULL,
  "due_date" date NOT NULL,
  "amount" numeric(19,4) NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "receipt_refs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_installment_lines_plan_seq UNIQUE ("tenant_id", "plan_id", "seq"),
  CONSTRAINT ck_installment_lines_amount CHECK ("amount" > 0),
  CONSTRAINT ck_installment_lines_status CHECK ("status" IN ('PENDING', 'DUE', 'PAID', 'OVERDUE', 'WAIVED'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_installment_lines_plan" ON "installment_lines" ("tenant_id", "plan_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_installment_lines_due" ON "installment_lines" ("tenant_id", "due_date", "status");
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"installment_lines"');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "installment_lines" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "installment_lines" TO erp_readonly;
--> statement-breakpoint
-- PHASE-027 permission keys (§3.12).
INSERT INTO "permissions" ("key", "module", "description") VALUES
('notes.notes.view', 'notes', 'View notes register (PHASE-027)'),
('notes.notes.create', 'notes', 'Record received/issued notes (PHASE-027)'),
('notes.notes.endorse', 'notes', 'Endorse a note out of custody (PHASE-027)'),
('notes.notes.deposit', 'notes', 'Deposit a note to the bank (PHASE-027)'),
('notes.notes.record_dishonor', 'notes', 'Record a dishonor with reason (PHASE-027)'),
('notes.notes.discount', 'notes', 'Discount a note (audited, PHASE-027)'),
('notes.notes.return', 'notes', 'Return an unresolved note (audited, PHASE-027)'),
('installments.plans.manage', 'installments', 'Create/activate installment plans (PHASE-027)'),
('installments.lines.waive', 'installments', 'Waive a line with reason (PHASE-027)'),
('reports.notes.calendar.read', 'notes', 'Run notes reports (PHASE-027)'),
('reports.installments.aging.read', 'installments', 'Run installment reports (PHASE-027)')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO erp._schema_state (key, value) VALUES ('schema_version', 29) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--> statement-breakpoint
