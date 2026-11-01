# Phase Acceptance Criteria

> **Status:** STABLE · **Owner:** Platform Architecture · **Updated:** 2026-10-28

Consolidated, objective acceptance criteria and exit gates per phase. The authoritative,
expanded version lives in each phase document's sections 6–8 ("Verification",
"Completion and Handoff"); this file is the reviewable index. **No phase may be marked
COMPLETE unless every item here passes with evidence.**

Universal criteria apply to all phases (from
[../testing/TEST_STRATEGY.md](../testing/TEST_STRATEGY.md) and
[../handoff/IMPLEMENTATION_PROTOCOL.md](../handoff/IMPLEMENTATION_PROTOCOL.md)):

- U1. Typecheck, lint (incl. module-boundary rules), and full test suite green in CI.
- U2. New migrations apply cleanly on a fresh database AND on the staging-shape database
  (migration test); rollback path documented.
- U3. Every new tenant-owned table has tenant scoping + RLS + isolation attack tests.
- U4. Every new route has permission checks + permission tests; rate limits on public ones.
- U5. All money math via shared decimal utilities; no float (lint-enforced).
- U6. UI text bilingual (AR+EN), RTL-correct (visual snapshot AR & EN), a11y checks pass.
- U7. Documentation updated: [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md),
  affected domain docs, `CHANGELOG.md`; completion report written with evidence.
- U8. No TODOs / stubs / dead code merged; code review checklist passed.

## Per-phase criteria (must-have highlights)

| Phase | Acceptance criteria (highlights) |
|-------|----------------------------------|
| 001 | Monorepo builds; CI runs typecheck+lint+unit+E2E stub on all apps; Docker Compose boots api+web+pg+minio+mailpit with health checks; boundary lint fails a deliberately violating test file (negative meta-test); docs validation in CI |
| 002 | Drizzle migration framework with named conventions; RLS helpers applied (app role non-owner, `SET LOCAL` GUC pattern, guard triggers); pg-boss boots with test job; storage adapter signed URLs; `/health/ready`; migration tests + RLS presence check in CI; attack tests A1–A10 on infra tables pass |
| 003 | Login/logout/session rotation; argon2id hashing; TOTP enroll/verify + recovery codes; RBAC enforcement matching [../security/AUTHORIZATION_MATRIX.md](../security/AUTHORIZATION_MATRIX.md); audit events for auth + admin actions; **cross-tenant attack suite ≥ 20 scenarios, 0 leaks**; rate limiting + progressive lockout verified |
| 004 | Registration creates tenant + owner + default config (template selected, jurisdiction pack bound, CoA template instantiated); onboarding wizard API complete; branches CRUD + scoping; entitlements service resolves plan→features and blocks disabled features server-side; admin console: suspend/restore (sessions killed, sync rejected), entitlement edit, audit view; support access time-boxed + audited |
| 005 | Design tokens implemented exactly ([../ui/DESIGN_TOKENS.md](../ui/DESIGN_TOKENS.md)) and used by ≥ 20 catalog components; DataTable virtualized at 10k rows with keyboard support; MoneyInput decimal keypad AR/EN; DateRange Gregorian+Hijri; app shell RTL/LTR mirrored with entitlement-driven nav; i18n key-parity CI check (zero missing AR/EN keys); visual regression AR+EN green; Storybook catalog deployed |
| 006 | Partners/items/categories/UoM/barcodes/price lists CRUD + search + import(CSV/XLSX)/export with duplicate detection and dry-run preview; opening-balance drafts stored (not posted); attachments permission-checked; partner credit-check API; UoM conversion property tests; **zero journal rows from module (verified)** |
| 007 | CoA template instantiation bilingual + tree validation (leaf-only posting) + purpose mapping fail-closed; fiscal periods + lock enforced by posting engine; manual journal create→approve→post; **posting engine implements [../accounting/POSTING_ENGINE.md](../accounting/POSTING_ENGINE.md) exactly: validation pipeline 1–8, error taxonomy, idempotency INV-013**; reversal flow; GL drill-down; recurring entries; opening balances posting (CoA + partners); **INV-001…INV-022 initial coverage: each invariant has passing positive + violation tests** |
| 008 | Cash/bank/petty accounts linked to CoA; receipts/disbursements with allocations (incl. opening balances) post correct journals (goldens G-05/G-06/G-10 with gain+loss mirrors); INV-016 allocation bounds incl. concurrency (CC-02), on-account remainders explicit (BR-027); expense claims + approval policies (BR-023) + reserved tax field; transfers with charges (G-12); cashier shifts with variance auto-post + supervisor PIN above tolerance (BR-021); bank statement import (adapters, idempotent, bounded) + auto/manual match + aging + per-account period lock (BR-022), statement lines never ledger entries; FX difference posting on settlement honoring stored rate (INV-008); **treasury balance = Σ movements (INV-019) with seeded-drift BROKEN detection blocking period lock (RC-08/PC-04)**; new tables in isolation registry A1–A10 + spoof rejections zero-partial; §3.4 permissions incl. SoD-guarded approve keys |
| 009 | Six treatments modeled distinctly; tax codes resolve per document date with rate snapshots; jurisdiction packs for all 10 countries load + version; **no-VAT pack operates cleanly (documents without VAT fields, no VAT postings, NOT_SUBJECT stamps)**; unregistered-tenant mode; tax summary per document; VAT return report reconciles to GL tax accounts (INV-012) per pack scenario; adapter port + fake adapter contract tests |
| 010 | Stock ledger append-only; WAC + FIFO engines pass property tests vs oracle datasets (incl. multi-receipt/multi-issue sequences); opening stock posting; transfers with in-transit; counts → adjustments post shrinkage/appreciation; batch/expiry/serial/IMEI enforcement where flagged; availability API; **inventory subledger reconciles to GL (INV-010/017/018: move+journal atomicity tests)** |
| 011 | PR→PO→GRN→supplier invoice chain with documented statuses; three-way matching with tolerance policies + match_result recorded; debit notes; payments + allocations; AP aging + supplier statements; GRNI accrual + clearing correct; landed-cost baseline; matching failure paths tested |
| 012 | Quote→order→delivery→invoice→credit note full chain; cash + credit sales; partial payments + allocations; credit limits (block/warn/ignore) enforced server-side at approval; returns re-enter stock at original cost; AR aging + customer statements (deterministic as-of); **all sales/credit-note posting rules tested with expected journal entries (success + failure: credit limit, period lock, stale price)** |
| 013 | Report contract registry per [../reporting/REPORT_CONTRACT.md](../reporting/REPORT_CONTRACT.md); TB/IS/BS/CF correct on golden datasets with self-assertions (TB debits=credits; IS net = BS current-year result); drill-down to source documents; print templates AR/EN RTL-correct; PDF/XLSX/CSV exports byte-stable in tests; permissions per report; exports audited; heavy reports via job path |
| 014 | Plans + entitlement matrix enforced end-to-end (server-side); checkout via provider adapter (sandbox) AND manual invoicing fallback; onboarding UX: register→configure→first invoice journey in AR and EN; dashboards with drill-down; security review of MVP surface (findings triaged); load smoke vs NFR-006; **MVP gate checklist green** ([MASTER_ROADMAP.md](MASTER_ROADMAP.md) §Release gates) |
| 015 | Configuration engine: `resolveEffectiveConfig` deterministic (property tests) + invalidation events; manifests schema-validated; retail/grocery/restaurant templates apply without data corruption; template switching additive-only (reversal of destructive attempts rejected + audited); INV-022 fuzz: configuration attempts cannot alter invariants |
| 016 | POS terminals + shifts/drawer with variance posting; touch sale flow p95 < 2s scan-to-cart; barcode scanning; receipts 80/58mm RTL-correct (visual snapshots); **offline sale queue: sell disconnected → sync reconciles with zero double-posting (chaos slice C-01/03/04/07/09/16)**; end-of-day Z report matches journals; unregistered-mode receipts |
| 017 | Automotive template: job cards (parts + labor) post correctly (golden tests incl. both parts-issue policies); vehicle registry per partner; distribution: van stock = warehouse semantics with load/unload transfers, route visits, settlements (cash + credit + returns + variance reconcile — conservation tests); customer price tiers + free goods |
| 018 | BOM versioning + explosion (multi-level); production order → consumption → WIP → finished goods at computed cost (material+labor+overhead); scrap posting; batch genealogy forward/backward trace; QC gates block completion on fail; **WIP/FG reconcile to GL (INV-010)**; multi-level costing golden tests with scrap % |
| 019 | Leads→customer conversion; tasks/activities/reminders with notifications; service contracts: recurring billing idempotent per (contract, period) incl. boundary dates + period-lock handling; deferred revenue wiring (BR-027); service orders; project dimension usable on documents + reports; revenue schedule ↔ AR reconciliation |
| 020 | Device registry + revocation (pushes rejected, pulls blocked); change feeds with cursors + tombstones; push/pull contracts with typed per-item results; **conflict policies per entity: server-decision for financial (no LWW) — policy tests**; local DB reference implementation + contract version gates; **full chaos matrix C-01…C-16 green** ([../testing/SYNC_TESTS.md](../testing/SYNC_TESTS.md)); POS terminal (PHASE-016) interops with generalized protocol; sync monitoring dashboard |
| 021 | Tauri app builds + signed auto-update (staged rollout path); offline web-ERP in shell: login, cached read models, offline drafts per capabilities matrix; keychain storage; crash recovery preserves outbox; WebView2 min-version enforcement; packaging + updater downgrade/attack tests |
| 022 | Expo app: personal-account views (balance, statement, invoices, receipts, due dates) with offline cache; field sales offline→sync flows; device registration + revocation enforced; biometric unlock; AR/RTL-EN parity snapshots; push notification skeleton; staged rollout + min-version enforcement |
| 023 | **No-fabrication gate**: ZATCA adapter implemented only against pinned official specifications with verification checklist evidence (sandbox exercised, sample invoices validated, legal review); submission registry state machine + retries + alerting; QR/signature verified against official test vectors; fake-authority harness tests (submission, rejection, timeout, retry); payment provider production adapter; **INCOMPLETE status rules honored when gating decisions (OQ-004/DR-001) are open — no silent completion** |
| 024 | Pen test per [../security/SECURITY_TEST_PLAN.md](../security/SECURITY_TEST_PLAN.md) scope executed; findings remediated/closed per SLA; MFA enforcement policies per role/plan; rate-limit/lockout hardening verified; secrets rotation drill executed once; dependency/SBOM triage; audit review tooling; privacy notices legal-review task tracked (OQ-009 decision record) |
| 025 | Load tests at 10× projection meet NFR-006 (k6 evidence, T-01…T-08); soak test; DR drill within RTO with timing evidence (region-loss tabletop + cross-region restore rehearsal); cold backup-restore by second engineer; runbooks cold-run validated; SLO dashboards + error budgets live; docs-drift final validation; **GA gate checklist green** ([MASTER_ROADMAP.md](MASTER_ROADMAP.md) §Release gates) |

## Per-phase criteria — Blueprint v2.0 expansion (stages 9–11)

Universal criteria U1–U8 above apply unchanged, as do the register §O safeguards: every
new posting goes through the posting engine with INV-013 idempotency, every new table is
tenant-owned + RLS with isolation attack tests, and no country-specific rates are
fabricated. Canonical identifiers per [../EXPANSION_REGISTER.md](../EXPANSION_REGISTER.md).

### PHASE-026 — Fixed Assets & Depreciation

- **INV-023 enforced**: Σ depreciation ≤ cost − salvage_value; NBV ≥ 0 always; disposal
  once only and only from status ACTIVE/FULLY_DEPRECIATED.
- Goldens **G-21/G-22/G-23** byte-stable: capitalization; monthly depreciation run (one
  journal, lines per asset); disposal with mandatory gain/loss mirror.
- Depreciation posts **only via runs** (BR-042), and runs are period-locked; a manual asset
  journal is rejected (negative test).
- Disposal locks the asset (BR-043); revaluation is optional + audited with delta to
  `REVALUATION_RESERVE` (BR-044).
- **Category purpose mapping enforced fail-closed** (BR-041): asset/accumulated/expense
  purposes must exist before a category is usable.
- Asset register, depreciation schedule, and movements reports reconcile to GL control
  accounts on golden datasets.
- All 6 new tables (`asset_categories`, `assets`, `depreciation_runs`, `depreciation_lines`
  🔒, `asset_disposals`, `asset_revaluations`) tenant-owned + RLS + isolation attack tests.

### PHASE-027 — Cheques, Promissory Notes & Installments

- **INV-024 enforced**: note custody equals journal effects — COLLECTED/DISCOUNTED/RETURNED
  notes carry zero `NOTES_RECEIVABLE` balance.
- Goldens **G-24…G-28** byte-stable: note received against invoice; collected at maturity;
  dishonored; issued-note pair; installment late fee.
- **PDC calendar auto-derived** from note maturity dates (BR-045); endorsement moves
  custody without a journal (BR-047).
- **Dishonor restores the AR open item exactly** (amount + references), requires a reason;
  bank fee optional via `BANK_CHARGES` (BR-046).
- **Installment plan total = source document total** (BR-048); schedule immutable after
  activation; **late fees only via the engine** per plan policy (BR-049/G-28), flat fees
  only — no interest-bearing computation (DR-003).
- Maturity-calendar, aging, and dishonored-register reports correct on golden datasets.
- `notes`, `note_events` 🔒, `installment_plans`, `installment_lines` tenant-owned + RLS +
  isolation attack tests; existing `treasury.cheques` feature key re-pointed to the
  `notes` module (ED-03).

### PHASE-028 — Budgeting & Variance Control

- **One ACTIVE budget version per (fiscal year, scope)** (BR-050); revisions supersede —
  never edit (immutability test).
- **Budgets never post journals**: budget lines are planning data only; variance reads GL
  actuals (negative test: no journal can originate from budgeting).
- **Controls advisory by default** (BR-051); hard-block only via explicit tenant policy;
  both behaviors tested.
- Budget-vs-actual variance correct on golden datasets across all four scopes (accounts,
  cost centers, projects, branches).
- Approval workflow DRAFT → PENDING_APPROVAL → ACTIVE → REVISED/CLOSED with SoD on
  `budgeting.budgets.approve`.
- `budgets`, `budget_lines` tenant-owned + RLS + isolation attack tests.

### PHASE-029 — Payroll: Salaries, Loans & End-of-Service

- **INV-025 enforced**: run totals = Σ lines (gross, deductions, net) and net = gross −
  deductions exactly; posted runs immutable (reversal-only).
- Goldens **G-29/G-30/G-31** byte-stable: run posting; payout; EOS settlement with residual
  to `EOS_PROVISION_EXPENSE`.
- **Payroll posts only via runs** (BR-053): a manual journal touching payroll accounts is
  rejected (negative test).
- **PII permission gating**: `payroll.employees.*` reads restricted (role template
  additions); national-ID and bank fields protected per
  [../security/DATA_PROTECTION.md](../security/DATA_PROTECTION.md).
- **No fabricated rates** (BR-055): components are tenant-configured; GOSI/social-insurance/EOS
  jurisdiction rules REQUIRE_VERIFICATION per the official-sources protocol; EOS accrual
  per tenant policy table.
- Salary structure versioning (BR-052): mid-period change creates a new structure version;
  loan deduction per period ≤ cap percent of net (BR-054).
- All 7 payroll tables (`employees`, `salary_structures`, `salary_components`,
  `payroll_runs`, `payroll_run_lines` 🔒, `employee_loans`, `employee_loan_lines`)
  tenant-owned + RLS + isolation attack tests.

### PHASE-030 — Wholesale & Electronics Templates

- `manifest.wholesale.json` + `manifest.electronics.json` parse, schema-validate, and
  extract byte-stable (`industry.wholesale`, `industry.electronics` ids).
- Both template docs pass the industry framework's **7 governance tests** (manifest schema,
  feature-key existence, navigation sample, terminology overrides, workflow signature,
  defaults, out-of-scope declaration).
- **Additive switching rules hold**: applying either template to a live tenant is
  additive-only; destructive attempts rejected + audited (INV-022 fuzz extended).
- Wholesale: qty-break price lists, credit terms/limits, optional routes resolve on golden
  partner/item data.
- Electronics: IMEI serial tracking, repair service orders, POS keys, trade-in via
  purchasing — every flagship key resolves to an existing module feature (no new core
  surface).
- CAPABILITY_MATRIX gains WHL/ELC columns; every cell cites an existing feature or N/A.

### PHASE-031 — Healthcare Commercial Shell

- Manifest + template doc pass the **7 governance tests**; additive switching rules hold.
- Insurance-claim billing = AR per claim (no clinical data model); claim lifecycle tested;
  claims cheques via `notes.received`.
- Pharmacy stock = `inventory.batch_tracking` (+ expiry) verified on golden datasets; no
  drug/clinical catalog fabricated.
- Patient financial files = partner extension with financial data only — clinical records/HIS
  remain out-of-scope, declared in the template doc (ED-11).
- Visits via `crm.service_orders`; every flagship key resolves to an existing feature.
- CAPABILITY_MATRIX gains the HLT column and `insurance_claim_billing` row with citations.

### PHASE-032 — Education Commercial Shell

- Manifest + template doc pass the **7 governance tests**; additive switching rules hold.
- Tuition contracts via `crm.service_contracts` (enrollment years); installment plans via
  `installments.plans` — plan total = contract total (BR-048) tested on golden data.
- Sibling discounts via pricing rules (no new pricing engine surface); dunning uses
  installment aging.
- Academic operations/LMS remain out-of-scope, declared in the template doc (ED-11).
- CAPABILITY_MATRIX gains the EDU column and `installment_terms` row with citations.

### PHASE-033 — Agriculture Commercial Shell

- Manifest + template doc pass the **7 governance tests**; additive switching rules hold.
- Crop-cycle costing via `manufacturing.boms` + production costing verified on golden
  datasets (crop cycle = BOM: inputs → harvest).
- Harvest batches via `inventory.batch_tracking`; livestock as serial-tracked items (no new
  tracking primitives).
- Per-field costing via `accounting.projects` — project dimension tested on agri documents.
- Precision agronomy remains out-of-scope, declared in the template doc (ED-11).
- CAPABILITY_MATRIX gains the AGR column and `crop_cycle_costing`/`harvest_batches` rows
  with citations.

### PHASE-034 — Multi-Entity Consolidation

- **INV-026 enforced**: consolidation runs never write member books; consolidated
  statement = Σ member statements (group currency, dated FX) − eliminations.
- **Zero cross-tenant writes**: cross-tenant reads only via the explicit, audited,
  read-only service (ADR-0018); RLS never relaxed — proven by isolation attack tests.
- Eliminations are balanced journals posted only in the parent's consolidation books
  (golden **G-32** byte-stable); reversible only by counter-entry (BR-056).
- **Member periods closed** prerequisite (BR-056) enforced and tested — a run against an
  open member period is rejected.
- Consolidated TB/IS/BS + eliminations log reconcile to member books on a golden
  two-entity dataset with intercompany balances.
- FX translation uses dated rates from PHASE-007; ownership percentages recorded on
  `group_entities`.
- `consolidation_groups`, `group_entities`, `elimination_entries`, `consolidation_runs`
  tenant-owned + RLS + isolation attack tests.

### Enterprise Depth release gate (end of PHASE-034)

- Every stage 9–11 phase (026–034) is `COMPLETE` with evidence per this file.
- Consolidated statements reconcile to member books with eliminations proven (INV-026,
  golden G-32); zero cross-tenant writes demonstrated (ADR-0018).
- Payroll, fixed-assets, and notes/installments suites green (INV-023…025, goldens
  G-21…G-32).
- Stages 9–11 never alter the MVP (PHASE-014) or GA (PHASE-025) gate criteria (ED-01) —
  expansion evidence is additional, never a substitute.

## Verification evidence requirements

Every acceptance item must be evidenced by at least one of: CI test names (linked),
command output in the completion report, screenshots for visual criteria (secondary —
data assertions are primary per directive §17), or runbook drill logs. Statements
without evidence do not count. A phase with failing or skipped critical tests is
`IN_PROGRESS` — never `COMPLETE`.
