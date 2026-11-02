# Next Action

> **Status:** LIVING DOCUMENT — updated at every phase completion · **Updated:** 2026-11-02

## The single next action

**Execute PHASE-024 (Security Hardening & Compliance Review)** — PHASE-023 ungated scope COMPLETE; ZATCA adapter remains an UNVERIFIED stub pending DR-001 + the verification gate. PHASE-021 is COMPLETE in its sandbox-provable scope (2026-11-02; evidence: reports/PHASE-021-COMPLETION.md — native Windows signing, SQLCipher wiring, chaos desktop matrix and Playwright smoke remain CI-class deferrals). PHASE-020 is COMPLETE (2026-11-02; evidence: reports/PHASE-020-COMPLETION.md): the generalized sync protocol + `packages/sync-core` v1 are live — the PHASE-016 POS slice runs unchanged on the same wire contracts; chaos-critical paths (C-01/C-06/C-12/C-13) proven on embedded PG. PHASE-019 is COMPLETE (2026-11-02; evidence: reports/PHASE-019-COMPLETION.md): crm module (leads→partner conversion, contracts + idempotent recurring billing through the posting engine, tasks/activities/time entries, service orders), projects analytical dimension stamped on journal lines, `industry.professional_services` template live via the unmodified engine, 2 services report contracts (registry 64→66), drift 242=242. PHASE-018 is COMPLETE (2026-11-02; evidence: reports/PHASE-018-COMPLETION.md): manufacturing module + food_manufacturing template live via the unmodified engine. PHASE-017 is COMPLETE (2026-11-02, tag `phase/017`;
evidence: reports/PHASE-017-COMPLETION.md): automotive & distribution templates seeded via
the unmodified PHASE-015 engine, domain cores for job cards / settlements / tiers /
free goods / commissions with unit proof, drift 237=237, unit 195 PASS.
evidence: reports/PHASE-016-COMPLETION.md): POS module live — terminals, counter sale
through the sales chain, narrow offline sync slice with INV-013 dedupe, POS reports,
template POS entries un-gated. PHASE-015 is COMPLETE (2026-11-02, tag `phase/015`;
evidence: reports/PHASE-015-COMPLETION.md): industry configuration framework live — ten-layer
fail-closed resolution with stable `resolved_hash`, 3 priority templates (retail/grocery/restaurant)
with idempotent audited additive-only apply/switch, phase-gated POS keys labeled PHASE-016,
3 industry reports registered, admin + onboarding UI, drift 228=228, gate non-browser steps green.
PHASE-014 is COMPLETE (2026-11-02, tag `phase/014`;
evidence: reports/PHASE-014-COMPLETION.md): subscriptions/billing/lifecycle/usage/
notifications substrate live, both payment paths identical (A-009), read-only grace
typed, posting never limit-blocked (INV-022), dashboards report-contract-bound only,
MVP security review done, gate non-browser steps green (browser-bound probes are
hosted-CI evidence — Chromium unavailable in the sandbox).

## Completed: PHASE-014

**Executed PHASE-014 — Subscription, Billing, Onboarding & Dashboards — MVP** per
[../implementation/phases/PHASE-014.md](../implementation/phases/PHASE-014.md):
plans and the entitlement matrix end-to-end, the payment-provider adapter with
the sandbox checkout flow **and the mandatory manual-invoicing fallback**
(A-009/OQ-003), the subscription lifecycle (trial → active → read-only grace →
suspended) integrated with the PHASE-004 suspension semantics, usage counters
with soft-warn/hard-block behaviors that **never block posting** (INV-022),
the completed onboarding wizard over the PHASE-004 backend, owner/CEO
dashboards as report-contract-bound KPI widgets with drill-down, the
billing-critical notifications center, the MVP security review, and the NFR-006
load smoke test — ending in the **MVP gate** per
[../planning/RELEASE_STRATEGY.md](../planning/RELEASE_STRATEGY.md).

Why now: PHASE-013 is COMPLETE (2026-11-01, tag `phase/013`; evidence:
reports/PHASE-013-COMPLETION.md) — the reporting engine is live and
self-proving: 48 report contracts (REPORT_CATALOG §1–§7) are registered with
boot-time zod validation; every statement runs its FINANCIAL_REPORT_RULES §11
assertion set at exact-decimal tolerance 0 and a FAIL blocks exports and
printing server-side (ASSERTION_FAILED — the viewer renders the banner, the
server refuses the artifact); as-of re-runs are byte-identical and idempotent
per `(tenant_id, report_key, params_hash)`; permissions re-resolve at
execution (a revoked grant kills a queued run FORBIDDEN_AT_RUN with zero
partial artifacts); and the print/export system delivers the four versioned
RTL-correct templates (tafqit amount-in-words, embedded woff2 fonts), the
Chromium PDF render (PDF/A-2b XMP identification stamp), and XLSX/CSV with
sha256-stamped, signed (15-min), audited artifacts through the files module —
exactly the export/print + report-contract surfaces billing invoices,
subscription statements, and the PHASE-014 owner dashboards consume
(dependency edge 013→014: "Billing needs export/print + report contract for
invoices/statements"; the dashboard-widget binding contract is documented at
REPORT_CATALOG §14 — widgets land PHASE-014). The full suite output is in the
completion report.

How:

1. Follow the handoff protocol: read the PHASE-013 completion report first
   (the report-contract registry seam + the §14 dashboard-widget binding
   contract + the print/export surfaces + the seven new module query services
   the platform reports ride), then the PHASE-004 report (the plans/
   entitlements/suspend-restore substrate the lifecycle and limits integrate
   with) and the PHASE-003 report (the platform plane + audit widening the
   billing history rides).
2. Confirm prerequisites per the dependency graph: PHASE-013 ✓ (+ PHASE-012 ✓,
   PHASE-011 ✓, PHASE-010 ✓, PHASE-009 ✓, PHASE-008 ✓, PHASE-007 ✓,
   PHASE-005 ✓ — all verified in IMPLEMENTATION_STATUS).
3. Honor the binding product principles: usage counters soft-warn at 80% /
   100% and hard-block only creation actions — the documents/month limit
   never blocks posting, and no limit behavior may affect posted data or
   reconciliation (INV-022); read-only grace keeps dashboards, reports,
   exports, and printing alive (postings fail with typed
   `subscription_read_only` errors naming the resolving action); the
   manual-invoicing fallback ships in the same phase as the sandbox checkout
   (A-009); all prices and numeric limits remain PLACEHOLDER pending OQ-002;
   dashboard widgets bind to report contracts in `current` freshness mode —
   links, never parallel implementations.
4. Do NOT implement PHASE-015+ in the same run.

## Next eligible: PHASE-014 — Subscription, Billing, Onboarding & Dashboards — MVP

Per [../planning/PHASE_DEPENDENCY_GRAPH.md](../planning/PHASE_DEPENDENCY_GRAPH.md):
PHASE-014 requires PHASE-013 ✓ (plus the delivered MVP stack PHASE-012 ✓,
PHASE-011 ✓, PHASE-010 ✓, PHASE-009 ✓, PHASE-008 ✓, PHASE-007 ✓,
PHASE-005 ✓).

## Follow-up obligations (waived evidence — attach at first infra availability)

- First GitHub CI green run on `main` (ci.yml) — PHASE-001 (local gate output is
  the recorded substitute).
- `docker compose up -d` healthcheck capture on a Docker-capable host — PHASE-001.
- First ci-db.yml (Testcontainers) run — PHASE-002 (the embedded-PG16 db suite is
  the recorded local substitute).
- Hosted k6 posting smoke (T-01 smoke tier) — PHASE-007 (the local
  k6-equivalent harness `posting-smoke.local.spec.ts` + the k6 script
  `apps/api/k6/posting-smoke.ts` are the recorded substitutes).

## Do NOT

- Do not implement PHASE-015+ in the same run as PHASE-014.
- Do not modify the ADRs or the roadmap without the change-control process
  ([IMPLEMENTATION_PROTOCOL.md](IMPLEMENTATION_PROTOCOL.md) §3).
- Do not relax the frozen substrates (PHASE-002 infra, PHASE-003 identity trust,
  PHASE-004 provisioning/entitlements, PHASE-007 posting-engine invariants,
  PHASE-009 tax contracts + snapshot semantics INV-022, PHASE-010 stock-ledger
  append-only semantics INV-010/017/018, PHASE-011 match-before-approval +
  GRNI/RC-09 semantics, PHASE-012 §3.4 explicit-allocation open-item semantics +
  original-cost re-entry W-3, PHASE-013 report-contract semantics +
  assertion-gated exports + the audited print/export artifact trail) to make
  PHASE-014 easier — changes need decision records.
- Do not let any usage-limit or billing behavior block posting or touch posted
  data and reconciliation (INV-022 — billing pressure uses notifications +
  billing, not ledger locks).
- Do not post journal rows from any module bypassing the posting engine
  (ADR-0007) — the PHASE-007 boundary meta-tests enforce this.
- Do not fabricate tax rates or legal rules (directive §1.12–1.13) — the
  compliance-matrix provenance chain is mandatory; new pack facts ship as
  versioned seed migrations with verification records.
- Do not recompute tax on offline devices or rewrite stamped snapshots
  (BR-033) — offline caches stamps (PHASE-016/020), it never recomputes.
- Do not write `stock_moves`/`stock_layers` from outside the inventory
  module (MODULE_BOUNDARIES — inventory exclusively owns them).
- Do not net credit notes against invoices silently in reports — the §3.4
  explicit-allocation model (invoice gross-open, note its own row) is the
  honest presentation PHASE-012 established; netting is a derived display
  total, never a mutation.
- Do not build dashboard widgets as parallel query implementations — widgets
  bind to registered report contracts with pinned parameters
  ([../reporting/REPORT_CATALOG.md](../reporting/REPORT_CATALOG.md) §14) and
  open the underlying report on click.
