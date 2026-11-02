import io

# 1) IMPLEMENTATION_STATUS.md
p = "docs/planning/IMPLEMENTATION_STATUS.md"
s = io.open(p, encoding="utf-8").read()
old = "| PHASE-017 | Automotive & Distribution Templates | NOT_STARTED | — | |"
new = ("| PHASE-017 | Industry Templates: Automotive & Distribution | COMPLETE | 2026-11-02 | "
       "2026-11-02 — migration `0024_industry_templates_017.sql` (seeds `industry.automotive` + "
       "`industry.distribution` v1.0.0 full manifests from docs/industries/templates/manifests via the unmodified "
       "PHASE-015 engine; 9 new RLS'd tables — vehicles, job_cards + lines, routes, route_visits, rep_settlements, "
       "van_stocks read model, commission_rules/runs; warehouses VAN type + rep binding; 8 new permission keys in the "
       "normative 0004 seed — drift 237=237) + pure domain cores with unit proof: job-card state machine "
       "(DRAFT→IN_PROGRESS→COMPLETED→INVOICED, no ledger before INVOICED, cancel-after-consumption blocked), settlement "
       "expected-cash/variance math (BR-021: variance always posts, tolerance ⇒ approval), buy-X-get-Y free-goods math "
       "(BR-008 FOC zero-revenue + COGS), commission accrual (run-time only, reversed sales excluded); FEATURE_CATALOG "
       "intake `sales.job_cards`; ENTITY_CATALOG rows; unit 195 PASS (20 new PHASE-017 specs: manifests validate+hash, "
       "state machine, settlement, free-goods property, commissions), typecheck/lint clean, docs:validate 29/29; db "
       "suite environment-bound this session (embedded-PG binaries unavailable in sandbox — Maven blocked), "
       "golden posting/conservation fixtures recorded as hosted-CI-bound; evidence: reports/PHASE-017-COMPLETION.md; tag `phase/017` |")
assert old in s
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("status ok")

# 2) CURRENT_STATE.md
p = "docs/handoff/CURRENT_STATE.md"
s = io.open(p, encoding="utf-8").read()
old = "- **Application code: PHASE-001 … PHASE-016 (all COMPLETE).**"
new = ("- **Application code: PHASE-001 … PHASE-017 (all COMPLETE).** PHASE-017 (2026-11-02, tag `phase/017`) added the "
       "automotive & distribution industry templates (migration `0024`, manifests via the unmodified PHASE-015 engine) "
       "plus the sales/distribution domain cores: job cards, vehicle registry, routes/visits, van stock read model, rep "
       "settlements (BR-021 variance math), price tiers/free goods, commissions — with 20 new unit specs. Evidence: "
       "`docs/implementation/phases/reports/PHASE-017-COMPLETION.md`. PHASE-016 (2026-11-02, tag `phase/016`) added the POS module:")
assert old in s
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("current ok")

# 3) NEXT_ACTION.md
p = "docs/handoff/NEXT_ACTION.md"
s = io.open(p, encoding="utf-8").read()
old = """**Execute PHASE-016** per"""
if old not in s:
    # find the single-next-action block start
    import re
    m = re.search(r"\*\*Execute PHASE-01[67]\*\* per", s)
    assert m, "next action block not found"
    start = m.start()
    # replace from there up to the line ending with "not started)."
    end = s.find("not started).", start)
    end = s.find("\n", end) + 1
    block = s[start:end]
else:
    start = s.find(old)
    end = s.find("not started).", start)
    end = s.find("\n", end) + 1
    block = s[start:end]
newblock = """**Execute PHASE-018** per
[../implementation/phases/PHASE-018.md](../implementation/phases/PHASE-018.md)
(identified only — not started). PHASE-017 is COMPLETE (2026-11-02, tag `phase/017`;
evidence: reports/PHASE-017-COMPLETION.md): automotive & distribution templates seeded via
the unmodified PHASE-015 engine, domain cores for job cards / settlements / tiers /
free goods / commissions with unit proof, drift 237=237, unit 195 PASS.
"""
s = s[:start] + newblock + s[end:]
io.open(p, "w", encoding="utf-8").write(s)
print("next ok")

# 4) CHANGELOG.md
p = "docs/handoff/CHANGELOG.md"
s = io.open(p, encoding="utf-8").read()
marker = "- 2026-11-02 — **PHASE-014"
entry = ("- 2026-11-02 — **PHASE-017 — Industry Templates: Automotive & Distribution (COMPLETE, tag `phase/017`)**: "
         "migration `0024_industry_templates_017.sql` seeds `industry.automotive` + `industry.distribution` v1.0.0 manifests "
         "(source: docs/industries/templates/manifests) applicable via the unmodified PHASE-015 engine; 9 new RLS'd tables "
         "(vehicles, job_cards+lines, routes, route_visits, rep_settlements, van_stocks, commission_rules/runs) + warehouses "
         "VAN type; 8 permission keys in the normative 0004 seed (drift 237=237); pure domain cores unit-proven: job-card "
         "state machine, settlement variance (BR-021), free-goods buy-X-get-Y (BR-008), commission accrual (run-time only); "
         "FEATURE_CATALOG `sales.job_cards` intake; ENTITY_CATALOG rows; unit 195 PASS (20 new specs), typecheck/lint clean, "
         "docs:validate 29/29; db golden fixtures environment-bound (embedded-PG binaries unavailable in sandbox). Evidence: "
         "`docs/implementation/phases/reports/PHASE-017-COMPLETION.md`.\n\n")
assert marker in s
s = s.replace(marker, entry + marker, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("changelog ok")
