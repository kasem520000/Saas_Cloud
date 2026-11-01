# TABLES — Sales & Receivables Cluster (PHASE-012)

> **Status:** DELIVERED (PHASE-012, migrations 0018/0019) · **Owner:** Database Architecture ·
> **Updated:** 2026-10-31 · Column-level specs for the PHASE-012 cluster, authored in-phase per
> the file header rule. ADR-0009 precision discipline throughout: quantities and unit
> costs/prices are `numeric(19,6)` (6-decimal internal), money quanta `numeric(19,4)`, FX
> rates `numeric(19,8)`. All tables are draft-lifecycle (SELECT/INSERT/UPDATE for `erp_app`;
> POSTED immutability is service discipline + status↔posted-columns shape CHECKs, mirroring
> the treasury/purchasing pattern) **except** `sales_reallocations`/`sales_reallocation_lines`
> (0019: SELECT/INSERT only — the audit trail is append-only by shape). RLS macro on every
> table; the isolation registry covers each (A1–A11). No table in this cluster writes
> `journal_*`, `stock_*`, or `partner_subledger_*` — those stay owned by accounting,
> inventory, and partners respectively (MODULE_BOUNDARIES; ADR-0007).

## §sales_reps — the representative registry (§2.10)

**`sales_reps`** — sales-rep records with attribution on documents (commissions are
explicitly PHASE-017 — no computation here): `code` tenant-unique (1–40), `name` (1–200),
`name_ar`, `email`/`phone` optional, `status` CHECK `('ACTIVE','INACTIVE')`. Index
`ix_sales_reps_tenant_status (tenant_id, status, code)`.

## §quotations / §quotation_lines — offers (§2.1; BR-006; DOCUMENT_LIFECYCLE §3)

**`quotations`** — no ledger effect; `quote_no` reserves at SENT (QOT-, BR-029's first
outbound state) — `uq_quotations_tenant_no`; `valid_until` NOT NULL (the service derives
`quote_date + sales.quote_default_validity_days` = 30; `ck_quotations_validity` enforces
validity ≥ date). State shapes: `ck_quotations_sent_shape` (SENT/ACCEPTED ⇒ sent_at/by +
quote_no), `ck_quotations_accepted_shape` (ACCEPTED ⇒ accepted_at/by +
`converted_order_id` FK → sales_orders), rejected/cancelled shapes mirror. Totals CHECK
`gross = net + tax`. Indexes: `ix_quotations_tenant_status (tenant_id, status, quote_date)`,
`ix_quotations_tenant_customer`.

**`quotation_lines`** — `quotation_id` (CASCADE), `line_no` (unique per quote), `item_id`
FK (RESTRICT), qty `numeric(19,6) > 0`, `unit_price ≥ 0`, discount ≥ 0, tax_code_id FK,
net/tax ≥ 0 (BR-003 resolution at create; manual override within BR-002 ceilings is
service-level).

## §sales_orders / §sales_order_lines — confirmed orders (§2.2)

**`sales_orders`** — the source of deliveries and invoices; `order_no` reserves at ISSUE
(SOR-). `warehouse_id` FK NOT NULL (targeting), `quotation_id` FK NULL (the conversion
chain), state shapes mirror the quotations (issued/approved/cancelled), totals CHECK.
Indexes: `ix_sales_orders_tenant_status`, `ix_sales_orders_tenant_customer`.

**`sales_order_lines`** — carry the optional **soft reservation** reference:
`reservation_id` FK → `stock_reservations` (ON DELETE SET NULL — the PHASE-010 seam;
holder_type `'SALES_ORDER'`, expiry honored by the sweep, availability nets ACTIVE
non-expired rows; non-blocking by design). `net_amount > 0` (an order line is never
zero-priced — free goods are invoice-level per BR-008).

## §delivery_notes / §delivery_note_lines — goods-out (§2.3; BR-007; golden G-03)

**`delivery_notes`** — POSTED issues stock through `inventory.issueStock` + posts the COGS
journal (`DR COGS · CR INVENTORY` at issue cost) **without AR**; `converted_invoice_id`
FK → sales_invoices (flow A); `cogs_value` records the issue total; posted shape CHECK
ties `status='POSTED'` ⇔ posting_date/by/at + posted_journal_id + delivery_no (DEL-).
Indexes: `ix_delivery_notes_tenant_status`, `ix_delivery_notes_tenant_customer`.

**`delivery_note_lines`** — `order_line_id` FK NULL (order provenance), batch capture at
issue (BR-017 FEFO picks when unspecified; explicit `batch_id` binds), `serial_ids` jsonb,
and the **issue-cost snapshot** `issue_unit_cost`/`issue_value` (`ck_..._issue_shape`
pairs them) — the W-3 original-cost provenance later credit notes re-enter at.

## §sales_invoices / §sales_invoice_lines — billing (§2.4; POSTING_ENGINE §4; goldens G-01/G-02/G-03; W-1)

**`sales_invoices`** — `kind` CHECK `('CASH','CREDIT')` (`ck_..._cash_shape`: CASH ⇒
`cash_account_id` NOT NULL); `invoice_no` (SAL-) reserves at posting —
`uq_sales_invoices_tenant_no` (INV-021); `due_date ≥ invoice_date` (`ck_..._due_after`);
flow shapes: `ck_..._goods_shape` (`warehouse_id IS NULL OR delivery_id IS NULL` — flow A
(stock/COGS at the DN) vs flow B (with-goods, the invoice issues + posts its own COGS via
`posted_cogs_journal_id`)); `credit_check` jsonb records the BR-001 decision at approval
(posture, math, override — the UI only reflects it); `tax_summary` jsonb (INV-012);
`offline_receipt_no` (PHASE-016, stays NULL) + `einvoice_status` (PHASE-023, stays NULL).
The AR aging index `ix_sales_invoices_tenant_customer_due (tenant_id, customer_id,
due_date)` — EXPLAIN-verified for the statement/aging surfaces; plus status/order/delivery
indexes.

**`sales_invoice_lines`** — item XOR account (`ck_..._target`); `delivery_line_id` FK
(flow A link); **`tax_snapshot` jsonb** stamped per line (BR-033 — posting re-resolves
deterministically and REFUSES a mismatch, never silently recomputes); batch/serial
capture + the issue-cost snapshot (`issue_unit_cost`/`issue_value` — flow B stamped at
post, flow A copied from the DN line at conversion; the credit-note re-entry source).

## §credit_notes / §credit_note_lines — AR corrections/returns (§2.5; BR-004; golden G-04; W-3)

**`credit_notes`** — `invoice_id` FK NOT NULL (**the reference requirement never
disables** — BR-004); the return window is a service check
(`sales.return_window_days` = 14, 0 = dates off); `note_no` (CRN-) at posting;
`reentry_value` records the re-entry total; posted/cancelled shape CHECKs mirror the
invoices. Indexes: `ix_credit_notes_tenant_status`, `ix_credit_notes_tenant_invoice`.

**`credit_note_lines`** — `invoice_line_id` FK NOT NULL (per-line mandatory reference),
`return_to_stock` boolean; `ck_..._reentry_shape`: return ⇒ item + `reentry_unit_cost` +
`reentry_value` (snapshotted from the referenced invoice line — the ORIGINAL issue cost,
batch preserved, serial binds the originally sold unit per BR-018 — never a
current-average recompute).

## §sales_reallocations / §sales_reallocation_lines — audited re-allocations (0019; §2.7)

**`sales_reallocations`** — the AR mirror of 0017: post-allocation re-allocation as
AUDITED documents (RECEIVABLES_AND_PAYABLES §3.3 — never edits): `receipt_id` FK →
receipts (RESTRICT), `customer_id` FK, `reason` 1–300 NOT NULL, `doc_no` (SRA-)
tenant-unique, `status` CHECK `('POSTED')` only — **the document IS the audited effect**
(POSTED-at-create), `total_amount` > 0. Grants: SELECT/INSERT only (append-only).

**`sales_reallocation_lines`** — from→to pairs with the explicit BR-027 on-account
semantics (exactly one side may be NULL: `to` NULL = un-allocate, `from` NULL = allocate
an on-account remainder); `amount` > 0.

## Reused substrates (no new columns)

- **`receipts`** (PHASE-008, migration 0012) — the money leg rides the treasury service
  wholesale: PHASE-012 posts `DR cash/bank · CR AR_CONTROL (partner)` with the W-2
  FX-gain/loss residual lines at settlement (INV-008 stored rate) and the settlement +
  on-account control legs split explicitly. The 0019 header records the reconciliation:
  the "receipts gains AR-allocation rows/columns" design item is satisfied by the
  existing substrate (`treasury_allocations.receipt_id` + `allocated_amount`).
- **`treasury_allocations`** (PHASE-008) — the INV-016 allocation substrate for receipts;
  the re-allocation service rewrites them under the CC-02 lock and re-syncs
  `receipts.allocated_amount`.
- **`partner_subledger_entries`** (PHASE-007) — invoices (+), credit notes (−), receipts
  (−), FX residual entries; INV-009 ties the open-item sum to `AR_CONTROL` from the first
  entry (opening AR settlement included, G-16 AR side).
- **`stock_moves.source_type`** — 0018 expands the CHECK with `delivery_note`,
  `sales_invoice`, `credit_note`; **`cash_movements.source_type`** gains `sales_invoice`
  (the G-02 counter-payment movement, INV-019).

## Grants & roles (migrations 0018/0019)

Draft-lifecycle tables (0018, all twelve): `REVOKE ALL` then `SELECT, INSERT, UPDATE` for
`erp_app`; `SELECT` for `erp_readonly` and `erp_definer`. Re-allocation documents (0019):
`SELECT, INSERT` only for `erp_app` (append-only). RLS macro `erp.apply_tenant_policy` on
all fourteen tables; every one registered in the isolation suite's table registry
(`src/__db__/isolation/tables.registry.ts`) with generated A-test coverage (A1–A11) and
the registry negative proof.
