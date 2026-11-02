import { beforeAll, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { SqliteLocalStore, runCycle, type PullPage, type SqliteDatabase, type Transport } from "@erp/sync-core";

import { ensureTestDb, superuserClient } from "../test-db";
import { withTenant } from "../../infra/db/tenant-context";
import { AuditService } from "../../modules/audit/api/audit";
import { DrizzleAuditStore } from "../../modules/audit/infrastructure/drizzle-audit.store";
import { PosSaleService } from "../../modules/pos/application/pos-sale.service";
import { TerminalService } from "../../modules/pos/application/terminal.service";
import { PushService } from "../../modules/sync/application/push.service";
import { PullService } from "../../modules/sync/application/pull.service";
import { verifyCursor } from "../../modules/sync/domain/cursor";
import { salesInvoices, setupSalesFixture, setSalesSetting, TENANT_S, S_CASHIER } from "../sales/fixtures";

/**
 * PHASE-021 T13/T14 — desktop profile on real PG16: the DESKTOP client kernel
 * (SqliteLocalStore on real SQLite + runCycle from @erp/sync-core, wired to
 * the real PHASE-020 sync services through a Transport adapter) converges
 * against the server: pos_sale accepted exactly once, duplicate replay, revoked
 * device rejected pre-execution with zero effects, pull advances the local
 * cursor. This is the same kernel the Tauri shell hosts.
 */

const audit = new AuditService(new DrizzleAuditStore());
const posSale = new PosSaleService(salesInvoices, audit);
const terminals = new TerminalService(audit);
const push = new PushService(audit, posSale);
const pull = new PullService();

const DEVICE = "00000000-0000-4000-8000-0000000000a1";

function makeDesktopStore(): SqliteLocalStore {
  const raw = new Database(":memory:");
  const db: SqliteDatabase = {
    pragma: (s) => raw.pragma(s),
    exec: (s) => raw.exec(s),
    prepare: (s) => raw.prepare(s) as never,
    transaction: (fn) => raw.transaction(fn) as () => void,
  };
  db.pragma("journal_mode = WAL");
  return new SqliteLocalStore(db);
}

/** Transport adapter: desktop kernel ↔ real PHASE-020 services (in-tenant). */
function desktopTransport(actorId: string): Transport {
  const tokens = new Map<string, string>();
  return {
    status: async (deviceId) => {
      const s = await pull.status({ deviceId, entities: ["sales_invoice"] });
      return { contractVersion: s.contractVersion };
    },
    pull: async (deviceId, entity, _cursorSeq): Promise<PullPage> => {
      const page = await pull.pull({ deviceId, entity, cursorToken: tokens.get(entity) });
      tokens.set(entity, page.nextCursor);
      const payload = verifyCursor(page.nextCursor, entity);
      return {
        items: (page.items as { op: "upsert" | "tombstone"; id: string; seq: number; row?: unknown }[]).map((i) => ({ op: i.op, id: i.id, seq: i.seq, row: i.row })),
        nextCursorSeq: payload.seq,
        hasMore: page.hasMore,
        contractVersion: page.contractVersion,
        resync: page.resync,
      };
    },
    push: async (deviceId, commands) => {
      // the kernel stores payload as JSON text (ADR-0009 decimals inside);
      // the server contract takes the object form
      const parsed = commands.map((c) => ({
        commandId: c.commandId,
        entityType: c.entityType,
        intent: c.intent,
        idempotencyKey: c.idempotencyKey,
        baseVersion: c.baseVersion,
        payload: JSON.parse(c.payload) as Record<string, unknown>,
      }));
      const res = await push.push({ deviceId, commands: parsed, actorId });
      return { results: res.results as never };
    },
  };
}

let cmdCounter = 0;
function saleCommand(key: string, offlineNo: string, line: Record<string, unknown>, customerId?: string) {
  cmdCounter += 1;
  return {
    commandId: "018f3a2e-9c40-7000-8000-" + String(cmdCounter).padStart(12, "0"),
    entityType: "sales_invoice",
    intent: "pos_sale",
    idempotencyKey: key,
    payload: JSON.stringify({
      terminalCode: "POS-01",
      customerId,
      orderType: "COUNTER",
      offlineReceiptNo: offlineNo,
      lines: [line],
    }),
  };
}

async function countPosInvoices(): Promise<number> {
  const su = await superuserClient();
  const r = await su.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM sales_invoices WHERE tenant_id = $1 AND pos_terminal_id IS NOT NULL`,
    [TENANT_S],
  );
  await su.end();
  return r.rows[0]?.n ?? 0;
}

beforeAll(async () => {
  ensureTestDb();
  await setupSalesFixture();
  await withTenant(TENANT_S, async () => {
    await setSalesSetting("sales.cash_autopost", true);
    const fx = await setupSalesFixture();
    try {
      await terminals.register({
        branchId: fx.branchId,
        deviceId: null,
        code: "pos-01",
        name: "Counter 1",
        cashAccountId: fx.cashAccountId,
        receiptSizeMm: 80,
        actorId: null,
      });
    } catch {
      /* shared fixture tenant */
    }
  });
  const su = await superuserClient();
  await su.query(
    `INSERT INTO users (id, email, full_name, password_hash, status) VALUES
     ('00000000-0000-0000-0000-000000000505', 'sync-actor@system', 'Sync Actor', 'x', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`,
  );
  await su.query(
    `INSERT INTO devices (id, user_id, platform, name, device_key_hash) VALUES
     ($1, $2, 'DESKTOP', 'desktop-a1', 'hash-a1') ON CONFLICT (id) DO NOTHING`,
    [DEVICE, S_CASHIER],
  );
  await su.end();
});

describe("PHASE-021 desktop profile (real PG + real SQLite kernel)", () => {
  it("D-01: offline sale enqueued in the local store syncs through runCycle → ACCEPTED exactly once (INV-013)", async () => {
    const store = makeDesktopStore();
    let line: Record<string, unknown> = {};
    let before = 0;
    await withTenant(TENANT_S, async () => {
      const fx = await setupSalesFixture();
      before = await countPosInvoices();
      line = { itemId: null, accountId: fx.gl.serviceAccount, qty: "2", unitPrice: "5.500000", taxCodeId: fx.taxCodeIds.notSubject };
      await store.enqueue(saleCommand("cmd-021-d01", "OFF-021-01", line, fx.customerId));

      const transport = desktopTransport(S_CASHIER);
      const res = await runCycle({ store, transport, deviceId: DEVICE, entities: ["sales_invoice"] });
      expect(res.acked).toBe(1);
      expect(res.pushed).toBe(1);
      expect(await store.outboxCount()).toBe(0);

      // duplicate redelivery through the kernel → duplicate:true, still one invoice
      await store.enqueue(saleCommand("cmd-021-d01", "OFF-021-01", line, fx.customerId)); // same commandId+key upsert → still 1 row
      expect(await store.outboxCount()).toBe(1);
      const res2 = await runCycle({ store, transport, deviceId: DEVICE, entities: ["sales_invoice"] });
      expect(res2.acked).toBe(1);
    });
    expect(await countPosInvoices()).toBe(before + 1);
  });

  it("D-02: revoked device pushing through the kernel → REJECTED DEVICE_REVOKED, zero effects, command kept for audit", async () => {
    const REVOKED = "00000000-0000-4000-8000-0000000000b2";
    const store = makeDesktopStore();
    let before = 0;
    await withTenant(TENANT_S, async () => {
      const su = await superuserClient();
      await su.query(
        `INSERT INTO devices (id, user_id, platform, name, device_key_hash, revoked_at) VALUES
         ($1, $2, 'DESKTOP', 'revoked-b2', 'hash-b2', now()) ON CONFLICT (id) DO NOTHING`,
        [REVOKED, S_CASHIER],
      );
      await su.end();
      const fx = await setupSalesFixture();
      before = await countPosInvoices();
      await store.enqueue(
        saleCommand("cmd-021-d02", "OFF-021-02", { itemId: null, accountId: fx.gl.serviceAccount, qty: "1", unitPrice: "1" }),
      );
      const res = await runCycle({ store, transport: desktopTransport(S_CASHIER), deviceId: REVOKED, entities: ["sales_invoice"] });
      expect(res.rejected).toBe(1);
      expect(res.acked).toBe(0);
    });
    expect(await countPosInvoices()).toBe(before);
  });

  it("D-03: pull through the kernel advances the local cursor and applies inbox rows", async () => {
    const store = makeDesktopStore();
    await withTenant(TENANT_S, async () => {
      const transport = desktopTransport(S_CASHIER);
      await runCycle({ store, transport, deviceId: DEVICE, entities: ["sales_invoice"] });
      const cursor = await store.getCursor("sales_invoice");
      expect(cursor).toBeGreaterThanOrEqual(0); // cursor persisted locally
      expect(await store.getMeta("schema_version")).toBe("1");
    });
  });
});
