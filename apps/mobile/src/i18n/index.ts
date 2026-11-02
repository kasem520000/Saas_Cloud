/**
 * PHASE-022 T3 — RTL-first i18n runtime (ADR-0014, RTL_DESIGN_RULES):
 * Arabic-first catalogs with EN parity, digits policy (identifiers and
 * numbers render `latn`), and the RTL direction helper consumed at app root
 * (`I18nManager.forceRTL(true)` under `ar`). Physical style props
 * (marginLeft/right, textAlign left/right…) are banned by the lint rule in
 * eslint.config.mjs — logical props only.
 */

export type Locale = "ar" | "en";

export const DEFAULT_LOCALE: Locale = "ar";

export function isRTL(locale: Locale): boolean {
  return locale === "ar";
}

/** Digits policy: identifiers/amounts always latn; display digits follow the
 *  tenant numeral system (default latn, `arab` optional per configuration). */
export type DigitPolicy = "latn" | "arab";
export function renderDigits(text: string, policy: DigitPolicy): string {
  if (policy === "latn") return text;
  const map: Record<string, string> = { "0": "٠", "1": "١", "2": "٢", "3": "٣", "4": "٤", "5": "٥", "6": "٦", "7": "٧", "8": "٨", "9": "٩" };
  return text.replace(/[0-9]/g, (d) => map[d] ?? d);
}

export interface MobileStrings {
  appName: string;
  syncNow: string;
  offline: string;
  pendingSync: string;
  posted: string;
  rejected: string;
  asOf: string;
  approvalsOnlineOnly: string;
  vanSale: string;
  collection: string;
  vanLoadUnload: string;
  returnsDraft: string;
  countLines: string;
  personalAccount: string;
  balance: string;
  statement: string;
  invoices: string;
  receipts: string;
  dueDates: string;
  readOnlyNotice: string;
  biometricUnlock: string;
  pinFallback: string;
  deviceRevoked: string;
  updateRequired: string;
}

export const ar: MobileStrings = {
  appName: "نظامERP",
  syncNow: "مزامنة الآن",
  offline: "دون اتصال",
  pendingSync: "بانتظار المزامنة",
  posted: "مرحَّل",
  rejected: "مرفوض",
  asOf: "آخر بيانات: {ts}",
  approvalsOnlineOnly: "الموافقات تتطلب اتصالاً — غير متاحة دون اتصال",
  vanSale: "بيع من السيارة",
  collection: "تحصيل",
  vanLoadUnload: "تحميل/تفريغ السيارة",
  returnsDraft: "مرتجع (مسودة)",
  countLines: "بنود الجرد",
  personalAccount: "حساب شخصي",
  balance: "الرصيد",
  statement: "كشف حساب",
  invoices: "الفواتير",
  receipts: "سندات القبض",
  dueDates: "الاستحقاقات",
  readOnlyNotice: "هذا الجهاز للقراءة فقط",
  biometricUnlock: "فتح بالبصمة",
  pinFallback: "رمز PIN",
  deviceRevoked: "تم إبطال هذا الجهاز — تم إيقاف المزامنة",
  updateRequired: "يلزم تحديث التطبيق",
};

export const en: MobileStrings = {
  appName: "ERP",
  syncNow: "Sync now",
  offline: "Offline",
  pendingSync: "Pending sync",
  posted: "Posted",
  rejected: "Rejected",
  asOf: "Data as of {ts}",
  approvalsOnlineOnly: "Approvals require a connection — unavailable offline",
  vanSale: "Van sale",
  collection: "Collection",
  vanLoadUnload: "Van load/unload",
  returnsDraft: "Return (draft)",
  countLines: "Count lines",
  personalAccount: "Personal account",
  balance: "Balance",
  statement: "Statement",
  invoices: "Invoices",
  receipts: "Receipts",
  dueDates: "Due dates",
  readOnlyNotice: "This device is read-only",
  biometricUnlock: "Biometric unlock",
  pinFallback: "PIN",
  deviceRevoked: "This device was revoked — sync stopped",
  updateRequired: "App update required",
};

export const catalogs: Record<Locale, MobileStrings> = { ar, en };

export function t(locale: Locale, key: keyof MobileStrings, vars?: Record<string, string>): string {
  let s = catalogs[locale][key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}
