/**
 * PHASE-021 T2 — the SQLite local-store binding for the desktop shell
 * (LOCAL_DATABASE §1.2/§6): better-sqlite3 with WAL mandatory, integrity check
 * on start, and the corruption path (stage outbox/inbox → reset → full pull).
 * SQLCipher encryption is applied at the Tauri SQL-plugin layer in CI builds
 * (the key never leaves the OS keychain — D-02); this class is
 * encryption-agnostic and takes any better-sqlite3-shaped database.
 *
 * The `Database` type is structural so the in-memory reference store and the
 * real driver both satisfy it in tests.
 */

import type { LocalStore, OutboxRow } from "./local-store";
import { applyMigrations, SYNC_CORE_SCHEMA_VERSION } from "./schema";

export interface SqliteStatement {
  run: (...params: unknown[]) => { changes: number };
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
}

export interface SqliteDatabase {
  pragma: (source: string) => unknown;
  exec: (sqlText: string) => void;
  prepare: (sqlText: string) => SqliteStatement;
  transaction: (fn: () => void) => () => void;
}

/** Enable WAL + run the integrity check; throws when the file is corrupt. */
export function ensureWalAndIntegrity(db: SqliteDatabase): void {
  db.pragma("journal_mode = WAL");
  const row = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
  if (row.integrity_check !== "ok") {
    throw new Error(`SQLITE_CORRUPT: ${row.integrity_check}`);
  }
}

export class SqliteLocalStore implements LocalStore {
  constructor(private readonly db: SqliteDatabase) {
    applyMigrations(
      (s) => this.db.exec(s),
      (fn) => this.db.transaction(fn)(),
      () => Number((this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined)?.value ?? 0),
    );
    this.db.exec(`INSERT OR REPLACE INTO meta (key, value) VALUES ('sync_core_schema_version', '${SYNC_CORE_SCHEMA_VERSION}')`);
  }

  async enqueue(cmd: Omit<OutboxRow, "status" | "attempts" | "nextAttemptAt" | "createdAt">): Promise<void> {
    // natural-id upsert: same commandId re-enqueued is a no-op
    this.db
      .prepare(
        `INSERT OR IGNORE INTO outbox (command_id, entity_type, intent, idempotency_key, base_version, client_created_at, local_ref, payload, status, attempts, next_attempt_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'QUEUED', 0, 0, ?)`,
      )
      .run(cmd.commandId, cmd.entityType, cmd.intent, cmd.idempotencyKey, cmd.baseVersion ?? null, cmd.clientCreatedAt ?? null, cmd.localRef ?? null, cmd.payload, Date.now());
  }

  async dueOutbox(now: number, limit: number): Promise<OutboxRow[]> {
    const rows = this.db
      .prepare(`SELECT * FROM outbox WHERE status = 'QUEUED' AND next_attempt_at <= ? ORDER BY created_at ASC LIMIT ?`)
      .all(now, limit) as Record<string, unknown>[];
    return rows.map((r) => ({
      commandId: r.command_id as string,
      entityType: r.entity_type as string,
      intent: r.intent as string,
      idempotencyKey: r.idempotency_key as string,
      baseVersion: (r.base_version as number | null) ?? undefined,
      clientCreatedAt: (r.client_created_at as string | null) ?? undefined,
      localRef: (r.local_ref as string | null) ?? undefined,
      payload: r.payload as string,
      status: r.status as OutboxRow["status"],
      attempts: r.attempts as number,
      nextAttemptAt: r.next_attempt_at as number,
      createdAt: r.created_at as number,
    }));
  }

  async markInFlight(commandId: string): Promise<void> {
    this.db.prepare(`UPDATE outbox SET status = 'IN_FLIGHT' WHERE command_id = ?`).run(commandId);
  }

  async markAcked(commandId: string): Promise<void> {
    this.db.prepare(`DELETE FROM outbox WHERE command_id = ?`).run(commandId);
  }

  async markFailed(commandId: string, nextAttemptAt: number): Promise<void> {
    this.db
      .prepare(`UPDATE outbox SET status = 'QUEUED', attempts = attempts + 1, next_attempt_at = ? WHERE command_id = ?`)
      .run(nextAttemptAt, commandId);
  }

  async recoverInFlight(_now: number): Promise<number> {
    return this.db.prepare(`UPDATE outbox SET status = 'QUEUED' WHERE status = 'IN_FLIGHT'`).run().changes;
  }

  async outboxCount(): Promise<number> {
    return (this.db.prepare(`SELECT count(*) AS n FROM outbox`).get() as { n: number }).n;
  }

  async applyInbox(items: { seq: number; entityType: string; entityId: string; op: "upsert" | "tombstone"; row?: string }[]): Promise<number> {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO inbox (seq, entity_type, entity_id, op, row, applied) VALUES (?, ?, ?, ?, ?, 1)`,
    );
    const tx = this.db.transaction(() => {
      for (const item of items) stmt.run(item.seq, item.entityType, item.entityId, item.op, item.row ?? null);
    });
    tx();
    return items.length;
  }

  async inboxPending(): Promise<number> {
    return (this.db.prepare(`SELECT count(*) AS n FROM inbox WHERE applied = 0`).get() as { n: number }).n;
  }

  async getCursor(entityType: string): Promise<number> {
    const row = this.db.prepare(`SELECT seq FROM cursors WHERE entity_type = ?`).get(entityType) as { seq: number } | undefined;
    return row?.seq ?? 0;
  }

  async setCursor(entityType: string, seq: number): Promise<void> {
    this.db
      .prepare(`INSERT INTO cursors (entity_type, seq, updated_at) VALUES (?, ?, ?)
                 ON CONFLICT(entity_type) DO UPDATE SET seq = MAX(seq, excluded.seq), updated_at = excluded.updated_at`)
      .run(entityType, seq, Date.now());
  }

  async getMeta(key: string): Promise<string | undefined> {
    return (this.db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as { value: string } | undefined)?.value;
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)`).run(key, value);
  }

  /**
   * Corruption path (LOCAL_DATABASE §6.4): stage the outbox+inbox rows, reset
   * the machinery tables, return the staged rows so the caller can re-import
   * them before a full pull.
   */
  stageAndResetMachinery(): { outbox: unknown[]; inbox: unknown[] } {
    const outbox = this.db.prepare(`SELECT * FROM outbox`).all();
    const inbox = this.db.prepare(`SELECT * FROM inbox`).all();
    const tx = this.db.transaction(() => {
      this.db.exec(`DELETE FROM outbox; DELETE FROM inbox; DELETE FROM cursors;`);
    });
    tx();
    return { outbox, inbox };
  }
}
