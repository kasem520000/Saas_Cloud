# Security Findings Log (living, append-only)

PHASE-024 T1/T2 — every finding gets: id, title, severity, surface, source,
status, fix PR + regression links. SLAs: **Critical 7 days (release-blocking),
High 30 days, Medium 90 days, Low next release**; waivers only via decision
record. Never edited after the fact — status changes are new rows.

| ID | Date | Title | Severity | Surface | Source | Status | Fix / regression |
|----|------|-------|----------|---------|--------|--------|------------------|
| F-024-001 | 2026-11-02 | External pen test (SECURITY_TEST_PLAN §11 full scope) not executable in sandbox — external firm engagement + tenant-pair setup required | High | all surfaces | PHASE-024 T1 | OPEN — deferred to CI/staging engagement window; phase extends rather than narrows scope (§7) | pen-test report ingestion per T2 |
| F-024-002 | 2026-11-02 | `pnpm audit --prod`: 16 advisories (6 high: postcss ×2, multer, image-size ×2, +1; 9 moderate; 1 low) — none critical; all in build/upload/parsing deps | High | dependency tree | `pnpm audit --prod` 2026-11-02 | OPEN — 30-day SLA; triage: upgrade postcss/multer/image-size in next dep window; lockfile-lint gate added (0 prod wildcards) | scripts/ci/lockfile-lint.mjs |
| F-024-003 | 2026-11-02 | Secrets rotation drill (S-03/S-01/S-11) requires staging with real secret stores — not executable in sandbox; dual-accept window logic unit-proven | Medium | secrets lifecycle | PHASE-024 T6 | OPEN — drill scheduled in staging; runbook entry required | apps/api dual-accept.spec (3/3) |
| F-024-004 | 2026-11-02 | Tenant offboarding purge job end-to-end staging run (grace→export→suspend→retention→purge→cert paths→legal hold) not executable here; purge GATE logic (legal-hold blocks) unit-proven | High | tenancy purge | PHASE-024 T11 | OPEN — staging drill; gate tests green | purge-guard.spec (3/3) |
| F-024-005 | 2026-11-02 | gitleaks full-history scan is CI-only; local fast gate (scripts/ci/secret-scan.mjs) green: 700 files, 0 findings | Low | CI/CD | PHASE-024 T7 | local gate CLOSED; full-history OPEN in CI | secret-scan.mjs |
| F-024-006 | 2026-11-02 | CSP/headers probe (SECURITY_TEST_PLAN §8) is Playwright-bound — re-run deferred to CI on GA candidate | Medium | web/BFF headers | PHASE-024 T9 | OPEN — CI probe on all origins incl. bidi-spoofing payloads | test:web-security (CI) |
| F-024-007 | 2026-11-02 | ZATCA adapter surface ships as UNVERIFIED stub — pen-test of the adapter surface must cover the stub's refusal path | Medium | e-invoicing sandbox | PHASE-023 gate | OPEN — include in pen-test scope (stub refuses; assert) | unverified-zatca-adapter tests |

## Closed this phase (with regression tests)

| ID | Title | Severity | Proof |
|----|-------|----------|-------|
| F-024-C01 | MFA enforcement per role/plan (423 MFA_REQUIRED gate; plan overrides role; default optional) | — | mfa-policy.spec 7/7 |
| F-024-C02 | Lockout/rate-limit oracle: identical error shape, cheap pre-work rejection, per-key isolation | — | rate-limit-oracle.spec 4/4 |
| F-024-C03 | Dual-accept rotation window + old-secret canary fails after window | — | dual-accept.spec 3/3 |
| F-024-C04 | Forensic audit review answerable from audit_events (actor/entity filters, RLS-confined) on real PG | — | security-hardening.db.spec S-01/S-02 2/2 |
| F-024-C05 | Support sessions 100% audit-captured (open+close) — existing platform-lifecycle suite re-run | — | platform-lifecycle.db.spec |
| F-024-C06 | Purge gate: legal hold / retention / suspension / export manifest each block | — | purge-guard.spec 3/3 |
