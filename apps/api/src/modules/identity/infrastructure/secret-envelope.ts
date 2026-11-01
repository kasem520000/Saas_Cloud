import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "../../../config/env";

/**
 * Application-level secret envelope for TOTP secrets at rest
 * (SECRETS_MANAGEMENT: secrets encrypted, never logged; ADR-0015 §4):
 * AES-256-GCM, key from the environment (IDENTITY_SECRET_KEY, base64,
 * 32 bytes) — never from the repo. Ciphertext carries a key id so key
 * rotation is a key-add + re-enroll, not a re-architecture. Development
 * and test derive a deterministic local key so flows stay exercisable
 * without committing secrets; production fails closed when unset.
 */

const DEV_KEY_ID = "dev";
const DEV_KEY_MATERIAL = createHash("sha256")
  .update("erp-dev-identity-secret-key-do-not-use-in-prod")
  .digest();

function keyMaterial(): { keyId: string; key: Buffer } {
  const raw = env.IDENTITY_SECRET_KEY;
  if (raw !== undefined && raw !== "") {
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
      throw new Error("IDENTITY_SECRET_KEY must be 32 bytes (base64)");
    }
    return { keyId: env.IDENTITY_SECRET_KEY_ID || "v1", key };
  }
  if (env.NODE_ENV === "production") {
    throw new Error("IDENTITY_SECRET_KEY is required in production");
  }
  return { keyId: DEV_KEY_ID, key: DEV_KEY_MATERIAL };
}

/** Encrypt a secret into the `v1:{keyId}:{nonce}:{ct+tag}` envelope. */
export function sealSecret(plaintext: string): string {
  const { keyId, key } = keyMaterial();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${keyId}:${nonce.toString("base64url")}:${Buffer.concat([ciphertext, tag]).toString("base64url")}`;
}

/** Decrypt an envelope produced by sealSecret (same key id). */
export function openSecret(envelope: string): string {
  const parts = envelope.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("malformed secret envelope");
  }
  const [, keyId, nonceB64, payloadB64] = parts as [string, string, string, string];
  const { keyId: currentId, key } = keyMaterial();
  if (keyId !== currentId) {
    throw new Error(`secret envelope key id ${keyId} is not active (rotation required)`);
  }
  const nonce = Buffer.from(nonceB64, "base64url");
  const payload = Buffer.from(payloadB64, "base64url");
  const tag = payload.subarray(payload.length - 16);
  const ciphertext = payload.subarray(0, payload.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
