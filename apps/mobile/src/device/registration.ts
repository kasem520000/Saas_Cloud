/**
 * PHASE-022 T4 — device registration with capability negotiation
 * (SECURITY_AND_DEVICE_MANAGEMENT §3): one app, two experiences scoped at
 * registration by capability subset: `van_sales` (tenant field rep) or
 * `personal_account` (customer/supplier, read-only device class). The server
 * enforces the subset; the client only declares it.
 */

export type Platform = "android";
export type Capability = "van_sales" | "personal_account";

export interface RegistrationRequest {
  platform: Platform;
  name: string;
  capabilities: readonly Capability[];
}

/** A personal-account device is read-only: no outbox, cursors/meta only
 *  (LOCAL_DATABASE §1.1). */
export function isReadOnlyDevice(capabilities: readonly Capability[]): boolean {
  return capabilities.includes("personal_account") && !capabilities.includes("van_sales");
}

export function validateRegistration(req: RegistrationRequest): string | null {
  if (req.platform !== "android") return "PLATFORM_NOT_ANDROID";
  if (req.capabilities.length === 0) return "NO_CAPABILITY";
  const allowed: readonly Capability[] = ["van_sales", "personal_account"];
  for (const c of req.capabilities) {
    if (!allowed.includes(c)) return "UNKNOWN_CAPABILITY";
  }
  return null;
}
