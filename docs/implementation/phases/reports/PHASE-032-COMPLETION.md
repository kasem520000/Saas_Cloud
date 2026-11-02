# PHASE-032 Completion Report — Education Commercial Shell

**Date:** 2026-11-03 · **Branch:** `arena/6a317de3-saas-cloud` · **Status:**
COMPLETE (configuration-only scope; residuals recorded honestly below).

## Scope statement

`industry.education` ships as a **commercial shell**: guardian = paying AR
partner, student = partner financial file (zero academic data — machine-checked),
enrollment year = `crm.service_contracts`, tuition = ordinary sales invoices with
line-level sibling discounts, installments = the PHASE-027 backbone consumed
as-is. **Pure configuration**: no new tables, modules, feature keys, permissions,
or schema — INV-022.

## Evidence

| Task | Result | Evidence |
|------|--------|----------|
| T1 migration `0035_industry_education_032.sql` — data-only seed of `industry.education` v1.0.0 (manifest.education.json), schema_version 35, idempotent | applies on real PG16; migrations.spec 4/4 | `migrations/0035_*`, `src/infra/db/migrations.spec.ts` |
| T1/T8/T9 manifest unit spec — schema-valid; report pins resolve (`installments.schedule`, `installments.aging`, `services.contract_revenue_schedule`, `partners.ar_aging`→`ar.aging` via v2.0 mapping); EDU capability asserts (installment_terms/service_contracts REQ, recurring_billing/deposits_late_fees/pdc_notes/price_tiers OPT); series INV/RCP/CN; stock modules NOT enabled; **zero-academic-surface gate** + exact seven-policy set | **5/5 unit** | `manifest-education-032.spec.ts` |
| T2 apply through the unmodified engine — idempotent, audited (`template.applied`), L1 lands, L1 policies live (`guardian_is_paying_partner`, `installment_schedule_immutable_after_activation` = true) | DB 4/4 on real PG16 | `education-032.db.spec.ts` |
| T9 switch safety — wholesale→education additive-only (BR-038: tenant intact, L1 swaps, hash changes, switch back), zero journal rows on apply AND switch (negative ledger proof, INV-022); unknown → `TemplateNotFoundError` | DB spec tests 3–4 | same |
| T8 report-pack wiring — pins use existing registry keys only; registry unchanged (79) | unit spec T8 test | manifest spec |
| T9 UI — config-only education preset (enrollment contracts, guardians, fee schedules, tuition invoices, installment plans, collections — all existing routes, feature-gated) + 8 bilingual dict keys | web tsc clean | `apps/web/lib/industry-presets.ts`, `i18n/dictionaries.ts` |
| Full api unit sweep | **368/368 (56 files)** | vitest run |
| Configuration DB suites (all four template specs) on real PG16 | **26/26** | vitest.db.config |
| api tsc + web tsc | clean / clean | `tsc --noEmit` |
| docs validation | **29/29** | `corepack pnpm docs:validate` |

## Honest residual (CI-class / not claimed)

- T6 tuition end-to-end golden (contract → invoice G-01 → plan BR-048 → collect G-05 → late fee G-28) re-run under an education-applied tenant: the golden shapes remain owned and green by the PHASE-012/019/027 suites; PHASE-032 proves the template layer (apply/switch/zero-journal) on real PG. Full e2e re-run is CI-class.
- RTL/Playwright visual set for the education screens: CI-class; preset data + dictionary parity proven.

## Invariants preserved

INV-022 (configuration only — zero ledger surface, proven), BR-038 (additive-only
switch, audited), ADR-0007 (no engine/journal changes), ED-08/ED-11 (zero academic
data — machine-checked), no new permission/feature keys, RLS untouched (no schema
change this phase), no secrets, docs synced (IMPLEMENTATION_STATUS, CURRENT_STATE,
CHANGELOG, NEXT_ACTION → PHASE-033).
