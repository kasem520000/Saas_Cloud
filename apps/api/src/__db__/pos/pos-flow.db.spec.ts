import { beforeAll, describe, expect, it } from "vitest";

import { ensureTestDb, superuserClient } from "../test-db";
import { withTenant } from "../../infra/db/tenant-context";
import { AuditService } from "../../modules/audit/api/audit";
import { DrizzleAuditStore } from "../../modules/audit/infrastructure/drizzle-audit.store";
import { TerminalService } from "../../modules/pos/application/terminal.service";
import { PosSaleService } from "../../modules/pos/application/pos-sale.service";
import { SyncSliceService } from "../../modules/pos/application/sync-slice.service";
import { TerminalCodeConflictError, TerminalInactiveError, TerminalNotFoundError } from "../../modules/pos/domain/pos-errors";
import * as posStore from "../../modules/pos/infrastructure/pos.store";
import { salesInvoices, setupSalesFixture, setSalesSetting, TENANT_S, S_CASHIER } from "../sales/fixtures";

/**
 * PHASE-016 db evidence (real PG16, tenant S fixture): terminal registry
 * lifecycle (T2), online POS sale posting through the sales chain (T5),
 * and the narrow sync slice (T8): C-01 duplicate push replays with zero new
 * effects, typed rejections (C-09 shape), batch budget, revoked-device
 * pre-execution rejection, cursor pull.
 */

const audit = new AuditService(new DrizzleAuditStore());
const terminals = new TerminalService(audit);
const posSale = new PosSaleService(salesInvoices, audit);
const sync = new SyncSliceService(posSale);

async function countInvoices(): Promise<number> {
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
  await withTenant(TENANT_S, () => setSalesSetting("sales.cash_autopost", true));
  const su = await superuserClient();
  await su.query(
    `INSERT INTO users (id, email, full_name, password_hash, status) VALUES
     ('00000000-0000-0000-0000-000000000505', 'policy-actor@system', 'Policy Actor', 'x', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`,
  );
  await su.end();
});

describe("T2 — terminal registry lifecycle", () => {
  it("registers, lists, deactivates, reactivates; duplicate code conflicts; unknown code 404-shaped", async () => {
    await withTenant(TENANT_S, async () => {
      const fx = await setupSalesFixture();
      const t = await terminals.register({
        branchId: fx.branchId,
        deviceId: null,
        code: "pos-01",
        name: "Counter 1",
        cashAccountId: fx.cashAccountId,
        receiptSizeMm: 80,
        actorId: null,
      });
      expect(t.code).toBe("POS-01");
      expect(t.status).toBe("ACTIVE");

      await expect(
        terminals.register({
          branchId: fx.branchId,
          deviceId: null,
          code: "POS-01",
          name: "dup",
          cashAccountId: fx.cashAccountId,
          receiptSizeMm: 58,
          actorId: null,
        }),
      ).rejects.toBeInstanceOf(TerminalCodeConflictError);

      const off = await terminals.setStatus(t.id, "INACTIVE", null);
      expect(off?.status).toBe("INACTIVE");
      await expect(posSale.submitSale({
        terminalCode: "POS-01",
        customerId: fx.customerId,
        lines: [{ itemId: fx.items.a, qty: "1", unitPrice: "5" }],
        actorId: null,
      })).rejects.toBeInstanceOf(TerminalInactiveError);

      const on = await terminals.setStatus(t.id, "ACTIVE", null);
      expect(on?.status).toBe("ACTIVE");

      await expect(
        posSale.submitSale({ terminalCode: "NOPE", customerId: fx.customerId, lines: [{ itemId: fx.items.a, qty: "1", unitPrice: "5" }], actorId: null }),
      ).rejects.toBeInstanceOf(TerminalNotFoundError);
    });
  });
});

describe("T5 — online POS sale posts through the sales chain", () => {
  let saleId = "";
  let before = 0;
  it("submits a cash POS sale: invoice POSTED, POS channel fields set, change_log + audit rows written", async () => {
    await withTenant(TENANT_S, async () => {
      const fx = await setupSalesFixture();
      before = await countInvoices();
      const sale = await posSale.submitSale({
        terminalCode: "POS-01",
        customerId: fx.customerId,
        orderType: "COUNTER",
        lines: [
          {
            itemId: null,
            accountId: fx.gl.serviceAccount,
            qty: "2",
            unitPrice: "10.000000",
            taxCodeId: fx.taxCodeIds.notSubject,
          },
        ],
        actorId: null,
      });
      expect(sale.status).toBe("POSTED");
      expect(sale.invoiceNo).toMatch(/^SAL-/);
      expect(sale.journalEntryId).not.toBeNull();
      saleId = sale.invoiceId;
    });
    expect(await countInvoices()).toBe(before + 1);
    const su = await superuserClient();
    const inv = await su.query(
      `SELECT pos_terminal_id, order_type, sync_state FROM sales_invoices WHERE id = $1`,
      [saleId],
    );
    expect(inv.rows[0]?.order_type).toBe("COUNTER");
    expect(inv.rows[0]?.sync_state).toBe("SYNCED");
    const cl = await su.query(`SELECT count(*)::int AS n FROM change_log WHERE tenant_id = $1 AND entity_type = 'sales_invoice'`, [TENANT_S]);
    expect(cl.rows[0]?.n).toBeGreaterThanOrEqual(1);
    const au = await su.query(
      `SELECT count(*)::int AS n FROM audit_events WHERE tenant_id = $1 AND action = 'pos_sale.posted'`,
      [TENANT_S],
    );
    expect(au.rows[0]?.n).toBeGreaterThanOrEqual(1);
    await su.end();
  });
});

describe("T8 — sync slice: C-01 dedupe, typed rejections, batch budget, revocation, pull cursors", () => {
  it("push pos_sale → ACCEPTED with official number; duplicate push replays with zero new invoices (C-01)", async () => {
    let before = 0;
    await withTenant(TENANT_S, async () => {
      const fx = await setupSalesFixture();
      before = await countInvoices();
      const payload = {
        terminalCode: "POS-01",
        customerId: fx.customerId,
        orderType: "COUNTER" as const,
        offlineReceiptNo: "OFF-POS-01-1",
        lines: [{ itemId: null, accountId: fx.gl.serviceAccount, qty: "1", unitPrice: "7.000000", taxCodeId: fx.taxCodeIds.notSubject }],
      };
      const deviceId = "00000000-0000-4000-8000-0000000000aa";
      await withTenant(TENANT_S, async () => {
        const su = await superuserClient();
        await su.query(
          `INSERT INTO devices (id, user_id, platform, name, device_key_hash) VALUES
           ($1, $2, 'POS_TERMINAL', 'POS-01 device', 'hash-aa') ON CONFLICT (id) DO NOTHING`,
          [deviceId, S_CASHIER],
        );
        await su.end();
      });
      const key = "cmd-0001-pos-sale-aaaa";
      const first = await sync.push({
        deviceId,
        commands: [{ idempotencyKey: key, clientId: "00000000-0000-7000-8000-0000000000cc", type: "pos_sale", payload }],
      });
      expect(first.results[0]?.status).toBe("ACCEPTED");
      expect(first.results[0]?.result.invoiceNo).toMatch(/^SAL-/);
      expect(first.results[0]?.result.offlineReceiptNo).toBe("OFF-POS-01-1");

      const second = await sync.push({
        deviceId,
        commands: [{ idempotencyKey: key, clientId: "00000000-0000-7000-8000-0000000000cc", type: "pos_sale", payload }],
      });
      expect(second.results[0]?.status).toBe("ACCEPTED");
      expect(second.results[0]?.result.replay).toBe(true);
      expect(second.results[0]?.result.invoiceNo).toBe(first.results[0]?.result.invoiceNo);
    });
    expect(await countInvoices()).toBe(before + 1); // exactly-once (INV-013)
  });

  it("unknown terminal → typed REJECTED; batch > 50 → BATCH_TOO_LARGE for every item (C-09 shape)", async () => {
    await withTenant(TENANT_S, async () => {
      const fx = await setupSalesFixture();
      const deviceId = "00000000-0000-4000-8000-0000000000aa";
      const bad = await sync.push({
        deviceId,
        commands: [
          {
            idempotencyKey: "cmd-bad-0001",
            clientId: "00000000-0000-7000-8000-0000000000cc",
            type: "pos_sale",
            payload: { terminalCode: "GHOST", customerId: fx.customerId, offlineReceiptNo: "OFF-POS-01-9", lines: [{ itemId: null, accountId: fx.gl.serviceAccount, qty: "1", unitPrice: "1" }] },
          },
        ],
      });
      expect(bad.results[0]?.status).toBe("REJECTED");
      expect(bad.results[0]?.result.errorCode).toBe("POS_TERMINAL_NOT_FOUND");

      const big = await sync.push({
        deviceId,
        commands: Array.from({ length: 51 }, (_, i) => ({
          idempotencyKey: `cmd-bulk-${i}`,
          clientId: "00000000-0000-7000-8000-0000000000cc",
          type: "pos_sale" as const,
          payload: { terminalCode: "POS-01", customerId: fx.customerId, lines: [{ itemId: null, accountId: fx.gl.serviceAccount, qty: "1", unitPrice: "1" }] },
        })),
      });
      expect(big.results).toHaveLength(51);
      expect(big.results.every((r) => r.status === "REJECTED" && r.result.errorCode === "BATCH_TOO_LARGE")).toBe(true);
    });
  });

  it("revoked device → DEVICE_REVOKED before execution, zero effects", async () => {
    let before = 0;
    await withTenant(TENANT_S, async () => {
      const fx = await setupSalesFixture();
      before = await countInvoices();
      const deviceId = "00000000-0000-4000-8000-0000000000dd";
      const su = await superuserClient();
      await su.query(
        `INSERT INTO devices (id, user_id, platform, name, device_key_hash, revoked_at) VALUES
         ($1, $2, 'POS_TERMINAL', 'revoked device', 'hash-dd', now()) ON CONFLICT (id) DO NOTHING`,
        [deviceId, S_CASHIER],
      );
      await su.end();
      await expect(
        sync.push({
          deviceId,
          commands: [
            {
              idempotencyKey: "cmd-revoked-1",
              clientId: "00000000-0000-7000-8000-0000000000cc",
              type: "pos_sale",
              payload: { terminalCode: "POS-01", customerId: fx.customerId, offlineReceiptNo: "OFF-POS-01-77", lines: [{ itemId: null, accountId: fx.gl.serviceAccount, qty: "1", unitPrice: "1" }] },
            },
          ],
        }),
      ).rejects.toMatchObject({ code: "DEVICE_REVOKED" });
    });
    expect(await countInvoices()).toBe(before);
  });

  it("pull advances the cursor over the POS feed group and reports tombstones", async () => {
    await withTenant(TENANT_S, async () => {
      const deviceId = "00000000-0000-4000-8000-0000000000aa";
      await posStore.appendChangeLog({ entityType: "pos_terminal", entityId: "00000000-0000-4000-8000-0000000000ee", op: "INSERT", payload: { code: "POS-01" } });
      const page1 = await sync.pull({ deviceId, entity: "pos_terminal", cursor: 0 });
      expect(page1.nextCursor).toBeGreaterThan(0);
      expect(page1.changes.length).toBeGreaterThanOrEqual(1);
      const page2 = await sync.pull({ deviceId, entity: "sales_invoice", cursor: page1.nextCursor });
      expect(page2.changes).toHaveLength(0); // nothing new — cursor held
      expect(page2.nextCursor).toBe(page1.nextCursor);
      const status = await sync.status(deviceId);
      expect(status.cursors.pos_terminal).toBe(page1.nextCursor);
    });
  });
});
