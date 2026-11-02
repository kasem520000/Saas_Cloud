# Completion Report — PHASE-015

> **Status:** COMPLETE (all locally-runnable evidence green; the browser-bound
> `render.spec.ts` suite is recorded as environment-bound — Chromium binary
> unavailable in the sandbox, same class as hosted-CI evidence) ·
> **Updated:** 2026-11-02

| Field | Value |
|---|---|
| Phase ID / Date | PHASE-015 — Industry Configuration Framework & Priority Templates · 2026-11-02 |
| Summary | Ten-layer fail-closed configuration resolution engine with deterministic `resolved_hash`; three priority template manifests (retail/grocery/restaurant v1.0.0) seeded and CI-validated; idempotent, audited, additive-only template apply/switch (BR-038) with REQUIRED-revocation blocking and phase-gated POS keys labeled "coming with PHASE-016"; the three industry reports registered (no orphan pins); admin templates page + onboarding industry step + nav item; ENTITY_CATALOG + isolation coverage for the new tables; permissions drift 228=228. |
| Files created / changed | (below) |
| Database migrations | `0022_industry_configuration.sql` — RLS'd tenant table `tenant_industry_config`, global `feature_flags`, 3 seeded manifests, 4 configuration permission keys (also added to the normative `0004` seed), owner role grants, schema-state 22 |
| API changes | `/api/v1/configuration/effective-config`, `templates`, `template`, `templates/:key/preview|apply|switch` — all in ROUTE_PERMISSIONS; report registry 48→51 contracts (`inventory.expiry_list`, `grocery.expiry_writeoff`, `retail.imei_register`); `InventoryQueriesService.expiryWriteoffs`; REPORT_KEY_PATTERN accepts snake_case industry subjects |
| UI changes | `/[locale]/configuration/templates` admin page (list/preview/apply/switch), onboarding industry step, nav item `settings.templates`, AR/EN dictionary keys (parity green) |
| Security changes | New tables under `erp.apply_tenant_policy` + isolation-suite probes (648 green); manifest jsonb read-only to `erp_app`; L6 overlay never cached across principals; fail-closed resolution (no partially-resolved config served); templates never grant entitlements |
| Tests executed | unit suite, db suite, permissions-drift, docs:validate, full `pnpm gate:local` |
| Actual test results | unit 163 PASS (incl. 9 configuration specs: manifest schema + resolution engine + pinned-report resolution) · db 1124 passed / 2 skipped (only `reporting/render.spec.ts` environment-bound) · migrations manifest 4/4 · migrations.db 7/7 · isolation 648/648 · permissions-drift 228=228 · docs:validate 29/29 · gate:local all non-browser steps GREEN |
| Build results | api + web + contracts typecheck green; api + web lint clean; i18n parity green |
| Acceptance criteria | 9/9 PASS (mapping below) |
| Evidence | this report; `/tmp/gate015c.log` (full gate output); unit/db runs in agent session |
| Known limitations | POS module remains OUT of scope (phase-gated, PHASE-016); `treasury.shift_cash_reconciliation` and `restaurant.*` report pins are PHASE-016 targets, not contracts yet; browser render evidence is hosted-CI-bound |
| Deferred work | PHASE-016+ (identified only): POS counter, table service, kitchen display |
| Next eligible phase | PHASE-016 |

## Acceptance criteria mapping

1. **Ten layers + precedence + deterministic hash** — `resolution-engine.spec.ts` (precedence L10>L5>L1>default, hash determinism, L6 overlay excluded from hash, L9 derivation) — PASS.
2. **Invalidation events drop the correct cache scope** — config-events/config-cache covered in the configuration unit specs; db suite re-verified — PASS.
3. **Three manifests validate + idempotent apply + golden hash** — `manifest-schema.spec.ts` + `template-apply.db.spec.ts` (T4/T5: seeded manifests validate, apply idempotent + audited + reflected in effective config with stable `resolved_hash`) — PASS.
4. **Additive-only switching (BR-038/INV-021)** — db spec T6: retail→grocery archives read-only, settings untouched, switch back works — PASS.
5. **REQUIRED missing blocks with guidance; phase-gated labeled** — db spec T7 (`TemplatePrerequisitesMissingError` with missing chain; phase-gated keys labeled not blocking) — PASS.
6. **Config-fuzz INV-022** — fail-closed negatives in unit specs (L2-only tax keys rejected, unknown template → `TemplateNotFoundError`); isolation suite extended — PASS.
7. **Industry reports registered, no orphan keys** — `inventory.expiry_list`, `grocery.expiry_writeoff`, `retail.imei_register` in the registry (51 contracts; meta-test asserts every non-phase-gated pin resolves) — PASS.
8. **Route permissions + derived-only UI** — 6 configuration routes in ROUTE_PERMISSIONS; nav item gated by `configuration.config.read` + `industry.template_engine`; drift 228=228 — PASS.
9. **Catalogs updated same phase** — ENTITY_CATALOG rows (`tenant_industry_config`, `feature_flags` | 015), AUTHORIZATION_MATRIX §3.8 rows, migrations.db 7/7, docs:validate 29/29 — PASS.

## Files created (selected)

- `apps/api/migrations/0022_industry_configuration.sql` (+ `0004` seed rows, `migrations.ts` manifest entry)
- `apps/api/src/modules/configuration/` — domain (industry-manifest, resolution-engine, feature-catalog, settings-schema), application (configuration.service, template-apply.service, config-cache, config-events), infrastructure (template registry/store), presentation (controller, 6 routes)
- `apps/api/src/modules/reporting/registry/operational/industry.ts` + registration in `registry/index.ts`; `runtime.ts` snake_case key pattern
- Specs: `manifest-schema.spec.ts`, `resolution-engine.spec.ts`, `__db__/configuration/template-apply.db.spec.ts`, isolation registry extension
- Web: `app/[locale]/configuration/templates/page.tsx`, `components/template-picker.tsx`, onboarding industry step, nav item, dictionary keys

## Notes

- Report-key pattern change is deliberate and documented: industry report keys
  (`inventory.expiry_list` etc.) are snake_case per
  `docs/industries/reports/README.md`; the kebab-case-only regex was relaxed to
  allow `[a-z0-9]+([-_][a-z0-9]+)*` subjects.
- `inventory.stock_valuation` pins in the manifests were normalized to the
  registered contract id `inventory.valuation` (no orphan pins).
