/**
 * PHASE-024 T11 — offboarding purge guard: a legal-hold flag BLOCKS the purge
 * job (Journey H); purge runs only after the retention window and only with
 * an export manifest + checksums. The guard is pure and unit-tested; the
 * staging end-to-end drill is recorded in the findings log as a deferral.
 */

export interface PurgeGateInput {
  legalHold: boolean;
  retentionWindowElapsed: boolean;
  exportManifestWritten: boolean;
  suspended: boolean;
}

export type PurgeDecision =
  | { allowed: true }
  | { allowed: false; reason: "LEGAL_HOLD" | "RETENTION_WINDOW" | "NOT_SUSPENDED" | "NO_EXPORT_MANIFEST" };

export function evaluatePurgeGate(input: PurgeGateInput): PurgeDecision {
  if (input.legalHold) return { allowed: false, reason: "LEGAL_HOLD" };
  if (!input.suspended) return { allowed: false, reason: "NOT_SUSPENDED" };
  if (!input.retentionWindowElapsed) return { allowed: false, reason: "RETENTION_WINDOW" };
  if (!input.exportManifestWritten) return { allowed: false, reason: "NO_EXPORT_MANIFEST" };
  return { allowed: true };
}
