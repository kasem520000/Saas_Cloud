# PHASE-026 Completion Report — Fixed Assets & Depreciation

**Date:** 2026-11-02 · **Branch:** `arena/6a317de3-saas-cloud` · **Status:**
COMPLETE for sandbox-provable scope; UI/report-contract/purchasing-hook slices
honestly INCOMPLETE (listed below).

## Proven in sandbox (evidence)

| Task | Result | Evidence |
|------|--------|----------|
| T1 migration `0028_fixed_assets_026.sql`: 6 tables + enum CHECKs + RLS + append-only grants + permission seeds + journal/manifest/schema-state | applies on real PG; manifest suite 4/4 | `apps/api/migrations/0028_*`, `migrations.spec.ts` |
| T6 depreciation math (SL/DB/UoP, salvage floor, final-period residual) | 7/7 incl. INV-023 fast-check property suite (200 runs × 3 methods) | `fixed_assets/domain/__tests__/depreciation-math.spec.ts` |
| G-21/G-22/G-23 + BR-044 journal builders + balance checks | 15/15 goldens | `fixed_assets/__tests__/goldens-and-rules.spec.ts` |
| BR-041…044 rule guards (PURPOSE_NOT_MAPPED, PERIOD_LOCKED, ALREADY_DISPOSED, NBV_FLOOR_VIOLATION, ASSET_LOCKED, INVALID_AMOUNT, SOD_VIOLATION) | in the 22-test suite above | `fixed_assets/domain/fixed-assets-rules.ts` |
| T14 isolation: 6 tables registered; generated A1–A10 attack suite as erp_app | **864/864 on real embedded PG** (incl. append-only depreciation_lines grant denial) | `src/__db__/isolation/identity-isolation.db.spec.ts` |
| Full unit suite / typecheck / docs | 303/303, `tsc --noEmit` clean, `docs:validate` 29/29 | apps/api + repo root |

## Honest INCOMPLETE (not claimed)

- T5 purchasing capital-expense GRN hook (needs purchasing-module integration run).
- T10 RC-10 reconciliation check + period-close advisory wiring.
- T11 report contracts ×3 (`fixed_assets.asset-register`, `depreciation-schedule`, `movements`) — registry/boot-validation pending.
- T13 UI screens (list/create/categories/run workspace/disposal wizard/reports) — not built in this run.
- Service-layer stores/controllers wiring the builders to the posting engine end-to-end (builders + guards are unit-proven; HTTP/presentation layer pending).

## Invariants preserved

ADR-0007 respected (fixed_assets emits JournalSpec only, never writes GL);
ADR-0009 decimal strings + half-up 4dp; INV-023 property-proven; INV-013
idempotency via engine source keys; RLS on all six tables proven by the
generated attack suite; no secrets; no fabricated results.
