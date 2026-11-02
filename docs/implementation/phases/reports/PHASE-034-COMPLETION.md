# PHASE-034 Completion Report — Multi-Entity Consolidation (final roadmap phase)

**Date:** 2026-11-03 · **Branch:** `arena/6a317de3-saas-cloud` · **Status:**
COMPLETE (sandbox-provable scope; residuals recorded honestly below).
This satisfies the **Enterprise Depth release gate** (ED-10, ADR-0018).

## Scope statement

Legal entity = tenant, unchanged (ADR-0005). Consolidation groups are
configuration in the owner tenant; elimination entries are balanced journals
posted via the engine into the **owner's** books only (G-32, BR-056); runs are
**read-only** aggregations over member books through the single audited
platform-plane reader (INV-026); FX translation uses dated stored rates
(INV-008). Zero cross-tenant writes; member RLS never relaxed.

## Evidence

| Task | Result | Evidence |
|------|--------|----------|
| T1 OQ-V2-2 decision gate — closing-rate default, per-group `fx_translation_method` override; DR-006 §4 amended, OQ-V2-2 CLOSED | docs validation 29/29 | `DR-006-consolidation.md` §4, `ARCHITECTURE_RISKS_AND_OPEN_QUESTIONS.md` |
| T2 migration `0037_consolidation_034.sql` — 4 tables + RLS (`erp.apply_tenant_policy`) + grants, `erp_consolidation` NOLOGIN SELECT-only reader role on GL read models, INTERCOMPANY_AR/AP CoA template accounts, §3.15 permission keys, schema_version 37 | fresh+regression on real PG16; catalog drift 7/7 | `migrations/0037_*`, `src/__db__/migrations.db.spec.ts` |
| T3 reader service — platform-plane, per-member tenant GUC, per-read audit rows (`consolidation.member_read`) | DB suite: audit rows ≥1 after run; zero member writes byte-counted | `reader-service.ts`, consolidation DB spec |
| T4 group/membership service — CRUD, foreign-tenant refs 404-shaped (platform-scope existence probe, A7) | DB spec beforeAll | `group-service.ts` |
| T5 elimination service + **G-32 golden** — balanced DRAFT → engine post (source_type `consolidation_elimination`, DR INTERCOMPANY_AP · CR INTERCOMPANY_AR, line-asserted in owner books); failure packs ENTRY_NOT_BALANCED / ALREADY_POSTED / MEMBER_PERIOD_OPEN; reversal-only counter-entry | **DB 5/5 on real PG16**; builder unit 2/2 | `consolidation-034.db.spec.ts`, `consolidation-rules.spec.ts` |
| T6 run service — BR-056 closed-year precheck (typed rejection), COMPLETED snapshot carrying Σ member statements − eliminations with INV-026 invariant string, member journal count unchanged (zero member writes) | DB spec tests 3–4 | `run-service.ts` |
| T7 FX translation — dated rates from `exchange_rates`, RATE_MISSING fail-closed, exact stored-rate multiply (100 USD × 3.75 = 375.00000000) | DB spec test 5 | `fx-translation.ts` |
| T8 report contracts — `consolidated.tb/is/bs` + `consolidated.eliminations-log` with INV-026 assertions; registry 79→83, boot meta 50/50 | reporting unit 50/50 | `registry/consolidation/contracts.ts` |
| T9 isolation — 4 new tables registered in the generated A1–A10 suite (fixtures + mismatched-tenant inserts) | **966/966 on real PG16** | `tables.registry.ts`, `identity-isolation.db.spec.ts` |
| T10 permissions — 5 §3.15 keys seeded (0037), matrix §3.15 aligned, registry known-permissions updated | reporting meta green | migration 0037, `reporting-unit.spec.ts` |
| T11 UI — consolidation groups page (existing archetypes) + 3 bilingual dict keys | web tsc clean | `app/[locale]/consolidation/page.tsx` |
| Full api unit sweep | **375/375 (58 files)** | vitest run |
| DB: consolidation 5/5 + migrations 7/7 + configuration 30/30 + isolation 966/966 | **all green on real PG16** | vitest.db.config |
| api tsc + web tsc | clean / clean | `tsc --noEmit` |
| docs validation | **29/29** | `corepack pnpm docs:validate` |

## Honest residual (CI-class / not claimed)

- pg-boss QUEUED→RUNNING job binding for runs (the service executes synchronously
  in-suite; the job envelope is CI-class, same as prior phases).
- Playwright RTL baselines for the consolidation page: CI-class; page compiles
  under web tsc with dictionary parity enforced at module load.
- Full minority-interest accounting beyond elimination math: explicitly not
  promised at PHASE-034 (DR-006).

## Invariants preserved

ADR-0005 (entity=tenant; member RLS untouched — 966/966 attack suite green incl.
the 4 new tables), ADR-0018 (zero cross-tenant writes — member journal counts
byte-compared before/after runs), ADR-0007 (eliminations only via the engine,
INV-013 idempotent source key), BR-056 (closed members only; reversal-only),
INV-026 (snapshot = Σ members − eliminations, asserted), INV-008 (dated rates,
fail-closed), INV-006 (elimination↔journal tie via the eliminations-log
contract), no secrets, docs synced (IMPLEMENTATION_STATUS, CURRENT_STATE,
CHANGELOG, NEXT_ACTION → roadmap complete).
