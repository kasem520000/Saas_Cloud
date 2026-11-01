import { sql } from "drizzle-orm";

import { generateUuidV7 } from "@erp/domain-core";

import { type TenantDb } from "../../../infra/db/client";
import { requireTenantContext } from "../../../infra/db/tenant-context";

/**
 * PHASE-014 billing/usage data access (infrastructure layer; migration
 * 0021). Pure storage — business rules live in the application services.
 * All functions run inside the ambient tenant transaction (RLS-confined);
 * platform-plane billing actions wrap them in withTenantOnTx.
 */

function tenantTx(): TenantDb {
  const context = requireTenantContext();
  if (context.tx === undefined) {
    throw new Error("billing access requires an ambient tenant scope");
  }
  return context.tx;
}

// -- subscriptions (lifecycle rows) ------------------------------------------

export interface SubscriptionLifecycleRow {
  id: string;
  tenantId: string;
  planId: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  providerRef: string | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  dunningStep: number;
}

const SUBSCRIPTION_COLUMNS = sql`
  id, tenant_id AS "tenantId", plan_id AS "planId", status,
  period_start AS "periodStart", period_end AS "periodEnd",
  provider_ref AS "providerRef", trial_ends_at AS "trialEndsAt",
  grace_ends_at AS "graceEndsAt", dunning_step AS "dunningStep"
`;

/** The live subscription row = latest non-CANCELLED, non-SUSPENDED row. */
export async function liveSubscription(): Promise<SubscriptionLifecycleRow | undefined> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    SELECT ${SUBSCRIPTION_COLUMNS}
    FROM subscriptions
    WHERE status NOT IN ('CANCELLED', 'SUSPENDED')
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return (rows.rows as unknown as SubscriptionLifecycleRow[])[0];
}

/** Read-only verdict driver: the tenant is read-only exactly while in GRACE. */
export async function isReadOnlyGrace(): Promise<boolean> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    SELECT EXISTS(
      SELECT 1 FROM subscriptions
      WHERE status = 'GRACE' AND grace_ends_at > now()
    ) AS "readOnly"
  `);
  return Boolean((rows.rows as unknown as { readOnly: boolean }[])[0]?.readOnly);
}

export async function insertSubscriptionRow(input: {
  planId: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  providerRef: string | null;
  trialEndsAt?: string | null;
  graceEndsAt?: string | null;
}): Promise<SubscriptionLifecycleRow> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    INSERT INTO subscriptions
      (id, tenant_id, plan_id, status, period_start, period_end, provider_ref, trial_ends_at, grace_ends_at)
    VALUES (${generateUuidV7()}, erp.current_tenant_id(), ${input.planId}, ${input.status},
            ${input.periodStart}, ${input.periodEnd}, ${input.providerRef},
            ${input.trialEndsAt ?? null}, ${input.graceEndsAt ?? null})
    RETURNING ${SUBSCRIPTION_COLUMNS}
  `);
  return (rows.rows as unknown as SubscriptionLifecycleRow[])[0]!;
}

/** Supersede every live row (manual assignment / plan change — never mid-state). */
export async function supersedeLiveSubscriptions(): Promise<void> {
  const tx = tenantTx();
  await tx.execute(sql`
    UPDATE subscriptions
    SET status = 'CANCELLED', updated_at = now(), version = version + 1
    WHERE status NOT IN ('CANCELLED', 'SUSPENDED')
  `);
}

export async function transitionSubscription(
  id: string,
  fromStatuses: readonly string[],
  toStatus: string,
  patch: { graceEndsAt?: string | null; trialEndsAt?: string | null; providerRef?: string | null; dunningStep?: number } = {},
): Promise<SubscriptionLifecycleRow | null> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    UPDATE subscriptions
    SET status = ${toStatus},
        grace_ends_at = COALESCE(${patch.graceEndsAt ?? null}, grace_ends_at),
        trial_ends_at = COALESCE(${patch.trialEndsAt ?? null}, trial_ends_at),
        provider_ref = COALESCE(${patch.providerRef ?? null}, provider_ref),
        dunning_step = COALESCE(${patch.dunningStep ?? null}, dunning_step),
        updated_at = now(), version = version + 1
    WHERE id = ${id} AND status IN (${sql.join(fromStatuses.map((s) => sql`${s}`), sql`, `)})
    RETURNING ${SUBSCRIPTION_COLUMNS}
  `);
  return (rows.rows as unknown as SubscriptionLifecycleRow[])[0] ?? null;
}

/** Subscriptions due for a lifecycle sweep (trial expiry / grace expiry). */
export async function subscriptionsDueForSweep(nowIso: string): Promise<SubscriptionLifecycleRow[]> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    SELECT ${SUBSCRIPTION_COLUMNS}
    FROM subscriptions
    WHERE (status = 'TRIAL' AND trial_ends_at IS NOT NULL AND trial_ends_at <= ${nowIso})
       OR (status IN ('ACTIVE', 'PAST_DUE') AND period_end < ${nowIso}::date)
       OR (status = 'GRACE' AND grace_ends_at IS NOT NULL AND grace_ends_at <= ${nowIso})
    ORDER BY created_at
  `);
  return rows.rows as unknown as SubscriptionLifecycleRow[];
}

// -- subscription invoices -----------------------------------------------------

export interface InvoiceRow {
  id: string;
  tenantId: string;
  subscriptionId: string;
  number: string;
  amount: string;
  currencyCode: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  providerRef: string | null;
  paidVia: string | null;
  paidAt: string | null;
  createdBy: string | null;
  paidBy: string | null;
}

const INVOICE_COLUMNS = sql`
  id, tenant_id AS "tenantId", subscription_id AS "subscriptionId", number,
  amount::text AS "amount", currency_code AS "currencyCode", status,
  period_start AS "periodStart", period_end AS "periodEnd", due_date AS "dueDate",
  provider_ref AS "providerRef", paid_via AS "paidVia", paid_at AS "paidAt",
  created_by AS "createdBy", paid_by AS "paidBy"
`;

export async function insertInvoice(input: {
  subscriptionId: string;
  number: string;
  amount: string;
  currencyCode: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  providerRef: string | null;
  createdBy: string | null;
}): Promise<InvoiceRow> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    INSERT INTO subscription_invoices
      (id, tenant_id, subscription_id, number, amount, currency_code,
       period_start, period_end, due_date, provider_ref, created_by)
    VALUES (${generateUuidV7()}, erp.current_tenant_id(), ${input.subscriptionId}, ${input.number},
            ${input.amount}, ${input.currencyCode}, ${input.periodStart}, ${input.periodEnd},
            ${input.dueDate}, ${input.providerRef}, ${input.createdBy})
    RETURNING ${INVOICE_COLUMNS}
  `);
  return (rows.rows as unknown as InvoiceRow[])[0]!;
}

export async function findInvoice(id: string): Promise<InvoiceRow | undefined> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    SELECT ${INVOICE_COLUMNS} FROM subscription_invoices WHERE id = ${id}
  `);
  return (rows.rows as unknown as InvoiceRow[])[0];
}

export async function findOpenInvoiceByProviderRef(providerRef: string): Promise<InvoiceRow | undefined> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    SELECT ${INVOICE_COLUMNS} FROM subscription_invoices
    WHERE provider_ref = ${providerRef} AND status = 'OPEN' LIMIT 1
  `);
  return (rows.rows as unknown as InvoiceRow[])[0];
}

export async function markInvoicePaid(
  id: string,
  paidVia: "PROVIDER" | "MANUAL",
  paidBy: string | null,
  providerRef: string | null,
): Promise<InvoiceRow | null> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    UPDATE subscription_invoices
    SET status = 'PAID', paid_via = ${paidVia}, paid_at = now(),
        paid_by = ${paidBy}, provider_ref = COALESCE(${providerRef}, provider_ref),
        updated_at = now(), version = version + 1
    WHERE id = ${id} AND status = 'OPEN'
    RETURNING ${INVOICE_COLUMNS}
  `);
  return (rows.rows as unknown as InvoiceRow[])[0] ?? null;
}

export async function listInvoices(limit = 50): Promise<InvoiceRow[]> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    SELECT ${INVOICE_COLUMNS} FROM subscription_invoices
    ORDER BY created_at DESC LIMIT ${limit}
  `);
  return rows.rows as unknown as InvoiceRow[];
}

/** Next invoice number per tenant: SUB-INV-{yyyy}-{seq:6} (deterministic per tenant+year). */
export async function nextInvoiceNumber(): Promise<string> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    SELECT COALESCE(MAX(CAST(regexp_replace(number, '^SUB-INV-[0-9]{4}-', '') AS integer)), 0) + 1 AS seq,
           to_char(now(), 'YYYY') AS year
    FROM subscription_invoices
    WHERE number LIKE 'SUB-INV-' || to_char(now(), 'YYYY') || '-%'
  `);
  const row = (rows.rows as unknown as { seq: number; year: string }[])[0]!;
  return `SUB-INV-${row.year}-${String(row.seq).padStart(6, "0")}`;
}

// -- billing events (append-only) ----------------------------------------------

export async function billingEventExists(providerEventId: string): Promise<boolean> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    SELECT EXISTS(SELECT 1 FROM billing_events WHERE provider_event_id = ${providerEventId}) AS found
  `);
  return Boolean((rows.rows as unknown as { found: boolean }[])[0]?.found);
}

export async function insertBillingEvent(input: {
  eventType: string;
  subscriptionId: string | null;
  invoiceId: string | null;
  providerEventId: string | null;
  payload: Record<string, unknown>;
  actorId: string | null;
  viaPlatformAdmin?: boolean;
}): Promise<void> {
  const tx = tenantTx();
  await tx.execute(sql`
    INSERT INTO billing_events
      (id, tenant_id, event_type, subscription_id, invoice_id, provider_event_id, payload, actor_id, via_platform_admin)
    VALUES (${generateUuidV7()}, erp.current_tenant_id(), ${input.eventType}, ${input.subscriptionId},
            ${input.invoiceId}, ${input.providerEventId}, ${JSON.stringify(input.payload)}::jsonb,
            ${input.actorId}, ${input.viaPlatformAdmin ?? false})
    ON CONFLICT ("tenant_id", "provider_event_id") WHERE "provider_event_id" IS NOT NULL DO NOTHING
  `);
}

export interface BillingEventRow {
  id: string;
  eventType: string;
  subscriptionId: string | null;
  invoiceId: string | null;
  providerEventId: string | null;
  payload: Record<string, unknown>;
  actorId: string | null;
  viaPlatformAdmin: boolean;
  createdAt: string;
}

export async function listBillingEvents(limit = 100): Promise<BillingEventRow[]> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    SELECT id, event_type AS "eventType", subscription_id AS "subscriptionId",
           invoice_id AS "invoiceId", provider_event_id AS "providerEventId",
           payload, actor_id AS "actorId", via_platform_admin AS "viaPlatformAdmin",
           created_at AS "createdAt"
    FROM billing_events ORDER BY created_at DESC LIMIT ${limit}
  `);
  return rows.rows as unknown as BillingEventRow[];
}

// -- usage counters --------------------------------------------------------------

export interface UsageCounterRow {
  id: string;
  counterKey: string;
  period: string;
  value: number;
}

/** Current-month period key (first of month, UTC). */
export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** Increment a counter for the period (upsert). NEVER throws to the caller's
 *  business path — the caller wraps in try/catch per INV-022 (counters are
 *  a read-model; a counter failure must not fail the action it measures). */
export async function incrementCounter(counterKey: string, period: string, delta = 1): Promise<number> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    INSERT INTO usage_counters (id, tenant_id, counter_key, period, value)
    VALUES (${generateUuidV7()}, erp.current_tenant_id(), ${counterKey}, ${period}, ${delta})
    ON CONFLICT ("tenant_id", "counter_key", "period")
    DO UPDATE SET value = usage_counters.value + ${delta}, updated_at = now(), version = usage_counters.version + 1
    RETURNING value
  `);
  return (rows.rows as unknown as { value: number }[])[0]!.value;
}

export async function setCounter(counterKey: string, period: string, value: number): Promise<void> {
  const tx = tenantTx();
  await tx.execute(sql`
    INSERT INTO usage_counters (id, tenant_id, counter_key, period, value)
    VALUES (${generateUuidV7()}, erp.current_tenant_id(), ${counterKey}, ${period}, ${value})
    ON CONFLICT ("tenant_id", "counter_key", "period")
    DO UPDATE SET value = ${value}, updated_at = now(), version = usage_counters.version + 1
  `);
}

export async function getCounter(counterKey: string, period: string): Promise<number> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    SELECT value FROM usage_counters WHERE counter_key = ${counterKey} AND period = ${period}
  `);
  return (rows.rows as unknown as { value: number }[])[0]?.value ?? 0;
}

export async function listCounters(period: string): Promise<UsageCounterRow[]> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    SELECT id, counter_key AS "counterKey", period, value
    FROM usage_counters WHERE period = ${period} ORDER BY counter_key
  `);
  return rows.rows as unknown as UsageCounterRow[];
}

