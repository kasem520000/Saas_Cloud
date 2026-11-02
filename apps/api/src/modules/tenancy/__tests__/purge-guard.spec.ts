/**
 * PHASE-024 T11 — purge gate: legal hold blocks; retention window, suspension
 * and export manifest are all required; certificate-path purge is part of
 * the same gate (SECRETS_MANAGEMENT §6.6).
 */
import { describe, expect, it } from "vitest";
import { evaluatePurgeGate } from "../application/purge-guard";

describe("offboarding purge gate", () => {
  const base = { legalHold: false, retentionWindowElapsed: true, exportManifestWritten: true, suspended: true };
  it("happy path: all conditions met → purge allowed", () => {
    expect(evaluatePurgeGate(base)).toEqual({ allowed: true });
  });
  it("legal hold blocks even when everything else is ready", () => {
    const d = evaluatePurgeGate({ ...base, legalHold: true });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toBe("LEGAL_HOLD");
  });
  it("retention window / suspension / export manifest each block independently", () => {
    const r = evaluatePurgeGate({ ...base, retentionWindowElapsed: false });
    expect(r.allowed === false && r.reason).toBe("RETENTION_WINDOW");
    const s2 = evaluatePurgeGate({ ...base, suspended: false });
    expect(s2.allowed === false && s2.reason).toBe("NOT_SUSPENDED");
    const m = evaluatePurgeGate({ ...base, exportManifestWritten: false });
    expect(m.allowed === false && m.reason).toBe("NO_EXPORT_MANIFEST");
  });
});
