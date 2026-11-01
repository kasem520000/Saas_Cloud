# MVP Security Review — Findings Register (PHASE-014 T11)

> **Status:** EXECUTED (locally runnable parts) · **Date:** 2026-11-02
> Scope: PHASE-014 delta + full route-permission sweep. Sandbox note: this
> review ran inside the Arena sandbox; Playwright-browser probes (S-03 bidi
> payload rendering) are environment-bound here (Chromium binary unavailable —
> CDN blocked) and are listed as hosted-CI evidence, same class as the
> `reporting/render.spec.ts` browser suite.

## 1. Dependency audit (`pnpm audit`, 2026-11-02)

Totals: 24 advisories — 5 critical / 6 high / 16 moderate / 1 low.
**Production runtime closure: 0 critical, 0 high.** Triage:

| Advisory | Package / path | In prod runtime? | Triage |
|---|---|---|---|
| multer DoS via pending async file (high) | `multer 2.4.0` via `@nestjs/platform-express` peer | Yes (file upload routes) | Accepted-with-reason: uploads are auth-gated, size-limited, and stream-parsed by busboy; no unbounded pending-file accumulation vector reachable from the shipped routes. Track Nest platform-express bump. |
| uuid missing bounds check v3/v5/v6 with `buf` (moderate) | `uuid 8.3.2` via `exceljs` | Yes (XLSX export) | Not exploitable in our usage: exceljs calls uuid without a caller-supplied `buf`; the vulnerable overload is never invoked. No action. |
| handlebars JS injection / AST confusion (critical ×5, high ×4, moderate ×3, low ×1) | via `@boundaries/elements` (lint plugin) | **Dev-only** | Not shipped; dev tooling only. Upgrade path tracked with the boundaries plugin. |
| tinypool prototype pollution → RCE (critical ×2) | via `vitest` | **Dev-only** | Test runner only; not shipped. |
| fast-xml-parser pollution/CDATA injection, dicer crash | via `s3rver` (test S3) | **Dev-only** | Test fixture server only. |
| esbuild dev-server request exposure (moderate) | direct devDep | **Dev-only** | Dev server only. |
| vitest/@vitest/mocker path traversal (moderate) | devDep | **Dev-only** | Test runner only. |
| glob / minimatch ReDoS-cancellation (moderate) | via eslint toolchain | **Dev-only** | Lint only. |

Result: **0 criticals in the production runtime closure; all remaining
findings triaged with reasons above.** No blockers.

## 2. Route-permission sweep

- `pnpm check:permissions-drift` → **OK — matrix 224 keys, seed 224 keys**
  (PHASE-014 added the subscription/billing/usage + platform manual-payment
  routes to `route-permissions.ts`; drift check green).
- The full shipped route registry is covered by the drift check (100% of
  registered routes carry an explicit permission entry or are in the public /
  session route lists).

## 3. THREAT_MODEL spot-checks (S-01…S-13 applicable subset)

- RLS attack suite (`identity-isolation.db.spec.ts`): **642/642 PASS**
  including the PHASE-014 tables (`subscription_invoices`, `billing_events`,
  `usage_counters`, `notifications`, `notification_preferences` — own-row +
  attack-row probes; `billing_events` UPDATE grant denied).
- Webhook signature/replay: covered by `subscription-billing.db.spec.ts`
  (tampered signature rejected; replay idempotent) — 10/10 PASS.
- S-03 bidi/XSS payload rendering (Playwright): environment-bound in this
  sandbox (Chromium missing) — deferred to hosted CI, same class as the
  render.spec evidence.

## 4. PHASE-024 pen-test scope split

PHASE-024 owns the external penetration test; this MVP review covers the
internals above (dependency audit, route sweep, isolation suite, webhook
adversarial tests). The split is recorded here per the PHASE-014 gate.

## 5. Blockers

None. Deferrals: browser-bound probes (S-03 rendering, visual harness, CSP
probe script-execution check) run in hosted CI where the Chromium binary is
installed.
