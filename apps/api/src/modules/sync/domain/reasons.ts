/**
 * PHASE-020 T6 — the typed push-rejection reason registry (SYNC_PROTOCOL §3,
 * ERROR_MODEL §4). Every REJECTED per-item result carries exactly one of these
 * codes plus machine-readable `details`, a `resubmittable` flag, and a
 * localized message (AR+EN). Additions follow the registry PR process and must
 * update the chaos contract together (SYNC_TESTS §9 rule 3).
 */

export const PUSH_REASONS = [
  "PERIOD_LOCKED",
  "PRICE_CHANGED",
  "INSUFFICIENT_STOCK",
  "CREDIT_LIMIT_EXCEEDED",
  "STALE_VERSION",
  "VALIDATION_ERROR",
  "ITEM_INACTIVE",
  "PARTNER_INACTIVE",
  "DUPLICATE_COMMAND",
  "DEVICE_REVOKED",
  "TENANT_SUSPENDED",
  "CONTRACT_VERSION_UNSUPPORTED",
  "FORBIDDEN",
  "BATCH_TOO_LARGE",
  "NOT_IMPLEMENTED",
] as const;

export type PushReason = (typeof PUSH_REASONS)[number];

export interface LocalizedText {
  en: string;
  ar: string;
}

const MESSAGES: Record<PushReason, LocalizedText> = {
  PERIOD_LOCKED: { en: "The accounting period is locked", ar: "الفترة المحاسبية مغلقة" },
  PRICE_CHANGED: { en: "The price changed since your last sync", ar: "تغير السعر منذ آخر مزامنة" },
  INSUFFICIENT_STOCK: { en: "Insufficient stock for the requested quantity", ar: "مخزون غير كافٍ للكمية المطلوبة" },
  CREDIT_LIMIT_EXCEEDED: { en: "The partner credit limit would be exceeded", ar: "سيتم تجاوز حد الائتمان للعميل" },
  STALE_VERSION: { en: "The entity changed on the server since your base version", ar: "تغير الكيان على الخادم منذ نسختك الأساسية" },
  VALIDATION_ERROR: { en: "The command payload failed validation", ar: "فشل التحقق من بيانات الأمر" },
  ITEM_INACTIVE: { en: "The item is inactive", ar: "البند غير مفعّل" },
  PARTNER_INACTIVE: { en: "The partner is inactive or archived", ar: "الشريك غير مفعّل أو مؤرشف" },
  DUPLICATE_COMMAND: { en: "This command was already processed", ar: "تمت معالجة هذا الأمر سابقاً" },
  DEVICE_REVOKED: { en: "This device has been revoked", ar: "تم إبطال هذا الجهاز" },
  TENANT_SUSPENDED: { en: "The tenant subscription is suspended", ar: "اشتراك المستأجر معلّق" },
  CONTRACT_VERSION_UNSUPPORTED: { en: "Client contract version is not supported; update required", ar: "نسخة عقد العميل غير مدعومة؛ требуется تحديث" },
  FORBIDDEN: { en: "Not permitted for this device or entity", ar: "غير مسموح لهذا الجهاز أو الكيان" },
  BATCH_TOO_LARGE: { en: "The batch exceeds the protocol budget", ar: "تجاوزت الدفعة حد البروتوكول" },
  NOT_IMPLEMENTED: { en: "This intent is not implemented on the server yet", ar: "هذه النية غير منفذة على الخادم بعد" },
};

/** Codes that mean the command must never be retried as-is. */
const NON_RESUBMITTABLE: ReadonlySet<PushReason> = new Set([
  "DEVICE_REVOKED",
  "TENANT_SUSPENDED",
  "CONTRACT_VERSION_UNSUPPORTED",
  "DUPLICATE_COMMAND",
]);

export function rejection(reason: PushReason, details: Record<string, unknown> = {}): {
  errorCode: PushReason;
  message: LocalizedText;
  details: Record<string, unknown>;
  resubmittable: boolean;
} {
  return {
    errorCode: reason,
    message: MESSAGES[reason],
    details,
    resubmittable: !NON_RESUBMITTABLE.has(reason),
  };
}
