/**
 * PHASE-023 T13 — rollout gate: default OFF, jurisdiction match required,
 * certificate provisioned required before enablement.
 */
import { describe, expect, it } from "vitest";
import { isAdapterEnabled } from "../adapter-flags";

describe("adapter rollout gate", () => {
  const base = { adapterId: "zatca", tenantJurisdiction: "SA", adapterSupportedCountries: ["SA"] as const, certProvisioned: true };
  it("flag undefined → OFF by default", () => {
    expect(isAdapterEnabled({ ...base, flagValue: undefined }).enabled).toBe(false);
  });
  it("flag on + jurisdiction match + cert → enabled", () => {
    expect(isAdapterEnabled({ ...base, flagValue: true }).enabled).toBe(true);
  });
  it("flag on but wrong jurisdiction → OFF", () => {
    expect(isAdapterEnabled({ ...base, tenantJurisdiction: "EG", flagValue: true }).reason).toBe("JURISDICTION_NOT_SUPPORTED");
  });
  it("flag on but no cert → OFF", () => {
    expect(isAdapterEnabled({ ...base, certProvisioned: false, flagValue: true }).reason).toBe("CERT_NOT_PROVISIONED");
  });
});
