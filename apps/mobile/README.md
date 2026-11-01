# apps/mobile — Expo React Native / Android (PHASE-022)

Placeholder directory. The Android application (Expo) is implemented in
[PHASE-022](../../docs/implementation/phases/PHASE-022.md) under
[ADR-0014](../../docs/architecture/ADR/ADR-0014-expo-android.md). It will import
`@erp/contracts` and `@erp/domain-core` only — never `packages/ui`
(DEPENDENCY_RULES §3). No code lives here until then, by design.
