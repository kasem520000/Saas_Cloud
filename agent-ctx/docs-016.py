import io

# IMPLEMENTATION_STATUS
p = "docs/planning/IMPLEMENTATION_STATUS.md"
s = io.open(p, encoding="utf-8").read()
import re
m = re.search(r"\| PHASE-016 \|[^\n]*\n", s)
print("016 row:", m.group(0)[:80] if m else None)
old = m.group(0)
new = ("| PHASE-016 | Point of Sale (POS + scoped offline slice) | COMPLETE | 2026-11-02 | "
       "2026-11-02 — migration `0023_pos_offline_slice.sql` (`pos_terminals` RLS'd registry, POS channel columns on "
       "`sales_invoices`/`cashier_shifts`, narrow sync slice `change_log`/`sync_cursors`/`sync_commands`, POS_TERMINAL "
       "device class, 4 pos.* permission keys in the normative 0004 seed — drift 232=232) + the `pos` module: terminal "
       "registry with lifecycle + device binding, online counter sale posting through the sales invoice chain "
       "(BR-005 autopost, INV-013 dedupe via sync_commands with result replay — C-01 green), narrow §11 sync slice "
       "(pull cursors / push ≤50 with per-item ACCEPTED-REJECTED-DEFERRED / revoked-device pre-execution DEVICE_REVOKED); "
       "T12 reports `pos.sales_by_terminal`, `pos.sales_by_hour`, `treasury.shift_cash_reconciliation` registered "
       "(registry 51→54); phase gate flipped to PHASE-016 (template POS entries resolve live); ENTITY_CATALOG rows + "
       "isolation suite 672 probes; web `/pos/terminals` admin + `/pos/counter` sale screen with honest offline banner; "
       "unit 163 PASS, db 1154 passed/2 skipped (render.spec browser-bound), docs:validate green, i18n parity "
       "1619=1619; evidence: reports/PHASE-016-COMPLETION.md; tag `phase/016` |\n")
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("status ok")

# CURRENT_STATE
p = "docs/handoff/CURRENT_STATE.md"
s = io.open(p, encoding="utf-8").read()
old = "- **Application code: PHASE-001 … PHASE-015 (all COMPLETE).**"
new = ("- **Application code: PHASE-001 … PHASE-016 (all COMPLETE).** PHASE-016 (2026-11-02, tag `phase/016`) added the POS "
       "module: terminal registry + counter sale posting through the sales chain + the narrow §11 offline sync slice "
       "(idempotent push with result replay, revoked-device rejection), 3 POS end-of-day reports, POS web screens, "
       "isolation coverage 672 probes, drift 232=232. Evidence: `docs/implementation/phases/reports/PHASE-016-COMPLETION.md`. ")
assert old in s
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("current ok")

# NEXT_ACTION
p = "docs/handoff/NEXT_ACTION.md"
s = io.open(p, encoding="utf-8").read()
old = """**Execute PHASE-016** per
[../implementation/phases/PHASE-016.md](../implementation/phases/PHASE-016.md)
(identified only — not started). PHASE-015 is COMPLETE"""
new = """**Execute PHASE-017** per
[../implementation/phases/PHASE-017.md](../implementation/phases/PHASE-017.md)
(identified only — not started). PHASE-016 is COMPLETE (2026-11-02, tag `phase/016`;
evidence: reports/PHASE-016-COMPLETION.md): POS module live — terminals, counter sale
through the sales chain, narrow offline sync slice with INV-013 dedupe, POS reports,
template POS entries un-gated. PHASE-015 is COMPLETE"""
assert old in s
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("next ok")

# CHANGELOG
p = "docs/handoff/CHANGELOG.md"
s = io.open(p, encoding="utf-8").read()
marker = "- 2026-11-02 — **PHASE-015"
entry = ("- 2026-11-02 — **PHASE-016 — Point of Sale (COMPLETE, tag `phase/016`)**: "
         "migration `0023_pos_offline_slice.sql` (RLS'd `pos_terminals`, POS channel columns on sales invoices/shifts, "
         "narrow sync slice `change_log`/`sync_cursors`/`sync_commands`, POS_TERMINAL device class, 4 pos.* keys — drift "
         "232=232); `pos` module: terminal registry lifecycle, counter sale via the sales invoice chain (BR-005 autopost), "
         "sync push with per-command idempotency + result replay (C-01), per-item typed results, revoked-device "
         "pre-execution rejection, pull cursors; reports `pos.sales_by_terminal` / `pos.sales_by_hour` / "
         "`treasury.shift_cash_reconciliation` (registry 51→54); phase gate flipped (POS template entries live); "
         "isolation 672 probes; web `/pos/terminals` + `/pos/counter` with honest offline banner; unit 163 PASS, db 1154 "
         "passed/2 skipped (render.spec browser-bound), i18n parity 1619=1619, gate non-browser steps green. Evidence: "
         "`docs/implementation/phases/reports/PHASE-016-COMPLETION.md`.\n\n")
assert marker in s
s = s.replace(marker, entry + marker, 1)
io.open(p, "w", encoding="utf-8").write(s)
print("changelog ok")
