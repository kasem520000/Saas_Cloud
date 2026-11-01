# Release Strategy

> **Status:** STABLE · **Owner:** Platform Architecture · **Updated:** 2026-10-28

## Release tiers and definitions

| Release | Definition | Content |
|---------|-----------|---------|
| **MVP (v1.0)** | First paid customers, KSA + UAE back-office segment | Phases 001–014 |
| **v1.x industry releases** | Quarterly post-MVP | POS + industry templates (015–017), manufacturing/CRM (018–019) |
| **v2.0 multi-platform** | Desktop + Android + offline field sales | 020–022 |
| **GA** | Compliance integrations + hardening + SLOs | 023–025 |
| **Enterprise Depth** | Post-GA platform depth & breadth: financial depth, industry expansion II, consolidation | 026–034 (stages 9–11) |

Each release ships only phases marked `COMPLETE` in
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) with evidence. **No release may
include partially verified phases.**

## Post-GA expansion releases (stages 9–11 — Blueprint v2.0)

Per [../EXPANSION_REGISTER.md](../EXPANSION_REGISTER.md), stages 9–11 (PHASE-026…034) are
**additive post-GA releases**: they never alter the MVP (PHASE-014) or GA (PHASE-025)
gates (ED-01) and may ship as independent releases as their phases complete:

- **Stage 9 — financial depth (PHASE-026…029)**: fixed assets, cheques/promissory notes &
  installments, budgeting, payroll (financial scope) — entitlement-gated modules rolled
  out per the existing feature-flag + cohort rules.
- **Stage 10 — industry expansion II (PHASE-030…033)**: wholesale, electronics,
  healthcare, education, agriculture commercial-shell templates — configuration-layer
  releases on the v1.x industry pattern.
- **Stage 11 — enterprise consolidation (PHASE-034)**: multi-entity consolidation
  (ADR-0018).

**Enterprise Depth gate (after PHASE-034)**: consolidated statements reconcile to member
books with eliminations proven (INV-026, golden G-32); payroll, fixed-assets, and
notes/installments suites green (INV-023…025, goldens G-21…G-31); zero cross-tenant
writes demonstrated (ADR-0018). The release ships only `COMPLETE` phases with evidence
and is tagged per the CalVer scheme like every other release.

## Branching & versioning

- Trunk-based: `main` always releasable; short-lived feature branches; PR reviews use
  the [code review template](../implementation/templates/CODE_REVIEW_TEMPLATE.md).
- Versioning: **CalVer for releases** (`v1.YY.MM.patch`) + semver for `packages/*`
  consumed by apps. API versions follow [../api/API_VERSIONING.md](../api/API_VERSIONING.md)
  (URL-prefixed major).
- Every completed phase is tagged `phase/NNN`; every release tagged `release/vX`.

## Rollout

1. Internal dogfood tenant → 5–10 design-partner tenants (staging data isolation) →
   general availability by cohort.
2. Feature flags + entitlement gating for staged exposure of new modules.
3. Desktop/Android: staged rollout channels (10% → 50% → 100%) with crash-rate gates.
4. Migrations: expand-contract; never a destructive step in the same deploy that serves
   traffic (see [../database/MIGRATION_STRATEGY.md](../database/MIGRATION_STRATEGY.md)).

## Quality gates per release

- CI green (unit/integration/E2E/visual AR+EN/tenant isolation/accounting invariants).
- Migration rehearsal on staging succeeded.
- Security checklist: dependency audit, SAST, new-endpoint permission review.
- Performance smoke against NFR-006 budgets.
- Documentation freeze: IMPLEMENTATION_STATUS + CHANGELOG updated; docs validation
  script (link/section checks) passes.

## Communication

- Release notes generated from `CHANGELOG.md` entries (user-facing, bilingual).
- Breaking API changes: deprecation window per [../api/API_VERSIONING.md](../api/API_VERSIONING.md);
  never break offline clients mid-rollout (they lag).

## Rollback

- Apps/API: redeploy previous image (DB-compatible by expand-contract).
- Clients: force-update via minimum-version enforcement (ADR-0014/0013 channels).
- Data: documented per-phase rollback notes; forward-fix preferred over restore;
  restore-from-backup is the last resort with incident process
  ([../security/INCIDENT_RESPONSE.md](../security/INCIDENT_RESPONSE.md)).
