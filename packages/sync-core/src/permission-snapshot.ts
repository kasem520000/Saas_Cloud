/**
 * PHASE-021 T3 — cached permission-snapshot watermark
 * (OFFLINE_CAPABILITIES_MATRIX desktop column / SECURITY_AND_DEVICE_MANAGEMENT
 * §4): offline login/unlock works against the cached snapshot; once the
 * snapshot is older than 7 days the app degrades to READ-ONLY and requires
 * online for any write. Pure, deterministic logic.
 */

export const PERMISSION_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type PermissionGate =
  | { mode: "full-offline" }
  | { mode: "read-only"; reason: "WATERMARK_EXPIRED" | "CONTRACT_GATE"; watermarkAgeMs?: number };

export function evaluatePermissionGate(input: {
  snapshotFetchedAtMs: number | null;
  nowMs: number;
  contractGateOpen: boolean; // false when server contract version > client (read-only + update prompt)
}): PermissionGate {
  if (!input.contractGateOpen) {
    return { mode: "read-only", reason: "CONTRACT_GATE" };
  }
  if (input.snapshotFetchedAtMs === null) {
    return { mode: "read-only", reason: "WATERMARK_EXPIRED", watermarkAgeMs: undefined };
  }
  const age = input.nowMs - input.snapshotFetchedAtMs;
  if (age > PERMISSION_SNAPSHOT_MAX_AGE_MS) {
    return { mode: "read-only", reason: "WATERMARK_EXPIRED", watermarkAgeMs: age };
  }
  return { mode: "full-offline" };
}
