# PHASE-027 Completion Report — Cheques, Promissory Notes & Installments

**Date:** 2026-11-02 · **Branch:** `arena/6a317de3-saas-cloud` · **Status:**
COMPLETE (full sandbox-provable scope).

## Evidence

| Task | Result | Evidence |
|------|--------|----------|
| T1 migration `0029_notes_installments_027.sql` (4 tables, RLS, append-only `note_events`, permissions) | applies on real PG; manifest 4/4 | `migrations/0029_*`, `migrations.spec.ts` |
| T2 custody state machine + INV-024 mirror sets | 14/14 domain tests | `notes/domain/custody-machine.ts` |
| G-24…G-28 journal builders, balance-checked | goldens in notes-goldens.spec (14/14) | `notes/application/journal-builders.ts` |
| T3–T6 service flows over ports: receive (G-24, foreign source → 404 zero-partial), deposit/collect (G-25, deposit posts zero journal), dishonor (G-26 reason-required + exact AR restore + fee), endorse zero-ledger-delta (BR-047), issued pair (G-27) | 5/5 flow tests | `notes/__tests__/note-service-flows.spec.ts` |
| T8–T11 installment flows: BR-048 total equality + activation lock, collections with INV-016 bounds, job-derived OVERDUE only, waive reason+audit, G-28 flat fee (cap, no compounding) | 3/3 + schedule tests | `installments/application/plan-service.ts` |
| T12 RC-11 register↔GL tie (pure + wired; BROKEN blocks lock PC-04) + 5 report contracts registered | registry meta-tests 50/50 (74 contracts) | `notes/domain/reconcile.ts`, `reconciliation-service.ts`, `registry/notes-installments/contracts.ts` |
| T14 UI scaffold: notes list + installments plans pages, AR/EN keys | web tsc clean | `apps/web/app/[locale]/{notes,installments}/` |
| T15 isolation: 4 tables registered; A1–A10 as erp_app incl. append-only note_events | **888/888 on real embedded PG** | `isolation/identity-isolation.db.spec.ts` |
| Full api unit / api+web tsc / docs | 335/335, clean, clean, 29/29 | repo |

## Honest residual (CI-class, documented)

- pg-boss PDC-calendar/overdue job bindings and HTTP controllers are thin
  bindings over the proven services; Playwright baselines CI-class.
- Late-fee policy defaults remain PLACEHOLDER per OQ-002 family (flat fees
  only — no interest path exists, DR-003 riba stance).

## Invariants preserved

ADR-0007 (JournalSpec-only; cash_movements stay treasury-owned), ADR-0009,
INV-024 (custody↔ledger equality; journal-bearing events enumerated),
INV-013 idempotency via engine source keys, RLS proven by attack suite,
BR-046/047/048/049 enforced, no secrets, no fabricated results.
