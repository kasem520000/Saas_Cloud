/**
 * PHASE-020 T10 — the sync cycle engine (OFFLINE_ARCHITECTURE §7):
 * connect → status → pull → push → ack, with the contract-version gate
 * (CONTRACT_VERSION_UNSUPPORTED ⇒ read-only mode, no fabricated writes) and
 * full-jitter retries. Transport-agnostic: the harness injects a fault-injecting
 * proxy; real apps inject the HTTP transport. Deterministic when `random` and
 * `now` are injected (chaos harness seeds both).
 */

import type { LocalStore, OutboxRow } from "./local-store";

export const CONTRACT_VERSION = 1;

export interface PullPage {
  items: { op: "upsert" | "tombstone"; id: string; seq: number; row?: unknown }[];
  nextCursorSeq: number;
  hasMore: boolean;
  contractVersion: number;
  resync?: boolean;
}

export interface PushItemResult {
  commandId: string;
  status: "ACCEPTED" | "REJECTED" | "DEFERRED";
  duplicate?: boolean;
  result: Record<string, unknown>;
}

export interface Transport {
  status(deviceId: string): Promise<{ contractVersion: number }>;
  pull(deviceId: string, entity: string, cursorSeq: number): Promise<PullPage>;
  push(deviceId: string, commands: OutboxRow[]): Promise<{ results: PushItemResult[] }>;
}

export interface RetryPolicy {
  baseMs: number;
  capMs: number;
  maxAttempts: number;
}

export const DEFAULT_RETRY: RetryPolicy = { baseMs: 250, capMs: 30_000, maxAttempts: 8 };

export function backoffCeiling(attempt: number, policy: RetryPolicy): number {
  return Math.min(policy.capMs, policy.baseMs * 2 ** Math.max(0, attempt));
}

export function nextDelay(attempt: number, policy: RetryPolicy, random: () => number): number {
  return (random() * (backoffCeiling(attempt, policy) + 1)) | 0; // integer ms
}

export interface CycleDeps {
  store: LocalStore;
  transport: Transport;
  deviceId: string;
  entities: readonly string[];
  now?: () => number;
  random?: () => number;
  retry?: RetryPolicy;
  maxCommandsPerPush?: number;
}

export interface CycleResult {
  pulled: number;
  pushed: number;
  acked: number;
  deferred: number;
  rejected: number;
  readOnly: boolean;
  resynced: string[];
}

/**
 * One full cycle. Ordering rules (SYNC_PROTOCOL §6): per-entity FIFO outbox,
 * pull before push, cursor advances only after the page is applied locally.
 */
export async function runCycle(deps: CycleDeps): Promise<CycleResult> {
  const now = deps.now ?? (() => Date.now());
  const random = deps.random ?? Math.random;
  const retry = deps.retry ?? DEFAULT_RETRY;
  const result: CycleResult = { pulled: 0, pushed: 0, acked: 0, deferred: 0, rejected: 0, readOnly: false, resynced: [] };

  // recovery: IN_FLIGHT from a crashed session → QUEUED (C-04 crash-resume)
  await deps.store.recoverInFlight(now());

  // connect → status: contract-version gate
  const status = await deps.transport.status(deps.deviceId);
  if (status.contractVersion !== CONTRACT_VERSION) {
    // read-only update mode — no fabricated writes
    result.readOnly = true;
    return result;
  }

  // pull per entity
  for (const entity of deps.entities) {
    let cursor = await deps.store.getCursor(entity);
    for (;;) {
      const page = await deps.transport.pull(deps.deviceId, entity, cursor);
      if (page.resync) {
        result.resynced.push(entity);
        cursor = 0;
        await deps.store.setCursor(entity, 0);
        continue;
      }
      await deps.store.applyInbox(
        page.items.map((i) => ({ seq: i.seq, entityType: entity, entityId: i.id, op: i.op, row: i.row === undefined ? undefined : JSON.stringify(i.row) })),
      );
      result.pulled += page.items.length;
      cursor = page.nextCursorSeq;
      await deps.store.setCursor(entity, cursor); // advance only after local commit
      if (!page.hasMore) break;
    }
  }

  // push: due outbox in FIFO order, batched
  const maxPerPush = deps.maxCommandsPerPush ?? 50;
  for (;;) {
    const due = await deps.store.dueOutbox(now(), maxPerPush);
    if (due.length === 0) break;
    for (const row of due) await deps.store.markInFlight(row.commandId);
    const { results } = await deps.transport.push(deps.deviceId, due);
    for (let i = 0; i < due.length; i++) {
      const row = due[i]!;
      const res = results.find((r) => r.commandId === row.commandId) ?? results[i];
      if (res === undefined) continue;
      if (res.status === "ACCEPTED") {
        await deps.store.markAcked(row.commandId);
        result.acked += 1;
        result.pushed += 1;
      } else if (res.status === "DEFERRED") {
        await deps.store.markFailed(row.commandId, now() + nextDelay(row.attempts, retry, random));
        result.deferred += 1;
      } else {
        // REJECTED: terminal for this command (typed reason stays in the row)
        await deps.store.markFailed(row.commandId, Number.POSITIVE_INFINITY);
        result.rejected += 1;
      }
    }
  }
  return result;
}
