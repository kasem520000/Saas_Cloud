# PHASE-022 — Completion Report: Android Application (Expo / React Native)

Date: 2026-11-02 · Branch: `arena/6a317de3-saas-cloud` · Phase doc:
[PHASE-022.md](../PHASE-022.md) · ADR: [ADR-0014](../../../architecture/ADR/ADR-0014-android-expo.md)

## Scope statement (honest)

No Android emulator/device farm, no EAS signing, no RN renderer in this
sandbox. Implemented and tested here is the **provable core**: project
scaffold, shared-package boundary, theme/i18n port with parity tests,
security/registration logic, local-store policies, sync scheduling, field-sales
validation + state machine, FCM adapter contract, CI pipeline, and a
mobile-device profile against the **real PG16** sync services. On-device and
store items are CI-class deferrals, listed below — none claimed complete.

## Implemented and verified in-sandbox

| Task | Artifact | Evidence |
|------|----------|----------|
| T1 scaffold + boundaries | `apps/mobile/` (app.json Android-only, package.json, eas.json) — depends on contracts/domain-core/sync-core ONLY | `pnpm --filter @erp/mobile lint` clean incl. `@erp/ui`/`react-dom` import ban |
| T2 theme port | `src/theme/tokens.ts` | parity test reads `packages/ui/src/tokens/tokens.ts` and asserts semantic values verbatim — **12/12 mobile tests** |
| T3 RTL/i18n | `src/i18n/index.ts` (AR/EN catalogs, digits policy latn/arab) + eslint physical-prop ban | AR/EN key parity test; RTL ban **negative-tested** (temp file with `marginLeft` → lint exit 1); lint clean |
| T4 auth/device | `src/auth/secure-store.ts` (SecureStore→Keychain), biometric unlock w/ PIN fallback, `src/device/registration.ts` capability subset | unit tests; mobile profile M-01/M-02/M-04 on real PG |
| T5 local store policies | `ReadOnlyLocalStore` (personal class refuses every write), LRU pruning ≤128 MB | unit tests incl. read-only refusal + eviction plan |
| T6 scheduler | `src/sync/scheduler.ts` — foreground 2 min, background ≤15 min Doze-safe, budgets 8 MB/2 MB/256 KB | unit tests |
| T7 field sales | `src/fieldsales/van-sale.ts` — LOCAL-VALID vs van snapshot (advisory), honest DRAFT_LOCAL→PENDING_SYNC→POSTED/REJECTED machine | unit tests |
| T8 companion | `capability-gate.ts` — approvals ONLINE-ONLY with reason, reads cached | unit tests |
| T10 rejection UX data | `src/reconciliation/rejection-actions.ts` — §3 table as data | parity test asserts every reason exists in CONFLICT_RESOLUTION.md |
| T11 FCM skeleton | `apps/api/.../notifications/application/fcm-adapter.ts` + spec | **3/3 contract tests** on fake provider (locale-before-call, unknown template fails closed, per-tenant quota) |
| T12 release CI | `.github/workflows/mobile-release.yml` (EAS build, Play staged 10→50→100 + crash gates, gitleaks) | workflow authored; execution CI-class |
| T13/T4 mobile profile on real PG | `apps/api/src/__db__/sync/mobile-profile.db.spec.ts` — M-01 capability subset persisted, M-02 attestation-lite trust flags, M-03 scoped pull on frozen contract v1, M-04 revoke kill switch | **4/4 on embedded PG16** (sync suite total 15/15) |

## Deferred (CI-class / device-farm) — NOT claimed complete

1. On-device chaos slices C-06/C-07/C-13 on the Expo/SQLite profile (emulator
   farm), T-03 scan-to-cart measurement on reference hardware.
2. Signed AAB via EAS/Play (store-backed keys, S-15), staged rollout execution,
   crash-reporting dashboard panels.
3. RN component tests, AR/EN visual parity snapshots, a11y suite (44 px targets)
   — renderer not available here.
4. SQLCipher encryption of the on-device DB (expo-sqlite + SecureStore key) —
   wiring runs on device; the store logic is tested on plain SQLite.
5. iOS — out of scope (decision record required).

## Invariants preserved

`sync-core` consumed unmodified (RISK-011); PHASE-020 wire contracts frozen;
personal-account class has no write path (ReadOnlyLocalStore hard-refuses);
money as decimal text (ADR-0009); secrets only in SecureStore; no fabricated
data; no server contract changes.

## Verification summary

- `@erp/mobile`: **12/12** unit/parity tests · typecheck/lint clean (RTL ban negative-tested)
- api: FCM adapter **3/3** · sync db suite (020 golden + 021 desktop + 022 mobile) **15/15** on embedded PG16 · api typecheck/lint clean
- `pnpm docs:validate`: **29/29**
