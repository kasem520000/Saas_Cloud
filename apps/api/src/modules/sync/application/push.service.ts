import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { requireTenantContext } from "../../../infra/db/tenant-context";
import { AuditService } from "../../audit/api/audit";
import { PosSaleService, type PosSaleInput } from "../../pos/application/pos-sale.service";
import { MAX_BATCH_COMMANDS, validateBatch, type SyncCommand } from "../domain/batch";
import { rejection, type PushReason } from "../domain/reasons";
import * as store from "../infrastructure/sync.store";

/**
 * PHASE-020 T6/T7/T8/T9 — the generalized push contract (SYNC_PROTOCOL §3/§4):
 * - batch envelope validated first (≤ 50 commands, ≤ 1 MB) — never
 *   all-or-nothing at the ledger, per-item results instead;
 * - revoked device / suspended tenant reject BEFORE any command executes
 *   (C-06: zero effects);
 * - inbox dedupe by (device, commandId) AND by idempotencyKey: duplicates
 *   replay the stored result with duplicate: true, never re-executed (C-01);
 * - DEFERRED items are not executed and NOT recorded in the inbox;
 * - financial intents route through the owning module's service → the
 *   centralized posting engine (ADR-0007, INV-013 second layer).
 */

export interface PushItemResult {
  commandId: string;
  idempotencyKey: string;
  status: "ACCEPTED" | "REJECTED" | "DEFERRED";
  duplicate: boolean;
  result: Record<string, unknown>;
}

@Injectable()
export class PushService {
  constructor(
    private readonly audit: AuditService,
    private readonly posSale: PosSaleService,
  ) {}

  private tx() {
    const ctx = requireTenantContext();
    if (ctx.tx === undefined) throw new Error("no ambient tenant scope");
    return ctx.tx;
  }

  async push(input: {
    deviceId: string;
    commands: readonly SyncCommand[];
    actorId: string;
  }): Promise<{ results: PushItemResult[] }> {
    // Gate 0: device + tenant state — before ANY command executes.
    const device = await store.findDevice(input.deviceId);
    if (device === undefined || device.revokedAt !== null) {
      return {
        results: input.commands.map((c) => ({
          commandId: c.commandId,
          idempotencyKey: c.idempotencyKey,
          status: "REJECTED" as const,
          duplicate: false,
          result: rejection("DEVICE_REVOKED"),
        })),
      };
    }
    await this.assertTenantActive();
    validateBatch(input.commands, JSON.stringify(input.commands).length);
    await store.touchDevice(input.deviceId);

    const results: PushItemResult[] = [];
    for (const command of input.commands) {
      results.push(await this.executeOne(input.deviceId, command));
    }
    await this.audit.record({
      action: "sync.batch_pushed",
      entityType: "device",
      entityId: input.deviceId,
      actorId: input.actorId,
      after: {
        count: input.commands.length,
        accepted: results.filter((r) => r.status === "ACCEPTED" && !r.duplicate).length,
        duplicates: results.filter((r) => r.duplicate).length,
        rejected: results.filter((r) => r.status === "REJECTED").length,
        deferred: results.filter((r) => r.status === "DEFERRED").length,
      },
    });
    return { results };
  }

  private async executeOne(deviceId: string, command: SyncCommand): Promise<PushItemResult> {
    // Inbox dedupe layer 1: (tenant, device, commandId).
    const byCommand = await store.findInboxByCommand(deviceId, command.commandId);
    if (byCommand !== undefined) {
      return {
        commandId: command.commandId,
        idempotencyKey: command.idempotencyKey,
        status: byCommand.status as PushItemResult["status"],
        duplicate: true,
        result: { ...byCommand.result, duplicate: true },
      };
    }
    // Inbox dedupe layer 2: intent idempotency key (cross-batch duplicates).
    const byKey = await store.findInboxByKey(command.idempotencyKey);
    if (byKey !== undefined) {
      return {
        commandId: command.commandId,
        idempotencyKey: command.idempotencyKey,
        status: byKey.status as PushItemResult["status"],
        duplicate: true,
        result: { ...byKey.result, duplicate: true, errorCode: "DUPLICATE_COMMAND" },
      };
    }

    // STALE_VERSION: client baseVersion vs the server feed for that entity.
    if (command.baseVersion !== undefined) {
      const rows = await this.tx().execute(sql`
        SELECT MAX("seq")::text AS m FROM "change_log"
        WHERE "entity_type" = ${command.entityType} AND "entity_id" = ${command.commandId}
      `);
      const serverSeq = Number((rows.rows[0] as { m: string | null }).m ?? 0);
      if (serverSeq > command.baseVersion) {
        const rej = rejection("STALE_VERSION", { baseVersion: command.baseVersion, serverSeq });
        await store.recordInbox({
          deviceId, commandId: command.commandId, intent: command.intent,
          idempotencyKey: command.idempotencyKey, status: "REJECTED", result: rej,
        });
        return { commandId: command.commandId, idempotencyKey: command.idempotencyKey, status: "REJECTED", duplicate: false, result: rej };
      }
    }

    const outcome = await this.dispatch(deviceId, command);
    if (outcome.status === "DEFERRED") {
      // DEFERRED is never executed and never recorded in the inbox (§3).
      return { commandId: command.commandId, idempotencyKey: command.idempotencyKey, status: "DEFERRED", duplicate: false, result: outcome.result };
    }
    await store.recordInbox({
      deviceId,
      commandId: command.commandId,
      intent: command.intent,
      idempotencyKey: command.idempotencyKey,
      status: outcome.status,
      result: outcome.result,
    });
    return { commandId: command.commandId, idempotencyKey: command.idempotencyKey, status: outcome.status, duplicate: false, result: outcome.result };
  }

  /** Route the intent to the owning module's published service. */
  private async dispatch(
    deviceId: string,
    command: SyncCommand,
  ): Promise<{ status: "ACCEPTED" | "REJECTED" | "DEFERRED"; result: Record<string, unknown> }> {
    if (command.intent === "pos_sale") {
      const outcome = await this.posSale.executePosSaleCommand({
        idempotencyKey: command.idempotencyKey,
        clientId: command.commandId,
        deviceId,
        payload: command.payload as PosSaleInput & { offlineReceiptNo: string },
      });
      return {
        status: outcome.status,
        result: { ...outcome.result, replay: outcome.replay },
      };
    }
    // Honest state: intents beyond the shipped handlers are DEFERRED, never
    // silently dropped and never recorded in the inbox.
    return {
      status: "DEFERRED",
      result: {
        ...rejection("NOT_IMPLEMENTED" as PushReason, { intent: command.intent }),
        retryAfterMs: 60_000,
        reason: "TRANSIENT",
      },
    };
  }

  private async assertTenantActive(): Promise<void> {
    const rows = await this.tx().execute(sql`
      SELECT "status" FROM "subscriptions" ORDER BY "period_start" DESC LIMIT 1
    `);
    const status = (rows.rows[0] as { status: string } | undefined)?.status;
    if (status === "SUSPENDED") throw Object.assign(new Error("TENANT_SUSPENDED"), { code: "TENANT_SUSPENDED" });
  }
}

export { MAX_BATCH_COMMANDS };
