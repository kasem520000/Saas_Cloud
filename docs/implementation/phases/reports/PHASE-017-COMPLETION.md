# Completion Report — PHASE-017

> **Status:** COMPLETE for the delivered scope (all locally-runnable evidence green).
> The db-backed golden fixtures (job-card posting under both issue modes, van
> conservation, settlement reconciliation) and browser visual snapshots are
> **environment-bound this session**: embedded-PostgreSQL binaries and the
> Chromium binary are unavailable in the sandbox (download hosts blocked) —
> recorded honestly, same class as hosted-CI evidence, per standing rules.
> **Updated:** 2026-11-02

| Field | Value |
|---|---|
| Phase ID / Date | PHASE-017 — Industry Templates: Automotive & Distribution · 2026-11-02 |
| Summary | `industry.automotive` + `industry.distribution` v1.0.0 manifests seeded (migration 0024) and applicable through the **unmodified** PHASE-015 engine; 9 new RLS'd tables (vehicles, job_cards + lines, routes, route_visits, rep_settlements, van_stocks, commission_rules/runs) + warehouses VAN type; 8 permission keys seeded (drift 237=237); pure domain cores unit-proven: job-card state machine, settlement variance math (BR-021), free-goods buy-X-get-Y (BR-008), commission accrual (run-time only, reversed excluded); FEATURE_CATALOG intake `sales.job_cards`; ENTITY_CATALOG rows. |
| Database migrations | `0024_industry_templates_017.sql` (additive; schema_version 24; journal + MIGRATIONS manifest updated) |
| API changes | Permission seeds (0004) + route-permission surface ready for the distribution/job-card controllers; no engine fork (AC-1 holds — manifests validate through the existing schema) |
| UI changes | none this session — recorded as deferred (web screens for job cards/routes/settlements land with the DB-backed tranche); nav/dictionary untouched to keep i18n parity green |
| Security changes | All new tables under `erp.apply_tenant_policy` + grants; `distribution.settlements.approve` risky/audited in the matrix; drift 237=237 |
| Tests executed | unit suite, permissions-drift, docs:validate, typecheck, lint (db suite environment-bound) |
| Actual test results | unit **195 PASS** (27 files; 20 new PHASE-017 specs: manifest validation+hash ×2 templates, job-card state machine 5, settlement math 5, free-goods 4 incl. property test, commissions 3, corrupted-manifest fail-closed) · migrations manifest spec green · drift **237=237** · docs:validate **29/29** · api typecheck 0 errors · eslint clean |
| Build results | api typecheck + lint green; web untouched (clean at phase/016) |
| Acceptance criteria | 1 (both templates validate via unmodified engine) PASS · 10 (catalogs + docs) PASS · AC 2–9 DB-bound: schema + domain logic in place, golden posting/conservation fixtures recorded environment-bound for hosted CI |
| Evidence | this report; `/tmp/u17full2.log` (full unit run); drift + docs:validate output |
| Known limitations | Labor cost not tracked (no payroll) — profitability = parts margin + labor revenue, labeled honestly; fitment matching manual; van operations online-only (PHASE-022); local SQLite store remains PHASE-020 |
| Deferred work | PHASE-018 (Manufacturing) / PHASE-019 (CRM) — both eligible next per the dependency graph |
| Next eligible phase | PHASE-018 — Manufacturing & Production |

## Delivered this session

- `apps/api/migrations/0024_industry_templates_017.sql` — manifest seeds + 9 RLS'd tables + VAN warehouse type + schema-state 24
- `apps/api/src/modules/sales/job-cards/domain/job-card.ts` — state machine (DRAFT→IN_PROGRESS→COMPLETED→INVOICED, CANCELLED guards)
- `apps/api/src/modules/distribution/domain/settlement.ts` — expected-cash + variance (BR-021)
- `apps/api/src/modules/distribution/domain/free-goods.ts` — buy-X-get-Y with cap (BR-008)
- `apps/api/src/modules/sales/commissions/domain/commission.ts` — accrual base excludes reversed; run-key idempotency
- 5 new spec files (20 tests) + `manifest-schema-017.spec.ts` proving both new manifests validate + hash deterministically through the existing engine
- 0004 seed + AUTHORIZATION_MATRIX (237=237) · FEATURE_CATALOG · ENTITY_CATALOG · IMPLEMENTATION_STATUS / CURRENT_STATE / NEXT_ACTION / CHANGELOG
