# PHASE-028 Completion Report — Budgeting & Variance Control

**Date:** 2026-11-02 · **Branch:** `arena/6a317de3-saas-cloud` · **Status:**
COMPLETE (full sandbox-provable scope).

## Evidence

| Task | Result | Evidence |
|------|--------|----------|
| T1 migration `0030_budgeting_028.sql` (`budgets` + `budget_lines`, RLS, BR-050 partial unique index `uq_budgets_one_active_per_year_scope`, permissions) | applies on real PG; manifest 4/4 | `migrations/0030_*`, `migrations.spec.ts` |
| T2/T4 lifecycle + SoD + supersede chain over ports | 4/4 flow tests | `budgeting/__tests__/budgeting.spec.ts` |
| T3 grid/lines: DRAFT-only edits, period∈fiscal-year, foreign dimension → typed 404 zero-partial | in flows | `budgeting/application/budget-service.ts` |
| BR-050/BR-051 domain guards incl. negative proof: POSTED never warned/blocked; ENFORCE_DRAFT blocks only DRAFT saves with BUDGET_EXCEEDED | 4/4 rule tests | `budgeting/domain/budget-rules.ts` |
| T5 variance engine (read-only GL actuals) + ledger-tie assertion | variance + tie tests | `budget-rules.ts` (`variance`, `ledgerTie`) |
| T7 report contracts ×2 (`budgeting.budget-vs-actual`, `budgeting.variance-analysis`, executionClass job, ledger-tie assertion) | registry meta 50/50 (76 contracts) | `reporting/registry/budgeting/contracts.ts` |
| T9 UI scaffold: budgets list page + AR/EN keys | web tsc clean | `apps/web/app/[locale]/budgeting/` |
| T10 isolation: 2 tables registered; A1–A10 as erp_app (budget_lines deleteGranted DRAFT-only) | **900/900 on real embedded PG** | `isolation/identity-isolation.db.spec.ts` |
| Full api unit / api+web tsc / docs | 343/343, clean, clean, 29/29 | repo |

## Honest residual (CI-class, documented)

- pg-boss execution of variance jobs + XLSX grid import/export adapter (T8) —
  thin bindings over the proven domain; Playwright baselines CI-class.
- `warn_threshold_percent` PLACEHOLDER default (100) pending the OQ-002 pass.

## Invariants preserved

Budgets are planning data, never ledger documents: no posting call site in
the engine (ADR-0007 negative property), advisory-by-default controls
(BR-051), INV-013 untouched, RLS proven by the attack suite, no secrets.
