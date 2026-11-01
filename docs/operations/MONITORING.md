# Monitoring

> **Status:** STABLE · **Owner:** Platform Operations · **Updated:** 2026-10-27

Operationalization of [../architecture/OBSERVABILITY.md](../architecture/OBSERVABILITY.md):
dashboards, the alert catalog with runbook links, on-call basics, SLO/error-budget
tracking, log retention, and the health-endpoint contract. Principles stay as in the
architecture doc: tenant-aware and privacy-safe logs, alerts that point to runbooks, and
observability wired from PHASE-001/002 as a phase exit criterion.

## 1. Dashboards inventory

| Dashboard | Introduced | Key panels | Purpose / thresholds |
|-----------|------------|-----------|----------------------|
| API golden signals | PHASE-002 | Request rate, error rate by class, p50/p95/p99 per route group, event-loop lag | Compare vs NFR-006 latency budgets; p95 breach pages the alert, doesn't just color |
| Database health | PHASE-002 | Pool saturation, connections by role, slow queries (>250 ms), cache hit ratio, statement timeouts | Slow-query panel feeds [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §database |
| Jobs & dead-letters | PHASE-002 | Queue depth per pg-boss category, attempts, retries, failed/expired (dead-letter) counts, worker heartbeat age | Heartbeat age > 5 min is a page; DLQ growth is ticket-or-page per §3 |
| Posting health | PHASE-007 | Documents posted/min by type, posting engine validation failures by invariant code, reversal rate | Invariant failures are **zero-tolerance** (RISK-009): any occurrence is Sev-1 |
| Backup success | PHASE-002 (config), MVP (drills) | Last dump age, restore-smoke result, PITR window oldest point, WORM config check | Feeds release pre-flight ([DEPLOYMENT.md](DEPLOYMENT.md) §1) and monthly attestation |
| Tenant isolation | PHASE-003 | **RLS denial counter — target 0**, policy-violation errors, cross-tenant 404-vs-403 audit | Any nonzero count is investigated immediately (RISK-010) |
| Sync health | PHASE-020 | Push success/latency, pull cursor lag by entity, conflicts by type, rejected pushes by reason code | Feeds [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §sync |
| E-invoicing funnel | PHASE-023 | Submissions by state (pending→signed→submitted→accepted/rejected), latency, rejection reasons, certificate-expiry countdown, sandbox-vs-prod health | Feeds [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §e-invoicing |
| Client stability | PHASE-021/022 | Crash-free sessions (desktop/Android), update-channel distribution, min-version enforcement hits, update adoption | Staged-rollout gates (10%→50%→100%) read from this dashboard |
| Business SLO | PHASE-014+ | Failed-login spike, tenant suspension events, signups/onboarding funnel, entitlement overrides | Suspensions are high-signal: they precede churn or abuse |

Metric naming is vendor-agnostic (`erp_<module>_<name>_<unit>`); collection starts as a
Prometheus-style exporter endpoint with sink choice per
[../decisions/technical/DR-003-observability-vendors.md](../decisions/technical/DR-003-observability-vendors.md).

## 2. Health endpoint contract (summary)

| Endpoint | Checks | Used by | Failure semantics |
|----------|--------|---------|-------------------|
| `GET /health/live` | Process up; build info | LB liveness, deploy smoke | 200 while the process can serve at all — no dependencies |
| `GET /health/ready` | DB round-trip, migration state, pg-boss queue liveness | LB readiness, deploy gates ([DEPLOYMENT.md](DEPLOYMENT.md) §2), alerting | 503 until all checks pass; partial-failure detail in `checks[]` (never secrets) |
| Worker heartbeat | `WORKER_MODE` process updates a heartbeat row (DB) on a fixed interval | Monitoring | Heartbeat age > 5 min → worker presumed stuck/dead → page |

Responses are JSON with `status`, `correlation_id` (echo of `X-Request-Id` or generated),
and a `checks[]` array (name, ok, latency_ms). Every alert below links a runbook section —
no alert exists without one.

## 3. Alert catalog

| Alert | Condition | Severity | Runbook | Paging policy |
|-------|-----------|----------|---------|---------------|
| `RLSDenial` | Any RLS policy violation observed in traffic (counter > 0) | **Sev-1** | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §tenant-isolation | Page immediately, any hour (RISK-010) |
| `PostingInvariantFail` | Posting engine rejected on invariant breach in production (should never fire — engine-internal bugs) | **Sev-1** | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §api | Page immediately (RISK-009) |
| `BackupJobFailed` | Nightly dump job errored | Sev-2 | [BACKUP_RESTORE_RUNBOOK.md](BACKUP_RESTORE_RUNBOOK.md) §9 | Ticket + notify; 2 consecutive → page |
| `RestoreSmokeFailed` | Nightly restore-smoke failed (restore step or invariant step) | Sev-2 (Sev-1 if repeated) | [BACKUP_RESTORE_RUNBOOK.md](BACKUP_RESTORE_RUNBOOK.md) §3, §9 | Ticket immediately; page on repeat |
| `WorkerHeartbeatStale` | Heartbeat age > 5 min | Sev-2 (Sev-1 if queue depth also rising) | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §jobs | Page after 10 min unexplained |
| `DeadLetterGrowth` | Failed/expired jobs +N (>10) in 15 min in any category | Sev-2 | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §jobs | Ticket; page if growth continues |
| `Api5xxSpike` | 5xx rate > 2% for 5 min | Sev-2 (Sev-1 > 10%) | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §api | Page for Sev-1; ticket Sev-2 |
| `ApiP95Breach` | p95 > NFR-006 budget for 10 min | Sev-3 | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §api | Ticket |
| `PoolSaturation` | DB pool wait/queue metrics above threshold 10 min | Sev-2 | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §api | Ticket; page if errors result |
| `SlowQueryRate` | >10 queries > 250 ms per minute, 10 min sustained | Sev-3 | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §database | Ticket |
| `MigrationFailed` | Deploy migration job non-zero exit | **Sev-1** | [DEPLOYMENT.md](DEPLOYMENT.md) §3 (abort criteria) | Page deploy on-call — deploy is aborted |
| `SLOBurn` | Error-budget burn 2× (Sev-2) / 4× (Sev-1) | Sev-2/1 | §5 + [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §api | Page per severity |
| `CertExpiry` | TLS or e-invoicing certificate < 30 days (Sev-3) / < 7 days (Sev-2) | Sev-3→Sev-2 | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §e-invoicing | Ticket → page under 7 days |
| `EInvoiceRejectSpike` | Rejection rate > 5% of submissions in 15 min | Sev-2 | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §e-invoicing | Ticket; page if tenant-wide outage |
| `SyncPushFailSpike` | Push failure > 5% in 15 min (PHASE-020+) | Sev-2 | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §sync | Ticket |
| `SyncCursorStall` | Any entity cursor lag > threshold (e.g., 15 min of change_log ahead) | Sev-3 | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §sync | Ticket |
| `ClientCrashRate` | Crash-free sessions below staged-rollout gate | Sev-2 | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §escalation | Ticket; rollout halt is automatic per gates |
| `StorageGrowth` | DB storage > 80% of provisioned | Sev-3 | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §database | Ticket; capacity review |
| `ReplicationLag` | Replica lag > 30 s (when read replica exists) | Sev-3 | [TROUBLESHOOTING.md](TROUBLESHOOTING.md) §database | Ticket |

## 4. On-call rotation (basics)

- **Primary + secondary**, weekly shifts, documented handoff note (open incidents, watch
  items, pending drills). Handoff overlaps 30 minutes.
- **Paging policy**: Sev-1 pages primary immediately, secondary after 10 min unanswered;
  Sev-2 pages within business hours, ticket otherwise; Sev-3 is ticket-only.
- **Escalation**: engineering lead after 30 min on an active Sev-1; product owner joins
  when tenant comms or data-loss decisions arise ([DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) §2);
  incident command per [../security/INCIDENT_RESPONSE.md](../security/INCIDENT_RESPONSE.md).
- Every page requires an acknowledgment + a runbook link click-through in the incident
  channel — the alert catalog makes "what do I do" one click away.
- Quarterly: the on-call pair runs the cold backup drill
  ([BACKUP_RESTORE_RUNBOOK.md](BACKUP_RESTORE_RUNBOOK.md) §4) — on-call readiness and DR
  readiness are the same muscle.

## 5. SLOs & error budgets

SLOs go live at GA (PHASE-025 — "error budget process live",
[../planning/RELEASE_STRATEGY.md](../planning/RELEASE_STRATEGY.md)); from MVP the same
metrics are tracked as budgets-without-teeth so targets have history before they gate.

| SLO (candidate, finalized in PHASE-025) | Target | Error budget consequence |
|------------------------------------------|--------|--------------------------|
| API availability (non-5xx, LB-level) | 99.9% monthly | Budget exhausted → feature releases pause; fixes only |
| API latency p95 | Within NFR-006 budget | Burn 4× → page + capacity review |
| Posting success | ≥ 99.99% of engine attempts; **zero** invariant failures | Any invariant failure is Sev-1 regardless of budget |
| Backup + restore-smoke | 100% of scheduled runs | Missed smoke blocks next release pre-flight |
| Sync push success (PHASE-020+) | ≥ 99.5% within 24 h | Budget burn halts staged client rollouts |
| Report render SLA (PHASE-013) | Per template budget | Sustained breach → worker capacity action |

Burn alerts (2×/4×) are wired in §3; the error-budget policy (freeze feature deploys when
a budget is exhausted) follows [../planning/RELEASE_STRATEGY.md](../planning/RELEASE_STRATEGY.md)
and is recorded in the GA release checklist.

## 6. Log retention & what logs are *not*

- Retention: **30 days hot** (queryable) / **1 year cold** (archived, slower, for incident
  and audit-adjacent searches). Retention is a sink configuration, verified at
  attestation time.
- Logs are operational telemetry: they never substitute for `audit_events`, which are the
  domain-level, immutable, tenant-queryable record
  ([../architecture/OBSERVABILITY.md](../architecture/OBSERVABILITY.md) §Audit vs telemetry).
  Financial audit questions are answered from the database, never from log search.
- PII policy: `tenant_id` + `correlation_id` in every line; no payloads, no secrets; the
  redaction serializer fail-closes unknown objects. Quoting a `correlation_id` to support
  must be enough to find the request trail.
