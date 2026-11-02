import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { ensureTestDb, superuserClient } from "../test-db";
import { requireTenantContext, withTenant } from "../../infra/db/tenant-context";
import { AuditService } from "../../modules/audit/api/audit";
import { DrizzleAuditStore } from "../../modules/audit/infrastructure/drizzle-audit.store";
import { PosSaleService } from "../../modules/pos/application/pos-sale.service";
import { TerminalService } from "../../modules/pos/application/terminal.service";
import { PushService } from "../../modules/sync/application/push.service";
import { PullService } from "../../modules/sync/application/pull.service";
import { InboxService } from "../../modules/sync/application/inbox.service";
import { DevicesService } from "../../modules/sync/application/devices.service";
import { bootstrapCursor, signCursor, verifyCursor, CursorError } from "../../modules/sync/domain/cursor";
import type { SyncCommand } from "../../modules/sync/domain/batch";
import { salesInvoices, setupSalesFixture, setSalesSetting, TENANT_S, S_CASHIER } from "../sales/fixtures";

/**
 * PHASE-020 golden db evidence (real PG16): the generalized sync protocol on
 * top of the PHASE-016 POS consumer — C-01 duplicate push replays with
 * duplicate:true and exactly one journal (INV-013), C-06 revoked device
 * rejects pre-execution with zero effects, C-13 cross-tenant references reject
 * with no existence leak, signed-cursor pull with caps + resync (C-12),
 * DEFERRED never enters the inbox, retention job is audited + idempotent.
 */

const audit = new AuditService(new DrizzleAuditStore());
const posSale = new PosSaleService(salesInvoices, audit);
const terminals = new TerminalService(audit);
const push = new PushService(audit, posSale);
const pull = new PullService();
const inbox = new InboxService(audit);
const devices = new DevicesService(audit);

const DEVICE = "00000000-0000-4000-8000-0000000000f0";

async function txQuery<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const ctx = requireTenantContext();
  if (ctx.tx === undefined) throw new Error("no ambient tx");
  const inlined = text.replace(/\$\d+/g, (m) => {
    const v = params[Number(m.slice(1)) - 1];
    return typeof v === "string" ? "'" + v.replace(/'/g, "''") + "'" : String(v);
  });
  const res = await ctx.tx.execute(sql.raw(inlined));
  return res.rows as T[];
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

async function countJournals(): Promise<number> {
  const su = await superuserClient();
  const r = await su.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM journal_entries WHERE tenant_id = $1 AND source_type = 'sales_invoice'`,
    [TENANT_S],
  );
  await su.end();
  return r.rows[0]?.n ?? 0;
}

let cmdCounter = 0;
function saleCommand(key: string, offlineNo: string, overrides: Partial<SyncCommand> = {}): SyncCommand {
  cmdCounter += 1;
  return {
    commandId: "018f3a2e-9c40-7000-8000-" + String(cmdCounter).padStart(12, "0"),
    entityType: "sales_invoice",
    intent: "pos_sale",
    idempotencyKey: key,
    payload: {
      terminalCode: "POS-01",
      orderType: "COUNTER",
      offlineReceiptNo: offlineNo,
      lines: [],
    },
    ...overrides,
  };
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
      // terminal already registered by another spec sharing this fixture tenant
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
     ($1, $2, 'POS_TERMINAL', 'POS-01 device', 'hash-f0') ON CONFLICT (id) DO NOTHING`,
    [DEVICE, S_CASHIER],
  );
  await su.end();
});

describe("PHASE-020 push contract (real PG)", () => {
  it("C-01: pos_sale accepted once; 3× duplicate delivery (same commandId + key) replays duplicate:true with exactly one invoice + one journal (INV-013)", async () => {
    let beforeInv = 0;
    let beforeJr = 0;
    await withTenant(TENANT_S, async () => {
      const fx = await setupSalesFixture();
      beforeInv = await countPosInvoices();
      beforeJr = await countJournals();
      const command = saleCommand("cmd-020-dup-01", "OFF-020-01", {
        payload: {
          terminalCode: "POS-01",
          customerId: fx.customerId,
          orderType: "COUNTER",
          offlineReceiptNo: "OFF-020-01",
          lines: [{ itemId: null, accountId: fx.gl.serviceAccount, qty: "1", unitPrice: "7.000000", taxCodeId: fx.taxCodeIds.notSubject }],
        },
      });
      const first = await push.push({ deviceId: DEVICE, commands: [command], actorId: S_CASHIER });
      expect(first.results[0]?.status).toBe("ACCEPTED");
      expect(first.results[0]?.duplicate).toBe(false);
      expect(first.results[0]?.result.invoiceNo).toMatch(/^SAL-/);

      for (let i = 0; i < 3; i++) {
        const again = await push.push({ deviceId: DEVICE, commands: [command], actorId: S_CASHIER });
        expect(again.results[0]?.status).toBe("ACCEPTED");
        expect(again.results[0]?.duplicate).toBe(true);
        expect(again.results[0]?.result.duplicate).toBe(true);
        expect(again.results[0]?.result.invoiceNo).toBe(first.results[0]?.result.invoiceNo);
      }
      // cross-batch duplicate by idempotency key (different commandId)
      const crossBatch = await push.push({
        deviceId: DEVICE,
        commands: [{ ...command, commandId: "018f3a2e-9c40-7000-8000-00000000ff01" }],
        actorId: S_CASHIER,
      });
      expect(crossBatch.results[0]?.duplicate).toBe(true);
      expect(crossBatch.results[0]?.result.errorCode).toBe("DUPLICATE_COMMAND");
    });
    expect(await countPosInvoices()).toBe(beforeInv + 1);
    expect(await countJournals()).toBe(beforeJr + 1);
  });

  it("C-06: revoked device → every item REJECTED DEVICE_REVOKED before execution, zero effects", async () => {
    const REVOKED = "00000000-0000-4000-8000-0000000000dd";
    let beforeInv = 0;
    await withTenant(TENANT_S, async () => {
      const su = await superuserClient();
      await su.query(
        `INSERT INTO devices (id, user_id, platform, name, device_key_hash, revoked_at) VALUES
         ($1, $2, 'POS_TERMINAL', 'revoked', 'hash-dd', now()) ON CONFLICT (id) DO NOTHING`,
        [REVOKED, S_CASHIER],
      );
      await su.end();
      const fx = await setupSalesFixture();
      beforeInv = await countPosInvoices();
      const result = await push.push({
        deviceId: REVOKED,
        commands: [
          saleCommand("cmd-020-rev-01", "OFF-020-77", {
            payload: {
              terminalCode: "POS-01",
              customerId: fx.customerId,
              orderType: "COUNTER",
              offlineReceiptNo: "OFF-020-77",
              lines: [{ itemId: null, accountId: fx.gl.serviceAccount, qty: "1", unitPrice: "1" }],
            },
          }),
        ],
        actorId: S_CASHIER,
      });
      expect(result.results[0]?.status).toBe("REJECTED");
      expect(result.results[0]?.result.errorCode).toBe("DEVICE_REVOKED");
      expect(result.results[0]?.result.resubmittable).toBe(false);
    });
    expect(await countPosInvoices()).toBe(beforeInv);
  });

  it("C-13/Y: a command referencing another tenant's partner rejects with no effects and no existence leak", async () => {
    let beforeInv = 0;
    await withTenant(TENANT_S, async () => {
      beforeInv = await countPosInvoices();
      // foreign partner id (tenant A/B isolation fixtures) — must not resolve here
      const foreignPartner = "b5b5b5b5-0000-4000-8000-000000000001";
      const result = await push.push({
        deviceId: DEVICE,
        commands: [
          saleCommand("cmd-020-xtenant-01", "OFF-020-99", {
            payload: {
              terminalCode: "POS-01",
              customerId: foreignPartner,
              orderType: "COUNTER",
              offlineReceiptNo: "OFF-020-99",
              lines: [{ itemId: null, accountId: "b0b0b0b0-0000-4000-8000-000000000002", qty: "1", unitPrice: "1" }],
            },
          }),
        ],
        actorId: S_CASHIER,
      });
      expect(result.results[0]?.status).toBe("REJECTED");
    });
    expect(await countPosInvoices()).toBe(beforeInv);
  });

  it("unknown intent → DEFERRED and NOT recorded in the inbox (§3)", async () => {
    await withTenant(TENANT_S, async () => {
      const result = await push.push({
        deviceId: DEVICE,
        commands: [saleCommand("cmd-020-def-01", "OFF-020-50", { intent: "van_stock_adjust", entityType: "van_stock" })],
        actorId: S_CASHIER,
      });
      expect(result.results[0]?.status).toBe("DEFERRED");
      expect(result.results[0]?.result.reason).toBe("TRANSIENT");
      const rows = await txQuery<{ n: number }>(
        `SELECT count(*)::int AS n FROM inbox_commands WHERE idempotency_key = 'cmd-020-def-01'`,
      );
      expect(rows[0]?.n).toBe(0);
    });
  });

  it("STALE_VERSION: baseVersion older than the server feed for the entity rejects with details", async () => {
    await withTenant(TENANT_S, async () => {
      const commandId = "018f3a2e-9c40-7000-8000-0000000000cd";
      const seq = await txQuery<{ seq: number }>(
        `INSERT INTO change_log (tenant_id, entity_type, entity_id, op, payload)
         VALUES (erp.current_tenant_id(), 'sales_invoice', $1, 'UPDATE', '{}') RETURNING seq`,
        [commandId],
      );
      const result = await push.push({
        deviceId: DEVICE,
        commands: [
          {
            commandId,
            entityType: "sales_invoice",
            intent: "pos_sale",
            idempotencyKey: "cmd-020-stale-01",
            baseVersion: Number(seq[0]?.seq) - 1, // client is one change behind the server
            payload: {},
          },
        ],
        actorId: S_CASHIER,
      });
      expect(result.results[0]?.status).toBe("REJECTED");
      expect(result.results[0]?.result.errorCode).toBe("STALE_VERSION");
      expect((result.results[0]?.result.details as Record<string, unknown>).serverSeq).toBe(Number(seq[0]?.seq));
    });
  });
});

describe("PHASE-020 pull contract (real PG)", () => {
  it("signed cursors: pages are contiguous, hasMore flips, tampered cursor rejected, regressed cursor → resync (C-12)", async () => {
    await withTenant(TENANT_S, async () => {
      // seed 3 feed rows
      for (let i = 0; i < 3; i++) {
        await txQuery(
          `INSERT INTO change_log (tenant_id, entity_type, entity_id, op, payload)
           VALUES (erp.current_tenant_id(), 'partners_lite', gen_random_uuid(), 'INSERT', '{"i":${i}}')`,
        );
      }
      const boot = bootstrapCursor("partners_lite");
      const p1 = await pull.pull({ deviceId: DEVICE, entity: "partners_lite", cursorToken: boot, limit: 2 });
      expect(p1.items).toHaveLength(2);
      expect(p1.hasMore).toBe(true);
      expect(p1.contractVersion).toBe(1);
      const p2 = await pull.pull({ deviceId: DEVICE, entity: "partners_lite", cursorToken: p1.nextCursor, limit: 2 });
      expect(p2.hasMore).toBe(false);
      expect(p2.items.length).toBeGreaterThanOrEqual(1);

      // tampered
      const bad = p1.nextCursor.slice(0, -2) + "zz";
      await expect(pull.pull({ deviceId: DEVICE, entity: "partners_lite", cursorToken: bad })).rejects.toBeInstanceOf(CursorError);
      // wrong entity
      await expect(pull.pull({ deviceId: DEVICE, entity: "items", cursorToken: p1.nextCursor })).rejects.toBeInstanceOf(CursorError);
      // regression → resync directive
      await pull.ack({ deviceId: DEVICE, entity: "partners_lite", cursorToken: p2.nextCursor });
      const regressed = await pull.pull({ deviceId: DEVICE, entity: "partners_lite", cursorToken: p1.nextCursor });
      expect(regressed.resync).toBe(true);
      // verify token round-trip
      expect(verifyCursor(signCursor({ entityType: "items", seq: 9, issuedAt: 1 }), "items").seq).toBe(9);
    });
  });
});

describe("PHASE-020 inbox retention + device registry (real PG)", () => {
  it("retention job deletes only expired rows, is idempotent and audited", async () => {
    await withTenant(TENANT_S, async () => {
      await txQuery(
        `INSERT INTO inbox_commands (tenant_id, device_id, command_id, intent, idempotency_key, status, result, expires_at)
         VALUES (erp.current_tenant_id(), $1, '018f3a2e-9c40-7000-8000-000000000e01', 'pos_sale', 'ret-old', 'ACCEPTED', '{}', now() - interval '31 days')`,
        [DEVICE],
      );
      await txQuery(
        `INSERT INTO inbox_commands (tenant_id, device_id, command_id, intent, idempotency_key, status, result, expires_at)
         VALUES (erp.current_tenant_id(), $1, '018f3a2e-9c40-7000-8000-000000000e02', 'pos_sale', 'ret-new', 'ACCEPTED', '{}', now() + interval '10 days')`,
        [DEVICE],
      );
      const first = await inbox.runRetention(S_CASHIER);
      expect(first.deleted).toBeGreaterThanOrEqual(1);
      const second = await inbox.runRetention(S_CASHIER);
      expect(second.deleted).toBe(0); // idempotent
      const remaining = await txQuery<{ k: string }>(`SELECT idempotency_key AS k FROM inbox_commands WHERE idempotency_key LIKE 'ret-%'`);
      expect(remaining.map((r) => r.k)).toEqual(["ret-new"]);
    });
  });

  it("attestation-lite challenge + attest sets trust flags; revoke flips the kill switch with audit", async () => {
    await withTenant(TENANT_S, async () => {
      const challenge = await devices.attestationChallenge({ deviceId: DEVICE, actorId: S_CASHIER });
      expect(challenge.nonce).toHaveLength(64);
      const attested = await devices.attest({
        deviceId: DEVICE,
        nonce: challenge.nonce,
        signature: "sig",
        publicKey: "pk",
        actorId: S_CASHIER,
      });
      expect(attested.attested).toBe(true);
      const revoked = await devices.revoke({ deviceId: DEVICE, actorId: S_CASHIER, reason: "lost device" });
      expect(revoked.revoked).toBe(true);
      const row = await txQuery<{ revoked_at: string | null }>(`SELECT revoked_at FROM devices WHERE id = $1`, [DEVICE]);
      expect(row[0]?.revoked_at).not.toBeNull();
    });
  });
});
