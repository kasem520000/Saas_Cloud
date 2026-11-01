import { sql } from "drizzle-orm";

import { generateUuidV7 } from "@erp/domain-core";

import { type TenantDb } from "../../../infra/db/client";
import { requireTenantContext } from "../../../infra/db/tenant-context";

/**
 * PHASE-014 T10 — in-app notification store (migration 0021; tenant-scoped
 * macro RLS). Infrastructure layer: pure storage.
 */

function tenantTx(): TenantDb {
  const context = requireTenantContext();
  if (context.tx === undefined) {
    throw new Error("notifications access requires an ambient tenant scope");
  }
  return context.tx;
}

export interface NotificationRow {
  id: string;
  tenantId: string;
  userId: string | null;
  type: string;
  title: { ar: string; en: string };
  body: { ar: string; en: string };
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const NOTIFICATION_COLUMNS = sql`
  id, tenant_id AS "tenantId", user_id AS "userId", type,
  title, body, link, read_at AS "readAt", created_at AS "createdAt"
`;

export async function insertNotification(input: {
  userId: string | null;
  type: string;
  title: { ar: string; en: string };
  body: { ar: string; en: string };
  link: string | null;
}): Promise<NotificationRow> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    INSERT INTO notifications (id, tenant_id, user_id, type, title, body, link)
    VALUES (${generateUuidV7()}, erp.current_tenant_id(), ${input.userId}, ${input.type},
            ${JSON.stringify(input.title)}::jsonb, ${JSON.stringify(input.body)}::jsonb, ${input.link})
    RETURNING ${NOTIFICATION_COLUMNS}
  `);
  return rows.rows[0] as unknown as NotificationRow;
}

export async function listNotifications(input: {
  userId: string | null;
  unreadOnly: boolean;
  limit: number;
  beforeId: string | null;
}): Promise<NotificationRow[]> {
  const tx = tenantTx();
  // Visible = tenant-wide rows (user_id NULL) + own rows.
  const rows = await tx.execute(sql`
    SELECT ${NOTIFICATION_COLUMNS}
    FROM notifications
    WHERE (user_id IS NULL OR user_id = ${input.userId})
      AND (${input.unreadOnly} = false OR read_at IS NULL)
    ORDER BY created_at DESC, id DESC
    LIMIT ${input.limit}
  `);
  return rows.rows as unknown as NotificationRow[];
}

export async function unreadCount(userId: string | null): Promise<number> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    SELECT COUNT(*)::int AS n FROM notifications
    WHERE (user_id IS NULL OR user_id = ${userId}) AND read_at IS NULL
  `);
  return (rows.rows as unknown as { n: number }[])[0]!.n;
}

export async function markRead(id: string, userId: string): Promise<NotificationRow | null> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    UPDATE notifications SET read_at = now(), updated_at = now(), version = version + 1
    WHERE id = ${id} AND (user_id IS NULL OR user_id = ${userId}) AND read_at IS NULL
    RETURNING ${NOTIFICATION_COLUMNS}
  `);
  return (rows.rows[0] as unknown as NotificationRow) ?? null;
}

/** 24h dedupe probe for threshold warnings (same type + link). */
export async function recentNotificationOfType(type: string, link: string | null, withinHours: number): Promise<boolean> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    SELECT EXISTS(
      SELECT 1 FROM notifications
      WHERE type = ${type} AND link IS NOT DISTINCT FROM ${link}
        AND created_at > now() - (${withinHours} || ' hours')::interval
    ) AS found
  `);
  return Boolean((rows.rows as unknown as { found: boolean }[])[0]?.found);
}

// -- preferences ---------------------------------------------------------------

export interface PreferenceRow {
  id: string;
  userId: string | null;
  eventType: string;
  inApp: boolean;
  email: boolean;
}

const PREFERENCE_COLUMNS = sql`
  id, user_id AS "userId", event_type AS "eventType", in_app AS "inApp", email
`;

export async function listPreferences(userId: string | null): Promise<PreferenceRow[]> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    SELECT ${PREFERENCE_COLUMNS} FROM notification_preferences
    WHERE user_id IS NOT DISTINCT FROM ${userId}
    ORDER BY event_type
  `);
  return rows.rows as unknown as PreferenceRow[];
}

export async function upsertPreference(input: {
  userId: string | null;
  eventType: string;
  inApp: boolean;
  email: boolean;
}): Promise<PreferenceRow> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    INSERT INTO notification_preferences (id, tenant_id, user_id, event_type, in_app, email)
    VALUES (${generateUuidV7()}, erp.current_tenant_id(), ${input.userId}, ${input.eventType},
            ${input.inApp}, ${input.email})
    ON CONFLICT DO NOTHING
    RETURNING ${PREFERENCE_COLUMNS}
  `);
  const inserted = rows.rows[0] as unknown as PreferenceRow | undefined;
  if (inserted !== undefined) {
    return inserted;
  }
  await tx.execute(sql`
    UPDATE notification_preferences
    SET in_app = ${input.inApp}, email = ${input.email}, updated_at = now(), version = version + 1
    WHERE tenant_id = erp.current_tenant_id() AND user_id IS NOT DISTINCT FROM ${input.userId}
      AND event_type = ${input.eventType}
  `);
  const after = await tx.execute(sql`
    SELECT ${PREFERENCE_COLUMNS} FROM notification_preferences
    WHERE tenant_id = erp.current_tenant_id() AND user_id IS NOT DISTINCT FROM ${input.userId}
      AND event_type = ${input.eventType}
  `);
  return after.rows[0] as unknown as PreferenceRow;
}

/** Effective preference for an event: user row wins, else tenant-wide row, else defaults. */
export async function effectivePreference(
  userId: string | null,
  eventType: string,
): Promise<{ inApp: boolean; email: boolean }> {
  const tx = tenantTx();
  const rows = await tx.execute(sql`
    SELECT in_app AS "inApp", email FROM notification_preferences
    WHERE user_id IS NOT DISTINCT FROM ${userId} AND event_type = ${eventType}
    UNION ALL
    SELECT in_app AS "inApp", email FROM notification_preferences
    WHERE user_id IS NULL AND event_type = ${eventType}
    LIMIT 1
  `);
  const row = (rows.rows as unknown as { inApp: boolean; email: boolean }[])[0];
  return row ?? { inApp: true, email: false };
}
