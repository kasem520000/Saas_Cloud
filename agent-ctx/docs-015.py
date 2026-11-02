import io, re

# ---------- 1) IMPLEMENTATION_STATUS.md: PHASE-015 row ----------
p = "docs/planning/IMPLEMENTATION_STATUS.md"
s = io.open(p, encoding="utf-8").read()
old = "| PHASE-015 | Industry Framework & Templates | NOT_STARTED | — | |"
new = ("| PHASE-015 | Industry Configuration Framework & Priority Templates | COMPLETE | 2026-11-02 | "
       "2026-11-02 — migration `0022_industry_configuration.sql` (RLS'd `tenant_industry_config` + global "
       "`feature_flags`, seeds `industry.retail`/`grocery`/`restaurant` v1.0.0 manifests, 4 configuration "
       "permission keys in the normative 0004 seed + owner grants, drift 228=228) + the `configuration` "
       "module: ten-layer fail-closed resolution engine with stable `resolved_hash` (L10>L5>L1>default, L6 "
       "overlay never cached across principals, L9 derivation), manifest zod schema + hash, template "
       "apply/switch service (idempotent, audited, additive-only BR-038, REQUIRED-revocation blocks with "
       "guidance, phase-gated keys labeled PHASE-016), 6 routes under `/api/v1/configuration` in "
       "ROUTE_PERMISSIONS; T10 industry reports `inventory.expiry_list`, `grocery.expiry_writeoff`, "
       "`retail.imei_register` registered (registry 48→51, snake_case industry keys allowed per "
       "docs/industries/reports/README.md); ENTITY_CATALOG rows + isolation-suite coverage for both new "
       "tables; web `/configuration/templates` admin page + onboarding industry step + nav item "
       "`settings.templates` + AR/EN dictionary parity; unit 163 PASS (incl. 9 configuration specs), db "
       "1124 passed/2 skipped (render.spec browser-bound: Chromium unavailable in sandbox), "
       "permissions-drift 228=228, docs validation green; evidence: reports/PHASE-015-COMPLETION.md; tag `phase/015` |")
assert old in s
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("status ok")

# ---------- 2) CURRENT_STATE.md ----------
p = "docs/handoff/CURRENT_STATE.md"
s = io.open(p, encoding="utf-8").read()
old = "- **Application code: PHASE-001 … PHASE-014 (all COMPLETE).** PHASE-014 (2026-11-02, tag `phase/014`) added the commercial machinery:"
new = ("- **Application code: PHASE-001 … PHASE-015 (all COMPLETE).** PHASE-015 (2026-11-02, tag `phase/015`) added the industry "
       "configuration framework: migration `0022` (RLS'd `tenant_industry_config`, global `feature_flags`, 3 seeded priority "
       "template manifests, 4 configuration permission keys — drift 228=228), the ten-layer fail-closed resolution engine with "
       "stable `resolved_hash`, idempotent/audited additive-only template apply/switch (BR-038), the 3 industry report contracts "
       "(registry 48→51), web `/configuration/templates` + onboarding industry step, isolation-suite coverage for the new tables. "
       "Evidence: `docs/implementation/phases/reports/PHASE-015-COMPLETION.md`. PHASE-014 (2026-11-02, tag `phase/014`) added the commercial machinery:")
assert old in s
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("current ok")

# ---------- 3) NEXT_ACTION.md ----------
p = "docs/handoff/NEXT_ACTION.md"
s = io.open(p, encoding="utf-8").read()
old = """**Execute PHASE-015** per
[../implementation/phases/PHASE-015.md](../implementation/phases/PHASE-015.md)
(identified only — not started). PHASE-014 is COMPLETE (2026-11-02, tag `phase/014`;"""
new = """**Execute PHASE-016** per
[../implementation/phases/PHASE-016.md](../implementation/phases/PHASE-016.md)
(identified only — not started). PHASE-015 is COMPLETE (2026-11-02, tag `phase/015`;
evidence: reports/PHASE-015-COMPLETION.md): industry configuration framework live — ten-layer
fail-closed resolution with stable `resolved_hash`, 3 priority templates (retail/grocery/restaurant)
with idempotent audited additive-only apply/switch, phase-gated POS keys labeled PHASE-016,
3 industry reports registered, admin + onboarding UI, drift 228=228, gate non-browser steps green.
PHASE-014 is COMPLETE (2026-11-02, tag `phase/014`;"""
assert old in s
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("next ok")

# ---------- 4) CHANGELOG.md ----------
p = "docs/handoff/CHANGELOG.md"
s = io.open(p, encoding="utf-8").read()
marker = "- 2026-11-02 — **PHASE-014"
entry = ("- 2026-11-02 — **PHASE-015 — Industry Configuration Framework & Priority Templates (COMPLETE, tag `phase/015`)**: "
         "migration `0022_industry_configuration.sql` (RLS'd `tenant_industry_config` + global `feature_flags`; seeds "
         "`industry.retail`/`industry.grocery`/`industry.restaurant` v1.0.0 manifests; 4 configuration permission keys in the "
         "normative 0004 seed + owner role grants — permissions drift 228=228); `configuration` module: ten-layer fail-closed "
         "resolution engine with deterministic `resolved_hash` (L10>L5>L1>default; L6 request overlay never cached across "
         "principals; L9 derivation from L1), manifest zod schema + sha hash, template apply/switch service (idempotent, audited, "
         "additive-only per BR-038, REQUIRED-revocation blocks with guidance, phase-gated entries labeled coming with PHASE-016); "
         "6 routes under `/api/v1/configuration` in ROUTE_PERMISSIONS; T10 industry reports `inventory.expiry_list`, "
         "`grocery.expiry_writeoff`, `retail.imei_register` registered (report registry 48→51; snake_case industry keys allowed "
         "per docs/industries/reports/README.md); ENTITY_CATALOG rows + isolation-suite coverage (648 probes) for both new "
         "tables; web `/configuration/templates` admin page (list/preview/apply/switch), onboarding industry step, nav item "
         "`settings.templates`, AR/EN dictionary parity; unit 163 PASS (9 configuration specs), db 1124 passed/2 skipped "
         "(render.spec browser-bound: Chromium unavailable in sandbox), gate non-browser steps green. Evidence: "
         "`docs/implementation/phases/reports/PHASE-015-COMPLETION.md`.\n\n")
assert marker in s
s = s.replace(marker, entry + marker, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("changelog ok")
