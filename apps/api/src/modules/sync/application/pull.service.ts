import { Injectable } from "@nestjs/common";

import { bootstrapCursor, signCursor, verifyCursor, CursorError, type CursorPayload } from "../domain/cursor";
import * as store from "../infrastructure/sync.store";

/**
 * PHASE-020 T5 — the generalized pull contract (SYNC_PROTOCOL §2): per-entity
 * opaque signed cursors, contiguous seq windows, page caps (default 500, hard
 * max 1000 items), hasMore/nextCursor envelope, tombstone items in the same
 * page, serverTime + contractVersion. No full-table dump exists anywhere.
 */

export const CONTRACT_VERSION = 1;
const DEFAULT_PAGE = 500;
const MAX_PAGE = 1000;

@Injectable()
export class PullService {
  /**
   * GET /sync/pull?entity=…&cursor=… — cursor-advancing page. A missing cursor
   * bootstraps at seq 0; a regressed cursor answers with a resync directive.
   */
  async pull(input: { deviceId: string; entity: string; cursorToken?: string; limit?: number }): Promise<{
    entity: string;
    items: unknown[];
    nextCursor: string;
    hasMore: boolean;
    serverTime: string;
    contractVersion: number;
    resync?: boolean;
  }> {
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_PAGE, 1), MAX_PAGE);
    const persisted = await store.getCursor(input.deviceId, input.entity);

    let payload: CursorPayload;
    if (input.cursorToken === undefined || input.cursorToken === "") {
      payload = { entityType: input.entity, seq: persisted, issuedAt: Date.now() };
    } else {
      try {
        payload = verifyCursor(input.cursorToken, input.entity, persisted);
      } catch (error) {
        if (error instanceof CursorError && error.code === "CURSOR_REGRESSION") {
          // C-12: regressed cursor ⇒ resync directive, never stale pages.
          return {
            entity: input.entity,
            items: [],
            nextCursor: bootstrapCursor(input.entity),
            hasMore: true,
            serverTime: new Date().toISOString(),
            contractVersion: CONTRACT_VERSION,
            resync: true,
          };
        }
        throw error;
      }
    }

    const changes = await store.readChanges({ entityType: input.entity, afterSeq: payload.seq, limit: limit + 1 });
    const tombstones = await store.readTombstones({ entityType: input.entity, afterSeq: payload.seq, limit: limit + 1 });
    const hasMore = changes.length > limit;
    const page = changes.slice(0, limit);
    const lastSeq = page.length > 0 ? page[page.length - 1]!.seq : payload.seq;

    return {
      entity: input.entity,
      items: [
        ...page.map((c) => ({ op: c.op === "DELETE" ? "tombstone" : "upsert", id: c.entityId, seq: c.seq, row: c.payload })),
        ...tombstones.map((t) => ({ op: "tombstone" as const, id: t.entityId, seq: t.seq })),
      ],
      nextCursor: signCursor({ entityType: input.entity, seq: lastSeq, issuedAt: Date.now() }),
      hasMore,
      serverTime: new Date().toISOString(),
      contractVersion: CONTRACT_VERSION,
    };
  }

  /** POST /sync/pull/ack — server-side cursor ack (monitoring hint only). */
  async ack(input: { deviceId: string; entity: string; cursorToken: string }): Promise<{ acknowledged: boolean }> {
    const payload = verifyCursor(input.cursorToken, input.entity);
    await store.setCursor(input.deviceId, input.entity, payload.seq);
    return { acknowledged: true };
  }

  async status(input: { deviceId: string; entities: readonly string[] }) {
    const cursors: Record<string, number> = {};
    for (const entity of input.entities) {
      cursors[entity] = await store.getCursor(input.deviceId, entity);
    }
    const lag: Record<string, number> = {};
    for (const entity of input.entities) {
      lag[entity] = (await store.maxSeq(entity)) - (cursors[entity] ?? 0);
    }
    return {
      deviceId: input.deviceId,
      cursors,
      lag,
      contractVersion: CONTRACT_VERSION,
      serverTime: new Date().toISOString(),
    };
  }
}
