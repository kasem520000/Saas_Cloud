# Decision Records

> **Status:** STABLE · **Owner:** Product Owner & Platform Architecture · **Updated:** 2026-10-27

Decision records (DRs) capture **product, accounting, compliance, and operational**
decisions that require explicit product-owner approval. They are the formal resolution
path for every open question in
[../ASSUMPTIONS_AND_OPEN_QUESTIONS.md](../ASSUMPTIONS_AND_OPEN_QUESTIONS.md): when a
question is decided, the record lands here, and the assumption/question file is updated
to point at it.

## 1. What belongs here vs ADRs

| | ADRs — [../architecture/ADR/](../architecture/ADR/) | Decision records — this directory |
|--|------------------------------------|------------------------------------|
| Subject | Technical **architecture**: structure, frameworks, data representation, patterns | **Business/commercial/policy**: pricing, providers, jurisdiction scope, accounting policy defaults, operational vendor choices |
| Question shape | "How do we build it?" | "What do we commit to as a product/company?" |
| Approver | Architecture owner (with product consultation when scope-impacting) | Product owner (with compliance reviewer for `compliance/`, architecture owner counter-sign when technical impact exists) |
| Lifecycle | [../architecture/ARCHITECTURE_DECISIONS.md](../architecture/ARCHITECTURE_DECISIONS.md) | This README + per-folder indexes |

A decision that changes **both** (e.g., a jurisdiction scope change that alters roadmap
ordering) produces a decision record **and** references/updates the affected ADRs and
phase documents. No decision record may weaken an accounting invariant — invariant changes
follow their own protocol ([../accounting/ACCOUNTING_INVARIANTS.md](../accounting/ACCOUNTING_INVARIANTS.md) §Maintenance).

## 2. Directory layout

| Folder | Scope | Records |
|--------|-------|---------|
| [product/](product/README.md) | Pricing, packaging, payment providers, product-scope commitments | DR-001 (pricing tiers, OPEN), DR-002 (payment provider, OPEN), DR-003 (platform expansion v2.0, ACCEPTED) |
| [technical/](technical/README.md) | Operational-technical choices (vendors/tools) that do not change architecture — architecture decisions default to ADRs | DR-003 (observability vendors, OPEN) |
| [accounting/](accounting/README.md) | Accounting policy defaults (costing, period conventions, financial-depth module policies) | DR-001 (costing method default, ACCEPTED), DR-002 (fixed assets, ACCEPTED), DR-003 (notes & installments, ACCEPTED), DR-004 (budgeting, ACCEPTED), DR-005 (payroll scope, ACCEPTED), DR-006 (consolidation, ACCEPTED) |
| [compliance/](compliance/README.md) | Jurisdiction scope and timing (e-invoicing, tax reporting) | DR-001 (ZATCA scope/timing, OPEN), DR-002 (Yemen scope, OPEN) |

Numbering: `DR-NNN` **per folder**; records are referenced folder-qualified
(`product/DR-001`) to stay unambiguous across folders.

## 3. Record format (mandatory)

```markdown
# DR-NNN — <short title>

> **Status:** OPEN | ACCEPTED | REJECTED | SUPERSEDED (by <folder>/DR-NNN) ·
> **Date:** <YYYY-MM-DD (opened / decided)> · **Approver:** <role/name>

## Context            — the forces in play; linked OQ/assumption/ADR IDs
## Options            — table of realistic options with consequences
## Recommendation     — the recommended option and why (only in OPEN records)
## Decision           — (ACCEPTED records) what was decided, exactly
## Consequences       — what becomes true/required after deciding
## Approval requirements — who must sign, what evidence must accompany the signature
```

Rules: no record without an **Options** section (decisions without alternatives are not
decisions); status changes never rewrite history — a changed decision **supersedes** with
a new record linking the old; compliance records must cite **official sources** or remain
OPEN (the no-fabrication gate, the agent hard rules ([../handoff/AGENT_START_HERE.md](../handoff/AGENT_START_HERE.md)).

## 4. Process

1. **Open**: any stakeholder files a record with status OPEN (context + options +
   recommendation). The linked OQ in
   [../ASSUMPTIONS_AND_OPEN_QUESTIONS.md](../ASSUMPTIONS_AND_OPEN_QUESTIONS.md) gains a
   `→ <folder>/DR-NNN` pointer.
2. **Review**: discussion happens on the record's PR; affected documents are listed in the
   record (they will be edited in the same change or a linked one).
3. **Decide**: approver flips status to ACCEPTED (or REJECTED with rationale kept —
   rejected records are still history); **Date** updated; decision + consequences sections
   finalized.
4. **Propagate**: update (a) the OQ/assumption file, (b) affected phase/area documents,
   (c) `docs/handoff/CHANGELOG.md`, (d) [../planning/RISK_REGISTER.md](../planning/RISK_REGISTER.md)
   if a risk's mitigation changed. Records affecting phase scope trigger the
   cross-document validation checklist in `docs/handoff/VALIDATION_REPORT.md`.
5. **Deadline discipline**: a record whose decision deadline (e.g., "before PHASE-014")
   passes without a decision escalates to the product owner as a schedule risk — the
   blueprint's provisional assumption keeps governing until then
   ([../ASSUMPTIONS_AND_OPEN_QUESTIONS.md](../ASSUMPTIONS_AND_OPEN_QUESTIONS.md) preamble).

## 5. Current open list

Every open question OQ-001…OQ-010 maps to a record here or to a record **to be opened**.
Open record status:

| Source | Topic | Record | Status |
|--------|-------|--------|--------|
| OQ-001 | Product branding (legal entity name, domain) | *(to be opened under `product/` — blocking only marketing surfaces; placeholder "the Platform" governs)* | Not yet opened |
| OQ-002 | Pricing tiers & entitlement matrix | [product/DR-001-pricing-tier-structure.md](product/DR-001-pricing-tier-structure.md) | OPEN — decide before PHASE-014 |
| OQ-003 | Payment provider selection | [product/DR-002-payment-provider-selection.md](product/DR-002-payment-provider-selection.md) | OPEN — decide before PHASE-014 |
| OQ-004 | ZATCA integration scope & timing | [compliance/DR-001-zatca-scope-and-timing.md](compliance/DR-001-zatca-scope-and-timing.md) | OPEN — decide before PHASE-023 planning |
| OQ-005 | Yemen sales-tax filing formats at GA | [compliance/DR-002-yemen-scope.md](compliance/DR-002-yemen-scope.md) | OPEN — decide before PHASE-023 evaluation |
| OQ-006 | Manufacturing depth at GA (MRP vs execution+costing) | *(to be opened under `product/` — assumption A-006 governs until then)* | Not yet opened |
| OQ-007 | Personal-account app online payments at GA | *(to be opened under `product/` — deferred per recommendation)* | Not yet opened |
| OQ-008 | Support SLA commitments per plan | *(to be opened under `product/` after PHASE-025 readiness review)* | Not yet opened |
| OQ-009 | Data-retention window after offboarding | *(to be opened under `compliance/`; legal review input required before GA)* | Not yet opened |
| OQ-010 | Arabic-only support channel at MVP | *(to be opened under `product/` — bilingual processes documented meanwhile)* | Not yet opened |
| — | Observability vendors (error tracking + log sink) | [technical/DR-003-observability-vendors.md](technical/DR-003-observability-vendors.md) | OPEN — decide at staging provisioning |
| A-005 | Costing method default (WAC/FIFO) | [accounting/DR-001-costing-method-default.md](accounting/DR-001-costing-method-default.md) | **ACCEPTED** 2026-10-27 |

When a "to be opened" item becomes urgent, copy its context from the OQ table — do not
paraphrase from memory.
