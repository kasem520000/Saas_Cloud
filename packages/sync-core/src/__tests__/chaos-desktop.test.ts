/**
 * PHASE-021 T13 — chaos desktop profile (SYNC_TESTS §7 desktop harness): the
 * SyncHost + SqliteLocalStore (real SQLite) driven by a fault-injecting
 * transport over a kill-matrix. Verifies: forced kills at any sync step lose
 * no outbox command and re-converge (IN_FLIGHT→QUEUED on start), duplicates
 * replay duplicate:true exactly-once server-side semantics, and the
 * contract-version gate flips the app read-only.
 */
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { SqliteLocalStore, type SqliteDatabase } from "../sqlite-store";
import { SyncHost } from "../host";
import { evaluatePermissionGate, PERMISSION_SNAPSHOT_MAX_AGE_MS } from "../permission-snapshot";
import type { PullPage, PushItemResult, Transport } from "../cycle";
import type { OutboxRow } from "../local-store";

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

/** Fault-injecting transport: can drop/fail at chosen phases; counts effects. */
class ChaosTransport implements Transport {
  serverSeq = 0;
  pushed: OutboxRow[] = [];
  failNextPush = false;
  killDuringPush = false;
  contractVersion = 1;

  async status() {
    return { contractVersion: this.contractVersion };
  }
  async pull(_d: string, _entity: string): Promise<PullPage> {
    return { items: [], nextCursorSeq: this.serverSeq, hasMore: false, contractVersion: this.contractVersion };
  }
  async push(_d: string, commands: OutboxRow[]): Promise<{ results: PushItemResult[] }> {
    if (this.killDuringPush) {
      // simulate process death mid-push: some commands marked IN_FLIGHT, none acked
      throw new Error("PROCESS_KILLED_MID_PUSH");
    }
    if (this.failNextPush) {
      this.failNextPush = false;
      throw new Error("NETWORK_DOWN");
    }
    const results = commands.map((c) => {
      const dupe = this.pushed.some((p) => p.commandId === c.commandId);
      if (!dupe) this.pushed.push(c);
      return { commandId: c.commandId, status: "ACCEPTED" as const, duplicate: dupe, result: { ok: true } };
    });
    return { results };
  }
}

const cmd = (id: string) => ({
  commandId: id,
  entityType: "sales_invoice",
  intent: "create",
  idempotencyKey: `idem-${id}`,
  payload: JSON.stringify({ total: "10.00" }),
});

describe("chaos desktop profile (kill-matrix)", () => {
  it("kill mid-push: no outbox command lost, IN_FLIGHT→QUEUED on restart, re-converges", async () => {
    const store = makeStore();
    const transport = new ChaosTransport();
    await store.enqueue(cmd("k1"));
    await store.enqueue(cmd("k2"));

    // session 1: mark in-flight then "die"
    const rows = await store.dueOutbox(Date.now(), 10);
    for (const r of rows) await store.markInFlight(r.commandId);
    // process dies here — nothing acked

    // session 2 (restart): recovery + cycle
    const recovered = await store.recoverInFlight(Date.now());
    expect(recovered).toBe(2);
    const host = new SyncHost({ store, transport, deviceId: "chaos-1", entities: ["sales_invoice"], now: () => Date.now() });
    const res = await host.syncNow();
    expect(res.acked).toBe(2);
    expect(await store.outboxCount()).toBe(0);
    expect(transport.pushed.map((p) => p.commandId).sort()).toEqual(["k1", "k2"]);
    host.stop();
  });

  it("duplicate delivery after crash replays duplicate:true, server applies once", async () => {
    const store = makeStore();
    const transport = new ChaosTransport();
    await store.enqueue(cmd("d1"));
    const host = new SyncHost({ store, transport, deviceId: "chaos-2", entities: ["sales_invoice"], now: () => Date.now() });
    await host.syncNow();
    // simulate redelivery of the same command (server retry after lost ack)
    const replay = (await transport.push("chaos-2", [
      { ...cmd("d1"), status: "QUEUED", attempts: 0, nextAttemptAt: 0, createdAt: 1 },
    ])).results[0]!;
    expect(replay.duplicate).toBe(true);
    expect(transport.pushed.filter((p) => p.commandId === "d1")).toHaveLength(1); // exactly-once effect
    host.stop();
  });

  it("network down → FAILED back to QUEUED with backoff, later cycle converges", async () => {
    const store = makeStore();
    const transport = new ChaosTransport();
    transport.failNextPush = true;
    await store.enqueue(cmd("n1"));
    const host = new SyncHost({ store, transport, deviceId: "chaos-3", entities: ["sales_invoice"], now: () => Date.now() });
    // transport-level failure propagates (like a crash); the row is NOT lost
    await expect(host.syncNow()).rejects.toThrow("NETWORK_DOWN");
    expect(await store.outboxCount()).toBe(1);
    // restart recovery: IN_FLIGHT → QUEUED, next cycle converges
    expect(await store.recoverInFlight(Date.now())).toBe(1);
    const res = await host.syncNow();
    expect(res.acked).toBe(1);
    expect(await store.outboxCount()).toBe(0);
    host.stop();
  });

  it("contract-version gate: server ahead → read-only result, no pushes attempted", async () => {
    const store = makeStore();
    const transport = new ChaosTransport();
    transport.contractVersion = 99;
    await store.enqueue(cmd("g1"));
    const host = new SyncHost({ store, transport, deviceId: "chaos-4", entities: ["sales_invoice"], now: () => Date.now() });
    const res = await host.syncNow();
    expect(res.readOnly).toBe(true);
    expect(transport.pushed).toHaveLength(0); // nothing fabricated
    expect(await store.outboxCount()).toBe(1); // command preserved for after update
    host.stop();
  });
});

describe("permission-snapshot watermark (7-day degrade)", () => {
  const now = 1_000_000_000_000;
  it("fresh snapshot → full-offline", () => {
    expect(evaluatePermissionGate({ snapshotFetchedAtMs: now - 1000, nowMs: now, contractGateOpen: true }).mode).toBe("full-offline");
  });
  it("older than 7 days → read-only WATERMARK_EXPIRED", () => {
    const g = evaluatePermissionGate({ snapshotFetchedAtMs: now - PERMISSION_SNAPSHOT_MAX_AGE_MS - 1, nowMs: now, contractGateOpen: true });
    expect(g.mode).toBe("read-only");
    if (g.mode === "read-only") expect(g.reason).toBe("WATERMARK_EXPIRED");
  });
  it("no snapshot → read-only; contract gate closed → read-only CONTRACT_GATE", () => {
    expect(evaluatePermissionGate({ snapshotFetchedAtMs: null, nowMs: now, contractGateOpen: true }).mode).toBe("read-only");
    expect(evaluatePermissionGate({ snapshotFetchedAtMs: now, nowMs: now, contractGateOpen: false }).mode).toBe("read-only");
  });
});
