# Completion Report — PHASE-016

> **Status:** COMPLETE (all locally-runnable evidence green; the browser-bound
> `render.spec.ts` suite is environment-bound — Chromium binary unavailable in
> the sandbox, same class as hosted-CI evidence) · **Updated:** 2026-11-02

| Field | Value |
|---|---|
| Phase ID / Date | PHASE-016 — Point of Sale · 2026-11-02 |
| Summary | POS module delivered as the terminal layer over the sales module: RLS'd terminal registry with device binding and lifecycle; online counter sale posting through the PHASE-012 invoice chain (BR-005 autopost, journals via the centralized engine); the narrow §11 offline sync slice (pull cursors, push ≤ 50 with per-item typed results, per-command idempotency with result replay, revoked-device pre-execution rejection); 3 POS end-of-day reports registered; template POS entries un-gated (gate flipped to PHASE-016); web admin + counter screens with an honest offline banner. |
| Database migrations | `0023_pos_offline_slice.sql` — `pos_terminals`, `change_log`, `sync_cursors`, `sync_commands` (all RLS'd), POS channel columns on `sales_invoices`/`cashier_shifts`, `POS_TERMINAL` device class, 4 `pos.*` permission keys in the normative 0004 seed + owner grants |
| API changes | `/api/v1/pos/terminals` (GET/POST), `terminals/:id/activate|deactivate|bind-device`, `POST /api/v1/pos/sale`, `GET pos/sync/pull`, `POST pos/sync/push`, `GET pos/sync/status` — all in ROUTE_PERMISSIONS; report registry 51→54 |
| UI changes | `/[locale]/pos/terminals` (admin), `/[locale]/pos/counter` (sale screen + offline banner), nav items `pos.counter` + `pos.terminals`, AR/EN dictionary keys (parity 1619=1619) |
| Security changes | 4 new tenant tables under `erp.apply_tenant_policy` + 672-probe isolation suite; permissions drift 232=232; device revocation rejects pushes before execution (zero effects) |
| Tests executed | unit suite, db suite (incl. new `__db__/pos/pos-flow.db.spec.ts`), permissions-drift, docs:validate, i18n parity, full `pnpm gate:local` |
| Actual test results | unit 163 PASS · db 1154 passed / 2 skipped (only `render.spec.ts` environment-bound) · pos-flow suite 6/6 (terminal lifecycle, posted sale with channel fields + change_log + audit, C-01 replay with exactly-once invoice count, typed rejections, batch budget, revoked device, cursor pull) · isolation 672/672 · drift 232=232 · docs:validate 29/29 · i18n 1619=1619 |
| Build results | api + web + contracts typecheck green; api + web lint clean |
| Acceptance criteria | mapped below (chaos slice C-01/C-03/C-04/C-07/C-09/C-16 core proven server-side; browser/device chaos harness cells recorded as hosted-CI-bound) |
| Evidence | this report; `/tmp/gate016b.log`; pos-flow db suite output |
| Known limitations | Local SQLite store (sync-core package) and Tauri packaging are PHASE-020/021 per the §11 boundary; kitchen KDS screen is a roadmap extension (tickets only); full chaos harness (fault-injection proxy) is hosted-CI evidence; receipt print templates render through the PHASE-013 print service (snapshot tests browser-bound) |
| Deferred work | PHASE-017 (identified only); PHASE-020 generalized sync must accept this POS slice unchanged (§11) |
| Next eligible phase | PHASE-017 — Industry Templates: Automotive & Distribution |

## Acceptance criteria mapping

1. **Chaos slice**: C-01 (duplicate push → replay, zero new invoices) green in `pos-flow.db.spec.ts`; C-03/C-09 shapes proven via per-item REJECTED results + batch budget; C-04/C-07/C-16 device-side cells are hosted-CI-bound (harness), server-side dedupe layers proven. Partially environment-bound — recorded honestly.
2. **Offline sale 1:1 reconciliation**: `OFF-` number recorded on the invoice (`offline_receipt_no`) alongside the official number; sync_state `PENDING_SYNC` until posted — asserted in the db suite.
3. **State honesty**: `PENDING_SYNC` never renders as posted (web banner + outbox state; server asserts `sync_state`).
4. **INV-013 exactly-once**: duplicate idempotencyKey replays the original result; invoice count unchanged — green.
5. **BR-021 shift close**: treasury shift service reused unchanged (writes remain treasury-owned); variance journal path pre-existing — no POS deviation.
6. **Receipts AR/EN 80/58**: print templates via the PHASE-013 print service; AR/EN RTL snapshot tests are browser-bound (render.spec) — recorded.
7. **Perf budgets**: scan-to-line/submit perf fixtures are browser/harness-bound; server sale submit exercised in db suite within budget.
8. **Permissions server-side**: all 9 POS routes in ROUTE_PERMISSIONS; owner grants seeded; route×role checklist green; revoked device ⇒ `DEVICE_REVOKED` zero effects — green.
9. **Template activation**: phase gate flipped to PHASE-016; retail/grocery/restaurant POS entries resolve live (configuration suite green); back-office unchanged without the entitlement.
10. **Docs/catalogs**: ENTITY_CATALOG rows (016 / 016+020 split), AUTHORIZATION_MATRIX §3.8 rows, FEATURE_CATALOG intake keys `pos.table_service`/`pos.kitchen_display` added, docs:validate 29/29 — green.

## Files created (selected)

- `apps/api/migrations/0023_pos_offline_slice.sql`; `0004` seed rows; `migrations.ts` + journal
- `apps/api/src/modules/pos/` — domain errors, store, TerminalService, PosSaleService, SyncSliceService, controller, module
- `apps/api/src/__db__/pos/pos-flow.db.spec.ts`; isolation registry + spec extensions (672 probes)
- `apps/api/src/modules/reporting/registry/operational/pos.ts` + registration; sales-analytics/treasury-queries POS queries
- `packages/contracts/src/navigation.ts` — `pos.counter`, `pos.terminals` nav items
- Web: `app/[locale]/pos/terminals/page.tsx`, `app/[locale]/pos/counter/page.tsx`, `components/terminal-admin.tsx`, `components/pos-counter.tsx`, dictionary keys

## Boundary notes (§11)

- No generalized sync foundation built: no `inbox_commands` retention, no multi-device drafts, no change feeds beyond the POS group — PHASE-020 scope, untouched.
- No business logic in the sync transport: push handlers call the sales module service + posting engine only.
- Deviation to record for PHASE-020: none — the slice stays inside §11.
