/**
 * PHASE-021 T5 — offline UI affordance (OFFLINE_CAPABILITIES_MATRIX desktop
 * column): a shell chrome badge driven by the sync host state. Honest states
 * only: ONLINE / OFFLINE / SYNCING / READ_ONLY (contract-version gate or
 * 7-day permission watermark → read-only + online-required for writes).
 * ONLINE-ONLY rows are disabled elsewhere in the UI — never queued here.
 */
"use client";

import type { Dictionary } from "../i18n/dictionaries";
import { formatMessage } from "../lib/messages";

export type OfflineState = "online" | "offline" | "syncing" | "read-only";

export function OfflineStatusBadge(props: {
  d: Dictionary;
  state: OfflineState;
  queuedCount?: number;
  asOf?: string;
}) {
  const { d, state, queuedCount, asOf } = props;
  const label =
    state === "online"
      ? d.offlineBadgeOnline
      : state === "offline"
        ? d.offlineBadgeOffline
        : state === "syncing"
          ? d.offlineBadgeSyncing
          : d.offlineBadgeReadOnly;
  const tone =
    state === "online"
      ? "bg-emerald-100 text-emerald-800"
      : state === "read-only"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-200 text-slate-700";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${tone}`}>
      <span aria-hidden>{state === "syncing" ? "…" : "●"}</span>
      <span>{label}</span>
      {typeof queuedCount === "number" && queuedCount > 0 && (
        <span>{formatMessage(d.offlineQueuedCount, { count: queuedCount })}</span>
      )}
      {asOf !== undefined && <span className="opacity-70">{formatMessage(d.offlineAsOf, { ts: asOf })}</span>}
    </span>
  );
}
