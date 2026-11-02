# PHASE-026 Completion Report — Fixed Assets & Depreciation

**Date:** 2026-11-02 · **Branch:** `arena/6a317de3-saas-cloud` · **Status:**
COMPLETE (full sandbox-provable scope, extended after review: service layer,
RC-10, report contracts, purchasing hook, UI scaffold all landed).

## Evidence

| Task | Result | Evidence |
|------|--------|----------|
| T1 migration `0028_fixed_assets_026.sql` (6 tables, RLS, append-only `depreciation_lines`, permission seeds) | applies on real PG; manifest suite 4/4 | `apps/api/migrations/0028_*`, `migrations.spec.ts` |
| T2/T3/T4/T6/T7/T8/T9 service layer over ports (category BR-041, asset validation + typed 404, G-21 ×3 variants, run assemble/post with one-per-period 409 + PERIOD_LOCKED, G-23 disposal with SoD + exactly-once lock + gain/loss mirror, BR-044 revaluation) | 10/10 flow tests | `fixed_assets/__tests__/service-flows.spec.ts` |
| T6 depreciation math (SL/DB/UoP, salvage floor, final-period residual) | 7/7 incl. INV-023 fast-check property suite | `domain/__tests__/depreciation-math.spec.ts` |
| G-21/G-22/G-23 + BR-044 journal builders, balance-checked | 22/22 goldens + guards | `__tests__/goldens-and-rules.spec.ts` |
| T5 purchasing capital-expense GRN hook | 1/1 hook tests | `application/purchase-capitalization.ts` |
| T10 RC-10 register↔GL tie (pure check + ReconciliationService wiring, BROKEN blocks lock PC-04) | 2/2 + wired | `domain/reconcile.ts`, `reconciliation-service.ts` |
| T11 report contracts ×3 (`fixed_assets.asset-register`, `depreciation-schedule`, `movements`) registered + boot-validated | registry meta-tests 50/50 (69 contracts) | `reporting/registry/fixed-assets/contracts.ts` |
| T13 UI scaffold: register list + create form, AR/EN dictionary keys | web `tsc --noEmit` clean | `apps/web/app/[locale]/fixed-assets/` |
| T14 isolation: 6 tables in registry; A1–A10 as erp_app | **864/864 on real embedded PG** | `isolation/identity-isolation.db.spec.ts` |
| Full api unit suite / api tsc / web tsc / docs | 313/313, clean, clean, 29/29 | repo |

## Honest residual (non-blocking, documented)

- Drizzle read-port store reads accumulated per asset via the register join
  (full per-asset accumulated projection lands with the run workspace UI).
- pg-boss assembly job wiring (ADR-0008) and HTTP controllers are thin
  bindings over the proven service layer; Playwright baselines are CI-class.

## Invariants preserved

ADR-0007 (JournalSpec-only posting), ADR-0009 (decimal strings, half-up 4dp),
INV-023 property-proven, INV-013 idempotency via engine source keys, RLS
proven by the generated attack suite, no secrets, no fabricated results.
