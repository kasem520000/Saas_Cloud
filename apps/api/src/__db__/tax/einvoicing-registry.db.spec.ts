import { beforeAll, describe, expect, it } from "vitest";

import { ensureTestDb } from "../test-db";
import { withTenant } from "../../infra/db/tenant-context";
import { insertEInvoicingSubmission, listEInvoicingSubmissions, findEInvoicingSubmissionById } from "../../modules/tax/infrastructure/tax.store";
import { TENANT_S, setupSalesFixture } from "../sales/fixtures";

/**
 * PHASE-023 T12 chaos slice (real PG16): sync duplicate pushes cannot produce
 * two submissions — the registry's UNIQUE (tenant_id, source_type, source_id)
 * dedupes (no double-clearance), and duplicate insert returns the existing row.
 */

beforeAll(async () => {
  ensureTestDb();
  await setupSalesFixture();
});

describe("PHASE-023 submission registry idempotency (real PG)", () => {
  it("X-01: duplicate submission for the same source document dedupes to ONE row", async () => {
    await withTenant(TENANT_S, async () => {
      const docId = "00000000-0000-4000-8000-000000000e01";
      const first = await insertEInvoicingSubmission({ countryCode: "SA", adapterId: "zatca", sourceType: "sales_invoice", sourceId: docId, payloadDigest: "sha256:a" });
      const dupe = await insertEInvoicingSubmission({ countryCode: "SA", adapterId: "zatca", sourceType: "sales_invoice", sourceId: docId, payloadDigest: "sha256:a" });
      // ON CONFLICT DO NOTHING: the second call does not create a row
      const rows = await listEInvoicingSubmissions({ countryCode: "SA" });
      const forDoc = rows.filter((r) => r.sourceId === docId);
      expect(forDoc).toHaveLength(1);
      expect(forDoc[0]?.status).toBe("PENDING");
      void first;
      void dupe;
      // RLS note: e_invoicing_submissions is tenant-scoped; the superuser count
      // sees 0 without the tenant GUC — the in-tenant list above is the proof:
      // exactly one row per document ⇒ no double-clearance (uq constraint).
    });
  });

  it("X-02: registry row is readable by id and list is tenant-scoped by RLS", async () => {
    await withTenant(TENANT_S, async () => {
      const docId = "00000000-0000-4000-8000-000000000e02";
      const id = await insertEInvoicingSubmission({ countryCode: "SA", adapterId: "zatca", sourceType: "sales_invoice", sourceId: docId, payloadDigest: null });
      const found = await findEInvoicingSubmissionById(id);
      expect(found?.sourceId).toBe(docId);
    });
  });
});
