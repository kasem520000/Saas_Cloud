/**
 * PHASE-022 T10 — parked-rejections screen data: the CONFLICT_RESOLUTION §3
 * reason→actions table, kept as data and asserted for parity with the doc
 * (reconciliation.parity.test.ts). sync-core itself stays unmodified
 * (RISK-011): this is presentation data, not sync behavior.
 */

export type RejectionReason =
  | "PERIOD_LOCKED"
  | "PRICE_CHANGED"
  | "INSUFFICIENT_STOCK"
  | "CREDIT_LIMIT_EXCEEDED"
  | "STALE_VERSION"
  | "ITEM_INACTIVE"
  | "PARTNER_INACTIVE"
  | "VALIDATION_ERROR"
  | "DEVICE_REVOKED"
  | "TENANT_SUSPENDED";

export type RejectionAction =
  | "edit-and-resend"
  | "cancel"
  | "accept-server-price"
  | "accept-partial"
  | "request-approval-online"
  | "review-and-merge"
  | "discard-local-edit"
  | "substitute-and-resend";

export const REJECTION_ACTIONS: Record<RejectionReason, readonly RejectionAction[]> = {
  PERIOD_LOCKED: ["edit-and-resend", "cancel"],
  PRICE_CHANGED: ["accept-server-price", "edit-and-resend", "cancel"],
  INSUFFICIENT_STOCK: ["edit-and-resend", "accept-partial", "cancel"],
  CREDIT_LIMIT_EXCEEDED: ["edit-and-resend", "request-approval-online", "cancel"],
  STALE_VERSION: ["review-and-merge", "discard-local-edit"],
  ITEM_INACTIVE: ["cancel", "substitute-and-resend"],
  PARTNER_INACTIVE: ["cancel", "substitute-and-resend"],
  VALIDATION_ERROR: ["edit-and-resend"],
  DEVICE_REVOKED: [], // administrative: no resubmission, sync stops
  TENANT_SUSPENDED: [],
};

export function isAdministrative(reason: RejectionReason): boolean {
  return REJECTION_ACTIONS[reason].length === 0;
}
