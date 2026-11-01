# PHASE-014 Worklog — Subscription, Billing, Onboarding & Dashboards (MVP)

Started 2026-11-01 on branch `arena/6a317de3-saas-cloud` (base `366a3b1` = PHASE-013).
Method: same as PHASE-004…013 — phase doc is the contract (PHASE-014.md §2/§5/§6);
additive migration first, then API (tenancy billing/usage/lifecycle + notifications
activation + read-only guard), then web surfaces, then tests, then docs + gate.

## Execution log

- [ ] T1 plans/entitlements/subscription wiring (seeds exist from 0008; lifecycle columns + status widening in 0021)
- [ ] T2 payment provider adapter port + sandbox checkout + signed webhook (replay-safe)
- [ ] T3 manual invoicing fallback (audited via_platform_admin)
- [ ] T4 subscription lifecycle state machine (TRIAL→ACTIVE→GRACE→SUSPENDED→restore) + PHASE-004 suspension wiring
- [ ] T5 read-only grace enforcement (guard + typed `subscription_read_only`; reports/exports exempt)
- [ ] T6 usage counters + §6 limit matrix (80/100 soft warn; hard block on creation only; posting NEVER blocked — property test)
- [ ] T7 public pricing pages (AR/EN) from plan seeds via GET /api/v1/public/plans
- [ ] T8 onboarding wizard completion + guided first invoice (Journey A6–A9 incl. print)
- [ ] T9 owner dashboard — KPI widgets bound to report contracts (current mode, pinned params)
- [ ] T10 notifications center (inbox + preferences + owner email) billing-critical event set
- [ ] T11 MVP security review + findings register (docs/security/MVP_SECURITY_REVIEW.md)
- [ ] T12 load smoke — local substitute harness (staging waived per owner directive 2026-10-28) + k6 script
- [ ] T13 backup-restore rehearsal — local drill script + record
- [ ] T14 MVP gate assembly + completion report + release tag + status docs

## Notes / decisions

- All prices/limits stay PLACEHOLDER (OQ-002); numbers come from plan seeds only.
- Documents/month counter: read-model incremented by the posting engine via the
  tenancy api port (boundary-safe: accounting application → tenancy api), wrapped so
  a counter failure can NEVER fail a posting (INV-022).
- Hard-block limit checks live in a central infra guard keyed by route annotations
  (identity cannot import tenancy — cycle — so invites are checked there).
- Infra-bound evidence (hosted CI, staging k6, compose boot) stays waived to first
  infra availability per the standing owner directive; local substitutes recorded.

## Update 2026-11-02 (continuation)
- Fixed subscription-billing.db.spec.ts typecheck errors; fixed runtime issues found by running it:
  - migration 0021: added 'checkout.session.completed' to ck_billing_events_type; added platform_select RLS policy on "subscriptions" (erp.platform_scope_active()) for the sweep due-scan; fixed statement-breakpoint separators (`-->` per repo convention).
  - billing.store transitionSubscription: ANY(array) → IN (sql.join(...)) (pg driver error).
  - subscription-lifecycle sweep due-scan now uses the platform tx; LifecycleService suspend/restore actorId widened to `string | null`; AuditEventInput.actorId `string | null`; sweep passes null system actor; billing-service platform audit actorId null for manual payment.
  - spec: real owner userId as actor (audit FK), superuser trial/grace forcing, Number() on bigint counters, owner role key for seeded memberships.
- New specs GREEN: billing-unit 12/12; subscription-billing.db 10/10.
- Regression fixes in existing specs after TRIAL-at-registration: tenancy-provisioning.db.spec + entitlements.db.spec now assert status='TRIAL' (+trial_ends_at).
- Full test:db: 62/63 files, 1113 passed / 2 skipped; ONLY failure = reporting/render.spec.ts (Playwright Chromium binary unavailable in sandbox — network allowlist blocks CDN; environment-bound evidence).
- pnpm typecheck + pnpm lint in apps/api PASS (Math.floor → `| 0` in new specs).

## Update 2026-11-02 (web + docs + gate)
- API: platform tenant detail now includes open invoices (manual-payment UI); typecheck PASS.
- Web: new pages /pricing (public, config-driven), /billing (subscription+usage+history+checkout/change-plan actions), /notifications (inbox+unread+preferences); dashboard KPI widgets on home (server-side POST reporting/report-runs, Money via domain-core); Journey A checklist on /onboarding; platform manual-payment panel on tenant detail; nav items home.notifications + settings.billing; AR/EN dictionary keys added (parity gate green). Web typecheck + lint PASS.
- T11: docs/security/MVP_SECURITY_REVIEW.md — pnpm audit 24 advisories, 0 critical in prod runtime closure (multer/uuid triaged with reasons), drift 224=224.
- gate:local — all non-browser steps GREEN (typecheck, lint, depcruise, permissions-drift, unit, test:db, build, contrast, i18n-parity, ui-catalog, docs 29/29, boundary negatives). Browser-bound steps (ui visual harness, web CSP script-exec probe, render.spec) fail ONLY on missing Chromium binary (CDN blocked) — environment-bound, hosted-CI class.
- Docs: PHASE-014-COMPLETION.md written; IMPLEMENTATION_STATUS.md (PHASE-014 COMPLETE), CURRENT_STATE.md, NEXT_ACTION.md (next = PHASE-015, identify only), CHANGELOG.md updated; docs:validate 29/29.
