# PHASE-029 Completion Report — Payroll: Salaries, Loans & End-of-Service

**Date:** 2026-11-02 · **Branch:** `arena/6a317de3-saas-cloud` · **Status:**
COMPLETE (full sandbox-provable scope, no gaps claimed without evidence).

## Evidence

| Task | Result | Evidence |
|------|--------|----------|
| T1 migration `0031_payroll_029.sql` (7 tables, RLS, append-only `payroll_run_lines`, INV-025 row-level CHECK `net = gross − deductions`, permissions) | applies on real PG; manifest 4/4 | `migrations/0031_*`, `migrations.spec.ts` |
| T4 calculation core: component order basic→%basic→%gross→fixed, half-up 4dp | G-29 worked example exact: gross 10,000 / ded 1,500 / net 8,500 / employer 1,000 / EOS 800 | `payroll/__tests__/payroll-goldens.spec.ts` |
| G-29/G-30/G-31 builders, balance-checked (11,800 = 11,800; G-31 residual + mirror rejection) | 8/8 goldens | `payroll/application/journal-builders.ts` |
| BR-054 loan cap (clamp 3,000 → 25% of net with warning; net-floor), BR-055 EOS policy-driven (no shipped rates; missing rate → skip + warn) | in goldens suite | `payroll/domain/payroll-calc.ts` |
| INV-025 suite (run totals = Σ lines; row net = gross − deductions) | in goldens suite | `payroll-calc.ts` |
| T5/T6/T7 run service: submit → SoD approve+post (self-approve blocked, PERIOD_LOCKED, one G-29 per run), G-30 payout with exact remainder, typed 404 | 3/3 flow tests | `payroll/__tests__/run-service-flows.spec.ts` |
| T10 3 report contracts (`payroll.register`, `cost-summary`, `eos-provision`) with ledger-tie assertions | registry meta 50/50 (79 contracts) | `reporting/registry/payroll/contracts.ts` |
| T11 UI scaffold: payroll employee list (PII fields never rendered) + AR/EN keys | web tsc clean | `apps/web/app/[locale]/payroll/` |
| T12 isolation: 7 tables registered; A1–A10 as erp_app incl. append-only payroll_run_lines | **942/942 on real embedded PG** | `isolation/identity-isolation.db.spec.ts` |
| Full api unit / api+web tsc / docs | 354/354, clean, clean, 29/29 | repo |

## Honest residual (CI-class, documented)

- pg-boss run-calculation job binding + payslip print template rendering +
  Playwright baselines are CI-class; PII encryption-at-rest is a column-level
  store concern verified in staging.

## Invariants preserved

ADR-0007 (G-29/30/31 via engine only; BR-053 no manual payroll journals),
ADR-0009 decimal math, INV-025 at row + run level, INV-013 idempotency,
RLS proven by attack suite, C-PII masked/excluded by construction, no
fabricated jurisdiction rates (BR-055), no secrets.
