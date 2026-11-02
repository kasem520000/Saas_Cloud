/**
 * PHASE-022 T4 — SecureStore binding (ADR-0014 §3, SECURITY_AND_DEVICE_MANAGEMENT
 * §3): on Android this is expo-secure-store backed by the Android Keystore.
 * Secrets (refresh token, device private key, SQLCipher DB key) exist ONLY
 * here; access tokens are memory-only (sync-core MemoryTokenHolder). The
 * interface is structural so tests use a fake.
 */

import type { Keychain } from "@erp/sync-core";

export interface SecureStoreLike {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export class SecureStoreKeychain implements Keychain {
  constructor(private readonly store: SecureStoreLike) {}
  async get(service: string, account: string) {
    return this.store.getItemAsync(`${service}|${account}`);
  }
  async set(service: string, account: string, secret: string) {
    await this.store.setItemAsync(`${service}|${account}`, secret);
  }
  async delete(service: string, account: string) {
    await this.store.deleteItemAsync(`${service}|${account}`);
  }
}

/** Biometric gate with PIN fallback (ADR-0014 §3): unlock succeeds via
 *  biometrics OR the locally stored PIN hash; neither blocks forever. */
export interface BiometricLike {
  hasHardwareAsync(): Promise<boolean>;
  isEnrolledAsync(): Promise<boolean>;
  authenticateAsync(prompt: string): Promise<{ success: boolean }>;
}

export type UnlockResult = { ok: true; method: "biometric" | "pin" } | { ok: false };

export async function unlock(
  biometric: BiometricLike | null,
  pinHash: string | null,
  prompt: string,
  candidatePinHash?: string,
): Promise<UnlockResult> {
  if (biometric !== null) {
    const [hw, enrolled] = await Promise.all([biometric.hasHardwareAsync(), biometric.isEnrolledAsync()]);
    if (hw && enrolled) {
      const res = await biometric.authenticateAsync(prompt);
      if (res.success) return { ok: true, method: "biometric" };
    }
  }
  if (pinHash !== null && candidatePinHash !== undefined && candidatePinHash === pinHash) {
    return { ok: true, method: "pin" };
  }
  return { ok: false };
}
