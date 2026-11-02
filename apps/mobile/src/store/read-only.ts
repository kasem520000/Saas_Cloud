/**
 * PHASE-022 T5/T9 — personal-account read-only device class
 * (LOCAL_DATABASE §1.1 rule 2, matrix personal-account column): the store
 * wrapper hard-refuses every write path. No outbox exists for this class —
 * sync is pull-only and the server feed is already customer-scoped.
 */

import type { LocalStore, OutboxRow } from "@erp/sync-core";

export class ReadOnlyLocalStore implements LocalStore {
  constructor(private readonly inner: LocalStore) {}

  private refuse(): never {
    throw new Error("READ_ONLY_DEVICE: personal-account devices have no write path");
  }

  async enqueue(_cmd: Omit<OutboxRow, "status" | "attempts" | "nextAttemptAt" | "createdAt">): Promise<void> {
    this.refuse();
  }
  async markInFlight(_id: string): Promise<void> {
    this.refuse();
  }
  async markAcked(_id: string): Promise<void> {
    this.refuse();
  }
  async markFailed(_id: string, _at: number): Promise<void> {
    this.refuse();
  }
  async recoverInFlight(now: number): Promise<number> {
    return this.inner.recoverInFlight(now); // no-op on this class, but safe
  }
  async dueOutbox(now: number, limit: number) {
    return this.inner.dueOutbox(now, limit).then((rows) => {
      if (rows.length > 0) this.refuse();
      return rows;
    });
  }
  async outboxCount() {
    return 0;
  }
  applyInbox(items: Parameters<LocalStore["applyInbox"]>[0]) {
    return this.inner.applyInbox(items);
  }
  inboxPending() {
    return this.inner.inboxPending();
  }
  getCursor(e: string) {
    return this.inner.getCursor(e);
  }
  setCursor(e: string, seq: number) {
    return this.inner.setCursor(e, seq);
  }
  getMeta(k: string) {
    return this.inner.getMeta(k);
  }
  setMeta(k: string, v: string) {
    return this.inner.setMeta(k, v);
  }
}
