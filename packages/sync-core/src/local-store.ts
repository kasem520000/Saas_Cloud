/**
 * PHASE-020 T10/T11 — the local sync machinery (LOCAL_DATABASE §1.2) as a
 * storage-agnostic interface: `outbox`, `inbox`, `cursors`, `meta`. Money and
 * quantities are TEXT decimal strings everywhere (ADR-0009; REAL is banned —
 * enforced by the lint rule in §11). The reference in-memory implementation
 * below is what the unit/property tests and the chaos harness drive; the
 * SQLite/SQLCipher binding (PHASE-021/022) implements the same interface.
 */

export type OutboxStatus = "QUEUED" | "IN_FLIGHT" | "ACKED" | "FAILED";

export interface OutboxRow {
  commandId: string;
  entityType: string;
  intent: string;
  idempotencyKey: string;
  baseVersion?: number;
  clientCreatedAt?: string;
  localRef?: string;
  payload: string; // JSON text — decimal strings inside (ADR-0009)
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
}

export interface InboxRow {
  seq: number;
  entityType: string;
  entityId: string;
  op: "upsert" | "tombstone";
  row?: string; // JSON text
  applied: boolean;
}

export interface LocalStore {
  // outbox
  enqueue(cmd: Omit<OutboxRow, "status" | "attempts" | "nextAttemptAt" | "createdAt">): Promise<void>;
  dueOutbox(now: number, limit: number): Promise<OutboxRow[]>;
  markInFlight(commandId: string): Promise<void>;
  markAcked(commandId: string): Promise<void>;
  markFailed(commandId: string, nextAttemptAt: number): Promise<void>;
  /** Crash recovery: IN_FLIGHT rows from a dead session go back to QUEUED. */
  recoverInFlight(now: number): Promise<number>;
  outboxCount(): Promise<number>;
  // inbox
  applyInbox(items: Omit<InboxRow, "applied">[]): Promise<number>; // returns applied count
  inboxPending(): Promise<number>;
  // cursors — advance ONLY after the page committed locally (§2 rule)
  getCursor(entityType: string): Promise<number>;
  setCursor(entityType: string, seq: number): Promise<void>;
  // meta
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
}

/** Reference in-memory implementation (harness-native reference device). */
export class InMemoryLocalStore implements LocalStore {
  private outbox = new Map<string, OutboxRow>();
  private inbox: InboxRow[] = [];
  private cursors = new Map<string, number>();
  private meta = new Map<string, string>();

  async enqueue(cmd: Omit<OutboxRow, "status" | "attempts" | "nextAttemptAt" | "createdAt">): Promise<void> {
    // natural-id upsert: re-enqueueing the same commandId is a no-op (draft creates)
    if (this.outbox.has(cmd.commandId)) return;
    this.outbox.set(cmd.commandId, {
      ...cmd,
      status: "QUEUED",
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: Date.now(),
    });
  }

  async dueOutbox(now: number, limit: number): Promise<OutboxRow[]> {
    return [...this.outbox.values()]
      .filter((r) => r.status === "QUEUED" && r.nextAttemptAt <= now)
      .sort((a, b) => a.createdAt - b.createdAt) // per-entity FIFO preserved by insertion order
      .slice(0, limit);
  }

  async markInFlight(commandId: string): Promise<void> {
    const row = this.outbox.get(commandId);
    if (row !== undefined) row.status = "IN_FLIGHT";
  }

  async markAcked(commandId: string): Promise<void> {
    this.outbox.delete(commandId);
  }

  async markFailed(commandId: string, nextAttemptAt: number): Promise<void> {
    const row = this.outbox.get(commandId);
    if (row !== undefined) {
      row.status = "QUEUED";
      row.attempts += 1;
      row.nextAttemptAt = nextAttemptAt;
    }
  }

  async recoverInFlight(): Promise<number> {
    let n = 0;
    for (const row of this.outbox.values()) {
      if (row.status === "IN_FLIGHT") {
        row.status = "QUEUED";
        n += 1;
      }
    }
    return n;
  }

  async outboxCount(): Promise<number> {
    return this.outbox.size;
  }

  async applyInbox(items: Omit<InboxRow, "applied">[]): Promise<number> {
    // tombstone for an unknown row is a no-op; everything applies in one local tx
    for (const item of items) this.inbox.push({ ...item, applied: true });
    return items.length;
  }

  async inboxPending(): Promise<number> {
    return this.inbox.filter((r) => !r.applied).length;
  }

  async getCursor(entityType: string): Promise<number> {
    return this.cursors.get(entityType) ?? 0;
  }

  async setCursor(entityType: string, seq: number): Promise<void> {
    const current = this.cursors.get(entityType) ?? 0;
    this.cursors.set(entityType, Math.max(current, seq)); // never regress
  }

  async getMeta(key: string): Promise<string | undefined> {
    return this.meta.get(key);
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.meta.set(key, value);
  }
}
