import { z } from "zod";

import { DomainError } from "@erp/domain-core";

/**
 * Tenant-settings typed key registry (PHASE-004 T8;
 * CONFIGURATION_ENGINE.md §4 "keys are dot-namespaced `<module>.<name>`
 * with a versioned JSON schema per module; writes are validated
 * server-side. Unknown or unvalidated keys are rejected").
 *
 * PHASE-004 registers the phase-scoped keys (phase §4): locale +
 * numeral system, the onboarding-written keys (fiscal preference,
 * numbering defaults, jurisdiction binding), the provisional
 * `tax.registration.*` pair (migrated by PHASE-009 per
 * expand-migrate-contract), and the support-access opt-in toggle
 * (matrix §7 rule 1). Domain-module keys (sales.*, inventory.*,
 * treasury.*) land with their owning phases — adding a key = phase
 * scope + schema version bump (§4 governance).
 *
 * Reconciliation note (documented in the completion report): the
 * `general.numeral_system` default is `latn` — LOCALIZATION_ARCHITECTURE
 * §7, RTL_AND_LTR §5, CURRENCY_AND_PRECISION §8 and the SA pack example
 * all say `latn` (Western) is the default with `arab` as the display
 * option; the CONFIGURATION_ENGINE table's `arab` default is the
 * minority reading and is corrected in this phase's docs sync.
 */

export interface SettingDefinition {
  readonly key: string;
  readonly schema: z.ZodType<unknown>;
  /** Default written at provisioning when absent. */
  readonly default: unknown;
  readonly description: string;
}

export const SETTINGS_REGISTRY: Readonly<Record<string, SettingDefinition>> = Object.freeze({
  "general.default_locale": Object.freeze({
    key: "general.default_locale",
    schema: z.enum(["ar", "en"]),
    default: "ar",
    description: "Tenant default UI locale (NFR-001; ar = Arabic-first).",
  }),
  "general.numeral_system": Object.freeze({
    key: "general.numeral_system",
    schema: z.enum(["latn", "arab"]),
    default: "latn",
    description: "Display numeral system; ledger amounts stay latn always.",
  }),
  "general.hijri_display": Object.freeze({
    key: "general.hijri_display",
    schema: z.boolean(),
    default: true,
    description: "Display-only Hijri overlay; fiscal years stay Gregorian (A-004).",
  }),
  "fiscal_calendar.start_month": Object.freeze({
    key: "fiscal_calendar.start_month",
    schema: z.number().int().min(1).max(12),
    default: 1,
    description: "Fiscal year start month preference (years/periods created in PHASE-007).",
  }),
  "numbering.defaults": Object.freeze({
    key: "numbering.defaults",
    schema: z.object({
      assign_at: z.enum(["approval", "posting"]).default("posting"),
    }),
    default: { assign_at: "posting" },
    description:
      "BR-029 document-numbering policy default (per-type rows + the numbering service land in PHASE-007).",
  }),
  "platform.support.opt_in": Object.freeze({
    key: "platform.support.opt_in",
    schema: z.boolean(),
    default: false,
    description: "Tenant toggle enabling platform support sessions (matrix §7 rule 1).",
  }),
  "tax.registration.status": Object.freeze({
    key: "tax.registration.status",
    schema: z.enum(["REGISTERED", "NOT_REGISTERED", "DEREGISTERED"]),
    default: "NOT_REGISTERED",
    description:
      "Provisional tax-registration status (TAX_ENGINE §1); the tax_registrations table (PHASE-009) migrates this key.",
  }),
  "tax.registration.number": Object.freeze({
    key: "tax.registration.number",
    schema: z.string().min(3).max(50),
    default: null,
    description:
      "Provisional tax-registration number (required while status = REGISTERED); migrated by PHASE-009.",
  }),
  "tax.jurisdiction.binding": Object.freeze({
    key: "tax.jurisdiction.binding",
    schema: z.object({
      country_code: z.string().length(2),
      pack_key: z.string().min(2).max(60),
      bound_at: z.string(),
    }),
    default: null,
    description:
      "Provisional primary-jurisdiction pack binding (ADR-0010 concept); the versioned jurisdictions registry (PHASE-009) formalizes it.",
  }),
  "sales.credit_limit_action": Object.freeze({
    key: "sales.credit_limit_action",
    schema: z.enum(["warn", "block", "allow"]),
    default: "warn",
    description:
      "BR-001 posture when a credit sale would exceed the limit or the partner is overdue: warn (default) / block / allow. The enforcement point is sales document approval (PHASE-012); PHASE-006 ships the credit-check interface over opening-balance drafts.",
  }),
  "sales.price_override_allowed": Object.freeze({
    key: "sales.price_override_allowed",
    schema: z.boolean(),
    default: true,
    description:
      "BR-002/BR-003: manual price overrides allowed (ceilings enforced at sales time, PHASE-012). Exposed by the pricing resolution service as an allowance flag.",
  }),
  // PHASE-012 sales keys (BR-004/BR-005/BR-006/BR-007; the phase §2 policy
  // surface).
  "sales.quote_default_validity_days": Object.freeze({
    key: "sales.quote_default_validity_days",
    schema: z.number().int().min(1).max(365),
    default: 30,
    description:
      "BR-006: default quotation validity window in days — an expired quote cannot be accepted or converted; re-issue as a new quotation.",
  }),
  "sales.doc_flow": Object.freeze({
    key: "sales.doc_flow",
    schema: z.enum(["delivery_then_invoice", "invoice_then_delivery"]),
    default: "delivery_then_invoice",
    description:
      "BR-007: the document-chain policy — deliveries may precede invoicing (retail/distribution default) or invoices precede delivery (contracting); both orders are first-class and stock/AR effects post at their own documents.",
  }),
  "sales.cash_autopost": Object.freeze({
    key: "sales.cash_autopost",
    schema: z.boolean(),
    default: false,
    description:
      "BR-005: cash invoices may auto-post on save (the APPROVED→POSTED states still occur, recorded as policy-driven with approved_by = 'policy'); back-office default off — POS terminals set their own (PHASE-016).",
  }),
  "sales.return_window_days": Object.freeze({
    key: "sales.return_window_days",
    schema: z.number().int().min(0).max(3650),
    default: 14,
    description:
      "BR-004: the return window in days for credit notes referencing an invoice (0 = unlimited dates); the invoice reference requirement itself NEVER disables.",
  }),
  "sales.credit_note_standalone_allowed": Object.freeze({
    key: "sales.credit_note_standalone_allowed",
    schema: z.boolean(),
    default: false,
    description:
      "RECEIVABLES_AND_PAYABLES §3.4: standalone credit notes (no stock/revenue reference semantics) only when policy-flagged — default OFF keeps the invoice reference mandatory (BR-004).",
  }),
  "accounting.fx_revaluation_enabled": Object.freeze({
    key: "accounting.fx_revaluation_enabled",
    schema: z.boolean(),
    default: false,
    description:
      "BR-036: optional unrealized FX revaluation run — default OFF; when ON, the dated run posts a self-reversing adjusting pair (G-19).",
  }),
  // PHASE-008 treasury keys (§2.4/§2.6/§2.7 defaults per BUSINESS_RULES §8).
  // Canonical decimal strings (ADR-0009) — never JS numbers.
  "treasury.petty_cash.single_tx_limit": Object.freeze({
    key: "treasury.petty_cash.single_tx_limit",
    schema: z.string().regex(/^\d+\.\d{4}$/, "canonical 4-dp decimal string"),
    default: "5000.0000",
    description:
      "BR-020 per-transaction petty-cash disbursement cap (PLACEHOLDER default pending the OQ-002 pricing/limits pass — documented in PHASE-008).",
  }),
  "treasury.petty_cash.max_balance": Object.freeze({
    key: "treasury.petty_cash.max_balance",
    schema: z.string().regex(/^\d+\.\d{4}$/, "canonical 4-dp decimal string"),
    default: "20000.0000",
    description:
      "BR-020 petty-cash fund balance cap — inflows beyond it require reimbursement or an accountant override (PLACEHOLDER default pending OQ-002).",
  }),
  "treasury.shift_variance_tolerance": Object.freeze({
    key: "treasury.shift_variance_tolerance",
    schema: z.string().regex(/^\d+\.\d{4}$/, "canonical 4-dp decimal string"),
    default: "0.0000",
    description:
      "BR-021: |counted − expected| at or below this tolerance may auto-post; anything larger requires supervisor id + PIN + reason before close.",
  }),
  "treasury.shift_auto_post_small_variance": Object.freeze({
    key: "treasury.shift_auto_post_small_variance",
    schema: z.boolean(),
    default: true,
    description:
      "BR-021: when true, an explained within-tolerance (or PIN-attested above-tolerance) shift difference posts automatically with the shift as source.",
  }),
  "treasury.shift_supervisor_pin": Object.freeze({
    key: "treasury.shift_supervisor_pin",
    schema: z.string().regex(/^$|^\d{4,8}$/, "4–8 digits, or empty to fail closed"),
    default: "",
    description:
      "BR-021 above-tolerance close attestation PIN. Empty (default) = fail closed: no above-tolerance close is possible until an owner sets a PIN.",
  }),
  "treasury.expense_receipt_threshold": Object.freeze({
    key: "treasury.expense_receipt_threshold",
    schema: z.string().regex(/^\d+\.\d{4}$/, "canonical 4-dp decimal string"),
    default: "0.0000",
    description:
      "BR-023: expense claims at or above this amount require a receipt attachment (0 = always required).",
  }),
  // PHASE-009 tax keys (§2.7 pricing policy; TAX_ENGINE §5 configuration
  // surface). The provisional tax.registration.* keys above stay registered
  // for the expand→dual-read→contract migration window (MIGRATION_STRATEGY
  // §3): the registration service reads/writes tax_registrations and only
  // falls back to them while no row exists.
  "tax.pricing_inclusive_default": Object.freeze({
    key: "tax.pricing_inclusive_default",
    schema: z.boolean(),
    default: false,
    description:
      "PHASE-009 §2.7: default pricing mode for tax resolution — false = prices are net (tax added); true = prices are gross (tax extracted within the same rounding rules). Per-document overrides travel on the sales documents (PHASE-012).",
  }),
  // PHASE-010 inventory keys (BR-013/BR-015; the phase §2.7/§2.10 policy
  // surface). Canonical decimal strings (ADR-0009) — never JS numbers.
  "inventory.allow_negative_stock": Object.freeze({
    key: "inventory.allow_negative_stock",
    schema: z.boolean(),
    default: false,
    description:
      "BR-013: issuing below zero is forbidden by default; when explicitly enabled, issues price at the last known average and reports flag the negative state. The stock ledger balance always holds.",
  }),
  "inventory.count_variance_tolerance": Object.freeze({
    key: "inventory.count_variance_tolerance",
    schema: z.string().regex(/^\d+\.\d{4}$/, "canonical 4-dp decimal string"),
    default: "0.0000",
    description:
      "BR-015: count-variance value impact at or below this tolerance may post with plain approval; anything larger requires a recount or supervisor approval.",
  }),
  // PHASE-011 purchasing keys (BR-009/BR-011/BR-012; the phase §2.5/§2.2
  // policy surface). Canonical decimal strings (ADR-0009).
  "purchasing.allow_po_less_grn": Object.freeze({
    key: "purchasing.allow_po_less_grn",
    schema: z.boolean(),
    default: true,
    description:
      "BR-012: goods receipts without a PO (direct purchase) require an explicit permission and reason; tenants may forbid them entirely by setting this to false.",
  }),
  "purchasing.match.qty_tolerance_pct": Object.freeze({
    key: "purchasing.match.qty_tolerance_pct",
    schema: z.string().regex(/^\d+(\.\d{1,4})?$/, "non-negative decimal string"),
    default: "0",
    description:
      "BR-009: three-way-match quantity tolerance as a percentage — 0 (default) means exact; variances within tolerance auto-pass with the variance recorded.",
  }),
  "purchasing.match.price_tolerance_pct": Object.freeze({
    key: "purchasing.match.price_tolerance_pct",
    schema: z.string().regex(/^\d+(\.\d{1,4})?$/, "non-negative decimal string"),
    default: "0",
    description:
      "BR-009: three-way-match price tolerance as a percentage — 0 (default) means exact; above-tolerance variances require buyer disposition before approval.",
  }),
  "purchasing.duplicate_invoice_behavior": Object.freeze({
    key: "purchasing.duplicate_invoice_behavior",
    schema: z.enum(["block", "warn"]),
    default: "block",
    description:
      "BR-011: a supplier invoice whose (supplier, number, amount) triple already exists is blocked; 'warn' downgrades the same-triple case to a warning (the (supplier, number) different-amount case always warns).",
  }),
  "purchasing.input_vat_default": Object.freeze({
    key: "purchasing.input_vat_default",
    schema: z.enum(["recoverable", "expensed"]),
    default: "recoverable",
    description:
      "PHASE-011 §2.4 (TAX_ENGINE §1): default input-VAT recoverability for eligible STANDARD_RATED supplier-invoice lines — inputs related to exempt supplies are expensed by setting this to 'expensed' or flagging individual lines.",
  }),
  "purchasing.po_approval_threshold": Object.freeze({
    key: "purchasing.po_approval_threshold",
    schema: z.string().regex(/^\d+\.\d{4}$/, "canonical 4-dp decimal string").nullable(),
    default: null,
    description:
      "BR-010: purchase orders above this base-currency gross amount require approval (null = no threshold — the single-owner MVP default).",
  }),
});

export const SETTING_KEYS: readonly string[] = Object.keys(SETTINGS_REGISTRY);

/** Unknown or unvalidated setting key/value (fail loud, §4). */
export class UnknownSettingKeyError extends DomainError {
  constructor(key: string) {
    super(
      "tenancy/unknown-setting-key",
      `Unknown tenant setting key: ${key} (CONFIGURATION_ENGINE §4 — keys are schema-registered)`,
    );
  }
}

export class InvalidSettingValueError extends DomainError {
  constructor(key: string, message: string) {
    super(
      "tenancy/invalid-setting-value",
      `Invalid value for tenant setting ${key}: ${message}`,
    );
  }
}

/** Validate a settings write; throws the typed §4 errors on failure. */
export function parseSettingValue(key: string, value: unknown): unknown {
  const definition = SETTINGS_REGISTRY[key];
  if (definition === undefined) {
    throw new UnknownSettingKeyError(key);
  }
  const parsed = definition.schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new InvalidSettingValueError(
      key,
      issue === undefined ? "schema validation failed" : `${issue.message} at ${issue.path.join(".")}`,
    );
  }
  return parsed.data;
}

/**
 * Registration-time cross-key rule (TAX_ENGINE §1): a REGISTERED tenant
 * must carry a registration number; NOT_REGISTERED/DEREGISTERED must not.
 */
export function validateTaxRegistrationPair(
  status: string,
  number: string | null,
): void {
  if (status === "REGISTERED" && (number === null || number.length === 0)) {
    throw new InvalidSettingValueError(
      "tax.registration.number",
      "a registration number is required while tax.registration.status = REGISTERED",
    );
  }
  if (status !== "REGISTERED" && number !== null && number.length > 0) {
    throw new InvalidSettingValueError(
      "tax.registration.number",
      "a registration number is only valid while tax.registration.status = REGISTERED",
    );
  }
}
