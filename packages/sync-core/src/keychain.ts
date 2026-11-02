/**
 * PHASE-021 T3/T7 — credential lifecycle for the desktop shell
 * (SECURITY_AND_DEVICE_MANAGEMENT §3): the OS keychain (Windows Credential
 * Manager via the Tauri keychain plugin) holds the device refresh token, the
 * device private key, and the SQLite encryption key. Access tokens live in
 * MEMORY ONLY — never in SQLite, logs, or preferences. The Keychain
 * interface is storage-agnostic; the Tauri binding implements it in the shell.
 */

export interface Keychain {
  get(service: string, account: string): Promise<string | null>;
  set(service: string, account: string, secret: string): Promise<void>;
  delete(service: string, account: string): Promise<void>;
}

export const KEYCHAIN_SERVICES = {
  refreshToken: "erp/device-refresh-token",
  devicePrivateKey: "erp/device-private-key",
  sqliteKey: "erp/sqlite-encryption-key",
} as const;

/** In-memory access-token holder — the ONLY place an access token may live. */
export class MemoryTokenHolder {
  private accessToken: string | null = null;
  private expiresAt = 0;

  set(token: string, expiresAtMs: number): void {
    this.accessToken = token;
    this.expiresAt = expiresAtMs;
  }

  /** Returns the token only while valid; clears on expiry. */
  get(nowMs: number): string | null {
    if (this.accessToken === null) return null;
    if (nowMs >= this.expiresAt) {
      this.accessToken = null;
      return null;
    }
    return this.accessToken;
  }

  clear(): void {
    this.accessToken = null;
    this.expiresAt = 0;
  }
}

/** Refresh-token rotation with one-time-use semantics (ADR-0015 §3):
 *  a stored refresh token is consumed on exchange; reuse of an already-consumed
 *  token is a theft signal → the caller must revoke the chain. */
export class CredentialLifecycle {
  constructor(
    private readonly keychain: Keychain,
    private readonly memory: MemoryTokenHolder,
    private readonly deviceId: string,
  ) {}

  async storeRefreshToken(token: string): Promise<void> {
    await this.keychain.set(KEYCHAIN_SERVICES.refreshToken, this.deviceId, token);
  }

  /** Consume the stored refresh token for a rotation exchange (one-time-use). */
  async consumeRefreshToken(): Promise<string | null> {
    const token = await this.keychain.get(KEYCHAIN_SERVICES.refreshToken, this.deviceId);
    if (token !== null) await this.keychain.delete(KEYCHAIN_SERVICES.refreshToken, this.deviceId);
    return token;
  }

  async storeDeviceKey(privateKey: string): Promise<void> {
    await this.keychain.set(KEYCHAIN_SERVICES.devicePrivateKey, this.deviceId, privateKey);
  }

  async storeSqliteKey(key: string): Promise<void> {
    await this.keychain.set(KEYCHAIN_SERVICES.sqliteKey, this.deviceId, key);
  }

  async getSqliteKey(): Promise<string | null> {
    return this.keychain.get(KEYCHAIN_SERVICES.sqliteKey, this.deviceId);
  }

  setAccessToken(token: string, ttlMs: number, nowMs: number): void {
    this.memory.set(token, nowMs + ttlMs);
  }

  accessToken(nowMs: number): string | null {
    return this.memory.get(nowMs);
  }

  /** Lock: wipe the in-memory access token (keychain entries survive unlock). */
  lock(): void {
    this.memory.clear();
  }
}
