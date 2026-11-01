# Table Specifications — Tax & Compliance

> **Status:** STABLE · **Owner:** Database & Tax Architecture · **Updated:** 2026-10-30 · **Delivered:** PHASE-009 (migration `0013_tax.sql`)

Column-level specifications for the tax/compliance tables **as delivered by
PHASE-009** (the jurisdiction-pack engine, the tenant codes/registrations,
the staged pack bindings, the INV-012 document-summary substrate, the VAT
returns, and the e-invoicing submission registry schema — real integrations
PHASE-023). Conventions:
[../DATABASE_CONVENTIONS.md](../DATABASE_CONVENTIONS.md); catalog entries:
[../ENTITY_CATALOG.md](../ENTITY_CATALOG.md) §tax & compliance; ERD:
[../ERD/treasury-tax.md](../ERD/treasury-tax.md).

**Doc-reality reconciliation (recorded in the PHASE-009 completion report):**
the pre-implementation plan below sketched `jurisdictions` keyed by
`country_code` text-PK with spread columns (`invoice_requirements`,
`e_invoicing_regime`, `effective_dates`, `source_refs`) and an
`e_invoicing_submissions` shape from the E_INVOICING pre-design. The
delivered schema: `jurisdictions` carries a uuid PK + `country_code`
UNIQUE with the full COUNTRY_PACKS §2 descriptor as one `descriptor` jsonb
(the authoring/interchange form verbatim); the treatments catalog ships as
its own `tax_treatments` seed table (return-box semantics live there, not
on rate rows); rate rows cover only the pack-rate treatments
(`STANDARD_RATED`/`ZERO_RATED`/`REVERSE_CHARGE`) — `EXEMPT`,
`OUT_OF_SCOPE` and `NOT_SUBJECT` compute no pack rate by engine semantics
(TAX_ENGINE §1) so they carry no rate rows; the submission registry ships
the lifecycle states of the PHASE-009 port (`PENDING → GENERATED →
SUBMITTED → ACCEPTED/REJECTED/FAILED`); and the phase additionally
delivered `tax_pack_bindings`, `tax_document_summaries` (INV-012's
document side — append-only) and `vat_returns` which the plan had not
sketched. The tables below document the DELIVERED shapes.

## `tax_treatments` (seed/reference — PHASE-009)

The six treatments, never conflated (TAX_ENGINE §1), with their distinct
return-box semantics.

| Column | Type | Null | Constraints | Description |
|--------|------|------|-------------|-------------|
| key | text | NO | PK; ck: `STANDARD_RATED \| ZERO_RATED \| EXEMPT \| OUT_OF_SCOPE \| REVERSE_CHARGE \| NOT_SUBJECT` | Treatment key |
| name / name_ar | text | NO | — | Bilingual labels |
| taxable | boolean | NO | — | Whether the treatment participates in VAT computation |
| output_tax_box | text | YES | ck: both boxes NULL or both NOT NULL | Return box (output side) |
| input_tax_box | text | YES | — | Return box (input side) |
| sort_order | integer | NO | — | Canonical ordering (deterministic summaries) |

## `jurisdictions` (seed/reference — PHASE-009)

Global reference data (ADR-0005 / TENANT_ISOLATION §3): **no tenant_id, no
RLS, read-only to `erp_app`** — pack updates ship as `erp_migrate` seed
migrations with changelog + verification records (SEEDS rule 2).

| Column | Type | Null | Constraints | Description |
|--------|------|------|-------------|-------------|
| id | uuid | NO | PK | |
| country_code | char(2) | NO | UNIQUE (ISO-3166 alpha-2) | Jurisdiction identity |
| country_name / country_name_ar | text | NO | — | Display names |
| currency_code | char(3) | NO | fk → `currencies` | Default currency |
| minor_units | integer | NO | ck: 0–4 | Currency decimals (ISO-4217) |
| vat_status | text | NO | ck: `VAT_IN_FORCE \| VAT_PLANNED \| NO_VAT` | Scheme applicability (the e-invoicing regime + statuses ride the descriptor) |
| pack_version | text | NO | — | e.g. `1.0.0-baseline` |
| descriptor | jsonb | NO | — | The COUNTRY_PACKS §2 pack JSON (formats, identifiers with null-until-verified formats, e_invoicing regime, regulatory notes) |
| verification_status | text | NO | default `REQUIRES_VERIFICATION`; ck with `verified_at` shape | Flips to VERIFIED only via the compliance-matrix per-fact protocol |
| source_ref | text | NO | — | Official source to verify against |
| verified_at | timestamptz | YES | — | NULL until the human protocol completes |
| is_active | boolean | NO | default true | Pack deactivation (never delete — history) |
| created_at | timestamptz | NO | default now() | |

## `jurisdiction_tax_rates` (seed/reference — PHASE-009)

Versioned, effective-dated rate rows (TAX_ENGINE §3): **a rate change = a
NEW row with `effective_from`, never an edit**; prior windows keep
`effective_to` so boundary fixtures pin (BH: 5% 2019→2021-12-31, 10% from
2022-01-01). Only the compliance-file-asserted standard rates are seeded;
`verified_at` ships NULL (REQUIRES_VERIFICATION provenance — directive
§1.12–1.13).

| Column | Type | Null | Constraints | Description |
|--------|------|------|-------------|-------------|
| id | uuid | NO | PK | |
| jurisdiction_id | uuid | NO | fk → `jurisdictions` (RESTRICT) | |
| treatment | text | NO | fk → `tax_treatments(key)`; ck: `STANDARD_RATED \| ZERO_RATED \| REVERSE_CHARGE` | Pack-rate treatments only (EXEMPT/OUT_OF_SCOPE/NOT_SUBJECT compute no pack rate) |
| rate | numeric(8,4) | NO | ck `rate ≥ 0` | Percentage (15.0000 = 15%) |
| effective_from | date | NO | uq(jurisdiction_id, treatment, effective_from) | Window start |
| effective_to | date | YES | ck `effective_to ≥ effective_from` | NULL = open-ended |
| source_ref | text | NO | — | Official source + fact citation |
| verified_at | timestamptz | YES | — | NULL until verified |
| created_at | timestamptz | NO | default now() | |

Index: `ix_jurisdiction_rates_lookup (jurisdiction_id, treatment, effective_from)` — the
resolver's rate-at-date lookup.

## `tax_codes` (tenant — PHASE-009)

| Column | Type | Null | Default | Constraints | Description |
|--------|------|------|---------|-------------|-------------|
| `id`, `tenant_id` **+standard** | — | — | — | `UNIQUE (id, tenant_id)` | RLS-scoped |
| code | text | NO | — | `uq_tax_codes_tenant_code (tenant_id, code)`; shape `^[A-Za-z0-9_-]{1,20}$` | User-facing code (tenant-unique) |
| name / name_ar | text | NO / YES | — | — | Bilingual label |
| country_code | char(2) | NO | — | fk → `jurisdictions` (RESTRICT); `uq_tax_codes_tenant_country_code` | Jurisdiction binding (resolution never crosses packs) |
| default_treatment | text | NO | — | ck: all six treatments | The resolver's input |
| snapshot_policy | text | NO | `STAMP_AT_POSTING` | ck: `STAMP_AT_POSTING \| STAMP_AT_DRAFT` | V1: posting stamps (data-carried for consumers) |
| status | text | NO | `ACTIVE` | ck: `ACTIVE \| ARCHIVED` | Archive is reference-guarded (service) |

Index: `ix_tax_codes_tenant_country_status (tenant_id, country_code, status)`.

## `tax_registrations` (tenant — PHASE-009)

Migrates the provisional PHASE-004 `tax.registration.*` settings
(expand-migrate-contract; the registration service owns the dual-read
window).

| Column | Type | Null | Constraints | Description |
|--------|------|------|-------------|-------------|
| `id`, `tenant_id` **+standard** | — | — | `UNIQUE (id, tenant_id)`; `uq (tenant_id, country_code)` | One row per jurisdiction per tenant |
| country_code | char(2) | NO | fk → `jurisdictions` (RESTRICT) | |
| status | text | NO | ck: `REGISTERED \| NOT_REGISTERED \| DEREGISTERED` | Drives resolution (not registered → NOT_SUBJECT) |
| registration_number | text | YES | ck shape: required (3–50 chars) while REGISTERED, NULL otherwise | As printed on invoices (format unasserted until verification) |
| effective_from / effective_to | date | NO / YES | ck window | Registration validity |
| deregistered_at | date | YES | ck: `(status = 'DEREGISTERED') = (deregistered_at IS NOT NULL)` | |
| note | text | YES | — | Transition notes (audited) |

## `tax_pack_bindings` (tenant — PHASE-009)

Staged pack-version pin per tenant (COUNTRY_PACKS §6.4: preview → apply,
audited; never retroactive — BR-033).

| Column | Type | Null | Constraints | Description |
|--------|------|------|-------------|-------------|
| `id`, `tenant_id` **+standard** | — | — | `UNIQUE (id, tenant_id)`; `uq (tenant_id, country_code)` | |
| country_code | char(2) | NO | fk → `jurisdictions` | |
| pack_version | text | NO | — | The pinned version (must be a seeded version) |
| applied_at / applied_by | timestamptz / uuid | NO / YES | default now() | The rollout audit trail (+ the `tax.pack_applied` audit event) |

## `tax_document_summaries` (tenant — PHASE-009, append-only 🔒)

INV-012's document side: per-document (direction, treatment, rate, tax
code) groups accumulated at posting inside the posting transaction. The
VAT return aggregates these; the RC-06/RC-07 checks reconcile them against
GL tax-account movements. **Append-only by grants (no UPDATE/DELETE for
`erp_app`) + the `erp.tax_summaries_guard()` trigger** — RC-07's seeded
drift is superuser tooling by construction.

| Column | Type | Null | Constraints | Description |
|--------|------|------|-------------|-------------|
| id | uuid | NO | PK | |
| tenant_id | uuid | NO | fk → tenants; RLS | |
| created_at | timestamptz | NO | default now() | |
| source_type | text | NO | shape `^[a-z][a-z0-9_]{2,39}$` | `expense` today; sales/purchase docs from their phases |
| source_id | uuid | NO | uq group key with (tenant_id, source_type, source_id, direction, treatment, rate, tax_code_id) | The posting document |
| document_date | date | NO | — | The resolution date (period aggregation) |
| fiscal_period_id | uuid | YES | — | Optional period convenience (date ranges drive queries) |
| country_code | char(2) | NO | fk → `jurisdictions` | |
| direction | text | NO | ck: `OUTPUT \| INPUT` | |
| treatment | text | NO | ck: all six | |
| rate | numeric(8,4) | NO | — | The snapshot's rate |
| tax_code_id | uuid | YES | composite fk → `tax_codes` (RESTRICT) | NULL for synthetic groups |
| taxable_base / tax_amount | numeric(19,4) | NO | — | Canonical 4-dp exact strings |
| snapshot | jsonb | NO | — | The frozen `tax.snapshot.v1` contract |

Indexes: `ix_tax_summaries_period (tenant_id, country_code, document_date, direction)`;
`ix_tax_summaries_source (tenant_id, source_type, source_id)`.

## `vat_returns` (tenant — PHASE-009)

| Column | Type | Null | Constraints | Description |
|--------|------|------|-------------|-------------|
| `id`, `tenant_id` **+standard** | — | — | `UNIQUE (id, tenant_id)`; `uq (tenant_id, country_code, period_start, period_end)` | One return per window |
| country_code | char(2) | NO | fk → `jurisdictions` | |
| period_start / period_end | date | NO / NO | ck `end ≥ start` | |
| status | text | NO | `DRAFT` | ck: `DRAFT \| READY \| FILED`; a failed re-prepare revokes READY → DRAFT (RC-07) |
| summary | jsonb | NO | — | The deterministic aggregation (byte-identical re-runs) |
| cross_check | jsonb | NO | — | The INV-012 side-by-side (documentSide vs glSide + ok) |
| cross_check_ok | boolean | NO | false | Gates READY and mark-filed |
| prepared_at / prepared_by | timestamptz / uuid | YES | ck: non-DRAFT ⇒ prepared_at NOT NULL | |
| filed_at / filed_by | filing… | YES | ck: `(status = 'FILED') = (filed_at IS NOT NULL AND filed_by IS NOT NULL)` | The human filing (audited; the platform reports) |
| filing_reference / filing_note | text | YES | ref length 1–80 | Filing metadata for audit |

## `e_invoicing_submissions` (tenant — schema PHASE-009, populated PHASE-023)

| Column | Type | Null | Constraints | Description |
|--------|------|------|-------------|-------------|
| `id`, `tenant_id` **+standard** | — | — | `UNIQUE (id, tenant_id)`; `uq (tenant_id, source_type, source_id)` | One registry row per source document |
| country_code | char(2) | NO | fk → `jurisdictions` | |
| adapter_id | text | NO | — | e.g. `zatca`, `eta_eg`, `fake` (test-only) |
| source_type / source_id | text / uuid | NO | shape as summaries | The submitting document |
| status | text | NO | `PENDING` | ck: `PENDING \| GENERATED \| SUBMITTED \| ACCEPTED \| REJECTED \| FAILED` (E_INVOICING §2 lifecycle — the port's states) |
| payload_digest | text | YES | — | Stable digest for idempotent rebuilds |
| authority_reference | text | YES | — | Authority id when accepted |
| submitted_at / responded_at | timestamptz | YES | — | Lifecycle timestamps |
| error_detail | jsonb | YES | — | Typed rejection payload |

Index: `ix_e_invoicing_tenant_status (tenant_id, country_code, status)`.

## Widening of existing tables (this migration)

- `items.tax_code_id` — the PHASE-006 reserved NULLABLE column **gains its composite
  FK** → `tax_codes` (expand step, MIGRATION_STRATEGY §3).
- `item_categories.default_tax_code_id` — NEW nullable column + composite FK (the
  category-default resolution input, T5).
- `expenses.tax_code_id` — the PHASE-008 reserved column gains its composite FK
  (the G-11 VAT leg).
