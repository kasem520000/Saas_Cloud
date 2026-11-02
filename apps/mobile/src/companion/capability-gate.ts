/**
 * PHASE-022 T8 — companion-screen capability gate: approvals are ONLINE-ONLY
 * (matrix row 16) — disabled with a reason when offline, NEVER queued or
 * simulated. Dashboards/statements are READ-CACHED with as-of labels.
 */

export type CompanionAction = "view_dashboard" | "view_statement" | "approve" | "search_master_data";

export function canPerform(action: CompanionAction, online: boolean): { allowed: boolean; reason?: string } {
  switch (action) {
    case "approve":
      return online ? { allowed: true } : { allowed: false, reason: "APPROVALS_ONLINE_ONLY" };
    case "view_dashboard":
    case "view_statement":
    case "search_master_data":
      return { allowed: true }; // READ-CACHED
  }
}
