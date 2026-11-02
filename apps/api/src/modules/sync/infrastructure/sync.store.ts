import { sql } from "drizzle-orm";

import { requireTenantContext } from "../../../infra/db/tenant-context";
import { type TenantDb } from "../../../infra/db/client";

function tenantTx(): TenantDb {
  const ctx = requireTenantContext();
  if (ctx.tx === undefined) throw new Error("sync requires an ambient tenant scope");
  return ctx.tx;
}

/** Append one change-feed row; the seq is drawn from the feed sequence. */
export async function appendChange(input: {
  entityType: string;
  entityId: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  payload: unknown;
}): Promise<number> {
  const rows = await tenantTx().execute(sql`
    INSERT INTO "change_log" ("tenant_id", "entity_type", "entity_id", "op", "payload")
    VALUES (erp.current_tenant_id(), ${input.entityType}, ${input.entityId}, ${input.op}, ${JSON.stringify(input.payload)}::jsonb)
    RETURNING "seq"
  `);
  return Number((rows.rows[0] as unknown as { seq: number | string }).seq);
}

export async function appendTombstone(input: { entityType: string; entityId: string; seq: number }): Promise<void> {
  await tenantTx().execute(sql`
    INSERT INTO "tombstones" ("tenant_id", "seq", "entity_type", "entity_id")
    VALUES (erp.current_tenant_id(), ${input.seq}, ${input.entityType}, ${input.entityId})
    ON CONFLICT DO NOTHING
  `);
}

export interface ChangeRow {
  seq: number;
  entityType: string;
  entityId: string;
  op: string;
  payload: unknown;
}

/** Contiguous seq window (afterCursor, afterCursor+limit] for one entity type. */
export async function readChanges(input: {
  entityType: string;
  afterSeq: number;
  limit: number;
}): Promise<ChangeRow[]> {
  const rows = await tenantTx().execute(sql`
    SELECT "seq", "entity_type" AS "entityType", "entity_id" AS "entityId", "op", "payload"
    FROM "change_log"
    WHERE "entity_type" = ${input.entityType} AND "seq" > ${input.afterSeq}
    ORDER BY "seq" ASC
    LIMIT ${input.limit}
  `);
  return (rows.rows as unknown as ChangeRow[]).map((r) => ({ ...r, seq: Number(r.seq) }));
}

export async function readTombstones(input: { entityType: string; afterSeq: number; limit: number }): Promise<
  { seq: number; entityId: string }[]
> {
  const rows = await tenantTx().execute(sql`
    SELECT "seq", "entity_id" AS "entityId" FROM "tombstones"
    WHERE "entity_type" = ${input.entityType} AND "seq" > ${input.afterSeq}
    ORDER BY "seq" ASC LIMIT ${input.limit}
  `);
  return (rows.rows as unknown as { seq: number; entityId: string }[]).map((r) => ({ ...r, seq: Number(r.seq) }));
}

export async function maxSeq(entityType: string): Promise<number> {
  const rows = await tenantTx().execute(sql`
    SELECT COALESCE(MAX("seq"), 0)::text AS m FROM "change_log" WHERE "entity_type" = ${entityType}
  `);
  return Number((rows.rows[0] as { m: string }).m);
}

// -- cursors -----------------------------------------------------------------

export async function getCursor(deviceId: string, entityType: string): Promise<number> {
  const rows = await tenantTx().execute(sql`
    SELECT "cursor" FROM "sync_cursors" WHERE "device_id" = ${deviceId} AND "entity_type" = ${entityType}
  `);
  return rows.rows.length > 0 ? Number((rows.rows[0] as { cursor: number | string }).cursor) : 0;
}

/** Server-side cursor ack is a monitoring hint only (SYNC_PROTOCOL §2). */
export async function setCursor(deviceId: string, entityType: string, cursor: number): Promise<void> {
  await tenantTx().execute(sql`
    INSERT INTO "sync_cursors" ("tenant_id", "device_id", "entity_type", "cursor")
    VALUES (erp.current_tenant_id(), ${deviceId}, ${entityType}, ${cursor})
    ON CONFLICT ("tenant_id", "device_id", "entity_type")
    DO UPDATE SET "cursor" = EXCLUDED."cursor", "updated_at" = now()
  `);
}

// -- inbox -------------------------------------------------------------------

export interface InboxRow {
  id: string;
  commandId: string;
  intent: string;
  idempotencyKey: string;
  status: string;
  result: Record<string, unknown>;
  duplicate: boolean;
}

export async function findInboxByCommand(deviceId: string, commandId: string): Promise<InboxRow | undefined> {
  const rows = await tenantTx().execute(sql`
    SELECT "id", "command_id" AS "commandId", "intent", "idempotency_key" AS "idempotencyKey",
           "status", "result", "duplicate"
    FROM "inbox_commands" WHERE "device_id" = ${deviceId} AND "command_id" = ${commandId}
  `);
  return rows.rows[0] as InboxRow | undefined;
}

export async function findInboxByKey(idempotencyKey: string): Promise<InboxRow | undefined> {
  const rows = await tenantTx().execute(sql`
    SELECT "id", "command_id" AS "commandId", "intent", "idempotency_key" AS "idempotencyKey",
           "status", "result", "duplicate"
    FROM "inbox_commands" WHERE "idempotency_key" = ${idempotencyKey}
  `);
  return rows.rows[0] as InboxRow | undefined;
}

export async function recordInbox(input: {
  deviceId: string;
  commandId: string;
  intent: string;
  idempotencyKey: string;
  status: "ACCEPTED" | "REJECTED";
  result: Record<string, unknown>;
}): Promise<void> {
  await tenantTx().execute(sql`
    INSERT INTO "inbox_commands" ("tenant_id", "device_id", "command_id", "intent", "idempotency_key", "status", "result")
    VALUES (erp.current_tenant_id(), ${input.deviceId}, ${input.commandId}, ${input.intent},
            ${input.idempotencyKey}, ${input.status}, ${JSON.stringify(input.result)}::jsonb)
    ON CONFLICT ("tenant_id", "device_id", "command_id") DO NOTHING
  `);
}

/** Retention job: drop inbox rows past their expiry (default 30 days). */
export async function deleteExpiredInbox(nowIso: string): Promise<number> {
  const rows = await tenantTx().execute(sql`
    DELETE FROM "inbox_commands" WHERE "expires_at" < ${nowIso}::timestamptz
  `);
  return rows.rowCount ?? 0;
}

// -- devices -----------------------------------------------------------------

export interface DeviceRow {
  id: string;
  userId: string;
  platform: string;
  name: string | null;
  revokedAt: string | null;
  capabilities: string[];
  contractVersion: number;
  trustFlags: Record<string, unknown>;
  attestedAt: string | null;
  lastSeenAt: string | null;
}

export async function findDevice(deviceId: string): Promise<DeviceRow | undefined> {
  const rows = await tenantTx().execute(sql`
    SELECT "id", "user_id" AS "userId", "platform", "name", "revoked_at" AS "revokedAt",
           "capabilities", "contract_version" AS "contractVersion", "trust_flags" AS "trustFlags",
           "attested_at" AS "attestedAt", "last_seen_at" AS "lastSeenAt"
    FROM "devices" WHERE "id" = ${deviceId}
  `);
  return rows.rows[0] as DeviceRow | undefined;
}

export async function touchDevice(deviceId: string): Promise<void> {
  await tenantTx().execute(sql`UPDATE "devices" SET "last_seen_at" = now() WHERE "id" = ${deviceId}`);
}

export async function revokeDevice(deviceId: string): Promise<void> {
  await tenantTx().execute(sql`
    UPDATE "devices" SET "revoked_at" = now(), "updated_at" = now() WHERE "id" = ${deviceId}
  `);
}

export async function setAttestation(deviceId: string, trustFlags: Record<string, unknown>): Promise<void> {
  await tenantTx().execute(sql`
    UPDATE "devices" SET "attested_at" = now(), "trust_flags" = ${JSON.stringify(trustFlags)}::jsonb, "updated_at" = now()
    WHERE "id" = ${deviceId}
  `);
}

export async function listDevices(): Promise<DeviceRow[]> {
  const rows = await tenantTx().execute(sql`
    SELECT "id", "user_id" AS "userId", "platform", "name", "revoked_at" AS "revokedAt",
           "capabilities", "contract_version" AS "contractVersion", "trust_flags" AS "trustFlags",
           "attested_at" AS "attestedAt", "last_seen_at" AS "lastSeenAt"
    FROM "devices" ORDER BY "created_at" DESC LIMIT 500
  `);
  return rows.rows as unknown as DeviceRow[];
}
