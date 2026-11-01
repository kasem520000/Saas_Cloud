/** @erp/contracts — the single source of API truth (ADR-0002). */
export {
  ContractKeyConflictError,
  ContractKeyNotFoundError,
  getContractSchema,
  listContractSchemas,
  registerContractSchema,
  resetContractRegistryForTests,
} from "./registry";
export { ERROR_CODES, isErrorCode, type ErrorCode } from "./error-codes";
export { FEATURE_KEYS, type FeatureKey } from "./feature-keys";
export {
  FX_RATE_PATTERN,
  ISO_DATE_PATTERN,
  MONEY_AMOUNT_PATTERN,
  PERCENTAGE_PATTERN,
  QUANTITY_PATTERN,
  UTC_TIMESTAMP_PATTERN,
  fxRateSchema,
  isoDateSchema,
  moneyAmountSchema,
  percentageSchema,
  quantitySchema,
  utcTimestampSchema,
} from "./wire";
export {
  ARCHETYPE_IDS,
  NAV_GROUP_IDS,
  NAV_GROUPS,
  NAV_ITEMS,
  isArchetypeId,
  isNavGroupId,
  resolveNavigation,
  type ArchetypeId,
  type Bilingual,
  type NavGroupId,
  type NavGroup,
  type NavItem,
  type ResolvedNavGroup,
  type ResolvedNavigation,
} from "./navigation";

export {
  TAX_TREATMENT_KEYS,
  TAX_REGISTRATION_STATUSES,
  TAX_VERIFICATION_STATUSES,
  VAT_RETURN_STATUSES,
  VAT_STATUSES,
  documentTaxSummarySchema,
  resolvedTaxLineSchema,
  taxPricingModeSchema,
  taxRegistrationStatusSchema,
  taxSnapshotSchema,
  taxSummaryGroupSchema,
  taxTreatmentSchema,
  taxVerificationStatusSchema,
  vatReturnStatusSchema,
  vatStatusSchema,
  type DocumentTaxSummary,
  type ResolvedTaxLine,
  type TaxSnapshot,
  type TaxSummaryGroup,
} from "./tax";
