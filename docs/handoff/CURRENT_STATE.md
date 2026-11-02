# Current State

> **Status:** LIVING DOCUMENT — updated at every phase completion · **Updated:** 2026-11-02

What actually exists in this repository right now. Paired with
[../planning/IMPLEMENTATION_STATUS.md](../planning/IMPLEMENTATION_STATUS.md) (phase
table) and [NEXT_ACTION.md](NEXT_ACTION.md).

## Repository contents

- **Documentation blueprint v2.0 — COMPLETE** (v1.1 consolidated baseline + platform depth
  & breadth expansion per [../EXPANSION_REGISTER.md](../EXPANSION_REGISTER.md)): 240
  Markdown documents under `docs/` covering vision, product
  requirements, scope, glossary (EN↔AR), architecture (system overview, 18 ADRs,
  module boundaries, dependency rules, data flows, security, multi-tenancy, deployment,
  observability), planning (34-phase roadmap, dependency graph, acceptance criteria,
  status, release strategy, risk register), database (conventions, entity catalog, data
  dictionary, relationships, constraints/indexes, tenant isolation, migration strategy,
  backup/recovery, ERDs, table specs, seeds), product (personas, journeys, workflows,
  BR-001…056 business rules, industry/feature catalogs — 22 modules, 163 feature keys
  (125 v1.1 + 38 v2.0) — subscriptions & entitlements,
  configuration engine), accounting (principles, bilingual CoA, posting engine,
  document lifecycle, journal rules with golden postings G-01…G-32, AR/AP, inventory
  accounting, period closing,
  reconciliation, invariants INV-001…026), industries (framework + capability matrix +
  13 template manifests (8 v1.1 + 5 v2.0 commercial shells) + workflows + report
  catalog), localization (architecture,
  RTL/LTR, currency/precision, country packs for SA/AE/BH/KW/OM/QA/YE/EG/JO/IQ with
  compliance matrices + official-sources registry, tax engine, e-invoicing
  architecture), api (conventions, authentication, error model, idempotency,
  versioning, OpenAPI strategy, integrations catalog), ui (principles, tokens, design
  system, 49-component catalog, 12 page archetypes, navigation (10 groups), RTL rules,
  accessibility, motion, visual testing), reporting (architecture, report contract,
  catalog with 67 reports, financial statement rules, printing/export,
  reconciliation), offline (architecture, local DB, sync protocol, conflict
  resolution, idempotency, device security, capabilities matrix, failure recovery),
  security (threat model, authorization matrix, data protection, secrets, security
  test plan, incident response), testing (strategy, accounting tests with golden
  datasets, tenant isolation tests, sync chaos suite, regression, performance),
  operations (dev setup, environments, CI/CD, deployment, backup/restore runbook,
  disaster recovery, monitoring, troubleshooting), implementation (34 phase documents
  + phase/completion/code-review templates), decisions (records for pricing, payment
  provider, costing default, ZATCA scope, Yemen scope, observability vendors, and the
  v2.0 expansion set: platform expansion, fixed assets, notes & installments,
  budgeting, payroll scope, consolidation), and this handoff set.
- **Application code: PHASE-001 … PHASE-020 (all COMPLETE).** PHASE-020 (2026-11-02) generalized the PHASE-016 POS sync slice into the platform-wide protocol: `sync` module (signed-cursor pull, per-item push with typed rejections, inbox dedupe with duplicate replay, device registry with attestation-lite + revocation), `packages/sync-core` v1 client kernel, 2 sync tables + feed index, drift 245=245; unit 232 PASS + sync-core 6/6; db suite 1340 PASS/2 skipped (isolation 828/828, sync golden 8/8). Evidence: `docs/implementation/phases/reports/PHASE-020-COMPLETION.md`. PHASE-019 (2026-11-02) added the `crm` module: leads with audited conversion to partners (BR-025 via PartnerService, CONVERTED immutable), tasks/activities/time entries with the narrative-required billing policy, service contracts whose billing run posts only through PostingService (DR AR_CONTROL·CR SALES_REVENUE, project stamped on journal lines, idempotent per (contract, period) — INV-013; SOFT_CLOSED rejection — INV-011), service orders generalizing job cards, and the accounting-owned `projects` dimension (`journal_lines.project_id`, engine-written); 2 report contracts `services.contract_revenue_schedule` / `services.time_billing_summary` (registry 64→66); `industry.professional_services` v1.0.0 seeded and applicable via the unmodified PHASE-015 engine (stock modules absent from its enabled set; rental_logistics recorded out of scope); drift 242=242; unit 221 PASS; db suite 1319 PASS/2 skipped on embedded PG (isolation 816/816, template-apply 13/13, crm golden 5/5). Evidence: `docs/implementation/phases/reports/PHASE-019-COMPLETION.md`. PHASE-017 (2026-11-02, tag `phase/017`) added the automotive & distribution industry templates (migration `0024`, manifests via the unmodified PHASE-015 engine) plus the sales/distribution domain cores and query services: job cards, vehicle registry, routes/visits, van stock read model, rep settlements (BR-021 variance math), price tiers/free goods, commissions — plus the 7 PHASE-017 report contracts (registry 54→61) backed by `DistributionQueriesService`, with 20 new unit specs and a green embedded-PG db suite (isolation 738/738, template-apply 8/8). Evidence: `docs/implementation/phases/reports/PHASE-017-COMPLETION.md`. PHASE-016 (2026-11-02, tag `phase/016`) added the POS module: PHASE-016 (2026-11-02, tag `phase/016`) added the POS module: terminal registry + counter sale posting through the sales chain + the narrow §11 offline sync slice (idempotent push with result replay, revoked-device rejection), 3 POS end-of-day reports, POS web screens, isolation coverage 672 probes, drift 232=232. Evidence: `docs/implementation/phases/reports/PHASE-016-COMPLETION.md`.  PHASE-015 (2026-11-02, tag `phase/015`) added the industry configuration framework: migration `0022` (RLS'd `tenant_industry_config`, global `feature_flags`, 3 seeded priority template manifests, 4 configuration permission keys — drift 228=228), the ten-layer fail-closed resolution engine with stable `resolved_hash`, idempotent/audited additive-only template apply/switch (BR-038), the 3 industry report contracts (registry 48→51), web `/configuration/templates` + onboarding industry step, isolation-suite coverage for the new tables. Evidence: `docs/implementation/phases/reports/PHASE-015-COMPLETION.md`. PHASE-014 (2026-11-02, tag `phase/014`) added the commercial machinery:
  subscription/billing/usage/notifications substrate (migration `0021`), sandbox checkout +
  signature-verified replay-safe webhook + manual-invoicing fallback (A-009), lifecycle
  TRIAL→GRACE(read-only)→SUSPENDED, usage counters that never block posting (INV-022),
  notifications center, and the web surfaces `/pricing`, `/billing`, `/notifications`,
  report-contract-bound dashboard widgets, Journey A checklist, and the platform
  manual-payment console. Evidence: `docs/implementation/phases/reports/PHASE-014-COMPLETION.md`. The
  pnpm + Turborepo monorepo with all local gates green (re-verified 2026-11-01):
  - `apps/api` — NestJS with `GET /health/live` + `GET /health/ready` (DB +
    migration state + queue liveness); modules: `audit` (append-only, transactional
    appends inside the caller's UoW + audit.view-gated query endpoint),
    `files` (S3 adapter + signed URLs + upload constraints, tenant-prefixed keys),
    `identity` (argon2id login, rotating opaque sessions 12 h/30 min, progressive
    lockout + per-IP windows, TOTP MFA with replay rejection + hashed recovery
    codes, stateless HMAC reset tokens, single-use invitations, RBAC admission via
    `@RequirePermissions` + route registry, roles editor primitives, tenant-context
    middleware + interceptor inside the RLS UoW), `notifications` (AR/EN email
    templates, minimal SMTP client, pg-boss queue with dedupe); infra: drizzle pool
    (non-owner `erp_app`), tenant-context unit-of-work (`withTenant`, transaction-local
    GUC, ALS), pg-boss queue client (`boss` schema, WORKER_MODE), ERROR_MODEL
    exception filter + success envelopes + Idempotency-Key presence guard, pino
    logging with correlation ids + redaction, OTel api no-op wiring, and — from
    PHASE-007 — the **accounting module** (the platform's financial heart): CoA
    readiness service (tree rules V1–V6, `account_purposes` 1-active-per-purpose
    resolution, fail-closed `PURPOSE_NOT_MAPPED`), fiscal calendar (12 monthly
    periods + OPENING/CLOSING windows, OPEN→SOFT_CLOSED→LOCKED with audited
    transitions, reopen + >2-month anti-fraud alert), dated exchange rates, the
    **posting engine** (ADR-0007 pure domain package — the ONLY writer of
    `journal_entries`/`journal_lines`, validation pipeline 1–8 in order,
    verbatim error taxonomy, idempotency on `(tenant, source_type, source_id,
    operation)` INV-013/CC-01, reversal-only correction INV-014, append-only
    guards + balance + period-lock triggers INV-003/011), manual journals
    (draft→submit→approve→post, SoD creator≠approver default), recurring journals
    (pg-boss DRAFT generation, never auto-posts), approval policies (BR-034
    base-currency thresholds), GL queries (trial balance, movements + running
    balance, journal register, INV-006 drill-down), cost centers, the numbering
    service (JE-{yyyy}-{seq:6}, ADR-0006), opening-balance posting (G-16 via the
    partners subledger port — per-partner AR/AP rows from entry #1), year-end
    close (PC-05…07, idempotent + unit-reversible), and the reconciliation
    framework (RC-01…03 AR/AP) + close checklist (NOT_APPLICABLE explicit). The
    partners module exposes the sanctioned same-transaction subledger api.
    Migrations `0010_accounting_core.sql` + `0011_journal_tables.sql` ship the
    tables (all RLS'd, composite-FK'd, registry-isolated). From PHASE-008 — the
    **treasury module** (the daily cash heartbeat): cash/bank/petty account
    service (open requires a mapped GL account, 1:1 by unique constraint; close
    preserves history; balance is always derived Σ `cash_movements` — INV-019),
    receipts/payments services (DRAFT→POSTED through `PostingEngine.post`,
    official RCV-/PAY- numbers at posting INV-021, methods incl. reserved CHEQUE,
    FX rate capture), the allocation service (FIFO suggestion, partials,
    INV-016 bounds enforced under the open-item row lock CC-02, on-account
    remainders as explicit open items BR-027), realized-FX settlement
    (SettlementCore: cash at current rate · control at the ORIGINAL stored rate
    INV-008 · explicit FX_GAIN/FX_LOSS residual line with references — goldens
    both directions), petty-cash guard (BR-020 per-tx + fund caps with
    PLACEHOLDER defaults documented in the settings schema + accountant
    override with audit), transfer service (G-12 with BANK_CHARGES fee posting,
    two movements, INV-019 both sides), expense service (BR-023 categories with
    per-category approval, receipt attachment via the files module, reserved
    `tax_code_id` for PHASE-009), shift service (BR-021 float/capture/close,
    tolerance auto-post with the shift as source, supervisor id+PIN above
    tolerance), statement import (pluggable adapter registry: generic-csv with
    Arabic-header mapping + generic-xlsx; sha-256 file-hash idempotency; row
    caps), bank-rec workspace service (auto-match amount+window+reference,
    exact manual match, unmatched aging both sides, per-account period lock
    BR-022 — statement lines never become ledger entries), and the treasury
    INV-019/RC-08 reconciliation check registered into the PHASE-007 framework
    (seeded drift → BROKEN + notification + PC-04 period-lock block; the close
    checklist's cash + bank-rec items are live with explicit NOT_RUN/
    NOT_APPLICABLE states). Migration `0012_treasury.sql` ships 11 tables (all
    RLS'd, composite-FK'd, registry-isolated; `cash_movements` append-only by
    grants + guard trigger — no UPDATE/DELETE for `erp_app` at all). From
    PHASE-009 — the **tax module** (six-treatment engine, all 10 jurisdiction
    packs with REQUIRES_VERIFICATION provenance, deterministic resolver with
    frozen rate snapshots BR-033, registrations with the settings
    expand-migration, the G-11 expense VAT leg, the INV-012 append-only
    summaries, VAT return v1 with the side-by-side cross-check + ready-gating,
    the RC-06/RC-07 check in the reconciliation framework with PC-04 lock
    block, and the EInvoicingAdapter port + fake adapter with the RISK-005
    refusal). Migration `0013_tax.sql` ships 3 global reference tables (no
    RLS by design, read-only to erp_app) + 6 tenant tables
    (`tax_document_summaries` append-only). From PHASE-010 — the
    **inventory module** (where money physically sits): warehouse service
    (branch-linked, per-warehouse GL inventory-account override — the G-15
    distinct-accounts seam; activation/deactivation), item-warehouse settings
    (reorder_level/min_qty + the once-per-24h-window reorder stamp BR-019),
    the movement core — one transaction per move: stock rows +
    `PostingEngine.post` + audit (INV-018; crash-injection proven), WAC + FIFO
    valuation engines at 6-decimal internal precision (oracle property
    suites: average within [min,max], Σ layer qty = on-hand exactly), the
    opening-stock flow consuming PHASE-006 stock drafts through the OPENING
    period (G-16 stock leg with per-item layers, INV-010 green from entry
    #1), transfers DRAFT → IN_TRANSIT → POSTED (two legs at conserved value;
    journal only when the warehouses resolve distinct GL accounts — G-15 +
    the policy-none case asserted; IN_TRANSIT stock visible but never
    sellable BR-016), stock counts DRAFT → COUNTED → VARIANCE_REVIEW →
    POSTED (frozen system-qty snapshot at creation, blind mode, audited
    recount, BR-015 value-impact tolerance with supervisor override, approval
    posts G-13 loss / G-14 gain), batches/expiry with FEFO issuing (BR-017)
    and expiry write-off as shrinkage, serial/IMEI registry with the original-
    unit return binding (BR-018), soft reservations + the availability
    service (on-hand − reserved − in-transit — the PHASE-011/012 seam), the
    nightly reorder job emitting `stock.below_reorder` email digests (alert,
    never autopilot), the INV-010/RC-04/RC-05 reconciliation check registered
    into the PHASE-007 framework (movement trail vs GL per resolved account
    with zero tolerance; drift → BROKEN + notification + PC-04 lock block +
    live close-checklist item), method-lock + dated-revaluation method switch
    (INV-017 — no in-flight movements, revaluation journal, history
    immutable), and manual reason-coded receipts/issues/adjustments. Migrations
    `0014_inventory_core.sql` + `0015_inventory_tracking.sql` ship 13 tables
    (all RLS'd, composite-FK'd, registry-isolated; `stock_moves` append-only
    by grants + `trg_stock_moves_guard` — even superuser DELETE refuses;
    the 0014 template correction realigns the viewer role with matrix §3.5).
    From PHASE-011 — the **purchasing module** (the procure-to-pay chain):
    purchase requests with approval routing + SoD, purchase orders DRAFT →
    PENDING_APPROVAL (BR-010 thresholds against the approval-policies
    substrate) → APPROVED → ISSUED → CLOSED with linked revisions and BR-029
    numbering, goods receipts receiving stock through the inventory
    `planReceipt`/`applyReceipt` seam (batch capture at receipt; purchasing
    never writes stock tables) and posting the GRNI accrual G-07 with the
    BR-012 PO-less policy, the three-way match BR-009 (tolerance matrix,
    per-line outcomes + dispositions in `match_result` recorded BEFORE
    approval, the service-level no-match-no-post guard,
    `purchasing.matching.override` risky), supplier invoices (BR-011 duplicate
    block/warn, BR-033 line snapshots, G-08 posting with exact per-line
    GRNI-clearing quanta + partial proportional clearing, VAT recoverability
    per pack + registration — RECOVERABLE/EXPENSED/NOT_SUBJECT), debit notes
    as G-09 mirror corrections, payments riding the PHASE-008 treasury service
    (`purchasing.payments.*` keys; G-10 + the W-2 FX mirror INV-008) with
    audited INSERT-only re-allocation documents (BR-027 on-account both
    directions, INV-016 bounds), the AP subledger tying to `AP_CONTROL`
    exactly (RC-02 randomized + RC-03 drift → BROKEN + PC-04 lock block),
    aging buckets + supplier statements as deterministic as-of recomputations
    (RC-10 byte-identical; document currency + base totals BR-028), opening-AP
    settlement (G-16 AP side; INV-009 from entry #1), the GRNI register RC-09
    registered into the PHASE-007 framework (live close-checklist item),
    landed-cost baseline allocation (VALUE/QTY, remaining-qty constraint,
    explicit COGS-adjustment posting via the new inventory revaluation seam),
    and supplier price-list consumption with BR-003 purchase-side provenance.
    Migrations `0016_purchasing_core.sql` + `0017_purchasing_ap.sql` ship 14
    tables (all RLS'd, composite-FK'd, registry-isolated; the re-allocation
    pair is INSERT-only by grants — the audit trail cannot be rewritten).
    From PHASE-012 — the **sales module** (the quote-to-cash chain — the
    revenue surface): quotations with BR-006 validity (enforced at send +
    accept + the expiry sweep; QOT- at SENT), sales orders DRAFT →
    PENDING_APPROVAL → APPROVED → ISSUED → CLOSED with optional line-level
    soft reservations against the PHASE-010 availability service (SOR- at
    ISSUE), delivery notes issuing stock through the inventory
    `planIssue`/`applyIssue` seam and posting the COGS journal G-03 WITHOUT
    AR (DEL-; converting to revenue-only invoices with the DN issue-cost
    snapshot copied onto the invoice lines — the W-3 provenance; BR-007
    both flows first-class), sales invoices cash + credit (G-01/G-02/G-03
    W-1 exact with per-line output-VAT legs, official SAL- numbering at
    posting INV-021, BR-005 cash-autopost with the POLICY_ACTOR sentinel,
    BR-001 credit limits as a CREDIT-kind control enforced server-side at
    approval with the no-TOCTOU re-verification at post — block/warn/allow
    × limit/overdue with the 8,200 + 2,500 > 10,000 math, override via
    `sales.credit_check.override` audited; BR-003 price resolution with the
    PRICE_CHANGED staleness gate; BR-033 snapshots refusing a rate mismatch
    at post), credit notes as G-04/W-3 mirror corrections (returns
    re-entering stock at the ORIGINAL issue cost — batch preserved, serial
    binds the sold unit BR-018; BR-004 window 14d/0 with the reference
    never disabling; §3.4 explicit allocation — the invoice stays
    gross-open, the note its own subledger row), receipts riding the
    PHASE-008 treasury service (G-05 settle + G-06 the W-2 FX residual ±10
    at the INV-008 stored rate; settlement + on-account control legs split
    explicitly BR-027) with INV-016 allocation bounds + CC-02 concurrency
    and audited INSERT-only re-allocation documents (SRA-; from→to,
    to-NULL on-account, `receipts.allocated_amount` re-synced), the AR
    aging buckets + customer statements as deterministic as-of
    recomputations (RC-10 byte-identical; BR-028 currency + base; the
    INV-009 footer tie) + `verifyInv009`, RC-01/RC-03 on the PHASE-007
    framework's AR kind (20 randomized ops OK; drift → BROKEN + PC-04
    lock block), opening-AR settlement (G-16 AR side; INV-009 from entry
    #1), the `invoice.overdue` job exactly-once (audit-stamp dedupe), and
    sales-rep attribution (commissions explicitly PHASE-017 — grep-clean).
    Migrations `0018_sales_core.sql` + `0019_sales_ar.sql` ship 14 tables
    (all RLS'd, composite-FK'd, registry-isolated; the re-allocation pair
    INSERT-only by grants; `stock_moves.source_type` widened with
    delivery_note/sales_invoice/credit_note + `cash_movements.source_type`
    gains sales_invoice for the G-02 counter payment; the §6 AR index
    `(tenant_id, customer_id, due_date)`). From PHASE-013 — the **reporting
    module** (the read-side truth surface, ADR-0011): the code-defined
    contract registry — 48 contracts, the REPORT_CATALOG §1–§7 phase-013
    set — boot-validated by zod (a malformed contract, an unknown
    permission, or a financial contract missing its §11 assertion set
    fails startup — meta-tested); the executor with the inline path
    (p50 budget) and the pg-boss job path (`reporting-report-run` queue)
    where permissions are re-resolved at execution — a revoked grant
    kills a queued run FORBIDDEN_AT_RUN with zero partial artifacts (no
    TOCTOU) — and runs are idempotent per `(tenant_id, report_key,
    params_hash)` (re-runs replace their own artifacts; the stored result
    envelope is the export source of truth — you print what you saw); the
    as-of-keyed cache (60s current-TTL cap) invalidated by ledger events
    (journal.posted/period.locked on the new accounting ledger-events bus
    wired into PostingService.post + PeriodService.lock); the assertion
    engine executing the FINANCIAL_REPORT_RULES §11 minimum set at
    exact-decimal tolerance 0 (FAIL is stored on the run AND blocks
    export/print server-side with ASSERTION_FAILED — the viewer renders
    the banner, the server refuses the artifact); the financial
    statements exact per the rules (TB one-side balances + zero
    suppression, GL running balance + the INV-006 entry drill +
    gl-entry-balance, IS contra aggregation via SALES_RETURNS/
    SALES_DISCOUNTS + the COGS section + the YTD column + is-tb-tie, BS
    with the RE composition counted once (bs-current-year-once) +
    prior-year comparative re-derived, CF indirect with cf-cash-tie
    INV-019 — untagged lines display as "أخرى/Other", the documented
    limitation), the fiscal close pack as an archive-class job,
    journal-register, and cost-centers — all consolidated by construction:
    journal lines carry no branch dimension in migrations 0001–0020, so
    financial contracts declare branches "fixed-all" (FINANCIAL_REPORT_
    RULES §1 branch subsets land with a branch-dimensioned journal
    substrate); the operational contracts over module query services —
    7 NEW application services (sales-analytics, ap-analytics,
    inventory-queries, treasury-queries, partner-queries, tax-queries,
    user-queries) powering AR/AP aging + statements + allocations (the
    INV-009 ties), salesAnalytics.* (item/customer/rep revenue,
    payment-method split, pipeline conversion, branch revenue +
    sales-gl-tie), apAnalytics.* (supplier/item spend, PO status,
    matching exceptions + purchasing-gl-tie), inventory queries (on
    hand/movement/expiry/count variance/transfer log/serials/slow-moving
    + the INV-010 tie), treasury queries (daily flow, receipts/payments
    registers, petty cash, expenses, shifts, bank recon + per-account
    INV-019 ties), the both-sides VAT return + summary-by-treatment
    (INV-012 tie via TaxQueriesService), and the platform reports
    (audit-trail with the new actorId/action filters on AuditQuery,
    user-activity, report-runs, subscription-usage); and the print/export
    system — `packages/ui/print` (entry `@erp/ui/print`, sanctioned in
    the erp-ui import-path rule): 4 versioned templates (a4-document
    with tafqit amount-in-words verified per locale and per currency
    minor-unit incl. 3-dp KWD/BHD/OMR/JOD/IQD + bilingual legal footers,
    a4-report with assertion footers + freshness stamps, receipt-80,
    receipt-58 with RTL rules — Western digits LTR-isolated, physical QR
    blocks, condensed 58mm) over embedded woff2 fonts (no system fonts,
    no network in render), the Chromium render service (playwright, pool
    bound 2 via Semaphore, 60s/300s timeouts, PDF/A-2b XMP
    identification stamping via pdf-lib — Chromium cannot emit
    conformance-level PDF/A; the stamp + artifact metadata record the
    archive class honestly), XLSX via exceljs (RTL sheet views,
    values-only, typed columns), CSV UTF-8 BOM RFC4180, and artifacts
    through the files module with sha256 + 15-minute signed URLs +
    audited export issuance. Migration `0020_reporting_core.sql` ships
    `report_runs` + `print_templates` (RLS'd, registry-isolated with
    generated A-test coverage).
  - `apps/web` — Next.js BFF (PHASE-003 substrate, contracts frozen) with all
    18 screens migrated onto @erp/ui (PHASE-005) + the PHASE-006 master-data
    screens + the PHASE-007 accounting group (8 screens: CoA editor + purpose
    mapping, journal list/detail/workspace on the JournalEntryGrid archetype-4
    pattern with live MoneySummaryBar Δ, GL browser with INV-006 drill-down,
    period management + close checklist + reconciliation + year-end, approvals
    queue on the ApprovalsQueue pattern, exchange-rate editor, opening-balances
    post step) + the PHASE-008 treasury group (12 routes: accounts list +
    detail with movements drill-down, receipts/payments list + create + detail
    with the allocation editor (INV-016 panel, FIFO suggest, live allocated /
    remainder bar in exact string math), expenses with category management,
    transfers with inline create + lifecycle, shifts with the ShiftPanel
    capture/close console, bank-rec import wizard → match grid → unmatched
    aging → reconcile lock) + the PHASE-009 tax group (4 routes: settings
    tax-codes manager with the resolve-lines preview, registrations manager,
    pack viewer with versions/preview/apply, and the reports VAT-return
    workspace with the INV-012 cross-check side-by-side + export +
    mark-filed) + the PHASE-010 inventory group (5 routes: the warehouses
    manager on the Settings archetype with create + deactivate/reactivate,
    stock on hand with the warehouse filter + BR-016 availability drill
    (on-hand − reserved − in-transit), the movement ledger with
    direction/kind/warehouse filters + batch/serial columns, the transfer
    wizard (multi-line create → dispatch → in-transit badge → receive —
    the G-15 two-leg flow), and the count workspace — Journey D end-to-end:
    session create with item picking + blind mode, the frozen-snapshot
    sheet, line entry, variance review with per-line diff + value impact,
    audited recount, and plain/supervisor approval posting G-13/G-14) + the
    PHASE-011 purchasing group (5 routes: the orders workspace with the
    PR→PO flow + threshold/revision awareness, receipts with GRN create/post
    + the PO-less reason flow + landed-cost create/post with allocation
    preview, supplier invoices with the match-result panel — per-line
    PO/GRN/invoice triple with variance highlighting + dispositions + the
    duplicate-warning banner, debit notes referencing posted invoices, and
    the AP views — aging buckets, supplier statement with the INV-009
    footer badge + document currency + base totals, and the GRNI register —
    all as-of deterministic) + the PHASE-012 sales group (5 routes: the
    quotes+orders workspace — BR-006 validity + conversion chain +
    soft-reservation awareness, deliveries with the two-flow posting +
    convert-to-invoice, invoices with the live credit-check decision panel
    (BR-001 math + escalation postures) + tax preview, credit notes with
    the return-window + re-entry-at-original-cost presentation, and the AR
    views — aging buckets, customer statement with the INV-009 footer tie,
    open items + re-allocation workspace; the receipts money leg rides the
    treasury group's existing surface; print honestly marked "arriving
    with the PHASE-013 reporting release" — the promise the PHASE-013
    print system now honors) + the PHASE-013 reports workspace (the
    `/reports` route on the report archetype: the catalog grouped by
    category filtered to the session's permissions, the declarative
    parameter bar (date window / as-of / report locale), saved views as
    client-side parameter sets — no new tables per the phase constraint,
    run + polling with the live stage line, the ReportViewer with group
    tree / check totals / assertion footer / freshness / drill links,
    the export menu, the print-preview iframe, and run history) + the
    nav item `reports.workspace`: session cookie +
    CSRF double-submit, generic proxy; login/register/forgot/accept on the
    public card shell; admin/console lists on DataTable archetypes with the
    navigation-driven app shell; CSP middleware (per-request nonce, §8 header
    set, probe-tested against the built app); typed dictionaries at 1505 keys
    with triple parity enforcement (TS + runtime + CI script).
  - `apps/desktop`, `apps/mobile` — declared README stubs only (PHASE-021/022).
  - `packages/ui` — **@erp/ui v1.0.0 (PHASE-005, ADR-0016)**: token layer
    byte-verbatim to DESIGN_TOKENS (contrast gate §16 in CI), Radix primitive
    wrappers (the only legal Radix site), catalog components (DataTable
    virtualized to 10k rows, MoneyInput §6.2, Hijri-capable date pickers §6.3,
    DocumentStatusBadge §6.4 + DocumentActions), the app shell with
    server-resolved entitlement-driven navigation (GET /tenancy/navigation;
    binding 10-group registry in @erp/contracts), AR+EN Storybook→Playwright
    visual harness (threshold 0, axe-in-harness 0 violations, geometry
    invariants, both-directions coverage check, quarantine mechanism) + the
    PHASE-008 `ShiftPanel` pattern (headless cashier console — capture/close
    callbacks, EXPECTED = opening+in−out via the shared `exact-decimal`
    helpers, supervisor id+PIN fields for BR-021 variance, CLOSED read-only
    summary, 4 bilingual stories with AR+EN baselines), the
    four erp-ui lint rules with negative proofs, and the four changeset-semver
    surface. From PHASE-013 the package also exposes the print surface
    `packages/ui/print` (entry `@erp/ui/print`, the second sanctioned
    entry — the erp-ui import-path rule allows the exact entry and bans
    deeper paths): the 4 versioned print templates (a4-document / a4-report
    / receipt-80 / receipt-58), the print CSS, and the embedded woff2
    fonts. Evidence: reports/PHASE-005-COMPLETION.md.
  - `packages/domain-core` — UUIDv7, `Money`/`Quantity`/`Rate` (ADR-0009 decimal
    semantics, half-up rounding, 3-decimal currencies), `Result`, domain errors,
    `CalendarDate`; 38 unit/property tests green.
  - `packages/contracts` — zod registry v0 (empty), error-code enum seed, wire-format
    schemas per API_CONVENTIONS §7; 11 tests green.
  - `packages/config` — shared strict tsconfig bases, ESLint config with
    module-boundary enforcement (proven by the negative meta-test), Prettier.
  - Tooling: pnpm workspaces + Turborepo, ESLint boundaries + custom money/RTL rules,
    `dependency-cruiser` graph rules (web→api violation caught in verification),
    Docker Compose dev stack (postgres:16/minio/mailpit/api/web), GitHub Actions CI
    (typecheck/lint/unit/build/docs-validation/gitleaks/e2e-stub/negative-boundary-test
    + the new ci-db.yml Testcontainers job), CODEOWNERS stub, `.env.example`.
  - Migrations `0001_core_infra.sql` … `0005_system_role_templates_seed.sql`
    (drizzle-kit journal `NNNN_description.sql` convention): PHASE-002 substrate
    plus the PHASE-003 identity cluster — 9 tables, variant command-specific RLS
    for roles/role_permissions, `template_seed` path, NOLOGIN BYPASSRLS role
    `erp_definer` owning the pre-GUC definer projections, 199-key permission seed
    (drift-checked against AUTHORIZATION_MATRIX in the gate) + 9 role templates
    with 413 grants. `tenants` grew its full profile in PHASE-004 (below).
  - PHASE-004 provisioning cluster — migrations `0006_tenancy_provisioning.sql`
    (currencies/countries seeded reference tables, tenants profile expansion +
    status swap incl. OFFBOARDED, audit_events platform widening: nullable
    tenant_id + via_platform_admin + platform-read policy, branches,
    tenant_settings, plans (platform RLS + seed path), subscriptions, entitlements,
    support_sessions, `erp.tenant_active_entitlements` definer projection,
    `erp.seed_platform_tenant()` ops-tenant bootstrap), `0007_accounts_schema.sql`
    (accounts + account_purposes, composite FKs, created early for CoA
    instantiation), `0008_platform_seeds.sql` (PLACEHOLDER plans starter/business/
    enterprise incl. closure-completion keys, 13 industry templates, the 42-row
    bilingual CoA template with 16 purpose markers).
  - PHASE-004 modules: `configuration` (feature-catalog mirror + BR-040 closure
    validator, settings-schema registry with zod schemas, in-process §9 event bus
    + config cache) and `tenancy` (registration, onboarding provisionWorkspace,
    branches + branch-scope enforcement, entitlements service + RequireFeature
    guard, typed settings service, lifecycle suspend/restore with session kill,
    support access §7, platform console with per-use platform audit). The
    platform plane = `@PlatformScope()` routes over the seeded operations tenant
    (platform_admin role from the template; first staff user bootstrapped by ops).
  - Prior migrations `0001_core_infra.sql` + `0002_rls_macro.sql` (drizzle-kit journal
    `NNNN_description.sql` convention): roles `erp_migrate`/`erp_app`/`erp_readonly`
    (no passwords in SQL — dev credentials via `scripts/db-dev-credentials.ts`),
    `erp.current_tenant_id()` GUC helper, minimal `tenants`, append-only
    `audit_events` (grants + `erp.audit_events_guard()`), RLS ENABLE+FORCE with
    `tenant_isolation` policies, `erp.apply_tenant_policy()` macro,
    `erp._schema_state` mirror, `boss` schema (owned by `erp_app`).
  - Completion flip (2026-10-28): the CI-green and `docker compose up` healthcheck
    evidence items are waived to first infrastructure availability by project-owner
    directive — the CI-equivalent local gate (`pnpm gate:local`) is green and is the
    recorded substitute; follow-ups tracked in the phase report §Deferred evidence.
- **Git:** initialized on `main` during PHASE-001 (the pre-implementation state was a
  plain directory — see the phase report's doc-reality reconciliation); baseline
  committed and tagged `blueprint/v1.1`; PHASE-001 implementation committed and tagged
  `phase/001`; blueprint v2.0 expansion committed on top; `phase/006` tagged 2026-10-29;
  `phase/007` tagged 2026-10-30; `phase/008` tagged 2026-10-30; `phase/009` tagged
  2026-10-30; `phase/010` tagged 2026-10-30; `phase/011` tagged 2026-10-30;
  `phase/012` tagged 2026-10-31; `phase/013` tagged 2026-11-01.

## Status of the world (honest statement per directive §24)

- **Designed:** everything in `docs/` — this is the blueprint, not a claim of working
  software.
- **Implemented:** PHASE-001 engineering foundation + PHASE-002 database &
  migration infrastructure + PHASE-003 identity/tenancy/audit core + PHASE-004
  provisioning + PHASE-005 design system + PHASE-006 master data + PHASE-007
  accounting core & posting engine + PHASE-008 treasury + PHASE-009 tax
  engine & jurisdiction packs + PHASE-010 inventory & warehousing +
  PHASE-011 purchasing & payables + PHASE-012 sales & receivables +
  PHASE-013 reporting, statements & printing
  (migrations 0001–0020; the centralized posting engine with the full
  invariant suite is live and proven by its consumers — treasury posts every
  money movement through it, tax stamps every tax-carrying line with frozen
  rate snapshots BR-033, inventory posts every stock movement through it
  atomically with its journal effect INV-018, purchasing posts the full P2P
  chain through it — GRNI accrual G-07, supplier-invoice clear + AP open
  G-08, debit notes G-09, payments G-10 with the FX mirror — and sales
  posts the full O2C chain through it — credit AR G-01, cash G-02, COGS
  G-03 both flows, credit-note mirror + original-cost re-entry G-04,
  receipt settle G-05 with the W-2 FX mirror; the AP and AR subledgers tie
  to their controls exactly (RC-01/02/03, INV-009 from entry #1 incl.
  opening balances on both sides) and the GRNI register reconciles at
  every step (RC-09) — drift blocks the period lock PC-04; the three-way
  match BR-009 records outcomes before approval and no posting path
  bypasses it; credit limits BR-001 enforce server-side at approval in all
  three postures with audited overrides; landed costs revalue stock
  through the sanctioned inventory seam with the remaining-qty
  constraint; and the reporting engine consumes it all read-only — every
  statement runs its FINANCIAL_REPORT_RULES §11 assertions at
  exact-decimal tolerance 0 with a FAIL blocking exports server-side,
  as-of re-runs are byte-identical (idempotent per (tenant_id, report_key,
  params_hash)), and print/export artifacts are sha256-stamped, signed
  (15-minute URLs), and audited). Subscriptions, billing, onboarding &
  dashboards remain PHASE-014 — the MVP gate.
  Infra-bound evidence (hosted CI, compose boot, Testcontainers run, mailpit
  capture, Playwright journey) waived per owner directive 2026-10-28 with
  local-gate equivalence recorded.
- **Tested:** locally — 1214+ checks across suites (api unit 92 + domain-core 38
  + contracts 11 + @erp/ui 42 + db suite 1044+ on embedded PostgreSQL 16
  (invariants INV-001…009/010/011/012/013/014/015/016/017/018/019/020/021/022
  with positive+violation each, goldens G-01..G-06+mirrors/G-07/G-08+VAT-legs/
  G-09/G-10+FX-mirror/G-11+VAT-leg/G-12/G-13/G-14/G-15+policy-none/G-16+
  G-19/G-20 + engine goldens,
  concurrency CC-01/02/03/04/05/06, periods PC-01…07, reconciliation
  RC-01…03 + RC-04/RC-05 + RC-06/RC-08 + RC-09 + RC-10 + drift, posting-smoke
  p95 local (n=100 p95=58.4ms), treasury spoof S-04/A7 + tax spoof A7/A8 +
  inventory spoof A7 + purchasing spoof A7,
  BR-009/010/011/012 + BR-013…023 + BR-025…028 + BR-001 matrix + BR-004/
  BR-006/BR-018 sales packs, per-pack fixture suites ×10
  with rounding worked examples + byte-identical determinism + rate-boundary
  + unregistered/NO_VAT modes,
  FEFO + serial return-binding, T-01 100k-move perf smoke with
  EXPLAIN-verified index use + the PHASE-013 reporting specs (registry
  meta-tests, golden dataset envelopes, as-of byte-identical re-runs, run
  lifecycle with the FORBIDDEN_AT_RUN TOCTOU + idempotent artifact
  replacement, export block on seeded corruption, real-Chromium render +
  the PDF/A stamp, tafqit/CSV/XLSX units, isolation A-tests over
  `report_runs`/`print_templates`; the full suite output is in the
  completion report)) + visual
  harness 16 (AR+EN threshold-0 baselines ×95 incl. ShiftPanel ×4 ×2 directions,
  axe 0, geometry, coverage) +
  perf gate (10k-row overhead ≤ 6ms) + CSP probe 4 + negative proofs 3
  + contrast 15 + web typecheck/lint/build): the generated
  tenant-isolation suite A1–A10 over every registered tenant-owned table with the
  registry negative proof, identity flows (R-01/02/03/05, M-01/02/04/06/07/08/10,
  S-01/02/03, invitations, permission checklist), HTTP end-to-end through the
  real Nest pipeline, email over a real SMTP session, append-only guards,
  pg-boss dedupe, signed URLs, readiness + boundary meta-test via the
  CI-equivalent `pnpm gate:local`; hosted-CI runs remain waived follow-ups
  (U1) pending infrastructure.
- **Verified against official sources:** no compliance item is VERIFIED; all country
  tax data is BASELINE_RESEARCH with REQUIRES_VERIFICATION flags
  ([../localization/compliance-matrix/README.md](../localization/compliance-matrix/README.md)).
- **Production-ready / compliant / secure:** no such claims are made anywhere, and
  none may be made until phases complete with evidence.

- **PHASE-021 (2026-11-02):** desktop app foundation landed in sandbox-provable scope — Tauri v2 shell scaffold (`apps/desktop`), static web export target with guard, and `@erp/sync-core` desktop modules (SQLite local store on real better-sqlite3 with WAL + migrations + corruption path, sync host, keychain credential lifecycle with memory-only access tokens, D-06 updater gate, WebView2 probe, ESC/POS reprint builder) — 28/28 unit tests green; CI release workflow added. Native Windows signing / SQLCipher key wiring / chaos matrix / Playwright smoke are recorded as CI-class deferrals in the completion report.

- **PHASE-022 (2026-11-02):** Android app foundation landed in sandbox-provable scope — Expo scaffold (`apps/mobile`), token/i18n port with parity + RTL lint ban, SecureStore + capability-scoped registration (read-only personal-account class), Android sync scheduler with Doze-safe background + cellular budgets, FCM skeleton, mobile CI pipeline; mobile profile proven on real PG (M-01..M-04). On-device chaos slices and signed AAB remain CI-class deferrals (completion report).

- **PHASE-023 (2026-11-02):** external-adapter layer landed in ungated scope — submission registry state machine + job semantics (idempotent, DLQ, circuit breaker, audited), fake-authority harness, chaos idempotency on real PG, bank parser with parked lines, commerce/shipping port fakes, rollout flags default OFF. ZATCA adapter is an UNVERIFIED refuse-to-submit stub (DR-001 OPEN, verification gate unpassed — no fabrication); payment production cutover INCOMPLETE pending DR-002. Details: PHASE-023-COMPLETION.md.

- **PHASE-024 (2026-11-02):** security hardening landed in sandbox-provable scope — MFA role/plan enforcement, rate-limit/lockout oracle, dual-accept rotation window, forensic audit review on real PG, purge legal-hold gate, findings log with SLA-tracked open items (external pen test, staging drills), threat-model update, disclosure policy. Honest deferrals live in `docs/operations/security-findings.md`.

- **PHASE-025 (2026-11-02):** GA-readiness sandbox scope landed (load-model seed, SLO policy, observability audit, gate checklist, post-GA pointers). GA gate NOT passed — 10× load, DR drill, cold restore, pen-test closure, release execution are INCOMPLETE with owners in `docs/planning/GA_GATE_CHECKLIST.md`.

- **PHASE-026 (2026-11-02):** fixed-assets foundation landed — migration 0028 with 6 RLS tables (isolation suite 864/864 on real PG), depreciation math with INV-023 property tests, G-21/22/23 goldens, BR-041…044 guards. Pending: UI screens, report contracts, RC-10, purchasing GRN hook (`docs/implementation/phases/reports/PHASE-026-COMPLETION.md`).

- **PHASE-027 (2026-11-02):** cheques/notes + installments delivered — custody machine with INV-024, G-24…G-28 goldens and flows, BR-045…049, RC-11, 5 report contracts (registry 74), isolation 888/888 on real PG (`reports/PHASE-027-COMPLETION.md`).

- **PHASE-028 (2026-11-02):** budgeting & variance delivered — BR-050 single-ACTIVE at DB level, lifecycle with SoD, advisory-only controls (ledger never blocked), read-only variance engine, 2 report contracts, isolation 900/900 on real PG (`reports/PHASE-028-COMPLETION.md`).

- **PHASE-029 (2026-11-02):** payroll delivered in financial scope — G-29/30/31 goldens (worked example exact), BR-052…055, INV-025 row-level, 942/944 DB green, isolation 942/942 on real PG (`reports/PHASE-029-COMPLETION.md`).

- **PHASE-030 (2026-11-03):** wholesale & electronics v2.0 templates seeded configuration-only via migration 0032 over the unmodified PHASE-015 engine — manifest spec 4/4, DB suite 4/4 on real PG incl. BR-038 additive switch and zero-journal negative ledger proof, UI presets config-only, unit 358/358, tsc clean, docs 29/29 (`reports/PHASE-030-COMPLETION.md`).

- **PHASE-031 (2026-11-03):** healthcare commercial shell delivered — one additive nullable `sales_invoices.claim_ref` (migration 0033) + `industry.healthcare` template (migration 0034), policy-gated `CLAIM_REF_REQUIRED` capture, `groupByClaim` param on existing report contracts, zero-clinical-surface gate, DB 5/5 on real PG incl. zero-journal proof, unit 363/363, tsc clean, docs 29/29 (`reports/PHASE-031-COMPLETION.md`).

## Known open items

- Open questions OQ-001…OQ-010 in
  [../ASSUMPTIONS_AND_OPEN_QUESTIONS.md](../ASSUMPTIONS_AND_OPEN_QUESTIONS.md) —
  notable: pricing matrix (OQ-002), payment provider (OQ-003), ZATCA scope (OQ-004).
- Decision records OPEN under [../decisions/](../decisions/README.md).
- Risks under watch: [../planning/RISK_REGISTER.md](../planning/RISK_REGISTER.md)
  top-5 watchlist.
