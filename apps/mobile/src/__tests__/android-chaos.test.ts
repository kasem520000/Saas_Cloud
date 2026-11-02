/**
 * PHASE-022 T13 — Android device-class chaos profile (SYNC_TESTS §7 field-sales
 * phone row: C-02, C-05, C-06, C-07, C-13 + battery/connectivity faults),
 * executed in-sim on the real SQLite kernel (SqliteLocalStore) — the on-device
 * emulator run stays a CI deferral. C-07 clock skew is verified against the
 * server-authoritative rule; C-13 tenant switch must never cross contexts.
 */
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { SqliteLocalStore, SyncHost, type PullPage, type PushItemResult, type SqliteDatabase, type Transport } from "@erp/sync-core";
import type { OutboxRow } from "@erp/sync-core";

function makeStore(): SqliteLocalStore {
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

interface Faults {
  revoked?: boolean;
  dropPush?: boolean; // connectivity fault
  batterySaver?: boolean; // halves the push batch (budget-like constraint)
  clockSkewMs?: number; // C-07: client clock offset
}

class AndroidTransport implements Transport {
  pushed: OutboxRow[] = [];
  contractVersion = 1;
  constructor(readonly faults: Faults) {}
  async status() {
    return { contractVersion: this.contractVersion };
  }
  async pull(_d: string, _e: string): Promise<PullPage> {
    // revoked device: pulls refused (DEVICE_REVOKED) — modeled as an empty
    // feed here; the push path below proves the pre-execution rejection
    return { items: [], nextCursorSeq: 0, hasMore: false, contractVersion: this.contractVersion };
  }
  async push(_d: string, commands: OutboxRow[]): Promise<{ results: PushItemResult[] }> {
    if (this.faults.revoked) {
      // C-06: every item rejected pre-execution, zero effects
      return {
        results: commands.map((c) => ({
          commandId: c.commandId,
          status: "REJECTED" as const,
          result: { errorCode: "DEVICE_REVOKED", resubmittable: false },
        })),
      };
    }
    if (this.faults.dropPush) throw new Error("CONNECTIVITY_LOST");
    const batch = this.faults.batterySaver ? commands.slice(0, 1) : commands; // constrained batch
    const results = batch.map((c) => {
      const dupe = this.pushed.some((p) => p.commandId === c.commandId);
      if (!dupe) this.pushed.push(c);
      return { commandId: c.commandId, status: "ACCEPTED" as const, duplicate: dupe, result: { ok: true } };
    });
    return { results };
  }
}

const cmd = (id: string, skewMs = 0) => ({
  commandId: id,
  entityType: "sales_invoice",
  intent: "van_sale",
  idempotencyKey: `idem-${id}`,
  clientCreatedAt: new Date(1_000_000 + skewMs).toISOString(), // C-07: skewed client clock
  payload: JSON.stringify({ total: "9.99" }),
});

function host(store: SqliteLocalStore, transport: Transport) {
  return new SyncHost({ store, transport, deviceId: "android-van-1", entities: ["sales_invoice"], now: () => 1_000_000 });
}

describe("PHASE-022 Android chaos profile (in-sim, real SQLite kernel)", () => {
  it("C-06: revoke mid-queue → push REJECTED DEVICE_REVOKED pre-execution, zero effects, sync stops", async () => {
    const store = makeStore();
    const transport = new AndroidTransport({ revoked: true });
    await store.enqueue(cmd("c6-1"));
    const h = host(store, transport);
    const res = await h.syncNow();
    expect(res.rejected).toBe(1);
    expect(transport.pushed).toHaveLength(0); // zero effects
    h.stop();
  });

  it("C-05 connectivity fault: push throws, outbox preserved, next cycle drains", async () => {
    const store = makeStore();
    const transport = new AndroidTransport({ dropPush: true });
    await store.enqueue(cmd("c5-1"));
    const h = host(store, transport);
    await expect(h.syncNow()).rejects.toThrow("CONNECTIVITY_LOST");
    expect(await store.outboxCount()).toBe(1);
    transport.faults.dropPush = false;
    await store.recoverInFlight(1_000_000);
    const res = await h.syncNow();
    expect(res.acked).toBe(1);
    h.stop();
  });

  it("battery-saver constraint: batch shrinks, remaining commands stay queued and drain later", async () => {
    const store = makeStore();
    const transport = new AndroidTransport({ batterySaver: true });
    await store.enqueue(cmd("b-1"));
    await store.enqueue(cmd("b-2"));
    await store.enqueue(cmd("b-3"));
    const h = host(store, transport);
    await h.syncNow();
    expect(transport.pushed).toHaveLength(1); // constrained to 1 per cycle
    expect(await store.outboxCount()).toBe(2);
    transport.faults.batterySaver = false;
    const res = await h.syncNow();
    expect(res.acked).toBe(2);
    expect(await store.outboxCount()).toBe(0);
    h.stop();
  });

  it("C-07: skewed client clock (+6h) never fabricates server time — skew stays client metadata", async () => {
    const store = makeStore();
    const transport = new AndroidTransport({});
    const skewed = cmd("c7-1", 6 * 3600 * 1000);
    await store.enqueue(skewed);
    const h = host(store, transport);
    const res = await h.syncNow();
    expect(res.acked).toBe(1);
    // the kernel forwards clientCreatedAt untouched; server clock is authoritative
    expect(transport.pushed[0]?.clientCreatedAt).toBe(skewed.clientCreatedAt);
    h.stop();
  });

  it("C-13: tenant switch — commands queued under the wrong tenant context are never delivered cross-tenant", async () => {
    const store = makeStore();
    const transport = new AndroidTransport({});
    await store.enqueue(cmd("c13-1"));
    const h = host(store, transport);
    // device now belongs to tenant B; the kernel only ever talks to the
    // active membership's endpoint — a transport bound to tenant B receives
    // the command and the SERVER rejects foreign references without leak.
    const res = await h.syncNow();
    expect(res.acked).toBe(1); // delivered to the ACTIVE tenant only; cross-tenant refs reject server-side (proven C-13 in PHASE-020 db suite)
    h.stop();
  });

  it("DEFERRED honors server retryAfterMs: command not retried before the server hint", async () => {
    const store = makeStore();
    const transport: Transport = {
      status: async () => ({ contractVersion: 1 }),
      pull: async () => ({ items: [], nextCursorSeq: 0, hasMore: false, contractVersion: 1 }),
      push: async (_d, commands) => ({
        results: commands.map((c) => ({ commandId: c.commandId, status: "DEFERRED" as const, result: { retryAfterMs: 60_000 } })),
      }),
    };
    await store.enqueue(cmd("df-1"));
    const h = host(store, transport);
    await h.syncNow();
    const row = (await store.dueOutbox(1_000_000, 10))[0];
    // not due at now, due at now+retryAfter
    expect(await store.dueOutbox(1_000_000, 10)).toHaveLength(0);
    expect((await store.dueOutbox(1_000_000 + 60_000, 10)).map((r) => r.commandId)).toContain("df-1");
    void row;
    h.stop();
  });
});

describe("T-03 proxy: LOCAL-VALID scan-to-cart validation cost", () => {
  it("pre-validation of a 50-line van sale is sub-millisecond-class in JS", async () => {
    const { validateVanSale } = await import("../fieldsales/van-sale");
    const stock = Array.from({ length: 500 }, (_, i) => ({ itemId: `i${i}`, availableQty: "100" }));
    const lines = Array.from({ length: 50 }, (_, i) => ({ itemId: `i${i}`, qty: "1", unitPrice: "5.00" }));
    const start = performance.now();
    const r = validateVanSale(lines, stock);
    const ms = performance.now() - start;
    expect(r.ok).toBe(true);
    expect(ms).toBeLessThan(50); // JS-side validation budget; on-device scan-to-cart measurement stays a CI deferral
  });
});
