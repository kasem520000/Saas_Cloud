# PHASE-021 — Completion Report: Desktop Application (Tauri v2, Windows)

Date: 2026-11-02 · Branch: `arena/6a317de3-saas-cloud` · Phase doc:
[PHASE-021.md](../PHASE-021.md) · ADR: [ADR-0013](../../../architecture/ADR/ADR-0013-tauri-desktop.md)

## Scope statement (honest)

This sandbox has **no Rust toolchain, no Windows, no WebView2, no Tauri build,
no Playwright/Chromium**. What follows is the **server-side-provable subset**,
fully implemented and tested; every native/Windows-only item is listed as a
**CI-class deferral** with the exact artifact that will prove it. Nothing
below is claimed COMPLETE without evidence.

## Implemented and verified in-sandbox

| Task | Artifact | Evidence |
|------|----------|----------|
| T1 Tauri scaffold + static export | `apps/desktop/` (tauri.conf.json, src-tauri Cargo/main/webview2, capabilities), `apps/web` `TAURI_BUILD=1` export target + `scripts/build-tauri.mjs` (BFF excluded) + `scripts/check-tauri-export.ts` | Guard green: **86 files scanned, 0 violations** (3 BFF routes excluded by design); `TAURI_BUILD=1 next build` **compiles + typechecks successfully**; full `out/` generation blocked by dynamic `[id]` routes missing `generateStaticParams` — deferred (see below); web typecheck/lint clean |
| T2 SQLite local store | `packages/sync-core/src/sqlite-store.ts` + `schema.ts` — real **better-sqlite3**, WAL enforced, `integrity_check` on start, forward-only migrations in ONE transaction, `stageAndResetMachinery()` corruption path | **28/28 sync-core tests pass** on real SQLite, incl. IN_FLIGHT→QUEUED recovery, monotonic cursors, stage/reset |
| T3/T7 Keychain + credentials | `packages/sync-core/src/keychain.ts` — Keychain interface, KEYCHAIN_SERVICES (refresh token / device key / SQLite key), `MemoryTokenHolder` (access token memory-only, expires), one-time-use refresh rotation | Unit tests green; shell glue test 1/1 |
| T4 Sync host | `packages/sync-core/src/host.ts` — start/unlock cycle, connectivity debounce 5 s, periodic 120 s, post-write fast cycle, manual; read-only gate surfaced | Unit tests with fake timers/transport green |
| T5 Offline UI affordances | `apps/web/components/offline-status-badge.tsx` + AR/EN dictionary keys (online/offline/syncing/read-only/as-of/queued) | web typecheck + lint clean |
| T8 Updater gate (D-06) | `packages/sync-core/src/updater.ts` — signed-only, downgrade/unsigned fail **closed**, staged 10→50→100 via fingerprint bucket, crash-rate gate 2% halts rollout, minimum-version force-update | Unit tests green (all attack cases) |
| T10 Printer | `packages/sync-core/src/printer.ts` — ESC/POS builder (80/58 mm), wrap; reprint renders stored POSTED bytes only, never re-numbers | Unit tests green |
| T11 WebView2 probe | `packages/sync-core/src/webview2.ts` + `src-tauri/src/webview2.rs` registry read — min 120.0.0.0, recommended 130 | Version-logic unit tests green; live registry probe is CI-class |
| T12 CI release engineering | `.github/workflows/ci-desktop.yml` — windows-latest, CalVer, sync-core+desktop tests, export guard+build, tauri build, CycloneDX SBOM, gitleaks, signpath NSIS + updater bundle (store-backed keys), staged manifest stage 10% | Workflow authored; execution is CI-class |
| T15 Docs | DEVELOPMENT_SETUP §11 (quickstart + system requirements), TROUBLESHOOTING §9, DEPLOYMENT §7 already covers rollout, FEATURE_CATALOG `offline.desktop_app` marked implemented, handoff docs | `pnpm docs:validate` **29/29 PASS** |

## Deferred (CI-class / native / Windows-only) — NOT claimed complete

1. **Signed NSIS installer + updater bundle on Windows CI** (T12 execution) —
   requires Windows runner + store-backed signing keys (S-15).
2. **SQLCipher encryption of `erp_local.db`** — the key wiring runs in the
   Tauri SQL plugin at shell start (key from keychain); `SqliteLocalStore`
   is encryption-agnostic and tested against plain SQLite here.
3. **Full `apps/web/out` static export** — `next build` with `TAURI_BUILD=1`
   compiles and typechecks, but dynamic `[id]` pages need
   `generateStaticParams`/`dynamicParams=false` per route before `out/` is
   emitted (BFF exclusion proven working: build progressed past the BFF error
   to the page-data stage).
4. **Chaos desktop matrix, kill-matrix, D-06 updater attack tests on real
   binaries, Playwright offline smoke (AR+EN), WebView2 live probe matrix,
   SBOM/gitleaks output** — all defined in the CI workflow and phase doc §6;
   they remain blocking in CI after this phase per the exit criteria.
5. **macOS/Linux** — out of scope this phase (decision record required).

## Invariants preserved

PHASE-020 wire contracts consumed unmodified (consumer, not author); sync
behavior untouched (`sync-core` cycle engine reused as-is — RISK-011 stays
dead); money as TEXT decimals (ADR-0009); no secrets in code/logs; no
fabricated data; RLS/posting-engine monopoly untouched (no server changes
this phase).

## Verification summary

- `@erp/sync-core`: **28/28** vitest (incl. real-SQLite store) · typecheck/lint clean
- `@erp/desktop`: shell glue **1/1** · typecheck clean
- `@erp/web`: `check:tauri-export` clean (86 files) · typecheck/lint clean · `TAURI_BUILD=1 next build` compiles + typechecks
- `pnpm docs:validate`: **29/29**
