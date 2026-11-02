import { Injectable } from "@nestjs/common";

import { DeviceRevokedError } from "../domain/pos-errors";
import * as store from "../infrastructure/pos.store";
import { PosSaleService, type PosSaleInput } from "./pos-sale.service";

/**
 * PHASE-016 T8 — the narrow server sync slice (SYNC_PROTOCOL §11, binding):
 * - pull: per-entity cursors over the POS feed group (items, price_list_items,
 *   partners_lite, tax_codes, pos_terminal) from `change_log`;
 * - push: batches ≤ 50 commands, per-item ACCEPTED / REJECTED / DEFERRED,
 *   each deduped by idempotencyKey with result replay (C-01/C-03/C-04);
 * - a revoked device is rejected BEFORE any command executes (DEVICE_REVOKED).
 * The full inbox/retention registry is PHASE-020 — this slice must not grow
 * past §11.
 */

export interface PushCommand {
  idempotencyKey: string;
  clientId: string;
  type: "pos_sale" | "cashier_shift" | "partner_create";
  payload: unknown;
}

export interface PushResultItem {
  idempotencyKey: string;
  status: "ACCEPTED" | "REJECTED" | "DEFERRED";
  result: Record<string, unknown>;
}

const POS_FEED_GROUP = ["items", "price_list_items", "partners_lite", "tax_codes", "pos_terminal"] as const;
const PULL_PAGE_LIMIT = 1000;

@Injectable()
export class SyncSliceService {
  constructor(private readonly posSale: PosSaleService) {}

  async assertDeviceLive(deviceId: string): Promise<void> {
    if (!(await store.deviceIsLive(deviceId))) {
      throw new DeviceRevokedError();
    }
  }

  /** GET sync/pull?entity=…&cursor=… — cursor-advancing page over the feed group. */
  async pull(input: { deviceId: string; entity: string; cursor?: number }) {
    if (!(POS_FEED_GROUP as readonly string[]).includes(input.entity)) {
      return { entity: input.entity, changes: [] as unknown[], nextCursor: input.cursor ?? 0, tombstones: [] as unknown[] };
    }
    const from = input.cursor ?? (await store.getCursor(input.deviceId, input.entity));
    const changes = await store.readChangeLog(input.entity, from, PULL_PAGE_LIMIT);
    const nextCursor = changes.length > 0 ? changes[changes.length - 1]!.seq : from;
    await store.setCursor(input.deviceId, input.entity, nextCursor);
    return {
      entity: input.entity,
      changes: changes.map((c) => ({ seq: c.seq, entityId: c.entityId, op: c.op, payload: c.payload })),
      nextCursor,
      tombstones: changes.filter((c) => c.op === "DELETE").map((c) => ({ seq: c.seq, entityId: c.entityId })),
    };
  }

  /**
   * POST sync/push — per-item results; batch ≤ 50 (protocol budget). Each
   * command executes through the module service + posting engine only.
   */
  async push(input: { deviceId: string; commands: readonly PushCommand[] }): Promise<{ results: PushResultItem[] }> {
    await this.assertDeviceLive(input.deviceId); // revoked ⇒ zero effects, before execution
    if (input.commands.length > 50) {
      return {
        results: input.commands.map((c) => ({
          idempotencyKey: c.idempotencyKey,
          status: "REJECTED" as const,
          result: { errorCode: "BATCH_TOO_LARGE", message: "push batch exceeds 50 commands (protocol budget)" },
        })),
      };
    }
    const results: PushResultItem[] = [];
    for (const command of input.commands) {
      if (command.type === "pos_sale") {
        const outcome = await this.posSale.executePosSaleCommand({
          idempotencyKey: command.idempotencyKey,
          clientId: command.clientId,
          deviceId: input.deviceId,
          payload: command.payload as PosSaleInput & { offlineReceiptNo: string },
        });
        results.push({ idempotencyKey: command.idempotencyKey, status: outcome.status, result: { ...outcome.result, replay: outcome.replay } });
      } else {
        // cashier_shift / partner_create handlers land with T3/T6; until then
        // they are DEFERRED (honest state — never silently dropped).
        results.push({
          idempotencyKey: command.idempotencyKey,
          status: "DEFERRED",
          result: { errorCode: "NOT_IN_POS_SLICE", message: `command type ${command.type} is outside the PHASE-016 POS slice` },
        });
      }
    }
    return { results };
  }

  async status(deviceId: string) {
    await this.assertDeviceLive(deviceId);
    const cursors: Record<string, number> = {};
    for (const entity of POS_FEED_GROUP) {
      cursors[entity] = await store.getCursor(deviceId, entity);
    }
    return { deviceId, cursors, feedGroup: [...POS_FEED_GROUP] };
  }
}
