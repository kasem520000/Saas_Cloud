import { sql } from "drizzle-orm";

import { getDb } from "../../../infra/db/client";

/**
 * PHASE-014 T5 — pre-GUC definer projection for the read-only guard:
 * `erp.tenant_subscription_read_only(uuid)` (migration 0021) resolves the
 * GRACE flag without entering a tenant UoW — the same pattern as
 * erp.tenant_active_entitlements (migration 0006).
 */

/** Fixed platform-operations tenant id (migration 0006 seed). */
export const PLATFORM_TENANT_ID = "20000000-0000-4000-8000-000000000001";

export async function tenantSubscriptionReadOnly(tenantId: string): Promise<boolean> {
  const rows = await getDb().execute(sql`
    SELECT erp.tenant_subscription_read_only(${tenantId}::uuid) AS "readOnly"
  `);
  return Boolean((rows.rows as unknown as { readOnly: boolean }[])[0]?.readOnly);
}

export interface UsageLimitsProjection {
  limits: Record<string, unknown> | null;
  counters: Record<string, number>;
  users: number;
  branches: number;
}

/** §6 pre-GUC projection: plan limits + live counts + period counters. */
export async function tenantUsageLimits(tenantId: string, period: string): Promise<UsageLimitsProjection> {
  const rows = await getDb().execute(sql`
    SELECT erp.tenant_usage_limits(${tenantId}::uuid, ${period}::date) AS "snapshot"
  `);
  return (rows.rows as unknown as { snapshot: UsageLimitsProjection }[])[0]!.snapshot;
}
