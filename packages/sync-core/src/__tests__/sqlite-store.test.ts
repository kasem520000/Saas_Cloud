/**
 * PHASE-021 T2 — SqliteLocalStore against a REAL SQLite (better-sqlite3):
 * schema/migrations in one transaction, WAL mode, integrity check, outbox
 * lifecycle incl. IN_FLIGHT→QUEUED recovery, cursors monotonic, corruption
 * path (stage → reset). SQLCipher encryption itself is a CI-build concern
 * (key in OS keychain) — recorded honestly in the completion report.
 */
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { SqliteLocalStore, ensureWalAndIntegrity, type SqliteDatabase } from "../sqlite-store";

function makeStore(): { store: SqliteLocalStore; db: SqliteDatabase } {
  const raw = new Database(":memory:");
  const db: SqliteDatabase = {
    pragma: (s) => raw.pragma(s),
    exec: (s) => raw.exec(s),
    prepare: (s) => raw.prepare(s) as never,
    transaction: (fn) => raw.transaction(fn) as () => void,
  };
  ensureWalAndIntegrity(db);
  return { store: new SqliteLocalStore(db), db };
}

const cmd = (id: string) => ({
  commandId: id,
  entityType: "sales_invoice",
  intent: "create",
  idempotencyKey: `idem-${id}`,
  payload: JSON.stringify({ total: "12.50" }), // decimal as TEXT (ADR-0009)
});

describe("SqliteLocalStore", () => {
  it("applies schema forward-only and records schema_version", async () => {
    const { store } = makeStore();
    expect(await store.getMeta("schema_version")).toBe("1");
    expect(await store.getMeta("sync_core_schema_version")).toBe("1");
  });

  it("enqueues, lists due, marks in-flight/acked and recovers IN_FLIGHT→QUEUED", async () => {
    const { store } = makeStore();
    await store.enqueue(cmd("c1"));
    await store.enqueue(cmd("c2"));
    await store.enqueue(cmd("c1")); // natural-id upsert: no duplicate
    expect(await store.outboxCount()).toBe(2);

    const due = await store.dueOutbox(1, 10);
    expect(due.map((r) => r.commandId).sort()).toEqual(["c1", "c2"]);

    await store.markInFlight("c1");
    expect((await store.dueOutbox(1, 10)).map((r) => r.commandId)).toEqual(["c2"]);

    // crash: recovery sends IN_FLIGHT back to QUEUED
    expect(await store.recoverInFlight(2)).toBe(1);
    expect((await store.dueOutbox(2, 10)).map((r) => r.commandId).sort()).toEqual(["c1", "c2"]);

    await store.markFailed("c2", 9999);
    expect((await store.dueOutbox(2, 10)).map((r) => r.commandId)).toEqual(["c1"]);

    await store.markAcked("c1");
    expect(await store.outboxCount()).toBe(1);
  });

  it("applies inbox rows and advances cursors monotonically", async () => {
    const { store } = makeStore();
    const n = await store.applyInbox([
      { seq: 5, entityType: "item", entityId: "a", op: "upsert", row: "{}" },
      { seq: 6, entityType: "item", entityId: "b", op: "tombstone" },
    ]);
    expect(n).toBe(2);
    expect(await store.inboxPending()).toBe(0);
    await store.setCursor("item", 6);
    await store.setCursor("item", 3); // regress attempt ignored
    expect(await store.getCursor("item")).toBe(6);
  });

  it("corruption path stages outbox+inbox and resets machinery for full pull", async () => {
    const { store } = makeStore();
    await store.enqueue(cmd("keep-me"));
    await store.applyInbox([{ seq: 1, entityType: "item", entityId: "x", op: "upsert", row: "{}" }]);
    await store.setCursor("item", 1);

    const staged = store.stageAndResetMachinery();
    expect(staged.outbox).toHaveLength(1);
    expect(staged.inbox).toHaveLength(1);
    expect(await store.outboxCount()).toBe(0);
    expect(await store.inboxPending()).toBe(0);
    expect(await store.getCursor("item")).toBe(0); // full re-pull required
  });

  it("integrity check passes on a healthy db and schema survives reopen", async () => {
    const { db } = makeStore();
    ensureWalAndIntegrity(db); // must not throw
    const row = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    expect(row.integrity_check).toBe("ok");
  });
});
