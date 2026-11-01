# Backup & Restore Runbook

> **Status:** STABLE · **Owner:** Platform Operations · **Updated:** 2026-10-27

Operational runbook for [../database/BACKUP_AND_RECOVERY.md](../database/BACKUP_AND_RECOVERY.md)
(the storage-level design). Targets (NFR-007): **RPO ≤ 15 min, RTO ≤ 4 h — unproven until
the first successful restore drill**. Directive §16: *backups do not exist until they have
been restored*; success of a backup job is not evidence. Escalation anchor: RISK-018
([../planning/RISK_REGISTER.md](../planning/RISK_REGISTER.md)). Incident interface:
[../security/INCIDENT_RESPONSE.md](../security/INCIDENT_RESPONSE.md) and
[DISASTER_RECOVERY.md](DISASTER_RECOVERY.md).

## 1. Backup jobs

| Job | What runs | When | Where it lands | Retention | WORM | Verified by |
|-----|-----------|------|----------------|-----------|------|-------------|
| `wal-archive` | Managed PostgreSQL WAL archiving (provider-managed, KMS-encrypted) | Continuous | Provider storage | 7-day PITR window | Provider-managed immutability settings | Quarterly PITR drill (§4) |
| `nightly-dump` | `pg_dump --format=custom --compress=9 --exclude-schema=boss --no-owner` run with `erp_migrate`-level credentials, **client-side AES-256 encrypted before upload** | 02:00 platform time, from the worker host | `s3://erp-backups/<env>/nightly/<YYYY-MM-DD>/erp-<env>.dump.enc` | 35 days | Yes — object-lock, versioning; deletion requires ops approval | Nightly restore-smoke (§3) |
| `weekly-snapshot` | Storage-level full snapshot of the DB instance | Sunday 03:00 | Provider snapshot store | 8 weeks | Provider retention lock | Quarterly drill uses a snapshot as fallback path |
| `monthly-archive` | Copy of the monthly full dump to the archive prefix | 1st of month | `s3://erp-backups/<env>/monthly/…` | 12 months (per legal review) | Yes | Quarterly drill samples one monthly archive |

Rules:

- The dump **excludes the `boss` schema** — queue state is reconstructable; financial data
  is not ([../database/BACKUP_AND_RECOVERY.md](../database/BACKUP_AND_RECOVERY.md)).
- The backup bucket is **separate** from the app bucket; app roles have **no write/delete**
  on it. WORM (object-lock + versioning) is verified as part of §8 attestation.
- Backup credentials are distinct from app credentials (`erp_migrate`-level), stored in the
  secret store, rotated quarterly.
- `nightly-dump` failure **pages** (§9); `weekly-snapshot`/`monthly-archive` failures alert
  Sev-2.

Example nightly job (cron on the ops host; CI never holds these credentials):

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%F)
pg_dump --format=custom --compress=9 --no-owner --exclude-schema=boss \
  --file "/tmp/erp-prod-${STAMP}.dump" \
  "$MIGRATE_DATABASE_URL"
openssl enc -aes-256-cbc -pbkdf2 -in "/tmp/erp-prod-${STAMP}.dump" \
  -out "/tmp/erp-prod-${STAMP}.dump.enc" -pass env:BACKUP_ENC_KEY
object-storage cp "/tmp/erp-prod-${STAMP}.dump.enc" \
  "s3://erp-backups/prod/nightly/${STAMP}/erp-prod.dump.enc"
rm -f "/tmp/erp-prod-${STAMP}.dump"*
```

## 2. Verification protocol (mandatory)

1. **Nightly automated restore-smoke** (§3) — proves the dump is restorable and the data
   inside it satisfies core invariants.
2. **Quarterly cold drill** (§4) — a second engineer executes PITR using only this runbook,
   timed, with a signed drill record (§8).
3. **GA gate (PHASE-025)** — region-loss tabletop + one cross-region restore rehearsal
   ([DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) §5).

## 3. Nightly restore-and-invariant-smoke (automated)

Runs at 04:30, one hour after the dump, on a dedicated ephemeral environment:

```bash
# 1. Start an ephemeral PostgreSQL 16 container (never reuse a shared dev DB)
docker run -d --name restore-verify -e POSTGRES_PASSWORD=verify -p 127.0.0.1:55432:5432 postgres:16

# 2. Fetch + decrypt the freshest nightly dump
object-storage cp "s3://erp-backups/prod/nightly/$(date +%F)/erp-prod.dump.enc" ./erp.dump.enc
openssl enc -d -aes-256-cbc -pbkdf2 -in erp.dump.enc -out erp.dump -pass env:BACKUP_ENC_KEY

# 3. Restore (roles from the dump are not used; --no-owner keeps it self-contained)
pg_restore -h 127.0.0.1 -p 55432 -U verify -d postgres --no-owner --jobs=4 erp.dump

# 4. Run the invariant smoke suite against the restored copy:
pnpm --filter api verify:restore-smoke -- --url postgresql://verify@127.0.0.1:55432/postgres
#    which asserts, per run:
#    a. random tenant GL balances:  SUM(debits) = SUM(credits) per journal entry      (INV-001/002)
#    b. RLS guard: SELECT as erp_app without tenant GUC on audit_events -> 0 rows    (isolation)
#    c. audit_events row count > 0 and monotonically increasing by 'at'              (audit trail)
#    d. posted documents all have >= 1 journal entry                                  (INV-006)
#    e. posting idempotency uniqueness intact: no dup (tenant,source_type,source_id,operation) (INV-013)

# 5. Record result (backup_verifications row: dump path, restore seconds, checks passed)
#    and emit metric erp_backups_restore_smoke_success / failure.

# 6. Teardown ALWAYS (also on failure paths)
docker rm -f restore-verify && rm -f erp.dump erp.dump.enc
```

Failure of any check = alert (§9) + RISK-018 trigger; the on-call must treat the latest
good dump as the effective RPO boundary until fixed.

## 4. Quarterly drill (cold run, timed)

Executed by a **second engineer** — someone who did not write the recent changes — using
only this runbook (no tribal knowledge). Record every step's wall time.

1. **Choose a restore point**: any timestamp inside the last 24 h (within the PITR window).
2. **Create the ephemeral restore environment**: new managed PG instance (drill scope) or,
   for the staging-attached variant, a fresh container per §3 pattern.
3. **PITR restore to the chosen timestamp** via the managed provider's point-in-time
   restore (the provider-specific invocation is recorded in the ops vault appendix at
   provisioning time and must be in the drill record). For container drills, simulate with
   `pg_restore` of the closest nightly + note the delta as measured RPO.
4. **Run the full invariant smoke suite** (§3 step 4) — all five assertions.
5. **Compare row counts** against the source production reads taken at the same timestamp:

   ```sql
   -- run on BOTH production (as of drill time, via erp_readonly) and the restored copy:
   SELECT 'journal_entries' t, count(*) FROM journal_entries
   UNION ALL SELECT 'journal_lines', count(*) FROM journal_lines
   UNION ALL SELECT 'sales_invoices', count(*) FROM sales_invoices
   UNION ALL SELECT 'stock_moves',   count(*) FROM stock_moves
   UNION ALL SELECT 'audit_events',  count(*) FROM audit_events;
   ```

   Expected: restored counts ≤ source counts and explainable by the timestamp delta.
6. **Measure**: time-to-restore (start → queries answering) vs RTO ≤ 4 h; data-loss window
   (last WAL/tx before restore point) vs RPO ≤ 15 min.
7. **Record the drill log** (append to §8) with: date, engineer, restore point, timings,
   row-count comparison, failures, corrective actions, signature.
8. **Teardown** the ephemeral instance; confirm no orphaned resources (cost + hygiene).
9. A failed drill = RISK-018 materialized: fix, then repeat the drill within 2 weeks — a
   drill is not "passed" until a complete successful run exists.

## 5. Restore procedure A — logical corruption (PITR to timestamp)

Use when a bad migration or bug corrupted data at scale (decision tree:
[DEPLOYMENT.md](DEPLOYMENT.md) §5; incident must be declared first).

1. **Declare incident** (Sev-1 if ledger integrity is affected — RISK-009); incident
   commander owns the clock; freeze deploys.
2. **Stop the bleeding**: roll back / disable the offending feature via rollout flag; if
   postings continue writing on top of corrupted state, enable **tenant read-only mode**
   ([DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) §3).
3. **Identify the corruption timestamp** from logs/audit (`audit_events`, deploy log,
   migration job log). Choose restore target = last clean instant **before** the event.
4. **Snapshot current state** (preserve evidence + the option to extract data written after
   the restore point for re-posting): trigger an immediate `pg_dump` + snapshot.
5. **Restore**: point-in-time restore to the target into a fresh instance (provider
   invocation from the vault appendix). Never restore "in place".
6. **Verify** on the restored instance: §3 step 4 suite + targeted checks for the reported
   corruption + compare key counts.
7. **Cutover decision** (incident commander + product owner):
   - Data written after restore point is **lost** on cutover — estimate affected tenants
     and documents from step 4's evidence dump; decide cutover vs forward-fix per scale.
   - Cutover = repoint `DATABASE_URL` secret → rolling restart api/web → worker last
     ([DEPLOYMENT.md](DEPLOYMENT.md) §2 steps 3–5) → health + smoke tests.
8. **Re-post recoverable data** from the evidence dump via normal document flows (never
   raw INSERTs into the ledger — INV-003).
9. **Tenant notices** (AR/EN templates: [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) §4) +
   post-incident review.

## 6. Restore procedure B — instance loss

DB instance unreachable/destroyed (no corruption assumed):

1. Provision a replacement managed instance from the **weekly snapshot** (fast path) and
   replay WAL to the latest available point (provider PITR on the snapshot).
2. Verify §3 suite; repoint secrets; rolling restart; smoke tests.
3. Target: **RTO ≤ 4 h** from declaration to queries answering; record actuals in §8.

## 7. Restore procedure C — cross-region restore (GA)

For region loss ([DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) §2):

1. Confirm backup-bucket **cross-region replication** is current (object-lock preserved on
   the replica — verified quarterly, §8 attestation).
2. Provision the new environment in the recovery region: managed PG + app nodes from the
   recorded infrastructure-as-code + `deploy/compose.prod.yml`.
3. Restore: nightly dump restore (or snapshot+PITR where the provider supports
   cross-region) → seeds not needed (data intact) → role bootstrap per
   [DEPLOYMENT.md](DEPLOYMENT.md) §6 steps 2.
4. Verify + cutover DNS/LB; target **RTO ≤ 8 h**; rehearsed at PHASE-025 with timing
   evidence (GA gate).

## 8. Drill log & attestation (append-only)

| Date | Type (nightly-smoke audit / quarterly PITR / cross-region) | Engineer | Restore point | Restore time (vs RTO) | Data window (vs RPO) | Result | Actions |
|------|------------------------------|----------|---------------|----------------------|---------------------|--------|----------|
| *(to be appended per drill — no backdating; failed drills stay recorded)* | | | | | | | |

**Attestation (directive §16).** A monthly attestation line is appended here, signed by
the on-call lead: *"I attest that for <month>: the nightly restore-smoke succeeded ≥ 27/30
days (every failure has an incident record), the last quarterly drill passed within RTO
and RPO, and the WORM configuration on the backup bucket was inspected and intact."*
A missed attestation blocks the next production release at pre-flight
([DEPLOYMENT.md](DEPLOYMENT.md) §1 row 3).

## 9. Failure alerts & escalation

| Signal | Severity | Immediate action | Escalation if not fixed |
|--------|----------|------------------|------------------------|
| `nightly-dump` job failed | Sev-2 | Inspect job log; retry once; check credentials/storage quota | 2 consecutive failures → **page on-call lead**; RISK-018 opened |
| Restore-smoke failed (restore or invariant step) | Sev-2 → Sev-1 if repeated | Treat newest good dump as RPO boundary; debug §3 step failing; do not touch prod | Page; incident record; release pre-flight blocked |
| PITR window unhealthy (oldest restore point < 7 days) | Sev-2 | Check WAL archiving status on the instance | Page DB owner; provider ticket |
| WORM/lock config drift detected | **Sev-1** | Assume anti-ransomware posture broken until re-verified; rotate backup credentials | Immediate page + security review ([../security/INCIDENT_RESPONSE.md](../security/INCIDENT_RESPONSE.md)) |
| Quarterly drill overdue > 2 weeks | Sev-3 | Schedule within the sprint | Escalate to product owner at release gate |
