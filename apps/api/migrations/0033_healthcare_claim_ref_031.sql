-- PHASE-031 T1 — the phase's single schema change: additive, nullable
-- sales_invoices.claim_ref (varchar(64), no backfill, no default).
-- External insurer claim reference (NOT a document number — ADR-0006/INV-021
-- untouched); null = self-pay. Inherits the existing sales_invoices row
-- policy — RLS untouched (ADR-0005). Optional additive index for claim
-- grouping. Zero ledger surface (INV-022).

ALTER TABLE "sales_invoices" ADD COLUMN IF NOT EXISTS "claim_ref" varchar(64);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_sales_invoices_tenant_claim_ref"
  ON "sales_invoices" ("tenant_id", "claim_ref");
--> statement-breakpoint
INSERT INTO erp._schema_state (key, value) VALUES ('schema_version', 33) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
