/**
 * Tenant-owned table registry (PHASE-003 T13; SECURITY_TEST_PLAN §2
 * "per-phase expansion rule"; extended by PHASE-004): every `tenant_id`-
 * bearing table in `public` must be registered here — the generated
 * A1–A10 suite iterates this list, and a registry CI check fails when a
 * new tenant-owned table ships without registering (the negative proof
 * the phase demands).
 *
 * Variant-policy tables (roles, role_permissions: system templates
 * readable with tenant_id IS NULL) are registered with their variant
 * flag so the generated suite applies their documented expectations
 * (A2 reads see template rows; writes still never cross tenants).
 *
 * PHASE-004 additions (migration 0006/0007): branches, tenant_settings,
 * subscriptions, entitlements, support_sessions, accounts,
 * account_purposes. `entitlements` additionally carries the DELETE grant
 * (the materialization upsert's symmetric half) — its A5 expectation is
 * "policy-confined delete touches 0 foreign rows" instead of the
 * grant-denial shape.
 */

export interface RegisteredTenantTable {
  readonly table: string;
  /** True for roles/role_permissions (template rows visible across tenants). */
  readonly variantTemplateRows?: boolean;
  /** True when the app role legitimately holds DELETE (entitlements). */
  readonly deleteGranted?: boolean;
}

export const TENANT_TABLES_REGISTRY: readonly RegisteredTenantTable[] = [
  { table: "audit_events" },
  { table: "memberships" },
  { table: "invitations" },
  { table: "roles", variantTemplateRows: true },
  { table: "role_permissions", variantTemplateRows: true },
  { table: "branches" },
  { table: "tenant_settings" },
  { table: "subscriptions" },
  { table: "entitlements", deleteGranted: true },
  { table: "support_sessions" },
  // PHASE-014 billing/usage/notifications cluster (migration 0021).
  // billing_events is append-only by grants (no UPDATE/DELETE for erp_app).
  { table: "subscription_invoices" },
  { table: "billing_events" },
  { table: "usage_counters" },
  // PHASE-015 (migration 0022): the applied-template row (PK = tenant_id).
  { table: "tenant_industry_config" },
  // PHASE-016 (migration 0023): POS module + narrow sync slice.
  { table: "pos_terminals" },
  { table: "change_log" },
  { table: "sync_cursors" },
  { table: "sync_commands" },
  // PHASE-017 (migration 0024): automotive & distribution cluster.
  { table: "vehicles" },
  { table: "job_cards" },
  { table: "job_card_lines" },
  { table: "routes" },
  { table: "route_visits" },
  { table: "rep_settlements" },
  { table: "van_stocks" },
  { table: "commission_rules" },
  { table: "commission_runs" },
  // PHASE-018 (migration 0025): manufacturing cluster.
  { table: "bills_of_materials" },
  { table: "bom_versions" },
  { table: "bom_lines" },
  { table: "production_orders" },
  { table: "production_consumptions" },
  { table: "inspections" },
  { table: "notifications" },
  { table: "notification_preferences", deleteGranted: true },
  { table: "accounts" },
  { table: "account_purposes" },
  // PHASE-006 master-data cluster (migration 0009).
  { table: "credit_terms" },
  { table: "price_lists" },
  { table: "partners" },
  { table: "partner_contacts" },
  { table: "partner_addresses" },
  { table: "item_categories" },
  { table: "uoms" },
  { table: "uom_conversions" },
  { table: "items" },
  { table: "barcodes" },
  { table: "price_list_items" },
  { table: "partner_balances" },
  { table: "opening_balance_docs" },
  { table: "file_objects" },
  { table: "import_jobs" },
  // PHASE-007 accounting cluster (migrations 0010/0011).
  { table: "fiscal_years" },
  { table: "fiscal_periods" },
  { table: "exchange_rates" },
  { table: "cost_centers" },
  { table: "recurring_journals" },
  { table: "approval_policies" },
  { table: "numbering_sequences" },
  { table: "number_assignments" },
  { table: "manual_journals", deleteGranted: true },
  { table: "manual_journal_lines", deleteGranted: true },
  { table: "journal_templates" },
  { table: "journal_entries" },
  { table: "journal_lines" },
  { table: "partner_subledger_entries" },
  { table: "reconciliation_runs" },
  // PHASE-008 treasury cluster (migration 0012). cash_movements is
  // append-only by grants (no UPDATE/DELETE for erp_app — A4 denial) per
  // INV-019; treasury_allocations carries the sanctioned pre-POST edit
  // DELETE (draft allocation replacement — the manual-journal-drafts
  // pattern).
  { table: "cash_accounts" },
  { table: "cash_movements" },
  { table: "receipts" },
  { table: "payments" },
  { table: "treasury_allocations", deleteGranted: true },
  { table: "expense_categories" },
  { table: "expenses" },
  { table: "cash_transfers" },
  { table: "cashier_shifts" },
  { table: "bank_statements" },
  { table: "bank_statement_lines" },
  // PHASE-009 tax cluster (migration 0013) — the tenant-owned tables. The
  // global reference tables (tax_treatments, jurisdictions,
  // jurisdiction_tax_rates) are deliberately NOT here: they carry no
  // tenant_id (ADR-0005/TENANT_ISOLATION §3 pack data) and their write
  // denial for erp_app is asserted by the grants test instead.
  // tax_document_summaries is append-only by grants + guard (INV-012's
  // substrate — the RC-07 drift fixture mutates via superuser tooling only).
  { table: "tax_codes" },
  { table: "tax_registrations" },
  { table: "tax_pack_bindings" },
  { table: "tax_document_summaries" },
  { table: "vat_returns" },
  { table: "e_invoicing_submissions" },
  // PHASE-010 inventory cluster (migrations 0014/0015). stock_moves is
  // append-only by grants (no UPDATE/DELETE for erp_app — A4 denial) per
  // INV-010/INV-017, mirroring cash_movements; the guard trigger is the
  // defense-in-depth layer.
  { table: "warehouses" },
  { table: "item_warehouse_settings" },
  { table: "stock_moves" },
  { table: "stock_layers" },
  { table: "item_stock" },
  { table: "stock_transfers" },
  { table: "stock_transfer_lines" },
  { table: "stock_adjustments" },
  { table: "stock_reservations" },
  { table: "item_batches" },
  { table: "item_serials" },
  { table: "stock_counts" },
  { table: "stock_count_lines" },
  // PHASE-011 purchasing cluster (migrations 0016/0017). Draft-lifecycle
  // tables (SELECT/INSERT/UPDATE); posted rows immutable by service
  // discipline + shape CHECKs (the treasury pattern). purchase_reallocations
  // + lines are INSERT-only documents (the audited audit trail).
  { table: "purchase_requests" },
  { table: "purchase_request_lines" },
  { table: "purchase_orders" },
  { table: "purchase_order_lines" },
  { table: "goods_receipts" },
  { table: "goods_receipt_lines" },
  { table: "supplier_invoices" },
  { table: "supplier_invoice_lines" },
  { table: "debit_notes" },
  { table: "debit_note_lines" },
  { table: "landed_costs" },
  { table: "landed_cost_allocations" },
  { table: "purchase_reallocations" },
  { table: "purchase_reallocation_lines" },
  // PHASE-012 sales cluster (migrations 0018/0019). Draft-lifecycle tables
  // (SELECT/INSERT/UPDATE); posted rows immutable by service discipline +
  // shape CHECKs (the treasury/purchasing pattern). sales_reallocations +
  // lines are INSERT-only documents (the audited audit trail).
  { table: "sales_reps" },
  { table: "quotations" },
  { table: "quotation_lines" },
  { table: "sales_orders" },
  { table: "sales_order_lines" },
  { table: "delivery_notes" },
  { table: "delivery_note_lines" },
  { table: "sales_invoices" },
  { table: "sales_invoice_lines" },
  { table: "credit_notes" },
  { table: "credit_note_lines" },
  { table: "sales_reallocations" },
  { table: "sales_reallocation_lines" },

  // PHASE-013 reporting cluster (migration 0020_reporting_core.sql):
  // orchestration state (SELECT/INSERT/UPDATE — no DELETE) + the template
  // registry rows (synced from the code-defined catalog).
  { table: "report_runs" },
  { table: "print_templates" },

  // PHASE-019 (migration 0026): crm + projects cluster.
  { table: "projects" },
  { table: "leads" },
  { table: "tasks" },
  { table: "activities" },
  { table: "service_contracts" },
  // carries DELETE by design (schedule re-expansion removes unbilled dated entries)
  { table: "contract_schedule_lines", deleteGranted: true },
  { table: "service_orders" },
  { table: "service_order_lines" },
  { table: "time_entries" },

  // PHASE-020 (migration 0027): sync foundation cluster.
  { table: "tombstones" },
  // carries DELETE only for the audited retention job (A5: policy-confined, 0 foreign rows)
  { table: "inbox_commands", deleteGranted: true },
  // PHASE-026 (migration 0028): fixed-assets cluster. depreciation_lines is append-only.
  { table: "asset_categories" },
  { table: "assets" },
  { table: "depreciation_runs" },
  { table: "depreciation_lines" },
  { table: "asset_disposals" },
  { table: "asset_revaluations" },
];

export const TENANT_TABLE_NAMES: readonly string[] = TENANT_TABLES_REGISTRY.map(
  (row) => row.table,
);
