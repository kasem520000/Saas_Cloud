-- PHASE-014 · migration 0021 · subscription billing, usage counters, notifications
--
-- Purpose (PHASE-014 §4; SUBSCRIPTION_AND_ENTITLEMENTS §6–§10; FEATURE_CATALOG
-- §platform; AUTHORIZATION_MATRIX §3.9/§3.10):
-- - `subscriptions` goes LIVE: the status check widens to the lifecycle states
--   (TRIAL / ACTIVE / GRACE / PAST_DUE / SUSPENDED / CANCELLED) and the row
--   gains the trial/grace window columns. The GRACE state drives the read-only
--   product state (typed `subscription_read_only` on state-changing routes;
--   reads, reports, exports and printing stay alive — §8).
-- - `subscription_invoices` — one row per billing period per subscription;
--   created by the sandbox checkout OR the manual-invoicing fallback; both
--   paths land here identically (A-009), distinguished by `paid_via`.
-- - `billing_events` — append-only event log (grants carry no UPDATE/DELETE);
--   `provider_event_id` is UNIQUE for webhook replay protection (INV-013
--   discipline at the billing plane).
-- - `usage_counters` — the read-model of §6 limit counters (documents/month,
--   users, branches, warehouses, terminals, devices), one row per
--   (tenant, counter_key, period). Counters NEVER gate posting (INV-022):
--   they are maintained beside the action, not in front of it.
-- - `notifications` + `notification_preferences` — the billing-critical
--   in-app inbox (PHASE-014 scope; the generalized surface is PHASE-015).
--
-- All five new tables are tenant-scoped via the macro RLS policy and are
-- registered in the isolation A-test registry (SECURITY_TEST_PLAN §2).
--> statement-breakpoint
SET ROLE erp_migrate;

--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- subscriptions: lifecycle columns + widened status set (additive only).
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT IF EXISTS ck_subscriptions_status_values;
--> statement-breakpoint
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "grace_ends_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "dunning_step" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "subscriptions"
  ADD CONSTRAINT ck_subscriptions_status_values CHECK (
    "status" IN ('TRIAL', 'ACTIVE', 'GRACE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED')
  );
--> statement-breakpoint
ALTER TABLE "subscriptions"
  ADD CONSTRAINT ck_subscriptions_grace_window CHECK (
    ("status" <> 'GRACE') OR ("grace_ends_at" IS NOT NULL)
  );

--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Subscription invoices (tenant-scoped; billing history is owner-visible).
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscription_invoices" (
  "id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE RESTRICT,
  "subscription_id" uuid NOT NULL REFERENCES "subscriptions" ("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "version" integer NOT NULL DEFAULT 1,
  "number" text NOT NULL,
  "amount" numeric(19,4) NOT NULL,
  "currency_code" char(3) NOT NULL REFERENCES "currencies" ("code") ON DELETE RESTRICT,
  "status" text NOT NULL DEFAULT 'OPEN',
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "due_date" date NOT NULL,
  "provider_ref" text,
  "paid_via" text,
  "paid_at" timestamptz,
  "created_by" uuid,
  "paid_by" uuid,
  CONSTRAINT pk_subscription_invoices PRIMARY KEY ("id"),
  CONSTRAINT uq_subscription_invoices_id_tenant UNIQUE ("id", "tenant_id"),
  CONSTRAINT uq_subscription_invoices_tenant_number UNIQUE ("tenant_id", "number"),
  CONSTRAINT ck_invoices_status_values CHECK ("status" IN ('OPEN', 'PAID', 'VOID')),
  CONSTRAINT ck_invoices_paid_via CHECK (
    "paid_via" IS NULL OR "paid_via" IN ('PROVIDER', 'MANUAL')
  ),
  CONSTRAINT ck_invoices_paid_shape CHECK (
    ("status" <> 'PAID') OR ("paid_via" IS NOT NULL AND "paid_at" IS NOT NULL)
  ),
  CONSTRAINT ck_invoices_amount_nonnegative CHECK ("amount" >= 0),
  CONSTRAINT ck_invoices_period_window CHECK ("period_start" <= "period_end")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_subscription_invoices_tenant_status
  ON "subscription_invoices" ("tenant_id", "status", "due_date");

--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Billing events: append-only log. `provider_event_id` UNIQUE = replay-safe
-- webhook ingestion. Grants carry no UPDATE/DELETE (append-only by grant).
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_events" (
  "id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "event_type" text NOT NULL,
  "subscription_id" uuid REFERENCES "subscriptions" ("id") ON DELETE RESTRICT,
  "invoice_id" uuid REFERENCES "subscription_invoices" ("id") ON DELETE RESTRICT,
  "provider_event_id" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actor_id" uuid,
  "via_platform_admin" boolean NOT NULL DEFAULT false,
  CONSTRAINT pk_billing_events PRIMARY KEY ("id"),
  CONSTRAINT uq_billing_events_id_tenant UNIQUE ("id", "tenant_id"),
  CONSTRAINT uq_billing_events_provider_event UNIQUE ("tenant_id", "provider_event_id"),
  CONSTRAINT ck_billing_events_type CHECK (
    "event_type" IN (
      'checkout.session.created', 'checkout.session.completed', 'invoice.created', 'invoice.paid',
      'invoice.payment_failed', 'subscription.activated', 'subscription.trial_expiring',
      'subscription.grace_entered', 'subscription.grace_expiring', 'subscription.suspended',
      'subscription.restored', 'subscription.plan_changed', 'payment.manual_recorded',
      'dunning.step'
    )
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_billing_events_tenant_created
  ON "billing_events" ("tenant_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_billing_events_tenant_subscription
  ON "billing_events" ("tenant_id", "subscription_id", "created_at");

--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Usage counters (§6 limit read-model): one row per (tenant, key, period).
-- `documents_per_month` counts POSTED documents of the period; the counter
-- is incremented beside the posting, never in front of it (INV-022).
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_counters" (
  "id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "version" integer NOT NULL DEFAULT 1,
  "counter_key" text NOT NULL,
  "period" date NOT NULL,
  "value" bigint NOT NULL DEFAULT 0,
  CONSTRAINT pk_usage_counters PRIMARY KEY ("id"),
  CONSTRAINT uq_usage_counters_id_tenant UNIQUE ("id", "tenant_id"),
  CONSTRAINT uq_usage_counters_tenant_key_period UNIQUE ("tenant_id", "counter_key", "period"),
  CONSTRAINT ck_usage_counters_key CHECK (
    "counter_key" IN ('users', 'branches', 'warehouses', 'documents_per_month', 'pos_terminals', 'offline_devices')
  ),
  CONSTRAINT ck_usage_counters_value_nonnegative CHECK ("value" >= 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_usage_counters_tenant_key
  ON "usage_counters" ("tenant_id", "counter_key", "period");

--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- In-app notifications (billing-critical subset, PHASE-014): inbox rows are
-- tenant-scoped; `user_id` NULL = tenant-wide (owner-facing events).
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "version" integer NOT NULL DEFAULT 1,
  "user_id" uuid,
  "type" text NOT NULL,
  "title" jsonb NOT NULL,
  "body" jsonb NOT NULL,
  "link" text,
  "read_at" timestamptz,
  CONSTRAINT pk_notifications PRIMARY KEY ("id"),
  CONSTRAINT uq_notifications_id_tenant UNIQUE ("id", "tenant_id"),
  CONSTRAINT ck_notifications_type CHECK (
    "type" IN (
      'limit.warning', 'limit.exceeded',
      'subscription.trial_expiring', 'subscription.grace_entered',
      'subscription.grace_expiring', 'subscription.suspended', 'subscription.restored',
      'subscription.plan_changed', 'subscription.payment_failed',
      'reconciliation.broken', 'assertion.failed', 'invoice.overdue'
    )
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_notifications_tenant_created
  ON "notifications" ("tenant_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_notifications_tenant_unread
  ON "notifications" ("tenant_id", "read_at") WHERE "read_at" IS NULL;

--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Notification preferences: per (tenant, event_type, user_id-or-tenant-wide).
-- Two partial uniques because SQL unique treats NULLs as distinct.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants" ("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "version" integer NOT NULL DEFAULT 1,
  "user_id" uuid,
  "event_type" text NOT NULL,
  "in_app" boolean NOT NULL DEFAULT true,
  "email" boolean NOT NULL DEFAULT false,
  CONSTRAINT pk_notification_preferences PRIMARY KEY ("id"),
  CONSTRAINT uq_notification_preferences_id_tenant UNIQUE ("id", "tenant_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_prefs_tenant_wide
  ON "notification_preferences" ("tenant_id", "event_type") WHERE "user_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_prefs_tenant_user
  ON "notification_preferences" ("tenant_id", "event_type", "user_id") WHERE "user_id" IS NOT NULL;

--> statement-breakpoint
-- RLS (TENANT_ISOLATION §2) — all five new tenant-owned tables.
SELECT erp.apply_tenant_policy('"subscription_invoices"');
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"billing_events"');
--> statement-breakpoint
-- Platform-plane read access on `subscriptions` for the lifecycle sweep (PHASE-014 T4):
-- the due-scan runs in pure platform scope; tenant sessions still see only their own row.
DROP POLICY IF EXISTS platform_select ON "subscriptions";
--> statement-breakpoint
CREATE POLICY platform_select ON "subscriptions" FOR SELECT TO erp_app
  USING (erp.platform_scope_active());
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"usage_counters"');
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"notifications"');
--> statement-breakpoint
SELECT erp.apply_tenant_policy('"notification_preferences"');

--> statement-breakpoint
-- Grants: invoices/counters/preferences/notifications are ordinary mutable
-- tenant rows; billing_events is append-only by grant (SELECT + INSERT).
GRANT SELECT, INSERT, UPDATE ON "subscription_invoices" TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON "billing_events" TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "usage_counters" TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "notifications" TO erp_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "notification_preferences" TO erp_app;
--> statement-breakpoint
GRANT SELECT ON "subscription_invoices", "billing_events", "usage_counters", "notifications", "notification_preferences" TO erp_readonly;
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
GRANT SELECT ON "subscription_invoices", "billing_events", "usage_counters", "notifications", "notification_preferences" TO erp_definer;
--> statement-breakpoint
-- Pre-GUC definer projection for the read-only-grace guard (same pattern as
-- erp.tenant_active_entitlements, migration 0006): the SubscriptionReadOnly
-- guard resolves the flag without entering a tenant UoW.
SET ROLE erp_definer;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION erp.tenant_subscription_read_only(p_tenant uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.subscriptions s
    WHERE s.tenant_id = p_tenant AND s.status = 'GRACE' AND s.grace_ends_at > now()
  );
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION erp.tenant_subscription_read_only(uuid) TO erp_app;
--> statement-breakpoint
-- Pre-GUC definer projection for the UsageLimitsGuard (§6 hard blocks run in
-- the guard layer, BEFORE the tenant UoW exists): plan limits + live counts +
-- the period's counters in one jsonb read.
CREATE OR REPLACE FUNCTION erp.tenant_usage_limits(p_tenant uuid, p_period date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'limits', (
      SELECT p.limits FROM public.subscriptions s
      JOIN public.plans p ON p.id = s.plan_id
      WHERE s.tenant_id = p_tenant AND s.status NOT IN ('CANCELLED', 'SUSPENDED')
      ORDER BY s.created_at DESC LIMIT 1
    ),
    'counters', (
      SELECT COALESCE(jsonb_object_agg(counter_key, value), '{}'::jsonb)
      FROM public.usage_counters WHERE tenant_id = p_tenant AND period = p_period
    ),
    'users', (SELECT COUNT(*) FROM public.memberships WHERE tenant_id = p_tenant AND status = 'ACTIVE'),
    'branches', (SELECT COUNT(*) FROM public.branches WHERE tenant_id = p_tenant AND is_active)
  );
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION erp.tenant_usage_limits(uuid, date) TO erp_app;
--> statement-breakpoint
SET ROLE erp_migrate;

--> statement-breakpoint
-- Schema-state marker for /health/ready (mirrors the migration manifest).
INSERT INTO erp._schema_state (key, value) VALUES ('schema_version', 21)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, at = now();

--> statement-breakpoint
RESET ROLE;
