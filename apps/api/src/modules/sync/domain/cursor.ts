import { createHmac } from "node:crypto";

/**
 * PHASE-020 T5 — opaque signed sync cursors (SYNC_PROTOCOL §2): the token wraps
 * `{entityType, seq, issuedAt}` and carries an HMAC-SHA256 signature, so a
 * client can neither forge nor read a cursor, and a tampered/replayed token
 * from another tenant fails verification. Cursor semantics: the seq is the
 * last APPLIED change; the next page is (seq, +∞).
 */

export interface CursorPayload {
  entityType: string;
  seq: number;
  issuedAt: number;
}

const getSecret = (): string =>
  process.env.SYNC_CURSOR_SECRET ?? "dev-only-sync-cursor-secret-not-for-production";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signCursor(payload: CursorPayload): string {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export class CursorError extends Error {
  constructor(readonly code: "MALFORMED" | "BAD_SIGNATURE" | "WRONG_ENTITY" | "CURSOR_REGRESSION") {
    super(`cursor ${code}`);
    this.name = "CursorError";
  }
}

export function verifyCursor(token: string, entityType: string, currentSeq?: number): CursorPayload {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) throw new CursorError("MALFORMED");
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", getSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !a.equals(b)) throw new CursorError("BAD_SIGNATURE");
  let payload: CursorPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CursorPayload;
  } catch {
    throw new CursorError("MALFORMED");
  }
  if (typeof payload.seq !== "number" || typeof payload.entityType !== "string") {
    throw new CursorError("MALFORMED");
  }
  if (payload.entityType !== entityType) throw new CursorError("WRONG_ENTITY");
  // C-12: a cursor older than the device's persisted cursor is a regression —
  // the server answers with a resync directive instead of serving stale pages.
  if (currentSeq !== undefined && payload.seq < currentSeq) throw new CursorError("CURSOR_REGRESSION");
  return payload;
}

/** Fresh bootstrap cursor (seq 0) for an entity the device has never pulled. */
export function bootstrapCursor(entityType: string): string {
  return signCursor({ entityType, seq: 0, issuedAt: Date.now() });
}
