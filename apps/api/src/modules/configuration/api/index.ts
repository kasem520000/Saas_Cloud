/**
 * Public surface of the configuration module (DEPENDENCY_RULES §1 `api/`):
 * the PHASE-004 skeleton — feature catalog + closure validation (BR-040),
 * the settings key registry (L5 typed keys), the industry-template
 * registry contract, and the in-process event bus (§9 cache
 * invalidation). The L1→L10 resolution engine completes in PHASE-015.
 */
export {
  FEATURE_DEPS,
  FEATURE_KEYS,
  closureViolations,
  isKnownFeatureKey,
  missingClosure,
} from "../domain/feature-catalog";
export {
  InvalidSettingValueError,
  SETTING_KEYS,
  SETTINGS_REGISTRY,
  UnknownSettingKeyError,
  parseSettingValue,
  validateTaxRegistrationPair,
  type SettingDefinition,
} from "../domain/settings-schema";
export {
  cachedTenantSettings,
  invalidateTenantConfig,
  onTenancyEvent,
  publishTenancyEvent,
  resetConfigurationCache,
  storeTenantSettingsCache,
  type TenancyEvent,
} from "../application/config-events";
