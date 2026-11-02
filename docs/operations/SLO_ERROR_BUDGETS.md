# SLOs & Error-Budget Policy (finalized in PHASE-025, T9)

Supersedes the "candidate" table in [MONITORING.md](MONITORING.md) §5. SLOs go
live at GA; until then the same metrics run as budgets-without-teeth.

| SLO | Target | Window | Error budget | Consequence on exhaustion |
|-----|--------|--------|--------------|---------------------------|
| API availability (non-5xx, LB-level) | 99.9% | monthly | 0.1% | Feature releases pause; fixes only (RELEASE_STRATEGY) |
| API latency p95 | within NFR-006 per route group | monthly | per-budget | Burn 4× → page + capacity review |
| Posting success | ≥ 99.99% of engine attempts; **zero** invariant failures | monthly | 0.01% | Any invariant failure is Sev-1 regardless of budget (RISK-009) |
| Backup + restore-smoke | 100% of scheduled runs | monthly | 0 | Missed smoke blocks next release pre-flight |
| Sync push success (PHASE-020+) | ≥ 99.5% within 24 h | monthly | 0.5% | Budget burn halts staged client rollouts |
| Report render SLA | per template budget (PHASE-013) | monthly | per template | Sustained breach → worker capacity action (ADR-0011) |

## Burn alerts

`SLOBurn` fires at 2× (Sev-2) and 4× (Sev-1) monthly burn — wired in
MONITORING.md §3, runbook link: TROUBLESHOOTING.md §api. Load-test burn-rate
evidence must show the monthly budget intact **with 2× headroom**
(PERFORMANCE_TEST_PLAN §5) — evidence pending the staging full-load run
(GA gate item 1 / 6, currently INCOMPLETE — see GA_GATE_CHECKLIST.md).

## Policy

When an error budget is exhausted: feature deploys freeze, only fixes ship,
until the budget recovers or a decision record names a compensating action.
Recorded in the GA release checklist (GA gate item 6).
