# PHASE-023 — Completion Report: External Integrations & E-Invoicing

Date: 2026-11-02 · Branch: `arena/6a317de3-saas-cloud` · Phase doc:
[PHASE-023.md](../PHASE-023.md)

## Status: COMPLETE for the ungated scope / INCOMPLETE for the gated adapters (split recorded, per the phase's own rules)

The **no-fabrication rule held absolutely**: no ZATCA/ETA wire format was
guessed. DR-001 (ZATCA scope) and DR-002 (payment provider) are OPEN, and the
verification gate (pinned official specs, sandbox runs, legal review,
two-person sign-off) cannot pass in this sandbox — official authority sources
are unreachable here. Per §2 rule 3, the ZATCA adapter ships as an
**UNVERIFIED refuse-to-submit stub** and is marked INCOMPLETE below.

## Implemented and verified in-sandbox

| Task | Artifact | Evidence |
|------|----------|----------|
| T1 registry lifecycle | `tax/domain/submission-lifecycle.ts` — legal transitions only (`IllegalTransitionError`), retry policy, DLQ threshold, `CircuitBreaker` | 7/7 unit tests |
| T1/T2 orchestrator | `tax/submissions/submission-orchestrator.ts` — registry idempotency (one row per source), audit on every transition, FAILED→retry→dead-letter | 7/7 incl. idempotency + DLQ |
| T11 fake-authority harness | `submissions/__tests__/fake-authority-harness.spec.ts` — ACCEPT stores uuid, REJECT surfaces codes, TIMEOUT→backoff→DLQ | 3/3 |
| T4 ZATCA (gated) | `tax/adapters/zatca/unverified-zatca-adapter.ts` — refuses with `UNVERIFIED_REGIME`, never submits | asserted in tests |
| T12 chaos slice (real PG) | `__db__/tax/einvoicing-registry.db.spec.ts` — X-01 duplicate submission dedupes to ONE row (no double-clearance), X-02 RLS-scoped read | **2/2 on embedded PG16** |
| T6 payment | `tenancy/__tests__/payment-fallback.spec.ts` — webhook signature round-trip, tampered body rejected, stale timestamp rejected, manual fallback path independent of the adapter flag | 4/4 |
| T7 bank parser | `treasury/infrastructure/bank-adapters/sa-ncb.ts` — fixed-column parser, malformed rows PARKED (never guessed amounts), BOM tolerant, registered in `BANK_ADAPTERS` | 3/3 |
| T8 commerce/shipping ports | `sales/adapters/commerce/ports.ts` + fakes — upsert by channel order id, batch Idempotency-Key dedupe, decimal-text price/stock | 4/4 |
| T13 rollout gate | `tax/rollout/adapter-flags.ts` — default OFF, jurisdiction match, cert-provisioned required | 4/4 |

## INCOMPLETE (named unmet items — never silently omitted)

1. **ZATCA adapter** — unmet: DR-001 decision (OPEN), pinned official spec/SDK
   versions, sandbox submission evidence, legal content review, two-person
   sign-off. Ships as UNVERIFIED stub. Follow-up slot: DR-001 + verification
   log.
2. **Payment production cutover** — unmet: DR-002 provider selection (OPEN).
   Sandbox adapter hardened; manual fallback proven independent. Follow-up:
   DR-002.
3. **Egypt ETA adapter** — evaluation pack only; no adapter code (RISK-007
   scope decided by record, not assumed).
4. **CI-class**: live-provider staging tests, signed-cert enrollment on real
   KSA sandbox, dashboard/alert live wiring, pen-test of adapter surface
   (PHASE-024 scope).

## Invariants preserved

Adapters read posted documents only (ADR-0007/0010 §4 — no business-table
writes from adapters); registry status is the sole authority-truth (never
inferred); money decimal text (ADR-0009); certificates remain S-10 handling —
no key material anywhere in this change; RLS on the registry table respected;
no compliance claim made anywhere without evidence.

## Verification summary

- New api unit tests: **25/25** across tax submissions/lifecycle, fake-authority,
  sa-ncb parser, commerce ports, rollout flags, payment fallback
- db chaos slice: **2/2** on embedded PG16
- `pnpm docs:validate`: **29/29** · api typecheck/lint clean
