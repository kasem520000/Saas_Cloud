/**
 * PHASE-023 T13 — adapter rollout flags default OFF per tenant jurisdiction
 * (DEPLOYMENT §7 PHASE-023 row): enablement additionally requires a
 * provisioned certificate (gate). Rollback = flag off; submission history is
 * append-only and never rewritten.
 */

export type AdapterId = "zatca" | "eta" | string;

export interface RolloutGateInput {
  adapterId: AdapterId;
  tenantJurisdiction: string; // e.g. "SA", "EG"
  adapterSupportedCountries: readonly string[];
  certProvisioned: boolean;
  flagValue: boolean | undefined; // undefined = default OFF
}

export function isAdapterEnabled(input: RolloutGateInput): { enabled: boolean; reason?: string } {
  if (input.flagValue !== true) return { enabled: false, reason: "FLAG_DEFAULT_OFF" };
  if (!input.adapterSupportedCountries.includes(input.tenantJurisdiction)) {
    return { enabled: false, reason: "JURISDICTION_NOT_SUPPORTED" };
  }
  if (!input.certProvisioned) return { enabled: false, reason: "CERT_NOT_PROVISIONED" };
  return { enabled: true };
}
