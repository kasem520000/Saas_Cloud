/**
 * PHASE-021 T6 — rejection UX implementing CONFLICT_RESOLUTION §3 exactly:
 * each typed reason maps to a FIXED set of user actions (no "unknown reason"
 * state — registry fallback shows message + traceId + support hint). Every
 * user choice is audit-logged client-side with the rejecting response's
 * traceId; resend creates a NEW commandId with the same entity id.
 * Administrative reasons (DEVICE_REVOKED / TENANT_SUSPENDED) offer no
 * resubmission — sync stops.
 */
"use client";

import type { Dictionary } from "../i18n/dictionaries";

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

/** CONFLICT_RESOLUTION §3 table — fixed mapping, do not extend ad hoc. */
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

export interface RejectionChoice {
  reason: RejectionReason;
  action: RejectionAction;
  traceId: string; // audit-logged with every user choice (§3 rules)
  atMs: number;
}

export function SyncRejectionDialog(props: {
  d: Dictionary;
  reason: RejectionReason;
  traceId: string;
  onChoose: (choice: RejectionChoice) => void;
  onClose: () => void;
}) {
  const actions = REJECTION_ACTIONS[props.reason];
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold">{props.d.syncRejectionTitle}</h2>
        <p className="mb-1 text-sm text-slate-600">{props.d.syncRejectionReason}: {props.reason}</p>
        <p className="mb-4 text-xs text-slate-400">traceId: {props.traceId}</p>
        {actions.length === 0 ? (
          <p className="mb-4 text-sm text-amber-700">{props.d.syncRejectionAdministrative}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {actions.map((a) => (
              <button
                key={a}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                onClick={() =>
                  props.onChoose({ reason: props.reason, action: a, traceId: props.traceId, atMs: Date.now() })
                }
              >
                {props.d[`syncAction_${a.replaceAll("-", "_")}` as keyof Dictionary] as string}
              </button>
            ))}
          </div>
        )}
        <button className="mt-4 text-sm text-slate-500 underline" onClick={props.onClose}>
          {props.d.syncRejectionClose}
        </button>
      </div>
    </div>
  );
}
