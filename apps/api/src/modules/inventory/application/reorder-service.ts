import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { AuditService } from "../../audit/api/audit";
import { EMAIL_SERVICE } from "../../notifications/notifications.module";
import { type EmailService } from "../../notifications/application/email-service";
import { requireTenantContext } from "../../../infra/db/tenant-context";
import * as store from "../infrastructure/inventory.store";

/**
 * Reorder monitoring (PHASE-010 T11; §2.14; BR-019): the nightly scan over
 * `item_warehouse_settings` — every active warehouse item whose on-hand ≤
 * its reorder level emits ONE `stock.below_reorder` digest per tenant per
 * window (24 h — `last_reorder_alerted_at` is the once-per-window dedupe
 * stamp). Alert, NOT autopilot: no purchase orders are created, nothing
 * reorders on its own (BR-019 fixed); the in-app alerting surface +
 * replenishment suggestions land PHASE-015.
 *
 * The durable, assertable surface is the audit event + the dedupe stamp;
 * the email rides the notifications module's templated adapter (AR+EN),
 * addressed to the tenant's owner (first owner-role membership).
 */
const WINDOW_HOURS = 24;

@Injectable()
export class ReorderService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EMAIL_SERVICE) private readonly email: EmailService,
  ) {}

  /** The tenant owner's email (first owner-role membership — read-only). */
  async ownerEmail(): Promise<string | null> {
    const context = requireTenantContext();
    const rows = await store
      .inventoryTx()
      .execute(sql`
        SELECT u.email
        FROM memberships m
        JOIN users u ON u.id = m.user_id
        JOIN roles r ON r.id = m.role_id AND r.tenant_id = m.tenant_id
        WHERE m.tenant_id = ${context.tenantId} AND r.key = 'owner'
        ORDER BY m.created_at
        LIMIT 1
      `);
    return (rows.rows as unknown as { email: string }[])[0]?.email ?? null;
  }

  /**
   * The nightly scan (pg-boss schedule + on-demand endpoint). Returns the
   * per-window digest; re-running inside the window is a documented no-op
   * for already-alerted rows (the test asserts exactly-once).
   */
  async runNightlyScan(input: {
    runMode: "NIGHTLY" | "ON_DEMAND";
    checkedBy: string | null;
  }): Promise<{
    belowReorder: number;
    alerted: number;
    withinWindow: number;
    recipient: string | null;
  }> {
    const candidates = await store.listReorderCandidates();
    const now = Date.now();
    const windowMs = WINDOW_HOURS * 3_600_000;
    const due = candidates.filter(
      (row) =>
        row.lastReorderAlertedAt === null ||
        now - Date.parse(row.lastReorderAlertedAt) >= windowMs,
    );
    const withinWindow = candidates.length - due.length;
    if (due.length === 0) {
      return { belowReorder: candidates.length, alerted: 0, withinWindow, recipient: null };
    }

    const items = due
      .map(
        (row) =>
          `${row.itemSku} — ${row.itemName} @ ${row.warehouseCode}: ${row.qtyOnHand} ≤ ${row.reorderLevel}`,
      )
      .join("\n");
    const recipient = await this.ownerEmail();
    if (recipient !== null) {
      const context = requireTenantContext();
      const tenantRows = await store.inventoryTx().execute(sql`
        SELECT name FROM tenants WHERE id = ${context.tenantId}
      `);
      const tenantName = (tenantRows.rows as unknown as { name: string }[])[0]?.name ?? "ERP";
      await this.email.enqueue(context.tenantId, {
        template: "stock_below_reorder",
        locale: "ar",
        recipient,
        variables: { tenantName, items },
      });
    }
    for (const row of due) {
      await store.markReorderAlerted(row.settingId);
    }
    await this.audit.record({
      action: "inventory.stock_below_reorder",
      entityType: "item_warehouse_setting",
      entityId: due[0]!.settingId,
      actorId: input.checkedBy ?? undefined,
      after: {
        runMode: input.runMode,
        belowReorder: candidates.length,
        alerted: due.length,
        withinWindow,
        items: due.map((row) => ({
          itemId: row.itemId,
          warehouseId: row.warehouseId,
          qtyOnHand: row.qtyOnHand,
          reorderLevel: row.reorderLevel,
        })),
      },
    });
    return {
      belowReorder: candidates.length,
      alerted: due.length,
      withinWindow,
      recipient,
    };
  }
}
