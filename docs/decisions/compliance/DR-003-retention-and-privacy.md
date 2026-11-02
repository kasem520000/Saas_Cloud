# DR-003 — Data-retention period after tenant offboarding & privacy notices (OQ-009)

> **Status:** DRAFT — BLOCKED on legal review (recorded honestly per PHASE-024
> acceptance rule 9: "decision record filed **or honestly BLOCKED with reason
> and owner**"). · **Date:** 2026-11-02 · **Owner:** platform compliance
> (legal review pending per jurisdiction) · Resolves: OQ-009.

## Working assumption (until this record is approved)

**90 days after offboarding, then hard delete**, with the documented purge
job (grace → export with manifest/checksums → suspension → retention window →
purge with deletion certificate → platform audit trail). Legal-hold flag
blocks the purge (gate implemented + unit-tested: `purge-guard.ts`).

## Decision options

- **A (working assumption):** 90-day retention then hard delete across DB,
  object storage, secret-store certificate paths, and logs.
- **B:** jurisdiction-specific longer retention (e.g., tax records 5–10 years
  in some markets) — requires per-jurisdiction pack rows.
- **C:** shorter retention with export-only handoff.

## Required inputs (unmet — hence BLOCKED)

1. Legal review per launch jurisdiction (KSA, Yemen initially) of the
   retention period and the privacy-notice wording (AR+EN drafts prepared in
   `docs/security/DATA_PROTECTION.md` §notices).
2. Confirmation that the purge job covers certificate paths
   (SECRETS_MANAGEMENT §6.6) — staging drill F-024-004.

## Impact when approved

Updates `docs/security/DATA_PROTECTION.md`, USER_JOURNEYS Journey H wording,
and the purge job's retention constant.
