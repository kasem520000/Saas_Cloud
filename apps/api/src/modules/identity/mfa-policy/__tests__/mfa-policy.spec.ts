/**
 * PHASE-024 T4 — MFA enforcement matrix tests: every (role × plan × policy)
 * combination behaves; 423 MFA_REQUIRED only under mandatory policy without
 * enrollment; defaults unchanged (optional); recovery codes single-use.
 */
import { describe, expect, it } from "vitest";
import { evaluateMfaPolicy, loginGate, RecoveryCodeHygiene, DEFAULT_MFA_POLICY, type MfaPolicyConfig } from "../mfa-policy";

const config: MfaPolicyConfig = {
  byRole: { owner: "mandatory", cashier: "exempt" },
  byPlan: { enterprise: "mandatory", basic: "exempt" },
};

describe("MFA enforcement matrix", () => {
  it("plan mandatory → required regardless of role", () => {
    expect(evaluateMfaPolicy(config, { roleTemplate: "viewer", planKey: "enterprise" })).toEqual({ required: true, reason: "PLAN_MANDATORY" });
  });
  it("plan exempt wins over role mandatory", () => {
    expect(evaluateMfaPolicy(config, { roleTemplate: "owner", planKey: "basic" })).toEqual({ required: false, reason: "EXEMPT" });
  });
  it("role mandatory → required", () => {
    expect(evaluateMfaPolicy(config, { roleTemplate: "owner", planKey: "pro" }).reason).toBe("ROLE_MANDATORY");
  });
  it("role exempt → not required", () => {
    expect(evaluateMfaPolicy(config, { roleTemplate: "cashier", planKey: "pro" }).reason).toBe("EXEMPT");
  });
  it("default config → optional (backwards compatible, ADR-0015 §4)", () => {
    expect(evaluateMfaPolicy(DEFAULT_MFA_POLICY, { roleTemplate: "owner", planKey: "any" }).required).toBe(false);
  });

  it("login gate: 423 only when mandatory AND not enrolled", () => {
    expect(loginGate(config, { roleTemplate: "owner", planKey: "pro", mfaEnrolled: false })).toEqual({ status: 423, code: "MFA_REQUIRED" });
    expect(loginGate(config, { roleTemplate: "owner", planKey: "pro", mfaEnrolled: true })).toEqual({ status: 200 });
    expect(loginGate(config, { roleTemplate: "cashier", planKey: "pro", mfaEnrolled: false })).toEqual({ status: 200 });
    expect(loginGate(DEFAULT_MFA_POLICY, { roleTemplate: "owner", planKey: "any", mfaEnrolled: false })).toEqual({ status: 200 });
  });

  it("recovery codes are single-use", () => {
    const h = new RecoveryCodeHygiene();
    expect(h.consume("hash-1")).toBe(true);
    expect(h.consume("hash-1")).toBe(false);
    expect(h.consume("hash-2")).toBe(true);
  });
});
