/**
 * Public surface of the notifications module (DEPENDENCY_RULES §1 `api/`):
 * PHASE-014 activates the in-app center — the NotificationsService is the
 * ONLY importable surface for other modules (tenancy billing/lifecycle/usage,
 * reporting assertion failures, sales invoice.overdue). The module itself
 * imports no other business module (identity imports IT for emails — the
 * cycle is forbidden by the boundary rules; callers resolve owner emails).
 */
export {
  NotificationsService,
  type NotificationType,
  type NotifyInput,
  type NotifyOutcome,
} from "../application/notifications-service";
