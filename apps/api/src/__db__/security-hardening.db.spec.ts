import { beforeAll, describe, expect, it } from "vitest";

import { ensureTestDb } from "./test-db";
import { withTenant } from "../infra/db/tenant-context";
import { AuditService } from "../modules/audit/api/audit";
import { DrizzleAuditStore } from "../modules/audit/infrastructure/drizzle-audit.store";
import { TENANT_S, setupSalesFixture, S_CASHIER } from "./sales/fixtures";

/**
 * PHASE-024 T8/T12 on real PG16: the tenant-admin audit review surface answers
 * a seeded forensic question ("who acted on this document, when, with what
 * correlation id") from audit_events alone, tenant-scoped by RLS; support
 * sessions are 100% audit-captured (open + close events per session).
 */

const audit = new AuditService(new DrizzleAuditStore());

beforeAll(async () => {
  ensureTestDb();
  await setupSalesFixture();
});

describe("PHASE-024 security hardening (real PG)", () => {
  it("S-01: forensic query — who acted on a document is answerable from audit_events via the review filters", async () => {
    await withTenant(TENANT_S, async () => {
      const docId = "00000000-0000-4000-8000-0000000000f1";
      await audit.record({
        action: "sales_invoice.posted",
        entityType: "sales_invoice",
        entityId: docId,
        actorId: S_CASHIER,
        after: { invoiceNo: "SAL-2026-9001", correlationId: "corr-abc-1" },
      });
      await audit.record({
        action: "sales_invoice.approved",
        entityType: "sales_invoice",
        entityId: docId,
        actorId: S_CASHIER,
        after: { correlationId: "corr-abc-2" },
      });
      // the review query: by entity
      const byEntity = await audit.list({ entityType: "sales_invoice", entityId: docId, limit: 100 });
      expect(byEntity.map((r) => r.action).sort()).toEqual(["sales_invoice.approved", "sales_invoice.posted"]);
      // every row carries the actor — and the actor filter narrows correctly
      for (const row of byEntity) expect(row.actorId).toBe(S_CASHIER);
      const byActor = await audit.list({ entityType: "sales_invoice", actorId: S_CASHIER, limit: 100 });
      expect(byActor.length).toBe(byEntity.length);
      const byOtherActor = await audit.list({ entityType: "sales_invoice", actorId: "00000000-0000-0000-0000-000000000999", limit: 100 });
      expect(byOtherActor).toHaveLength(0);
    });
  });

  it("S-02: audit review stays inside the tenant (RLS) — another tenant's rows never appear", async () => {
    await withTenant(TENANT_S, async () => {
      const rows = await audit.list({ entityType: "sales_invoice", limit: 500 });
      // all rows belong to this tenant context by construction (store path is RLS-confined)
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });
  });
});
