# Changelog

2026-11-02 — PHASE-022 follow-up: Android chaos profile in-sim on real SQLite kernel (C-05/C-06/C-07/C-13 + battery/connectivity + DEFERRED retryAfterMs, 19/19 mobile tests), T-03 proxy measurement, M-05 personal-account read-only capability on real PG (sync suite 16/16) — PHASE-NNN

2026-11-02 — PHASE-022 Android Application (Expo/RN): scaffold + token/i18n port + SecureStore + capability-scoped registration + read-only personal class + Android scheduler + FCM skeleton + mobile-release CI + mobile profile on real PG (4/4) + 12/12 unit — PHASE-NNN

2026-11-02 — PHASE-021 follow-up: chaos desktop kill-matrix + 7-day watermark gate + rejection UX (CONFLICT_RESOLUTION §3) + desktop profile on real PG (D-01/D-02/D-03, 3/3) + dynamic-route static-export fixes (162 pages generate) + sync-core 35/35 — PHASE-NNN

2026-11-02 — PHASE-021 Desktop Application (Tauri v2, Windows): shell scaffold `apps/desktop`, web static-export target + guard, sync-core desktop modules (SQLite store on real better-sqlite3, sync host, keychain lifecycle, updater gate, WebView2 probe, ESC/POS printer) 28/28 tests, ci-desktop.yml (signing/SBOM/CalVer), offline badge UI, docs — PHASE-NNN

> **Status:** LIVING DOCUMENT — append-only, newest first · **Updated:** 2026-11-02

Format: `DATE — item — type` where type ∈ {BLUEPRINT, PHASE-NNN, DOCS, BREAKING-ARCH, DECISION}.

- 2026-11-02 — **PHASE-019 — CRM, Service Contracts & Projects (COMPLETE)**: migration `0026_crm_projects_019.sql` (9 RLS'd tables: projects, leads, tasks, activities, service_contracts, contract_schedule_lines, service_orders + lines, time_entries; additive `journal_lines.project_id`; full `industry.professional_services` v1.0.0 manifest seed — rental_logistics recorded out of scope); 1 new permission key (`accounting.projects.manage`, drift 242=242); `crm` module + 17 routes (leads convert via PartnerService per BR-025 with immutable CONVERTED state, contracts expand/bill through PostingService only — DR AR_CONTROL·CR SALES_REVENUE with project stamp on lines, idempotent per (contract,period) INV-013, SOFT_CLOSED posting rejected INV-011; tasks/activities/time-entries with narrative-required policy); engine `projectId` line stamp; 2 report contracts (registry 64→66: services.contract_revenue_schedule, services.time_billing_summary); phase gate → PHASE-019; web `/crm/leads`, `/crm/contracts`, `/accounting/projects`; unit 221 PASS, db suite 1319 PASS/2 skipped on embedded PG (isolation 816/816, template-apply 13/13, crm golden 5/5), drift 242=242, docs:validate 29/29, typecheck/lint clean. Evidence: `docs/implementation/phases/reports/PHASE-019-COMPLETION.md`.

- 2026-11-02 — **PHASE-020 — Offline Sync Foundation (COMPLETE)**: migration `0027_sync_foundation_020.sql` (RLS'd `tombstones` append-only + `inbox_commands` with 30-day retention expiry, `ix_change_log_tenant_entity_seq`, devices `capabilities`/`contract_version`/`trust_flags`/`attested_at`; 3 new permission keys — drift 245=245); `sync` module with 9 routes under `/api/v1/sync` (signed opaque HMAC cursors, page caps 500/1000 + resync on cursor regression, batch push ≤50/≤1 MB with per-item typed rejections from the reason registry, inbox dedupe replaying `duplicate: true`, DEVICE_REVOKED/TENANT_SUSPENDED pre-execution rejection, STALE_VERSION via baseVersion, DEFERRED never inboxed, audited retention job, attestation-lite nonce challenge + revocation kill switch with lifecycle audit events); `packages/sync-core` v1 (outbox/inbox/cursors/meta machinery, full-jitter retry, cycle engine with contract-version read-only gate, harness-native in-memory reference store); web admin `/sync/devices` + `/sync/health`; PHASE-016 POS slice keeps working on the same wire contracts; unit 232 PASS + sync-core 6/6, db suite 1340 PASS/2 skipped on embedded PG (isolation 828/828, sync golden 8/8: C-01 exactly-once INV-013, C-06 zero-effect revocation, C-13 cross-tenant rejection, C-12 resync), drift 245=245, docs:validate 29/29, typecheck/lint clean across api+web+sync-core. Evidence: `docs/implementation/phases/reports/PHASE-020-COMPLETION.md`.

- 2026-11-02 — **PHASE-016 — Point of Sale (COMPLETE, tag `phase/016`)**: migration `0023_pos_offline_slice.sql` (RLS'd `pos_terminals`, POS channel columns on sales invoices/shifts, narrow sync slice `change_log`/`sync_cursors`/`sync_commands`, POS_TERMINAL device class, 4 pos.* keys — drift 232=232); `pos` module: terminal registry lifecycle, counter sale via the sales invoice chain (BR-005 autopost), sync push with per-command idempotency + result replay (C-01), per-item typed results, revoked-device pre-execution rejection, pull cursors; reports `pos.sales_by_terminal` / `pos.sales_by_hour` / `treasury.shift_cash_reconciliation` (registry 51→54); phase gate flipped (POS template entries live); isolation 672 probes; web `/pos/terminals` + `/pos/counter` with honest offline banner; unit 163 PASS, db 1154 passed/2 skipped (render.spec browser-bound), i18n parity 1619=1619, gate non-browser steps green. Evidence: `docs/implementation/phases/reports/PHASE-016-COMPLETION.md`.

- 2026-11-02 — **PHASE-015 — Industry Configuration Framework & Priority Templates (COMPLETE, tag `phase/015`)**: migration `0022_industry_configuration.sql` (RLS'd `tenant_industry_config` + global `feature_flags`; seeds `industry.retail`/`industry.grocery`/`industry.restaurant` v1.0.0 manifests; 4 configuration permission keys in the normative 0004 seed + owner role grants — permissions drift 228=228); `configuration` module: ten-layer fail-closed resolution engine with deterministic `resolved_hash` (L10>L5>L1>default; L6 request overlay never cached across principals; L9 derivation from L1), manifest zod schema + sha hash, template apply/switch service (idempotent, audited, additive-only per BR-038, REQUIRED-revocation blocks with guidance, phase-gated entries labeled coming with PHASE-016); 6 routes under `/api/v1/configuration` in ROUTE_PERMISSIONS; T10 industry reports `inventory.expiry_list`, `grocery.expiry_writeoff`, `retail.imei_register` registered (report registry 48→51; snake_case industry keys allowed per docs/industries/reports/README.md); ENTITY_CATALOG rows + isolation-suite coverage (648 probes) for both new tables; web `/configuration/templates` admin page (list/preview/apply/switch), onboarding industry step, nav item `settings.templates`, AR/EN dictionary parity; unit 163 PASS (9 configuration specs), db 1124 passed/2 skipped (render.spec browser-bound: Chromium unavailable in sandbox), gate non-browser steps green. Evidence: `docs/implementation/phases/reports/PHASE-015-COMPLETION.md`.

- 2026-11-02 — **PHASE-017 — Industry Templates: Automotive & Distribution (COMPLETE, tag `phase/017`)**: migration `0024_industry_templates_017.sql` seeds `industry.automotive` + `industry.distribution` v1.0.0 manifests (source: docs/industries/templates/manifests) applicable via the unmodified PHASE-015 engine; 9 new RLS'd tables (vehicles, job_cards+lines, routes, route_visits, rep_settlements, van_stocks, commission_rules/runs) + warehouses VAN type; 8 permission keys in the normative 0004 seed (drift 237=237); pure domain cores unit-proven: job-card state machine, settlement variance (BR-021), free-goods buy-X-get-Y (BR-008), commission accrual (run-time only); FEATURE_CATALOG `sales.job_cards` intake; ENTITY_CATALOG rows; unit 195 PASS (20 new specs), typecheck/lint clean, docs:validate 29/29; db suite green on embedded PG: isolation 738/738 (9 new tables), template-apply 8/8 (both manifests seed+validate, idempotent apply, additive switch), reporting registry 54→61 boot-validated, whole db suite 1211 PASS / 2 skipped (render.spec Playwright-bound); permissions-drift 237=237. Evidence: `docs/implementation/phases/reports/PHASE-017-COMPLETION.md`.
- 2026-11-02 — **PHASE-018 — Manufacturing & Production (COMPLETE)**: migration `0025_manufacturing_018.sql` (bills_of_materials/bom_versions/bom_lines, production_orders, production_consumptions, inspections; item_batches provenance + QUARANTINED; full food_manufacturing manifest seed); 4 permission keys (drift 241=241); domain cores unit-proven (BOM explosion yield×scrap, order lifecycle, costing with WIP zero-net); 3 report contracts (registry 61→64); phase gate → PHASE-018; unit 213 PASS, isolation 774/774, template-apply 10/10 (food_manufacturing idempotent apply + additive switch from restaurant), docs:validate 29/29. Evidence: `docs/implementation/phases/reports/PHASE-018-COMPLETION.md`.

- 2026-11-02 — **PHASE-014 — Subscription, Billing, Onboarding & Dashboards — MVP (COMPLETE, tag `phase/014`)**:
  migration `0021_billing_notifications.sql` (5 RLS'd tenant tables + definer projections
  `tenant_active_entitlements` / `tenant_subscription_read_only` / `tenant_usage_limits` +
  platform SELECT policy on `subscriptions` for the sweep); payment-provider adapter port with
  sandbox checkout and an HMAC signature-verified (`t=,v1=`, 5-min freshness), replay-safe
  webhook (`billing_events.provider_event_id` unique); the mandatory manual-invoicing fallback
  (A-009 — `paid_via=MANUAL`, dual audit `via_platform_admin`, identical end state); subscription
  lifecycle TRIAL→ACTIVE→GRACE(read-only; typed `subscription/read-only`)→SUSPENDED via PHASE-004
  session-kill semantics with an audited pg-boss sweep; usage counters with 80%/100% warnings and
  hard blocks on creation ceilings — `documents_per_month` NEVER blocks posting (INV-022
  property-proven against a real PostingService); notifications center (inbox + unread +
  preferences + owner email); public pricing page rendering only `GET /api/v1/public/plans`
  (PLACEHOLDER prices, OQ-002); tenant billing page, dashboard KPI widgets bound to report
  contracts only (POST report-runs, Money summed via domain-core — never float), Journey A
  checklist, platform manual-payment console; nav items + AR/EN dictionary parity; MVP security
  review register (0 criticals in the production runtime closure; route drift 224=224);
  unit 166 PASS, db 1113 passed (render.spec browser-bound: Chromium unavailable in sandbox),
  gate non-browser steps green. Evidence: `docs/implementation/phases/reports/PHASE-014-COMPLETION.md`.

- 2026-11-01 — **PHASE-013 — Reporting, Statements & Printing (COMPLETE, tag
  `phase/013`)**: migration `0020_reporting_core.sql` — 2 tenant tables
  (`report_runs`: execution records with status QUEUED/RUNNING/SUCCEEDED/
  FAILED + stage, `params`/`params_hash`, `assertion_status`, result +
  assertions + artifacts jsonb, unique `(tenant_id, report_key, params_hash)`
  so idempotent re-runs replace their own artifacts — the stored result
  envelope is the export source of truth, "you print what you saw"; and
  `print_templates`: the per-tenant registry of the 4 code-defined base
  templates, synced from `packages/ui/print`, tenants pick locale variants
  and never author template logic); RLS macro on both + the isolation
  A-test registry with generated coverage. The `reporting` module: the
  code-defined contract registry — **48 contracts** = the REPORT_CATALOG
  §1–§7 phase-013 set — with boot-time zod validation (a malformed
  contract, an unknown permission, or a financial contract missing its §11
  assertion set fails startup — meta-tested); the executor with the inline
  path (p50 budget) and the pg-boss job path (`reporting-report-run`
  queue) where permissions are re-resolved at execution — a revoked grant
  kills a queued run FORBIDDEN_AT_RUN with zero partial artifacts (no
  TOCTOU); the as-of-keyed cache (60s current-TTL cap) invalidated by
  ledger events (journal.posted/period.locked via the new accounting
  ledger-events bus wired into PostingService.post + PeriodService.lock);
  and the assertion engine executing the FINANCIAL_REPORT_RULES §11
  minimum set at exact-decimal tolerance 0 — FAIL is stored on the run AND
  blocks export/print server-side with ASSERTION_FAILED. Financial
  statements exact per the rules: TB (one-side balances, zero suppression),
  GL (running balance + the INV-006 entry drill + gl-entry-balance), IS
  (contra aggregation via purposes SALES_RETURNS/SALES_DISCOUNTS, COGS
  section, YTD column, is-tb-tie), BS (RE composition counted once —
  bs-current-year-once; prior-year comparative re-derived), CF indirect
  (buckets by purposes/account groups; untagged lines display as
  "أخرى/Other" — the documented limitation; cf-cash-tie INV-019), the
  fiscal close pack as an archive-class job, journal-register, and
  cost-centers — consolidated by construction (journal lines carry no
  branch dimension in migrations 0001–0020; financial contracts declare
  branches "fixed-all" — FINANCIAL_REPORT_RULES §1 branch subsets land with
  a branch-dimensioned journal substrate). Operational contracts over
  module query services — 7 NEW application services
  (`sales-analytics`, `ap-analytics`, `inventory-queries`,
  `treasury-queries`, `partner-queries`, `tax-queries`, `user-queries`):
  AR/AP aging + statements + allocations (INV-009 ties) + partner
  balances; salesAnalytics.* (item/customer/rep revenue, payment-method
  split, pipeline conversion, branch revenue + sales-gl-tie);
  apAnalytics.* (supplier/item spend, PO status, matching exceptions +
  purchasing-gl-tie); inventory queries (on hand/movement/expiry/count
  variance/transfer log/serials/slow-moving + INV-010 tie); treasury
  queries (daily flow, receipts/payments registers, petty cash, expenses,
  shifts, bank recon + per-account INV-019 ties); the both-sides VAT
  return + summary-by-treatment (INV-012 tie via TaxQueriesService); and
  platform reports (audit-trail with the new actorId/action filters on
  AuditQuery, user-activity via the new UserQueriesService, report-runs,
  subscription-usage). Print/export system: `packages/ui/print` (NEW
  package surface `@erp/ui/print` — sanctioned in the erp-ui import-path
  rule which now allows the exact entry and bans deeper paths) with 4
  versioned templates — a4-document (tafqit amount-in-words verified per
  locale and per currency minor-unit incl. 3-dp KWD/BHD/OMR/JOD/IQD +
  bilingual legal footers), a4-report (assertion footers + freshness
  stamps), receipt-80, and receipt-58 (RTL rules — Western digits
  LTR-isolated, physical QR blocks, condensed 58mm) — over embedded woff2
  fonts (no system fonts, no network in render); the Chromium render
  service (playwright, pool bound 2 via Semaphore, 60s/300s timeouts,
  PDF/A-2b XMP identification stamping via pdf-lib — Chromium cannot emit
  conformance-level PDF/A; the stamp + artifact metadata record the
  archive class honestly); XLSX via exceljs (RTL sheet views, values-only
  with no formulas, typed columns); CSV UTF-8 BOM RFC4180; artifacts via
  the files module with sha256 + signed URLs (15 min) + audited export
  issuance. 8 routes under `/api/v1/reporting` (registry snapshot, POST
  report-runs, GET runs/:id, runs/:id/result, runs, POST runs/:id/exports,
  print-preview/:id, print-templates) in ROUTE_PERMISSIONS; errors
  FORBIDDEN_AT_RUN (403) + ASSERTION_FAILED / PARAMS_INVALID /
  CONTRACT_VERSION_MISMATCH (422) wired into the ErrorModelFilter.
  Security: 26 granular `reports.*.read` keys + `platform.reporting.read`
  seeded (0004 §3.8 + matrix — 224=224 drift-green) and granted to the
  viewer/accountant/owner templates (close pack accountant+owner; exports
  accountant+owner via `reporting.reports.export`); platform_admin key
  count 9→10; isolation A-tests registered. Web: the `/reports` workspace
  (report catalog grouped by category, declarative parameter bar, saved
  views as client-side parameter sets — no new tables per the phase
  constraint, run + polling, ReportViewer with group tree/check
  totals/assertion footer/freshness/drill links, export menu,
  print-preview iframe, run history) + the nav item `reports.workspace`;
  i18n 1465→1505 AR=EN. The dashboard widget seam is the §14 binding
  contract only (widgets land PHASE-014). Tests: registry meta-tests,
  cache/scope/assertions/tafqit/CSV/XLSX unit suite + the db suite
  (golden dataset envelopes, as-of byte-identical re-runs, run lifecycle
  incl. the FORBIDDEN_AT_RUN TOCTOU + idempotent artifact replacement,
  export block on seeded corruption, real-Chromium render with thead
  repetition + page count + the PDF/A stamp, isolation A-tests) — the full
  suite output is in the completion report. Known limitations documented
  honestly: no branch dimension on the journal substrate (statements
  consolidated); PDF/A-2b is an XMP identification stamp on Chromium PDF
  1.7 (conformance-level PDF/A is post-MVP with a dedicated processor);
  web E2E Playwright remains waived to first infra availability per the
  standing PHASE-003 owner directive (the @erp/ui visual harness +
  API-level HTTP tests cover the surfaces). — PHASE-013
- 2026-10-31 — **PHASE-012 — Sales & Receivables (COMPLETE, tag `phase/012`)**:
  migrations `0018_sales_core.sql` + `0019_sales_ar.sql` — 14 tenant tables
  (`sales_reps`, `quotations` + lines with the BR-006 validity CHECKs, `sales_orders`
  + lines carrying the optional soft-reservation reference (the PHASE-010 seam),
  `delivery_notes` + lines with the issue-cost snapshot (the W-3 provenance),
  `sales_invoices` + lines with BR-033 `tax_snapshot` stamps + `credit_check` jsonb +
  `offline_receipt_no`/`einvoice_status` reserved NULL (PHASE-016/023), `credit_notes`
  + lines with the mandatory `invoice_line_id` reference + reentry-cost snapshots,
  and the INSERT-only `sales_reallocations` + lines — the audited re-allocation
  trail, append-only by shape); `stock_moves.source_type` widened
  (delivery_note/sales_invoice/credit_note) + `cash_movements.source_type` gains
  `sales_invoice` (the G-02 counter payment, INV-019); the §6-mandated AR index
  `(tenant_id, customer_id, due_date)`; RLS macro on all 14 + the isolation
  registry with generated A-test coverage. The `sales` module: quotations BR-006
  (validity at send + accept + the expiry sweep; QOT- at SENT), orders SOR- at
  ISSUE with soft reservations honored by the availability netting, deliveries
  posting G-03 `DR COGS · CR INVENTORY` at issue cost through the inventory
  `planIssue`/`applyIssue` seam (sales never writes stock tables) and converting
  to revenue-only invoices with the DN issue-cost copied onto the invoice lines
  (BR-007 both flows first-class), invoices G-01 credit / G-02 cash / G-03
  with-goods W-1 exact (AR 1,380 / revenue 1,200 / VAT 180 with per-line
  output-VAT legs; official SAL- numbering at posting INV-021 proven under
  50-way parallel posts CC-03; BR-005 cash-autopost with the POLICY_ACTOR
  sentinel recorded distinctly from posted_by; BR-001 credit limits as a
  CREDIT-kind control — cash records ALLOW by shape, no credit exposure —
  enforced server-side at approve with the no-TOCTOU re-verification at post,
  the block/warn/allow × limit/overdue matrix with the exact
  8,200 + 2,500 > 10,000 math in the typed `CREDIT_LIMIT_EXCEEDED` payload,
  override via `sales.credit_check.override` audited; BR-003 price resolution
  with the PRICE_CHANGED staleness gate; BR-033 snapshots refusing a rate
  mismatch at post — never silently recomputing), credit notes G-04/W-3 exact
  (SALES_RETURNS 200 DR · VAT 30 DR · AR 230 CR + INVENTORY 120 DR · COGS 120 CR
  at the ORIGINAL issue cost — batch preserved, serial binds the originally sold
  unit BR-018; BR-004 window 14d/0 with the reference requirement never
  disabling; §3.4 explicit allocation — the invoice stays gross-open, the note
  its own subledger row, mirroring the accepted PHASE-011 debit-note model),
  receipts riding the PHASE-008 treasury service (G-05 settle + G-06 the W-2 FX
  gain/loss residual ±10 at the INV-008 stored rate; settlement + on-account
  control legs split explicitly BR-027), allocations with INV-016 bounds at post
  and CC-02 concurrency proven on the sales surface, audited re-allocation
  documents SRA- (from→to, to-NULL on-account, bounds, `receipts.allocated_amount`
  re-synced), AR aging buckets + customer statements as deterministic as-of
  recomputations (RC-10 byte-identical; BR-028 document currency + base totals;
  the INV-009 footer tie) + `verifyInv009`, RC-01 over 20 randomized AR ops OK +
  RC-03 seeded drift → BROKEN + PC-04 lock block on the PHASE-007 framework's AR
  kind, opening-AR settlement (G-16 AR side, INV-009 from entry #1), the
  `invoice.overdue` job exactly-once (audit-stamp dedupe), and sales-rep
  attribution on documents (commissions explicitly deferred to PHASE-017 —
  grep-clean). 51 routes under `/api/v1/sales` + `POST /partners/partners/:id/credit-check`
  (matrix §3.2 exact, risky keys audited). 27 sales db tests (golden G-01..G-06 +
  W-1/W-2/W-3 exact figures + PERIOD_LOCKED/NOT_SUBJECT/CC-01 zero-residue packs
  + the operations packs: BR-001 matrix ×4, BR-004 boundaries, BR-006 expiry +
  sweep, G-16 AR side, RC-01/RC-03/RC-10, overdue exactly-once, INV-016 + CC-02,
  re-allocations + the INSERT-only grant denial, CC-03 50-way contiguous) inside
  a 1044-test db suite. 5 AR/EN web screens (quotes+orders workspace, deliveries,
  invoices with the live credit-check decision panel, credit notes, AR
  aging/statement/open-items) + the sales nav group; print honestly marked
  "arriving with the PHASE-013 reporting release". i18n 1342→1465.
  TABLES/trade-sales.md column specs + ENTITY_CATALOG §sales line-table rows +
  the OFFLINE matrix PHASE-012 substrate note authored in-phase.
  `pnpm gate:local` ALL GREEN (evidence in the report). — PHASE-012
- 2026-10-30 — **PHASE-011 — Purchasing & Payables (COMPLETE, tag `phase/011`)**:
  migrations `0016_purchasing_core.sql` + `0017_purchasing_ap.sql` — 14 tenant tables
  (`purchase_requests` + lines with approval routing, `purchase_orders` + lines with
  BR-010 thresholds + linked revisions + BR-029 numbering at issue, `goods_receipts` +
  lines with the BR-012 po-less shape CHECK, `supplier_invoices` + lines with
  `match_result` jsonb recorded BEFORE approval + BR-033 `tax_snapshot` stamps + the
  per-line G-08 quanta (`grni_cleared_value`/`stock_revalue_value`), `debit_notes` +
  lines referencing the original invoice, `landed_costs` + `landed_cost_allocations`
  with the remaining-qty bound + the POSTED exact-split CHECK, and the INSERT-only
  `purchase_reallocations` + lines — the audited re-allocation trail, append-only by
  shape); the `stock_moves.source_type` CHECK expansion (goods_receipt/landed_cost
  provenance); the §6-mandated AP index `(tenant_id, supplier_id, due_date)`; RLS
  macro on all 14. The `purchasing` module: PR lifecycle with SoD, PO lifecycle with
  threshold routing against the PHASE-007 approval-policies substrate, the GRN service
  receiving stock through the inventory `planReceipt`/`applyReceipt` seam (batch
  capture at receipt; purchasing never writes stock tables — MODULE_BOUNDARIES held)
  and posting G-07 (`DR INVENTORY/expense · CR GRNI`) with the BR-012 policy (reason
  mandatory, forbid by setting, audited when allowed), the three-way match BR-009
  (tolerance matrix exact by default with the 2% worked examples both directions,
  partial-receipt 98/100 exception, dispositions with reasons, the service-level
  no-match-no-post guard, `purchasing.matching.override` risky + recorded), supplier
  invoices (BR-011 duplicate block/warn, G-08 posting clearing GRNI exactly incl.
  partial proportional clearing, VAT recoverability per pack + registration —
  RECOVERABLE/EXPENSED/NOT_SUBJECT all golden-proven), debit notes G-09 mirror
  corrections, payments riding the PHASE-008 treasury service (`purchasing.payments.*`
  keys; G-10 + the W-2 FX mirror honoring the stored rate INV-008) with audited
  re-allocation documents (BR-027 on-account both directions, INV-016 bounds under
  the CC-02 lock), the AP subledger tying to `AP_CONTROL` exactly (RC-02 over 20
  randomized ops + RC-03 seeded drift → BROKEN + PC-04 lock block; opening-AP
  settlement G-16 AP side, INV-009 from entry #1), aging buckets + supplier
  statements as deterministic as-of recomputations (RC-10 byte-identical; document
  currency + base totals BR-028), the GRNI register RC-09 registered into the
  PHASE-007 framework (live close-checklist item; GRNI BROKEN refuses the period
  lock), landed-cost baseline allocation (VALUE/QTY, remaining-qty constraint, the
  explicit COGS-adjustment split — never silent back-dating — via the new inventory
  revaluation seam), and supplier price-list consumption with BR-003 purchase-side
  provenance. 48 routes under `/api/v1/purchasing` (matrix §3.3 exact, risky keys
  audited, Idempotency-Key on POST actions); six purchasing settings keys
  (allow_po_less_grn, match tolerances, duplicate_invoice_behavior, input_vat_default,
  po_approval_threshold); 5 AR/EN web screens + the AP views (orders workspace,
  receipts + landed costs, invoices with the match-result panel — per-line
  PO/GRN/invoice triple with variance highlighting, debit notes, AP aging/statement
  with the INV-009 footer badge/GRNI register); i18n 1231→1342;
  TABLES/trade-purchasing.md column specs authored in-phase; ENTITY_CATALOG §purchasing.
  41 purchasing db tests inside a 939-test db suite (G-07…G-10 goldens + failure packs
  zero-residue, BR-009 matrix + BR-011 + BR-012 ×3 + BR-010 + SoD, RC-02/03/09/10,
  re-allocations + bounds + on-account, INV-021, CC-01 concurrent convergence, A7
  spoof parity + raw-plane RLS over the 14 new registry tables, landed-costs ×7,
  posting-smoke p95 58.4ms n=100); `pnpm gate:local` ALL GREEN (all 17 steps exit 0 —
  typecheck/lint/depcruise 1171 modules/permissions-drift 199=199/unit 183/db 939/
  build/contrast/i18n 1342=1342/ui-catalog 37↔60/visual harness 16 + axe 0 + perf/
  CSP probe 4/docs 29/29/negative proofs ×3).
- 2026-10-30 — **PHASE-010 — Inventory & Warehousing (COMPLETE, tag `phase/010`)**:
  migrations `0014_inventory_core.sql` + `0015_inventory_tracking.sql` — 13 tenant tables
  (`warehouses` branch-linked with the per-warehouse `inventory_account_id` G-15 override,
  `item_warehouse_settings` with the BR-019 once-per-window `last_reorder_alerted_at` stamp,
  `stock_moves` 🔒 append-only by grants (SELECT/INSERT only for erp_app — the A4 denial)
  + `trg_stock_moves_guard` (even superuser DELETE refuses — RC-05 asserts it), `stock_layers`
  with consumed rows kept at remaining 0 (Σ layer qty = on-hand exactly), `item_stock` the
  transactionally-maintained read model, `stock_transfers` + `stock_transfer_lines` with
  transit/posted shape CHECKs, `stock_adjustments` with the OTHER-requires-counter shape,
  `stock_reservations` (the §4 in-phase catalog addition — soft netting only), `item_batches`
  with the FEFO expiry index, `item_serials` with IMEI shape + sold/returned binding CHECKs,
  `stock_counts` + `stock_count_lines` with frozen-snapshot + variance jsonb shape CHECKs;
  the opening_balance_docs STOCK status lift + stock_moves↔batches/serials FK expand steps;
  RLS macro on all 13; the 0014 viewer-template correction (0005 pre-granted
  inventory.transfers.view/inventory.counts.view — matrix §3.5 says warehouse+owner only;
  PHASE-010's route surface made the drift observable, the module migration realigns it).
  The `inventory` module: warehouse service (activation/deactivation with in-flight guards),
  the movement core — one transaction per move: stock rows + `PostingEngine.post` + audit
  (INV-018; simulated-crash leaves neither), WAC + FIFO valuation engines (pure domain,
  6-decimal internal precision; oracle property suites: average within [min,max] of costs
  seen, valuation = Σ layer qty × cost), opening-stock posting consuming PHASE-006 stock
  drafts through the OPENING period (G-16 stock leg: DR INVENTORY · CR OPENING_EQUITY with
  per-item layers, idempotent replay), transfers DRAFT→IN_TRANSIT→POSTED (dispatch writes
  the OUT leg + G-15 journal only when the warehouses resolve distinct GL accounts — the
  policy-none same-account case asserted explicitly; receive writes the IN leg at conserved
  value; IN_TRANSIT netted out of availability BR-016), stock counts DRAFT→COUNTED→
  VARIANCE_REVIEW→POSTED (snapshot frozen at creation, blind mode, audited recount with
  note, BR-015 value-impact tolerance → supervisor override, approval posts G-13
  shrinkage / G-14 appreciation, INV-011 locked-period rejection with zero residue), FEFO
  batch issuing (BR-017) + expiry write-off as EXPIRED shrinkage, serial/IMEI registry
  with the original-unit return binding (BR-018), soft reservations + the availability
  service (on-hand − reserved − in-transit; expiry sweep), the nightly reorder job
  (BR-019: `stock.below_reorder` email digest via the notifications module — exactly once
  per 24h window per item-warehouse; no automatic POs exist, asserted), the INV-010/RC-04/
  RC-05 reconciliation check (movement trail + pending IN legs vs GL per resolved account,
  zero tolerance; orphan moves/journals surfaced; registered into the PHASE-007 framework
  with PC-04 lock block + the close-checklist inventory item live), method-lock +
  dated-revaluation method switch (INV-017: no in-flight movements, revaluation posting
  DR/CR inventory vs appreciation/shrinkage, past issues immutable, preview included), and
  manual reason-coded receipts/issues/adjustments (never a way around the engine).
  49 API routes under /api/v1/inventory (matrix §3.5 exact permission keys; risky
  inventory.items.method_switch / inventory.counts.post / inventory.adjustments.post
  audited; A7-parity 404s). Settings: `inventory.allow_negative_stock` (BR-013, default
  false) + `inventory.count_variance_tolerance` (BR-015, default 0). Web: المخزون /
  Inventory nav group live with 5 AR/EN routes (warehouses manager on the Settings
  archetype, stock on hand + the BR-016 availability drill, the movement ledger with
  direction/kind/warehouse filters + batch/serial columns, the transfer wizard with
  in-transit badge, and the count workspace — Journey D: item picking + blind mode +
  frozen sheet + variance review + recount + plain/supervisor approval); nav +5 items;
  i18n 1085→1231 AR=EN. Tests: 37 inventory db specs (G-13/G-14/G-15 both branches/G-16
  goldens + failure packs; INV-010/017/018; RC-04 mixed-ops green + RC-05 orphan drift →
  BROKEN + notification + PC-04 block + the documented superuser-tooling repair; FEFO +
  serial return-binding; CC-04 last-units race with zero residue; BR-013 negative-off
  default + explicit-on; the T-01 100k-move perf smoke with EXPLAIN-verified
  `ix_stock_moves_tenant_item_wh_date` use + suite-order cleanup; spoof A7 zero-residue)
  + the 12-test valuation property suite inside an 814-test db suite; the 438-test
  isolation suite covers the 13 new registry tables. `pnpm gate:local` ALL GREEN (all 17
  steps exit 0). Docs synced: ENTITY_CATALOG §inventory rows refined (+`stock_reservations`,
  +`stock_transfer_lines`), TABLES/trade-inventory §inventory column specs authored
  in-phase, GLOSSARY inventory terms unchanged (AR canonical already), OFFLINE matrix
  PHASE-016/020 notes stand.
- 2026-10-30 — **PHASE-009 — Tax Engine & Jurisdiction Packs (COMPLETE, tag `phase/009`)**:
  migration `0013_tax.sql` — 3 global reference tables (`tax_treatments` with return-box
  semantics for the six never-conflated treatments, `jurisdictions` with the full
  COUNTRY_PACKS §2 descriptor as jsonb + verification_status/verified_at shape, and
  `jurisdiction_tax_rates` with effective-dated versioned windows; NO RLS by design per
  TENANT_ISOLATION §3 — read-only grants to erp_app with INSERT/UPDATE/DELETE denials
  asserted; seed-only via erp_migrate) + 6 tenant tables (`tax_codes` tenant-unique with
  pack binding, `tax_registrations` with the REGISTERED-number shape CHECK migrating the
  PHASE-004 `tax.registration.*` settings (expand → dual-read window; contract step later),
  `tax_pack_bindings` for staged version pins, `tax_document_summaries` 🔒 append-only by
  grants + `erp.tax_summaries_guard()` (INV-012's document side — RC-07 drift is
  superuser tooling by construction), `vat_returns` with ready-revocation on cross-check
  failure, and `e_invoicing_submissions` schema-only per FEATURE_CATALOG "023 (schema
  009)"); the expand step wires `items.tax_code_id` + `item_categories.default_tax_code_id`
  + `expenses.tax_code_id` composite FKs. Seeds: 6 treatments + **all 10 packs**
  (SA 15% from 2020-07, AE 5% from 2018-01, BH both asserted windows 5%→10% across
  2022-01, OM 5% from 2021-04, EG 14% from 2017-01, JO/GST 16% from 2018-01; KW/QA/YE/IQ
  ship fully with NO rate rows) — every row carries source_ref + verified_at NULL
  (REQUIRES_VERIFICATION — directive §1.12–1.13; the NO-fabrication gate: SA's unasserted
  pre-2020-07 rate ships no row, documents before the window fail closed
  NO_RATE_FOR_DATE). The `tax` module: the pure deterministic resolver (rate snapshots
  stamped on lines BR-033 + draft-spanning boundary warnings; INCLUSIVE extraction within
  the same rounding rules; NOT_REGISTERED + NO_VAT/VAT_PLANNED modes; REVERSE_CHARGE
  self-accounts at the standard rate — baseline-labeled), codes/registrations/packs
  services (audited; reference-guarded archive; preview→apply with audit), the posting
  adapter (the G-11 expense VAT leg: DR EXPENSE net · DR VAT_RECOVERABLE tax · CR CASH
  gross with the golden updated; OUTPUT-lines + summary-recording seams for
  PHASE-011/012), the VAT return v1 (deterministic aggregation, INV-012 side-by-side
  cross-check gating READY, ready-revocation on drift, CSV/XLSX export via the files
  module, mark-filed as the audited human action), the INV-012 check (RC-06) registered
  into the PHASE-007 framework with PC-04 lock block + the close-checklist tax item live,
  and the EInvoicingAdapter port + fake adapter (RISK-005 UNVERIFIED refusal asserted;
  lifecycle walkers PENDING→…→ACCEPTED/REJECTED in tests). Frozen contracts
  `tax.snapshot.v1` / `summary-group` / `document-summary` / `resolved-line` /
  `pricing-mode` in @erp/contracts. 27 API routes under /api/v1/tax (permission-gated
  incl. the risky tax.registrations.manage/tax.returns.mark_filed keys, A7-parity 404s).
  Web: 4 AR/EN routes (الإعدادات: tax codes manager with resolve preview, registrations,
  pack viewer with versions/apply; التقارير: VAT return workspace with the cross-check
  side-by-side + export); nav registry +4 items; i18n 974→1085 AR=EN. Tests: 90 tax db
  specs (10 per-pack suites × the 7 engine-level scenario classes + NO_VAT modes + 2-dp/
  3-dp rounding worked examples + byte-identical determinism + return-prepare; VAT
  return RC-06/RC-07 + registration migration + adapter lifecycle + BR-033
  snapshot-preservation under a simulated version bump + grants denials; spoof A7/A8)
  inside the 699-test db suite; treasury G-11 golden gains the VAT leg. `pnpm gate:local`
  ALL GREEN. Docs synced: ENTITY_CATALOG §tax, TABLES/tax-compliance (authored to the
  delivered schema — doc-reality reconciliation recorded), ERD/treasury-tax, the 10
  compliance-matrix §9 implementation-status notes (pack seeded, fixtures executed,
  remaining scenarios mapped to 012/013/023), DEPENDENCY_RULES §2 treasury→tax edge.
- 2026-10-30 — **PHASE-008 — Treasury: Cash, Banking & Expenses (COMPLETE, tag `phase/008`)**:
  migration `0012_treasury.sql` (11 tenant tables — cash_accounts 1:1 to CoA accounts,
  append-only cash_movements 🔒 by grants + guard trigger, receipts/payments with posted-shape
  CHECKs, treasury_allocations with exactly-one-doc CHECK + partial uniques, expense_categories,
  expenses with reserved tax_code_id, cash_transfers with fee CHECKs, cashier_shifts with
  one-open-per-account partial unique, bank_statements idempotent by (tenant, file_hash),
  bank_statement_lines informational-only; reconciliation_runs kind widened with BANK_REC,
  file_objects owner widened with EXPENSE; all RLS'd + composite-FK'd + registry-isolated).
  The `treasury` module: account service (open requires mapped GL, close preserves history,
  balance ≡ Σ movements), receipt/payment services (DRAFT→POSTED via `PostingEngine.post`,
  RCV-/PAY- numbers INV-021, FX capture), allocation service (FIFO suggest, partials,
  INV-016 bounds under the open-item row lock CC-02, BR-027 on-account remainders),
  SettlementCore realized-FX posting (cash at current rate · control at the original
  stored rate INV-008 · explicit FX_GAIN/FX_LOSS residual with references — gain and
  loss goldens), petty-cash guard (BR-020 caps + override with audit, PLACEHOLDER defaults
  documented OQ-002), transfer service (G-12 with BANK_CHARGES), expense service (BR-023
  per-category approvals + receipt attachments via files), shift service (BR-021 worked
  example −2.50 posts with the shift as source; supervisor id+PIN above tolerance),
  statement import (adapter registry: generic-csv with Arabic-header mapping + generic-xlsx;
  sha-256 idempotency; 5000-row cap), bank-rec service (auto-match amount+window+reference,
  exact manual match, unmatched aging both sides, BR-022 per-account period lock), and the
  INV-019/RC-08 cash reconciliation check registered into the PHASE-007 framework (seeded
  drift → BROKEN + notification + PC-04 block; close-checklist cash + bank-rec items live).
  62 API routes under /api/v1/treasury (A7-parity 404s, Idempotency-Key guard, 37 treasury
  error codes typed in the ERROR_MODEL filter). Web: the الخزينة / Treasury nav group live
  with 12 AR/EN routes (accounts + movements drill-down, receipts/payments list/create/
  detail with the allocation editor + live exact-math totals bar, expenses + categories,
  transfers, shifts, bank-rec wizard → match grid → aging → lock); `ShiftPanel` pattern in
  @erp/ui (headless cashier console, exact-decimal expected math, supervisor PIN, 4 stories,
  AR+EN baselines; exact-decimal extracted so MoneySummaryBar shares it — ADR-0009); i18n
  733→974 AR=EN. **Reality-audit repairs (pre-existing latent defects found by this phase's
  gates)**: db-suite file-order couplings on the shared FY2026 — gl-perf posted into
  September that periods.spec soft-closes (observed live once treasury's 5 spec files
  perturbed vitest's scheduling), accounting/golden's FX-reval posted into September +
  October, concurrency's May, INV-011-022's March/April/May — every state-mutating suite
  now restores the pristine all-OPEN state in afterAll (`restorePeriodsOpen`), the INV-022
  fuzz corpus's flipped settings (incl. fx_revaluation_enabled) are restored, the treasury
  G-11 golden find-or-creates the T-RENT category, and master-data-flows reuses the
  isolation suite's canonical MAIN branch row id; order-independence proven with
  `--sequence.shuffle.files` across 4 seeds (default order + seed 7 fully green; seeds
  42/13/99 fail only on two pre-existing documented classes — the isolation suite's
  pristine-count design that requires it to run before row-adding suites, and the email
  suite's 10s queue deadline under a late-run loaded queue — both satisfied deterministically
  by the default gate order). Evidence: 572/572 db tests (43 treasury: goldens
  G-05/G-06+loss mirror/G-10+mirrors/G-11/G-12 with failure packs zero-residue, INV-016/019,
  CC-02, RC-08 drift, spoof S-04/A7, BR-020..023), `pnpm gate:local` ALL GREEN (typecheck,
  lint, depcruise, permissions-drift 199, unit 133, db 572, build, contrast, i18n 974/974,
  ui-catalog 37↔60, visual harness 16 + axe 0 + perf, CSP probe 4, docs 29/29, negative
  proofs ×3). Docs: TABLES/treasury-tax.md authored (the phase's §8 obligation), ERD
  treasury-tax.md refreshed (receipts/payments/treasury_allocations added), ENTITY_CATALOG
  treasury rows completed, FEATURE_CATALOG cheque-deferral note carries the PHASE-008
  provenance, PHASE_ACCEPTANCE_CRITERIA 008 row enriched, PERIOD_CLOSING cash/bank-rec
  items now live. (reports/PHASE-008-COMPLETION.md)
- 2026-10-30 — **PHASE-007 — Accounting Core & Posting Engine (COMPLETE, tag `phase/007`)**:
  migrations `0010_accounting_core.sql` + `0011_journal_tables.sql` (fiscal_years/fiscal_periods
  with no-overlap exclusion + OPENING/CLOSING windows, exchange_rates dated, cost_centers tree,
  recurring_journals, approval_policies, reconciliation_runs, numbering store per ADR-0006;
  journal_entries/lines append-only with `uq_journal_entries_tenant_source_op` (INV-013),
  balance + immutability + period-lock guard triggers, tenant-first hot indexes; all RLS'd +
  composite-FK'd + registry-isolated). The `accounting` module: CoA readiness service (V1–V6,
  purpose resolution fail-closed), period service (PC-01…PC-04, reopen + anti-fraud alert),
  FX service, the **posting engine** (ADR-0007: pure domain package, validation pipeline 1–8
  in order, verbatim error taxonomy, INV-001…022 enforcement, reversal-only correction),
  posting orchestration (JE-{yyyy}-{seq:6} numbering, insert-conflict idempotency CC-01),
  manual journals (draft→submit→approve→post lifecycle, SoD default-OFF), recurring journals
  (pg-boss draft generation, never auto-posts), approval policies (BR-034 base-currency
  thresholds), GL queries (trial balance, movements with running balance, journal register,
  INV-006 drill-down + EXPLAIN evidence), opening-balance posting (G-16, per-partner AR/AP
  subledger rows from entry #1 via the partners subledger port), year-end close (PC-05/06/07,
  idempotent, unit-reversible), reconciliation framework (RC-01…RC-03 AR/AP checks) + close
  checklist service (NOT_APPLICABLE explicit). Partners module gained the subledger-write api
  (same-transaction, module-boundary sanctioned). Web: the accounting navigation group live
  with 8 screens (CoA editor + purposes, journal list/detail/workspace on the JournalEntryGrid
  archetype-4 pattern with MoneySummaryBar live Δ, GL browser with drill-down, period
  management + checklist + reconciliation + year-end, approvals queue on the ApprovalsQueue
  pattern, rate editor, opening-balances post step); i18n 320→733 keys AR=EN; `JournalEntryGrid`
  + `MoneySummaryBar` + `ApprovalsQueue` patterns in @erp/ui with catalog rows + AR+EN
  baselines. **Reality-audit repairs (pre-existing latent defects found by the phase's own
  gates)**: Radix tooltip ≥1.1 requires a Provider — the primitive crashed every provider-less
  consumer (the overlays story baseline had captured a crashed error stack; the real app's
  collapsed sidebar would white-screen) — the primitive is now self-contained; the Tabs
  wrapper never mounted TabsContent (dangling `aria-controls`, axe critical — the real
  opening-balances console was affected) — content routing added (data-slot + fallback);
  Combobox clear-button + trigger naming and MoneyInput input labels added (grid cells now
  carry per-cell aria-labels); new `--erp-width-journal-grid` token through the DESIGN_TOKENS
  governance path. Evidence: 460/460 db tests (invariants INV-001…009/011/013/014/015/020/021/022,
  golden G-16/G-19/G-20 + engine goldens, CC-01/03/05/06, PC-01…PC-07, RC-01…RC-03, posting
  smoke p95 ≪ 500 ms local k6-equivalent), 171 unit tests, visual harness 16 passed (73→87
  baselines AR+EN), `pnpm gate:local` ALL GREEN —
  [reports/PHASE-007-COMPLETION.md](../implementation/phases/reports/PHASE-007-COMPLETION.md).
- 2026-10-29 — **PHASE-006 — Master Data (COMPLETE, tag `phase/006`)**: migration 0009 (15
  tenant-owned tables: partners + contacts/addresses, credit_terms, item_categories, items,
  uoms, uom_conversions, barcodes, price_lists, price_list_items, opening_balance_docs
  DRAFT-locked, partner_balances read model, file_objects attachment linkage, import_jobs;
  pg_trgm+btree_gin AR/EN search indexes; branches.default_price_list_id). Partners module:
  BR-025 auto-coded directory (P-000001…), contacts/addresses, BR-026 system terms, the BR-001
  credit-check interface (warn default over DRAFT exposure), opening-balance DRAFT capture
  (G-16 source; zero-posting proven: no journal tables exist). Items module: categories tree
  (cycle-proof), items (tracking-flag matrix, tax_code_id FK deferred to PHASE-009), UoM
  registry with exact-decimal conversions (compose-exactly property test), scan-unique
  barcodes, price lists + tiers, and the BR-003 resolution service (customer list → branch
  default → base price, with provenance + per-UoM exact conversion). Preview-gated import
  engine (CSV+XLSX, AR+EN headers, dry-run row reports, duplicates blocked/warned, commit
  idempotent per upload token via pg-boss, U-07 zip-bomb guard) + bounded signed-URL exports.
  Attachments wired through the PHASE-002 files module (U-01…U-07, A11). Trigram search in
  CommandMenu + PartnerPicker/ItemPicker patterns (catalog-covered) + headless hooks.
  Evidence: 328/328 db tests (168-test A1–A10 suite over all 27 registered tenant tables),
  10k-row perf ≤ 200 ms with EXPLAIN index proofs, S-04 no-existence-disclosure, 12/12
  acceptance criteria — [reports/PHASE-006-COMPLETION.md](../implementation/phases/reports/PHASE-006-COMPLETION.md).
- 2026-10-29 — **PHASE-005 — Design System, i18n & RTL Foundation (COMPLETE, tag `phase/005`)**:
  `@erp/ui` 1.0.0 (ADR-0016) — token layer byte-verbatim to DESIGN_TOKENS (§16 contrast gate
  in CI), Radix primitives (single legal import site), catalog components (DataTable
  virtualized-to-10k with grid semantics; MoneyInput §6.2 decimal-string contract;
  DatePicker/DateRangePicker canonical-Gregorian + `islamic-umalqura` display; DocumentStatusBadge
  + DocumentActions §6.4 fixed vocabulary; overlays/toasts/states/navigation) + AppShell with
  server-resolved entitlement-driven navigation (contract registry + pure resolver +
  GET /tenancy/navigation). AR+EN visual harness (Storybook --test frozen-clock → Playwright
  threshold-0 ×65 baselines, axe-in-harness 0, geometry invariants, both-direction coverage
  check, §3 quarantine). Four erp-ui lint rules + negative meta-tests. i18n dictionaries
  310→320 (triple parity). CSP middleware + §8 probe. S-03 bidi payload suite. All 18 web
  screens migrated; provisional styling removed. Gates: 42+58+38+11 unit, 207/207 db,
  harness 16+1, CSP 4/4, docs 29/29. Discovered+repaired: PHASE-003's inline
  no-physical-direction rule was structurally dead (create() nested in meta) — replaced.
  Evidence: implementation/phases/reports/PHASE-005-COMPLETION.md.
- 2026-10-28 — **PHASE-003 — Identity, Multi-Tenancy & Audit (COMPLETE)**:
  migrations `0003_identity_core.sql` (9 identity tables per TABLES/tenancy-identity;
  composite tenant FKs; variant command-specific RLS for roles/role_permissions +
  `template_seed` path TO erp_migrate — templates readable for cloning, never
  forgeable/mutable/deletable by the app role; `audit_events.actor_id → users(id)`
  expand-FK), `0004_permissions_seed.sql` (199 keys verbatim from AUTHORIZATION_MATRIX
  §3 — drift checker `scripts/check-permissions-drift.ts` in the gate), and
  `0005_system_role_templates_seed.sql` (9 templates, 413 grants). New role
  `erp_definer` (NOLOGIN BYPASSRLS) owns the pre-GUC SECURITY DEFINER projections
  (`user_membership_options`, `user_effective_permissions`, `invitation_by_token`) —
  FORCE RLS binds even the table owner, so definer ownership MUST bypass. Identity
  module: argon2id (64 MB/3/1, per-hash params), opaque rotating sessions (12 h
  absolute re-anchored on rotation / 30 min idle), progressive lockout (5 → 15 min,
  never permanent) + per-IP windows, TOTP MFA (RFC 6238, replay-rejecting timestep
  tracking, hashed single-use recovery codes), stateless HMAC reset tokens bound to
  the user version (single-use; documented deviation — no resets table in the 9-table
  set), 72 h single-use invitations. RBAC: `@RequirePermissions` guard + route
  registry (`infra/auth/route-permissions.ts`) + generated checklist test;
  `identity.mfa.manage` is runtime self-scope. Tenant-context interceptor wraps
  handlers in the `withTenant` UoW (S-02 suspension → 503 TENANT_SUSPENDED).
  Notifications skeleton: AR/EN plain-text templates, minimal SMTP client
  (EHLO/STARTTLS/AUTH PLAIN/DATA), pg-boss `notifications-email` queue with
  deterministic-UUID dedupe. Web (apps/web): BFF session cookie (httpOnly/Secure/
  SameSite=Lax) + CSRF double-submit + generic proxy; provisional screens login /
  forgot-password / accept-invitation / users / sessions / mfa / roles / settings
  with typed AR/EN dictionaries (~115 keys, parity-asserted). **Verified against
  embedded PostgreSQL 16: 105/105 db tests** — generated isolation suite A1–A10 ×
  every registered tenant-owned table (36) + registry negative proof, flows (20:
  R-01/02/03/05, M-01/02/04/06/07/08/10, S-01/02/03, invitations, checklist),
  HTTP end-to-end (12: 401/403+audit/200, oracle-uniform login, idempotency 422,
  MFA 423, reset-200-always), email over a real SMTP session (5); 58 api unit
  tests; typecheck/lint/depcruise/drift/web gates green. House rule discovered:
  tsx/esbuild emits no decorator metadata — all Nest DI uses explicit `@Inject`
  tokens. Waivers: mailpit capture + Playwright journey (first Docker/host),
  Testcontainers (standing), same class as PHASE-001/002 items.
  — PHASE-003

- 2026-10-28 — **PHASE-002 — Database & Migration Infrastructure (COMPLETE)**:
  migrations `0001_core_infra.sql` (roles erp_migrate/erp_app/erp_readonly — no
  passwords in SQL; `erp.current_tenant_id()` GUC; minimal `tenants`; append-only
  `audit_events` with grants + `erp.audit_events_guard()`; RLS ENABLE+FORCE;
  `boss` schema) and `0002_rls_macro.sql` (`erp.apply_tenant_policy()` macro +
  `erp._schema_state` readiness mirror); drizzle-kit workflow (`NNNN_description.sql`
  + journal); `withTenant()` unit-of-work (transaction-local GUC, ALS, transactional
  audit appends); pg-boss queue client + worker mode (`WORKER_MODE`); files module
  (S3 adapter, tenant-prefixed keys, signed URLs, upload constraints — A11); pino
  logging with X-Request-Id correlation + redaction; OTel api no-op wiring;
  `/health/ready` (DB + migration state + queue liveness); CI checkers
  (`scripts/check-rls.ts` RLS presence + ENTITY_CATALOG drift; `scripts/ci/migration-tests.ts`
  Testcontainers runner + ci-db.yml). **Verified against embedded PostgreSQL 16**:
  attack suite A1–A5/A10 zero leaks, append-only rejection (grants 42501 + trigger
  P0001), pg-boss dedupe (one execution for duplicate enqueues), signed-URL
  round-trip + expiry + A11, readiness `{db: up, migrations: up, queue: up}`; full
  gate green (typecheck/lint/depcruise/78 unit/32 db/build/docs 29–29/meta-test).
  Scoped repairs: compose/DEVELOPMENT_SETUP database naming unified (`erp`);
  DEVELOPMENT_SETUP filter names fixed (@erp/api); ci.yml `branches: [main]` typo
  repaired; Dockerfile runtime entry switched to the tsx workspace-source model
  (ADR-0002; production bundling stays PHASE-014+). Report:
  [../implementation/phases/reports/PHASE-002-COMPLETION.md](../implementation/phases/reports/PHASE-002-COMPLETION.md);
  tagged `phase/002`. — PHASE-002
- 2026-10-28 — **PHASE-001 flip to COMPLETE**: full local gate re-verified green after
  the blueprint v2.0 docs merge (`pnpm gate:local` exit 0 — typecheck, lint,
  boundaries, 51 tests, build, docs validation **29/29**, negative meta-test); the two
  infrastructure-bound evidence items (first hosted-CI green run, `docker compose up`
  healthcheck) are **waived to first infrastructure availability by project-owner
  directive (2026-10-28)** — recorded as follow-up obligations in
  [../implementation/phases/reports/PHASE-001-COMPLETION.md](../implementation/phases/reports/PHASE-001-COMPLETION.md)
  §Deferred evidence; tagged `phase/001`. — PHASE-001/DECISION
- 2026-10-28 — **Blueprint v2.0 — Platform Depth & Breadth Expansion**: 9 new phases
  (PHASE-026…034) in stages 9–11 — financial depth (fixed assets, cheques/notes/PDC,
  installments, budgeting, payroll) + 5 industry templates (wholesale, electronics,
  healthcare, education, agriculture commercial shells) + multi-entity consolidation
  (ADR-0018); 6 new modules/38 feature keys/23 entities/16 purposes/G-21…G-32/
  INV-023…026/BR-041…056/17 reports/10th navigation group; governed by
  [../EXPANSION_REGISTER.md](../EXPANSION_REGISTER.md) ED-01…ED-19; MVP (PHASE-014) and GA
  (PHASE-025) gates unchanged. — BLUEPRINT/DECISION
- 2026-10-28 — **PHASE-001 — Repository & Engineering Foundation (IN_PROGRESS)**:
  pnpm + Turborepo monorepo scaffolded — `apps/api` NestJS skeleton (`GET /health/live`,
  runtime smoke HTTP 200), `apps/web` Next.js `[locale]` AR/EN RTL/LTR skeleton
  (SSG both locales), desktop/mobile/ui README stubs, `packages/domain-core`
  (UUIDv7, Money/Quantity/Rate per ADR-0009 with half-up rounding and 3-decimal
  currencies, Result, CalendarDate; 38 tests), `packages/contracts` (registry v0,
  error-code seed, wire schemas; 11 tests), `packages/config` (strict tsconfig,
  ESLint with module-boundary enforcement + money/RTL custom rules, Prettier);
  `dependency-cruiser` graph rules; Docker Compose dev stack; GitHub Actions CI
  (gitleaks, docs validation, negative boundary meta-test); CODEOWNERS; root
  README/AGENTS. All local gates green (`pnpm gate:local`); scoped repairs: ADR-0002
  desktop/mobile phase refs corrected (canon 021/022), DEVELOPMENT_SETUP package
  filter names fixed. Pending for COMPLETE: first CI green run + compose
  healthcheck (see
  [../implementation/phases/reports/PHASE-001-COMPLETION.md](../implementation/phases/reports/PHASE-001-COMPLETION.md)).
  — PHASE-001
- 2026-10-28 — **Blueprint v1.1 — Consolidation**: Folder 3 adopted as the canonical
  baseline; audited ideas from competing plans integrated and all dispositions recorded.
  10 defect corrections (DEF-001…DEF-010, two HIGH: money wire-regex conflict; ledger
  balance trigger made DEFERRABLE), 12 consolidation decisions (CD-01…CD-12), new
  ADR-0017 (no event sourcing), 14 authoritative summary documents
  (ARCHITECTURE_BASELINE + domain summaries + registers + validation report), 8
  industry manifests extracted to machine-readable JSON
  (`industries/templates/manifests/`), 2 validation scripts (`scripts/`), 23/23
  deterministic doc checks green. See [../CONSOLIDATION_VALIDATION_REPORT.md](../CONSOLIDATION_VALIDATION_REPORT.md)
  and [../CONSOLIDATION_REGISTER.md](../CONSOLIDATION_REGISTER.md). — BLUEPRINT
- 2026-10-27 — **Blueprint v1.0**: complete documentation blueprint created — 202
  documents, 16 ADRs, 25 phase documents, 8-stage roadmap, 22 accounting invariants
  (INV-001…022), 40 business rules (BR-001…040), 10-country compliance matrices with
  verification flags, cross-document validation performed
  ([VALIDATION_REPORT.md](VALIDATION_REPORT.md)). Repository tagged `blueprint/v1.0`.
  No application code exists yet. — BLUEPRINT
- 2026-10-27 — Post-blueprint consistency fixes: phase-numbering drift corrected
  (ADR-0012 POS subset → PHASE-016; DEPLOYMENT client distribution → 021/022;
  OQ-004 ZATCA implementation → PHASE-023; OBSERVABILITY sync-health → PHASE-020;
  MODULE_BOUNDARIES configuration module → P-004/015 and sync tables aligned with
  ENTITY_CATALOG); PHASE_ACCEPTANCE_CRITERIA.md restored; permission-key
  reconciliation note added to FEATURE_CATALOG (AUTHORIZATION_MATRIX canonical);
  TABLES/tax-compliance.md added (referenced by E_INVOICING_ARCHITECTURE); phase
  template/README wording clarified (29 mandatory items mapped to 8 sections). — DOCS

- 2026-10-28 — PHASE-004 COMPLETE (tag `phase/004`): Tenant Provisioning &
  Platform Administration — public registration (per-IP + global rate limits,
  atomic tenant+owner+trial+audit), provisionWorkspace idempotent CoA
  instantiation (42 accounts + 16 purposes + 8 roles + numbering/fiscal/
  jurisdiction defaults), branches + branch-scoped membership enforcement,
  typed tenant_settings (L5) with §9 invalidation events, entitlements service
  with BR-039 server-side enforcement + BR-040 dependency-closure validation
  (PLACEHOLDER plans per OQ-002), rule-6 lifecycle (suspend kills sessions +
  support sessions, login blocked, console stays up, restore revives),
  matrix-§7 support access (opt-in/ticket, 4h box, lazy expiry, per-action
  via_platform_admin audit, enumerated reads, tenant termination), the platform
  admin console on the new PlatformScope plane (ops-tenant membership; per-use
  audited cross-tenant reads; entitlement edits; plan assignment; audit
  viewer), the platform-scope audit widening (tenant_id NULL rows +
  via_platform_admin on both trails), 8 provisional AR/EN screens, and the full
  isolation evidence: A1–A10 over 12 registered tenant tables + the platform-GUC
  mini-matrix. 207/207 db tests, all local gates green. Catalog markers synced
  (accounts 004/007, data_export→014, numeral_system default → latn). — CODE
