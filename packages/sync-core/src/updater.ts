/**
 * PHASE-021 T8 — auto-update gate logic (RELEASE_STRATEGY §Rollout): signed
 * bundles only, staged rollout 10% → 50% → 100% with crash-rate gates reading
 * the client-stability dashboard. Pure and deterministic — the Tauri updater
 * plugin calls into this; the wire/manifest verification happens in Rust/CI.
 * D-06: unsigned manifests, tampered manifests, and downgrades fail CLOSED.
 */

export interface UpdateManifest {
  version: string; // CalVer
  channel: "stable" | "staging";
  signature: string; // base64 signature over the manifest bytes
  minSupportedVersion: string; // minimum-version force-update floor
  rolloutPercent: number; // 0..100 staged gate for this channel
}

export interface StabilityMetrics {
  crashFreeSessionRate: number; // 0..1
  crashRatePerSession: number; // 0..1 — gate threshold
}

export const ROLLOUT_STAGES: readonly number[] = [10, 50, 100];
export const CRASH_GATE_THRESHOLD = 0.02; // 2% crash rate halts the rollout

export class UpdateRejectedError extends Error {
  constructor(readonly code: "UNSIGNED" | "TAMPERED" | "DOWNGRADE" | "BELOW_MINIMUM" | "ROLLOUT_HALTED" | "WRONG_CHANNEL") {
    super(`update rejected: ${code}`);
    this.name = "UpdateRejectedError";
  }
}

/** Compare CalVer-ish versions "YYYY.MM.PATCH". */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Decide whether the manifest may be served to this client.
 * `signatureValid` is computed by the caller over the raw manifest bytes
 * (Ed25519 in CI); an invalid/missing signature fails closed.
 */
export function evaluateUpdate(input: {
  manifest: UpdateManifest;
  currentVersion: string;
  deviceFingerprint: string; // stable per-device hash for staged %
  signatureValid: boolean;
  metrics: StabilityMetrics;
}): { accept: boolean; reason?: UpdateRejectedError["code"]; stage: number } {
  const { manifest, currentVersion, deviceFingerprint, signatureValid, metrics } = input;
  if (!signatureValid || manifest.signature.length === 0) {
    return { accept: false, reason: "UNSIGNED", stage: 0 };
  }
  if (compareVersions(manifest.version, currentVersion) <= 0) {
    return { accept: false, reason: "DOWNGRADE", stage: 0 }; // downgrade attack fails closed
  }
  if (compareVersions(currentVersion, manifest.minSupportedVersion) < 0) {
    // below the floor → this client MUST update (forced), regardless of stage
    return { accept: true, stage: 100 };
  }
  if (metrics.crashRatePerSession > CRASH_GATE_THRESHOLD || metrics.crashFreeSessionRate < 1 - CRASH_GATE_THRESHOLD) {
    return { accept: false, reason: "ROLLOUT_HALTED", stage: 0 }; // crash gate breached → halt
  }
  // staged percentage: fingerprint bucket must fall inside rolloutPercent
  const bucket = fingerprintBucket(deviceFingerprint);
  if (bucket >= manifest.rolloutPercent) {
    return { accept: false, reason: "ROLLOUT_HALTED", stage: manifest.rolloutPercent };
  }
  return { accept: true, stage: manifest.rolloutPercent };
}

/** Stable 0..99 bucket from a fingerprint (FNV-1a). */
export function fingerprintBucket(fingerprint: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < fingerprint.length; i++) {
    h ^= fingerprint.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}

/** Next stage after the current one (10 → 50 → 100). */
export function nextStage(current: number): number {
  for (const s of ROLLOUT_STAGES) if (s > current) return s;
  return 100;
}
