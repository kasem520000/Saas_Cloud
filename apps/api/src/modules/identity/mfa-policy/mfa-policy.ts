/**
 * PHASE-024 T4 — MFA enforcement policies per role template × plan
 * (ADR-0015 §4 "mandatory-able per role/plan policy later"). Enforcement
 * point: login returns 423 MFA_REQUIRED until the user is enrolled, unless
 * the policy for (role template, plan) is EXEMPT. Defaults preserve current
 * behavior — no forced MFA until a tenant/plan enables it (migration rule).
 */

export type RoleTemplate = "owner" | "accountant" | "cashier" | "viewer" | string;
export type PlanKey = string;
export type MfaPolicy = "mandatory" | "optional" | "exempt";

export interface MfaPolicyConfig {
  /** roleTemplate → policy; plan-level overrides via planOverrides. */
  byRole: Record<string, MfaPolicy>;
  byPlan: Record<string, MfaPolicy>;
}

export const DEFAULT_MFA_POLICY: MfaPolicyConfig = { byRole: {}, byPlan: {} };

export type EnforcementDecision =
  | { required: true; reason: "ROLE_MANDATORY" | "PLAN_MANDATORY" }
  | { required: false; reason: "EXEMPT" | "OPTIONAL" | "DEFAULT_OPTIONAL" };

/** Plan-level policy wins over role-level; default is optional (ADR-0015 §4
 *  backwards compatibility — no forced MFA until configured). */
export function evaluateMfaPolicy(
  config: MfaPolicyConfig,
  input: { roleTemplate: RoleTemplate; planKey: PlanKey },
): EnforcementDecision {
  const plan = config.byPlan[input.planKey];
  if (plan === "exempt") return { required: false, reason: "EXEMPT" };
  if (plan === "mandatory") return { required: true, reason: "PLAN_MANDATORY" };
  const role = config.byRole[input.roleTemplate];
  if (role === "exempt") return { required: false, reason: "EXEMPT" };
  if (role === "mandatory") return { required: true, reason: "ROLE_MANDATORY" };
  return { required: false, reason: "DEFAULT_OPTIONAL" };
}

/** Login gate: 423 MFA_REQUIRED when policy requires MFA and the user has no
 *  active MFA method. */
export function loginGate(
  config: MfaPolicyConfig,
  input: { roleTemplate: RoleTemplate; planKey: PlanKey; mfaEnrolled: boolean },
): { status: 200 } | { status: 423; code: "MFA_REQUIRED" } {
  const decision = evaluateMfaPolicy(config, input);
  if (decision.required && !input.mfaEnrolled) return { status: 423, code: "MFA_REQUIRED" };
  return { status: 200 };
}

/** Recovery codes are single-use: a consumed code can never be reused. */
export class RecoveryCodeHygiene {
  private readonly used = new Set<string>();
  consume(codeHash: string): boolean {
    if (this.used.has(codeHash)) return false;
    this.used.add(codeHash);
    return true;
  }
}
