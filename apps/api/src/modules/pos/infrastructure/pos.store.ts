import { sql } from "drizzle-orm";

import { generateUuidV7 } from "@erp/domain-core";

import { requireTenantContext } from "../../../infra/db/tenant-context";
import type { TenantDb } from "../../../infra/db/client";

function tenantTx(): TenantDb {
  const context = requireTenantContext();
  if (context.tx === undefined) {
    throw new Error("query requires an ambient tenant scope");
  }
  return context.tx;
}

/**
 * PHASE-016 — POS store: `pos_terminals` registry + the narrow sync slice
 * (`change_log`, `sync_cursors`, `sync_commands`). RLS'd tenant tables; the
 * store is the only writer (MODULE_BOUNDARIES).
 */

export interface PosTerminalRow {
  id: string;
  tenantId: string;
  branchId: string;
  deviceId: string | null;
  code: string;
  name: string;
  cashAccountId: string;
  receiptSizeMm: number;
  status: "ACTIVE" | "INACTIVE";
  activatedAt: string;
  deactivatedAt: string | null;
}

export async function listTerminals(): Promise<PosTerminalRow[]> {
  const rows = await tenantTx().execute(sql`
    SELECT id, tenant_id AS "tenantId", branch_id AS "branchId", device_id AS "deviceId",
  code, name, cash_account_id AS "cashAccountId", receipt_size_mm AS "receiptSizeMm",
  status, activated_at AS "activatedAt", deactivated_at AS "deactivatedAt" FROM "pos_terminals" ORDER BY "code"
  `);
  return rows.rows as unknown as PosTerminalRow[];
}

export async function findTerminalByCode(code: string): Promise<PosTerminalRow | undefined> {
  const rows = await tenantTx().execute(sql`
    SELECT id, tenant_id AS "tenantId", branch_id AS "branchId", device_id AS "deviceId",
  code, name, cash_account_id AS "cashAccountId", receipt_size_mm AS "receiptSizeMm",
  status, activated_at AS "activatedAt", deactivated_at AS "deactivatedAt" FROM "pos_terminals" WHERE "code" = ${code} LIMIT 1
  `);
  return rows.rows[0] as unknown as PosTerminalRow | undefined;
}

export async function findTerminalById(id: string): Promise<PosTerminalRow | undefined> {
  const rows = await tenantTx().execute(sql`
    SELECT id, tenant_id AS "tenantId", branch_id AS "branchId", device_id AS "deviceId",
  code, name, cash_account_id AS "cashAccountId", receipt_size_mm AS "receiptSizeMm",
  status, activated_at AS "activatedAt", deactivated_at AS "deactivatedAt" FROM "pos_terminals" WHERE "id" = ${id} LIMIT 1
  `);
  return rows.rows[0] as unknown as PosTerminalRow | undefined;
}

export async function insertTerminal(input: {
  branchId: string;
  deviceId: string | null;
  code: string;
  name: string;
  cashAccountId: string;
  receiptSizeMm: number;
}): Promise<PosTerminalRow> {
  const rows = await tenantTx().execute(sql`
    INSERT INTO "pos_terminals"
      ("id", "tenant_id", "branch_id", "device_id", "code", "name", "cash_account_id", "receipt_size_mm", "status")
    VALUES (${generateUuidV7()}, erp.current_tenant_id(), ${input.branchId}, ${input.deviceId}, ${input.code},
            ${input.name}, ${input.cashAccountId}, ${input.receiptSizeMm}, 'ACTIVE')
    RETURNING id, tenant_id AS "tenantId", branch_id AS "branchId", device_id AS "deviceId",
  code, name, cash_account_id AS "cashAccountId", receipt_size_mm AS "receiptSizeMm",
  status, activated_at AS "activatedAt", deactivated_at AS "deactivatedAt"
  `);
  return rows.rows[0] as unknown as PosTerminalRow;
}

export async function setTerminalStatus(
  id: string,
  status: "ACTIVE" | "INACTIVE",
): Promise<PosTerminalRow | undefined> {
  const rows = await tenantTx().execute(sql`
    UPDATE "pos_terminals"
    SET "status" = ${status},
        "deactivated_at" = CASE WHEN ${status} = 'INACTIVE' THEN now() ELSE "deactivated_at" END,
        "activated_at" = CASE WHEN ${status} = 'ACTIVE' THEN now() ELSE "activated_at" END,
        "updated_at" = now()
    WHERE "id" = ${id}
    RETURNING id, tenant_id AS "tenantId", branch_id AS "branchId", device_id AS "deviceId",
  code, name, cash_account_id AS "cashAccountId", receipt_size_mm AS "receiptSizeMm",
  status, activated_at AS "activatedAt", deactivated_at AS "deactivatedAt"
  `);
  return rows.rows[0] as unknown as PosTerminalRow | undefined;
}

export async function bindDevice(terminalId: string, deviceId: string): Promise<void> {
  await tenantTx().execute(sql`
    UPDATE "pos_terminals" SET "device_id" = ${deviceId}, "updated_at" = now() WHERE "id" = ${terminalId}
  `);
}

/** True when the linked device row exists and is not revoked. */
export async function deviceIsLive(deviceId: string | null): Promise<boolean> {
  if (deviceId === null || deviceId === undefined || deviceId === "") {
    return true; // unbound terminals (online-only admin-registered) are live
  }
  const rows = await tenantTx().execute(sql`
    SELECT "revoked_at" FROM "devices" WHERE "id" = ${deviceId} LIMIT 1
  `);
  const row = rows.rows[0] as { revoked_at: string | null } | undefined;
  return row !== undefined && row.revoked_at === null;
}

// -- change_log -------------------------------------------------------------

export async function appendChangeLog(input: {
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

export async function readChangeLog(entityType: string, afterCursor: number, limit: number): Promise<
  { seq: number; entityType: string; entityId: string; op: string; payload: unknown; createdAt: string }[]
> {
  const rows = await tenantTx().execute(sql`
    SELECT "seq", "entity_type" AS "entityType", "entity_id" AS "entityId", "op", "payload", "created_at" AS "createdAt"
    FROM "change_log"
    WHERE "entity_type" = ${entityType} AND "seq" > ${afterCursor}
    ORDER BY "seq" ASC
    LIMIT ${limit}
  `);
  return (rows.rows as unknown as { seq: number | string; entityType: string; entityId: string; op: string; payload: unknown; createdAt: string }[]).map(
    (r) => ({ ...r, seq: Number(r.seq) }),
  );
}

// -- sync_cursors ----------------------------------------------------------

export async function getCursor(deviceId: string, entityType: string): Promise<number> {
  const rows = await tenantTx().execute(sql`
    SELECT "cursor" FROM "sync_cursors"
    WHERE "device_id" = ${deviceId} AND "entity_type" = ${entityType} LIMIT 1
  `);
  const row = rows.rows[0] as unknown as { cursor: number | string } | undefined;
  return row === undefined ? 0 : Number(row.cursor);
}

export async function setCursor(deviceId: string, entityType: string, cursor: number): Promise<void> {
  await tenantTx().execute(sql`
    INSERT INTO "sync_cursors" ("tenant_id", "device_id", "entity_type", "cursor")
    VALUES (erp.current_tenant_id(), ${deviceId}, ${entityType}, ${cursor})
    ON CONFLICT ("tenant_id", "device_id", "entity_type") DO UPDATE SET "cursor" = EXCLUDED."cursor", "updated_at" = now()
  `);
}

// -- sync_commands (idempotency + replay) ----------------------------------

export interface SyncCommandRow {
  idempotencyKey: string;
  tenantId: string;
  deviceId: string | null;
  commandType: string;
  clientId: string;
  status: "ACCEPTED" | "REJECTED" | "DEFERRED";
  result: Record<string, unknown>;
  createdAt: string;
}

export async function findCommand(idempotencyKey: string): Promise<SyncCommandRow | undefined> {
  const rows = await tenantTx().execute(sql`
    SELECT * FROM "sync_commands" WHERE "idempotency_key" = ${idempotencyKey} LIMIT 1
  `);
  return rows.rows[0] as unknown as SyncCommandRow | undefined;
}

export async function insertCommand(input: {
  idempotencyKey: string;
  deviceId: string | null;
  commandType: string;
  clientId: string;
  status: SyncCommandRow["status"];
  result: Record<string, unknown>;
}): Promise<void> {
  await tenantTx().execute(sql`
    INSERT INTO "sync_commands"
      ("idempotency_key", "tenant_id", "device_id", "command_type", "client_id", "status", "result")
    VALUES (${input.idempotencyKey}, erp.current_tenant_id(), ${input.deviceId}, ${input.commandType},
            ${input.clientId}, ${input.status}, ${JSON.stringify(input.result)}::jsonb)
    ON CONFLICT ("tenant_id", "idempotency_key") DO NOTHING
  `);
}

/** Record the POS linkage on the posted invoice (channel fields). */
export async function markInvoicePosChannel(input: {
  invoiceId: string;
  terminalId: string;
  orderType: string | null;
  tableRef: string | null;
  offlineReceiptNo: string | null;
  syncState: string;
}): Promise<void> {
  await tenantTx().execute(sql`
    UPDATE "sales_invoices"
    SET "pos_terminal_id" = ${input.terminalId},
        "order_type" = ${input.orderType},
        "table_ref" = ${input.tableRef},
        "offline_receipt_no" = COALESCE(${input.offlineReceiptNo}, "offline_receipt_no"),
        "sync_state" = ${input.syncState},
        "updated_at" = now()
    WHERE "id" = ${input.invoiceId}
  `);
}
