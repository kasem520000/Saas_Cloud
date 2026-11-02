# PHASE-031 Completion Report — Healthcare Commercial Shell

**Date:** 2026-11-03 · **Branch:** `arena/6a317de3-saas-cloud` · **Status:**
COMPLETE (sandbox-provable scope; residuals recorded honestly below).

## Scope statement

The `industry.healthcare` template ships as a **commercial shell**: the patient
is a partner FINANCIAL file only (zero clinical surface — machine-checked), the
claim is a reference stamped on invoices, and claims settle by cheque/PDC through
the PHASE-027 `notes` module unchanged. Exactly **one** additive schema change
was needed (`sales_invoices.claim_ref`); the apply/switch engine is the
**unmodified PHASE-015** code (INV-022).

## Evidence

| Task | Result | Evidence |
|------|--------|----------|
| T1 migration `0033_healthcare_claim_ref_031.sql` — additive nullable `claim_ref` varchar(64), no backfill/default, optional `(tenant_id, claim_ref)` index, schema_version 33; RLS untouched (existing row policy) | applies on real PG16; column shape asserted (nullable, len 64) | `migrations/0033_*`, DB spec test 1 |
| T2 migration `0034_industry_healthcare_031.sql` — data-only seed of `industry.healthcare` v1.0.0 (manifest.healthcare.json), schema_version 34, idempotent | applies on real PG16; migrations.spec 4/4 | `migrations/0034_*`, `src/infra/db/migrations.spec.ts` |
| T2/T9/T10 manifest unit spec — schema-valid; report pins resolve (v2.0 mapping `partners.ar_aging`→`ar.aging`); HLT capability asserts (insurance_claim_billing/pdc_notes/expiry_tracking_fefo/job_cards REQ, installment_terms OPT); series INV/CN/RCP/GRN; WAC + batch/expiry/FEFO on, serial off; **zero-clinical-surface gate** (no clinical term keys in the seeded manifest; exact six-policy set) | **5/5 unit** | `manifest-healthcare-031.spec.ts` |
| T4 claim-ref capture — optional `claimRef` on the existing invoice create DTO + service; policy-gated: L1 `claim_ref_required_for_insured_invoices=true` + explicitly blank ref → typed `CLAIM_REF_REQUIRED`; absent ref = self-pay (null); provided ref persisted and read back | **DB 5/5 on real PG16** | `healthcare-031.db.spec.ts`, `sales-errors.ts`, `invoices.ts`, controller |
| T3 policies — the six workflow policies publish via the manifest L1 (`workflow_policies` auto-accepted by the resolver; L10 overrides validated fail-closed) | unit + DB (policy read from `resolveEffectiveConfig().policies`) | `resolve.ts`, DB spec test 2 |
| T6 report wiring — optional `groupByClaim` parameter added inside the EXISTING contracts `notes.aging`, `notes.maturity-calendar`, `partner.statement`; **no new report keys** (registry unchanged at 79) | tsc clean; contracts compile | `notes-installments/contracts.ts`, `operational/ar-ap.ts` |
| T6/T11 apply/switch through the unmodified engine — idempotent, audited (`template.applied`), L1 lands; BR-038 additive-only switch wholesale↔healthcare with hash change and switch-back; unknown → `TemplateNotFoundError` | DB spec tests 2–4 | `healthcare-031.db.spec.ts` |
| T9 negative ledger proof — `journal_entries` count = 0 around apply AND switch AND all claim-ref DRAFT creates (INV-022 machine-checked) | asserted in DB spec | same |
| T11 UI — config-only healthcare preset (visits, payer invoices, claims-by-insurer, expiry control, pharmacy counter, claim cheques — all existing routes) + 8 bilingual dict keys | web tsc clean | `apps/web/lib/industry-presets.ts`, `i18n/dictionaries.ts` |
| Regression — sales golden/operations suites unchanged and green with the new column | configuration+sales DB **49/49** | vitest.db.config |
| Full api unit sweep | **363/363 (55 files)** | vitest run |
| api tsc + web tsc | clean / clean | `tsc --noEmit` |
| docs validation | **29/29** | `corepack pnpm docs:validate` |

## Honest residual (CI-class / not claimed)

- T8 full claim-lifecycle e2e (visit → G-01/G-03 → G-24 → G-25 → G-26 with line-asserted journals): the golden shapes remain owned and green by the PHASE-012/027 suites; PHASE-031 proves the new surface (claim_ref persistence, policy gate, zero-journal proof) on real PG. Full e2e re-run is CI-class.
- RTL/Playwright visual set for the healthcare screens: CI-class; preset data + dictionary parity proven.
- Report `groupByClaim` grouping rendering: parameter extension compiles and registry meta stays green; pixel-level grouping output is CI-class.

## Invariants preserved

INV-022 (zero ledger surface on config/claim-ref edits — proven), BR-038
(additive-only switch, audited), ADR-0005 (RLS untouched — additive column under
the existing row policy), ADR-0006/INV-021 (claim_ref is an external reference,
never a document number), ADR-0007 (no new journal shapes; DRAFT creates post
nothing), ADR-0009 (claim_ref is a string; no money fields), ED-07/ED-11 (zero
clinical data — machine-checked), no new permission keys, no secrets, docs synced
(IMPLEMENTATION_STATUS, CURRENT_STATE, CHANGELOG, NEXT_ACTION → PHASE-032).
