# Troubleshooting

> **Status:** STABLE · **Owner:** Platform Operations · **Updated:** 2026-10-27

Symptom → diagnosis → remediation tables for production and staging. Every entry links
the authoritative runbook or spec section; alerts that route here are defined in
[MONITORING.md](MONITORING.md) §3. **Golden rule:** before mutating anything, capture
evidence (correlation ids, `audit_events`, `boss.job` state) — most remediations are safe
only on a correct diagnosis.

## 1. How to use this runbook

1. Identify the alert/symptom group below and open the linked section.
2. Run the **diagnosis** commands (all read-only) before any remediation.
3. Prefer app-level remediations (restart, re-enqueue, flag-off) over data-level ones.
4. Anything that touches posted financial data is an incident
   ([../security/INCIDENT_RESPONSE.md](../security/INCIDENT_RESPONSE.md)) — corrections go
   through reversals/new documents, never edits (INV-003).

## 2. API

Symptoms: 5xx spikes, slow p95, restart loops. Alerts: `Api5xxSpike`, `ApiP95Breach`,
`PoolSaturation`, `SLOBurn` ([MONITORING.md](MONITORING.md) §3).

| Symptom | Diagnosis | Remediation | Runbook |
|---------|-----------|-------------|---------|
| 5xx spike after a deploy | Correlate start time with deploy log; check error codes in logs (`error.code`) grouped by route | If release-correlated → app rollback: [DEPLOYMENT.md](DEPLOYMENT.md) §4 + [CI_CD.md](CI_CD.md) §7 | [DEPLOYMENT.md](DEPLOYMENT.md) §3–4 |
| Slow p95 across routes | `SELECT calls, mean_exec_time, rows, query FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20;` — look for new plans after migration | Add/fix index per [../database/CONSTRAINTS_AND_INDEXES.md](../database/CONSTRAINTS_AND_INDEXES.md) §6; check stats freshness (`ANALYZE`) | [../database/DATABASE_CONVENTIONS.md](../database/DATABASE_CONVENTIONS.md) §8 |
| DB pool exhaustion | Pool metrics (waiters, queue); `SELECT count(*), state FROM pg_stat_activity GROUP BY state;` — look for long `idle in transaction` | Kill offending pids via the pool admin route; find the leaked transaction in logs by `correlation_id`; fix code path (missing unit-of-work dispose) | [../database/DATABASE_CONVENTIONS.md](../database/DATABASE_CONVENTIONS.md) §10 |
| Readiness flapping | `GET /health/ready` detail: which `checks[]` fails (DB round-trip? queue?) | DB issue → §database; queue issue → §jobs; transient LB blips during deploys are expected only inside deploy windows | [MONITORING.md](MONITORING.md) §2 |
| Error budget burning (no single symptom) | SLO dashboard burn rate by route/tenant | Treat as capacity/correctness investigation: open a ticket with the top contributing route + tenant distribution | [MONITORING.md](MONITORING.md) §5 |

## 3. Database

Alerts: `SlowQueryRate`, `StorageGrowth`, `ReplicationLag`.

| Symptom | Diagnosis | Remediation | Runbook |
|---------|-----------|-------------|---------|
| Lock contention (requests piling up, `wait_event_type='Lock'`) | `SELECT pid, wait_event_type, wait_event, now()-query_start AS age, left(query,80) FROM pg_stat_activity WHERE wait_event_type IS NOT NULL AND state<>'idle';` then `SELECT pg_blocking_pids(pid), pid FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid))>0;` | Identify the blocker (usually a report query or forgotten transaction); terminate the session only if it is not a posting transaction (`pg_terminate_backend` as last resort — posting transactions are atomic and retry-safe via INV-013) | [../database/DATABASE_CONVENTIONS.md](../database/DATABASE_CONVENTIONS.md) §10 |
| Table/index bloat (counts fine, scans slow) | Bloat estimate via `pgstattuple` on suspects; autovacuum stats | Tune autovacuum per table; `REINDEX CONCURRENTLY` bloated indexes in a maintenance window | [../database/CONSTRAINTS_AND_INDEXES.md](../database/CONSTRAINTS_AND_INDEXES.md) §6 |
| Replication lag (once replica exists) | Provider lag metrics + `pg_stat_replication` | Throttle heavy reports off the primary; check network/wal volume; never let reporting queries hit primary during spikes | [../architecture/DEPLOYMENT_ARCHITECTURE.md](../architecture/DEPLOYMENT_ARCHITECTURE.md) §Scaling path |
| Storage growth | Disk usage by relation: `SELECT relname, pg_size_pretty(pg_total_relation_size(oid)) FROM pg_class WHERE relkind='r' ORDER BY pg_total_relation_size(oid) DESC LIMIT 15;` | Growth in `boss.job`/`audit_events`/`change_log` → maintenance job review ([../database/DATABASE_CONVENTIONS.md](../database/DATABASE_CONVENTIONS.md) §9); capacity action otherwise | [DEPLOYMENT.md](DEPLOYMENT.md) §7 |
| Migration job failed at deploy | Migration job log (statement + lock info) | Abort per [DEPLOYMENT.md](DEPLOYMENT.md) §3; fix forward — never write a down-migration | [../database/MIGRATION_STRATEGY.md](../database/MIGRATION_STRATEGY.md) §4 |

## 4. Jobs & workers

Alerts: `WorkerHeartbeatStale`, `DeadLetterGrowth`.

| Symptom | Diagnosis | Remediation | Runbook |
|---------|-----------|-------------|---------|
| Worker heartbeat stale | Worker logs (is the process up? OOM? stuck render?); `SELECT state, count(*) FROM boss.job GROUP BY state;` | Restart worker (`docker compose -f deploy/compose.prod.yml up -d --no-deps worker`) — pg-boss re-claims expired jobs; if crash-looping, check Chromium memory (§printing) | [DEPLOYMENT.md](DEPLOYMENT.md) §2 step 5 |
| Dead-letter triage (generic steps) | 1. `SELECT * FROM boss.job WHERE state IN ('failed','expired') ORDER BY created_on DESC LIMIT 50;` 2. Read `response`/error payload; 3. Classify by category below; 4. Check whether a payload bug (fix code) or data state (fix data via flows) | Re-enqueue only after the cause is fixed; bulk re-enqueue of unfixable payloads creates noise, not progress | ADR-0008 ([../architecture/ADR/ADR-0008-jobs-redis.md](../architecture/ADR/ADR-0008-jobs-redis.md)) |
| Dead letters: `reports.*` | Render errors, template failures, timeouts (render budget) | Fix template/params; stuck renders → §printing; re-enqueue the specific `report_runs` rows | [../accounting/DOCUMENT_LIFECYCLE.md](../accounting/DOCUMENT_LIFECYCLE.md) §5 + §printing below |
| Dead letters: `accounting.recurring` | Recurring journal generation failures (period locked, missing purpose mapping) | Fix period/config; re-run — idempotency key (INV-013) prevents duplicates | [../accounting/POSTING_ENGINE.md](../accounting/POSTING_ENGINE.md) |
| Dead letters: `reconciliation.*` | Subledger/stock reconciliation drift detected | Never silence: read the drift report, identify the invariant (INV-009/010/012/019) and the offending module; Sev-1 if real drift | [../accounting/ACCOUNTING_INVARIANTS.md](../accounting/ACCOUNTING_INVARIANTS.md) |
| Dead letters: `sync.*` (PHASE-020+) | Rejected pushes (period locked, price tolerance, credit limit) | These are **tenant-actionable errors**: verify the device got the rejection; no server-side merge — see §sync | [../offline/SYNC_PROTOCOL.md](../offline/SYNC_PROTOCOL.md) |
| Stuck report render queue | Queue depth for `reports.render` rising; worker CPU/memory | See §printing (Chromium pool exhaustion) | §printing below |

## 5. Authentication & sessions

| Symptom | Diagnosis | Remediation | Runbook |
|---------|-----------|-------------|---------|
| User lockout storm | `SELECT email, failed_login_count, locked_until FROM users WHERE locked_until > now();` — brute-force pattern? distributed or single IP? | Rate-limit/response per [../architecture/SECURITY_ARCHITECTURE.md](../architecture/SECURITY_ARCHITECTURE.md); unlock individual legitimate users via admin flow (audited); credential-stuffing pattern → tighten rate limits + notify affected users | [../architecture/ADR/ADR-0015-authentication.md](../architecture/ADR/ADR-0015-authentication.md) |
| Session storm (login churn, session table spike) | Sessions created per minute by user/IP; check for clients looping on 401 (rotated secret? expired announcement?) | If `SESSION_SECRET` was rotated without a grace strategy → redeploy with previous secret briefly + fix rotation procedure; loop clients → min-version enforcement (PHASE-022) | [ENVIRONMENT_CONFIGURATION.md](ENVIRONMENT_CONFIGURATION.md) §3 |
| MFA lockout (lost device) | `mfa_factors` state for the user | Admin-assisted MFA reset flow (audited, requires identity verification); recovery codes where enrolled | [../security/SECRETS_MANAGEMENT.md](../security/SECRETS_MANAGEMENT.md) |
| Invitation emails not arriving | Mailpit/provider logs; `SMTP_HOST` correctness; bounce records | Provider issue → switch to fallback provider config; individual tenant → resend invitation (new token, old expires) | [DEVELOPMENT_SETUP.md](DEVELOPMENT_SETUP.md) §6.4 |

## 6. Tenants, entitlements & isolation

Alert: `RLSDenial` (Sev-1 — [MONITORING.md](MONITORING.md) §3).

| Symptom | Diagnosis | Remediation | Runbook |
|---------|-----------|-------------|---------|
| **RLS denial counter > 0** | Pull the request logs for the denial (tenant, route, correlation id); reproduce the request shape in staging | This means code attempted a cross-tenant access: treat as a security incident (RISK-010) — hotfix path with attack-test coverage ([../database/TENANT_ISOLATION.md](../database/TENANT_ISOLATION.md) §5) before anything else | [../security/INCIDENT_RESPONSE.md](../security/INCIDENT_RESPONSE.md) |
| Tenant suspended; users see stale behavior | `tenants.status`, `subscriptions.status`, entitlement materialization state | Suspension is designed to: block login into tenant, stop jobs, flip entitlements at next materialization. Verify the entitlements refresh job ran; old sessions must be rejected at the boundary | [../architecture/MULTI_TENANCY.md](../architecture/MULTI_TENANCY.md) |
| Entitlement changes not taking effect | `entitlements` table row age vs change time (materialization lag); client-side caching TTL | Re-run materialization job; confirm plan change was audited; clients re-check entitlements per contract — never cache longer than the stated TTL | [ENVIRONMENT_CONFIGURATION.md](ENVIRONMENT_CONFIGURATION.md) §4 |
| Tenant reports "data missing" | User session tenant vs requested tenant; RLS is doing its job if ids mismatch | Verify membership + branch scope; a correct 404 on cross-tenant ids is by design (no existence leak — A7 attack) | [../database/TENANT_ISOLATION.md](../database/TENANT_ISOLATION.md) §5 |

## 7. Offline sync (PHASE-020+)

Alerts: `SyncPushFailSpike`, `SyncCursorStall`.

| Symptom | Diagnosis | Remediation | Runbook |
|---------|-----------|-------------|---------|
| Stuck pull cursor (clients not getting changes) | `SELECT entity_type, last_seq FROM sync_cursors WHERE device_id=$1;` vs `SELECT max(seq) FROM change_log WHERE tenant_id=$1;` — per-entity lag | If change feed is healthy but cursor stalls: device connectivity/heartbeat issue; if change_log lags globally: producer job issue → §jobs | [../offline/SYNC_PROTOCOL.md](../offline/SYNC_PROTOCOL.md) |
| Rejected pushes triage | Rejection reason codes on `inbox_commands`/document state: period locked, price beyond tolerance, credit limit exceeded, version conflict | These are **by-design actionable errors returned to the device** — verify the device shows them; do not force-merge on the server; tenant resolves the business condition then re-submits | [../accounting/DOCUMENT_LIFECYCLE.md](../accounting/DOCUMENT_LIFECYCLE.md) §4 |
| Duplicate effects suspected after sync | Check posting idempotency: `SELECT tenant_id, source_type, source_id, operation, count(*) FROM journal_entries GROUP BY 1,2,3,4 HAVING count(*)>1;` (must return 0) | If 0 → dedupe worked (client-side duplicates are display-only); if > 0 → **Sev-1** (RISK-011) — incident, freeze sync for that tenant | [../accounting/ACCOUNTING_INVARIANTS.md](../accounting/ACCOUNTING_INVARIANTS.md) INV-013 |
| Offline POS receipts not reconciling | `offline_receipt_no` present on posted invoices for the terminal/shift window | Re-run the terminal reconciliation view; gaps mean unsynced local sales → device must sync before close of shift | [../accounting/DOCUMENT_LIFECYCLE.md](../accounting/DOCUMENT_LIFECYCLE.md) §4 |

## 8. E-invoicing (PHASE-023)

Alerts: `EInvoiceRejectSpike`, `CertExpiry`. Full design:
[../localization/E_INVOICING_ARCHITECTURE.md](../localization/E_INVOICING_ARCHITECTURE.md).

| Symptom | Diagnosis | Remediation | Runbook |
|---------|-----------|-------------|---------|
| Submission rejected by authority | `e_invoicing_submissions.status`, reason code, raw response file for the document | Fix the **document data** (e.g., buyer fields), then create a **new submission** for the same document — never edit history; if the rejection indicates a spec misunderstanding → treat as compliance incident (RISK-005) | [../localization/E_INVOICING_ARCHITECTURE.md](../localization/E_INVOICING_ARCHITECTURE.md) §7 |
| Certificate expiry imminent | Cert dashboard countdown; renewal window per authority process | Rotate via the enrollment process **before** expiry; signing jobs read the new key from the secret store; rotation is audited; test in sandbox before prod cutover | [../security/SECRETS_MANAGEMENT.md](../security/SECRETS_MANAGEMENT.md) |
| Sandbox passes, production fails (or vice versa) | Compare payload snapshots + endpoint versions; adapter version drift | Pin spec versions per adapter declaration; bump pack version + staged rollout of the adapter ([../localization/E_INVOICING_ARCHITECTURE.md](../localization/E_INVOICING_ARCHITECTURE.md) §7) | [../localization/TAX_ENGINE.md](../localization/TAX_ENGINE.md) §3 |
| Submission queue backing up | `boss.job` counts for the adapter categories; authority latency on the funnel dashboard | Backoff storms happen after provider incidents — verify caps; if the authority is down, the registry honestly shows PENDING (never mark ACCEPTED without authority confirmation — directive §12) | [../localization/E_INVOICING_ARCHITECTURE.md](../localization/E_INVOICING_ARCHITECTURE.md) §2 |

## 9. Printing & report rendering (Chromium in worker)

| Symptom | Diagnosis | Remediation | Runbook |
|---------|-----------|-------------|---------|
| Report renders stuck / queue depth rising | Worker memory + CPU graphs; render-duration metrics; `boss.job` in `active` state with old `started_on` | Restart worker (expired jobs re-claimed); reduce render concurrency if pattern repeats | [DEPLOYMENT.md](DEPLOYMENT.md) §2 step 5 |
| Chromium pool exhaustion (OOM, crash loops) | Worker logs: render timeouts then OOM-kill loop; RISK-013 | Cap concurrent renders below memory budget; ensure render-timeout kills the page, not the pool; burst capacity = dedicated worker pool (scaling path), not a bigger shared worker | [../architecture/DEPLOYMENT_ARCHITECTURE.md](../architecture/DEPLOYMENT_ARCHITECTURE.md) §Scaling path |
| Garbled Arabic in PDFs (missing glyphs) | Test render of the same template in staging | Template/font issue, not ops: route to the phase template fix; fonts ship with the image (never fetch at runtime) | [../architecture/ADR/ADR-0011-reporting-printing.md](../architecture/ADR/ADR-0011-reporting-printing.md) |

## 10. Escalation matrix

| Severity | Examples | First responder | Escalate after | Escalation target |
|----------|----------|-----------------|----------------|-------------------|
| Sev-1 | RLS denial, posting invariant failure, migration failure, region loss, WORM drift | On-call primary (paged) | 15 min without containment | Engineering lead + product owner; incident command per [../security/INCIDENT_RESPONSE.md](../security/INCIDENT_RESPONSE.md) |
| Sev-2 | Backup job failure (repeated), DLQ growth, e-invoicing reject spike, sync push spike, pool saturation | On-call primary (ticket/page per §3) | 4 h without resolution | Engineering lead; product owner if tenant-visible |
| Sev-3 | Slow queries, cursor lag, storage growth, Sev-3 cert window | Assigned engineer (ticket) | Sprint boundary | Capacity/tech-debt review |

Any incident involving **ledger data integrity** (posting, reconciliation, sync
duplicates) is **Sev-1 by definition** (RISK-009/RISK-011) — do not downgrade it because
only one tenant is affected. Post-incident reviews: [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) §6.
