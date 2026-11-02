/**
 * PHASE-021 T2 / LOCAL_DATABASE §1.2 — the exact local machinery schema
 * (outbox, inbox, cursors, meta) plus the forward-only migration runner.
 * Money/quantities are TEXT decimal strings (ADR-0009; REAL is banned —
 * enforced by the lint rule). Migrations apply inside ONE transaction at app
 * start and are mapped to CONTRACT_VERSION; a semantic change resets cursors
 * (full re-pull of the entity).
 */

export const SYNC_CORE_SCHEMA_VERSION = 1;

export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS meta (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS cursors (
     entity_type TEXT PRIMARY KEY,
     seq INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS outbox (
     command_id TEXT PRIMARY KEY,          -- client UUIDv7 (ADR-0006); natural-id upsert
     entity_type TEXT NOT NULL,
     intent TEXT NOT NULL,
     idempotency_key TEXT NOT NULL,
     base_version INTEGER,
     client_created_at TEXT,
     local_ref TEXT,
     payload TEXT NOT NULL,                 -- JSON text; decimals as TEXT (ADR-0009)
     status TEXT NOT NULL CHECK (status IN ('QUEUED','IN_FLIGHT','ACKED','FAILED')),
     attempts INTEGER NOT NULL DEFAULT 0,
     next_attempt_at INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS ix_outbox_due ON outbox (status, next_attempt_at)`,
  `CREATE TABLE IF NOT EXISTS inbox (
     seq INTEGER NOT NULL,
     entity_type TEXT NOT NULL,
     entity_id TEXT NOT NULL,
     op TEXT NOT NULL CHECK (op IN ('upsert','tombstone')),
     row TEXT,                              -- JSON text
     applied INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (entity_type, seq)
   )`,
  `CREATE INDEX IF NOT EXISTS ix_inbox_pending ON inbox (applied)`,
];

/** Forward-only local migrations. `contractVersion` is the minimum server
 *  contract version the local schema is compatible with. */
export interface LocalMigration {
  version: number;
  contractVersion: number;
  statements: readonly string[];
}

export const LOCAL_MIGRATIONS: readonly LocalMigration[] = [
  { version: 1, contractVersion: 1, statements: SCHEMA_STATEMENTS },
];

/** Apply pending migrations in ONE transaction; returns applied versions. */
export function applyMigrations(
  exec: (sqlText: string) => void,
  inTransaction: (fn: () => void) => void,
  getApplied: () => number,
): number[] {
  const applied: number[] = [];
  exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  inTransaction(() => {
    let current = getApplied();
    for (const m of LOCAL_MIGRATIONS) {
      if (m.version <= current) continue;
      for (const stmt of m.statements) exec(stmt);
      exec(`INSERT INTO meta (key, value) VALUES ('schema_version', '${m.version}')`);
      applied.push(m.version);
      current = m.version;
    }
  });
  return applied;
}
