/**
 * PHASE-030 T11 — Blueprint v2.0 industry UI presets (configuration-only).
 *
 * These presets are pure data consumed by the app shell / dashboard. They
 * introduce NO new archetypes, NO new routes with bespoke logic, and NO new
 * permission keys: every target below already exists (sales, pos, notes,
 * inventory, partners). Templates are configuration, never a fork (INV-022).
 *
 * - industry.wholesale: quick-order workspace + credit & collections emphasis
 *   (PDC custody, maturity calendar, customer statements relabeled).
 * - industry.electronics: trade-in intake + IMEI register emphasis + repair
 *   card relabel.
 */

export type IndustryPresetId = "industry.wholesale" | "industry.electronics" | "industry.healthcare" | "industry.education" | "industry.agriculture";

export interface PresetNavItem {
  id: string;
  /** Existing route target — presets only point at existing screens. */
  target: string;
  featureKey?: string;
}

export interface IndustryPreset {
  id: IndustryPresetId;
  /** Workspace presets surfaced on the template home. */
  workspaces: PresetNavItem[];
  /** Dashboard emphasis: report keys pinned by the manifest (existing registry keys). */
  dashboardReports: string[];
  /** Terminology relabels (mirrors manifest.terminology_overrides, UI side only). */
  relabels: Record<string, { en: string; ar: string }>;
}

export const WHOLESALE_PRESET: IndustryPreset = {
  id: "industry.wholesale",
  workspaces: [
    { id: "quick_order", target: "sales.quick_order" },
    { id: "quotes", target: "sales.quotations" },
    { id: "orders", target: "sales.orders" },
    { id: "deliveries", target: "sales.deliveries" },
    { id: "credit_invoices", target: "sales.invoices" },
    { id: "statements", target: "partners.statements" },
    { id: "pdc_custody", target: "notes.received", featureKey: "notes.received" },
    { id: "maturity_calendar", target: "notes.pdc_calendar", featureKey: "notes.pdc_calendar" },
  ],
  dashboardReports: [
    "notes.maturity-calendar",
    "partners.ar_aging",
    "notes.aging",
    "inventory.stock_valuation",
  ],
  relabels: {
    "doc.sales_invoice": { en: "Wholesale sales invoice", ar: "فاتورة بيع جملة" },
    "doc.quotation": { en: "Trade quote", ar: "عرض السعر" },
    "doc.sales_order": { en: "Bulk order", ar: "أمر التوريد" },
    "billing.statement": { en: "Customer statement", ar: "كشف حساب العميل" },
    "notes.pdc": { en: "Post-dated note", ar: "شيك مؤجل" },
  },
};

export const ELECTRONICS_PRESET: IndustryPreset = {
  id: "industry.electronics",
  workspaces: [
    { id: "trade_in_intake", target: "purchasing.goods_receipts" },
    { id: "imei_register", target: "reports.retail_imei_register" },
    { id: "pos_sales", target: "pos.sales" },
    { id: "repair_cards", target: "crm.service_orders", featureKey: "crm.service_orders" },
    { id: "quotes", target: "sales.quotations" },
    { id: "invoices", target: "sales.invoices" },
  ],
  dashboardReports: [
    "retail.imei_register",
    "pos.sales_by_terminal",
    "pos.sales_by_hour",
    "inventory.stock_valuation",
  ],
  relabels: {
    "crm.service_order": { en: "Repair card", ar: "بطاقة إصلاح" },
    "inventory.serial": { en: "IMEI / serial", ar: "رقم IMEI / Serial" },
  },
};

export const HEALTHCARE_PRESET: IndustryPreset = {
  id: "industry.healthcare",
  workspaces: [
    { id: "visits", target: "crm.service_orders", featureKey: "crm.service_orders" },
    { id: "invoices_payer", target: "sales.invoices" },
    { id: "claims_by_insurer", target: "partners.statements" },
    { id: "expiry_control", target: "reports.inventory_expiry_list" },
    { id: "pharmacy_counter", target: "pos.sales", featureKey: "pos.sales" },
    { id: "claim_cheques", target: "notes.received", featureKey: "notes.received" },
  ],
  dashboardReports: [
    "notes.aging",
    "notes.maturity-calendar",
    "partners.ar_aging",
    "inventory.expiry_list",
  ],
  relabels: {
    "partner.patient": { en: "Patient (financial file)", ar: "المريض (الملف المالي)" },
    "partner.insurer": { en: "Insurance company", ar: "شركة التأمين" },
    "doc.claim_ref": { en: "Insurance claim", ar: "مطالبة تأمينية" },
    "doc.sales_invoice": { en: "Medical services invoice", ar: "فاتورة الخدمات الطبية" },
  },
};

export const EDUCATION_PRESET: IndustryPreset = {
  id: "industry.education",
  workspaces: [
    { id: "enrollment_contracts", target: "crm.contracts", featureKey: "crm.service_contracts" },
    { id: "guardians", target: "partners.directory" },
    { id: "fee_schedules", target: "items.price_lists", featureKey: "items.price_lists" },
    { id: "tuition_invoices", target: "sales.invoices" },
    { id: "installment_plans", target: "installments.plans", featureKey: "installments.plans" },
    { id: "collections", target: "installments.collections", featureKey: "installments.collections" },
    { id: "receipts", target: "treasury.receipts", featureKey: "treasury.receipts_disbursements" },
  ],
  dashboardReports: [
    "installments.schedule",
    "installments.aging",
    "services.contract_revenue_schedule",
    "partners.ar_aging",
  ],
  relabels: {
    "partner.student": { en: "Student (financial file)", ar: "الطالب (الملف المالي)" },
    "partner.guardian": { en: "Guardian (payer)", ar: "ولي الأمر (الدافع)" },
    "crm.contract": { en: "Enrollment contract", ar: "عقد الالتحاق" },
    "installments.plan": { en: "Installment plan", ar: "خطة الأقساط" },
    "installments.line": { en: "Tuition installment", ar: "القسط" },
    "sales.discount": { en: "Sibling discount", ar: "خصم الأشقاء" },
  },
};

export const AGRICULTURE_PRESET: IndustryPreset = {
  id: "industry.agriculture",
  workspaces: [
    { id: "crop_cycles", target: "manufacturing.production_orders", featureKey: "manufacturing.production_orders" },
    { id: "field_projects", target: "accounting.projects", featureKey: "accounting.projects" },
    { id: "input_purchases", target: "purchasing.goods_receipts", featureKey: "purchasing.goods_receipts" },
    { id: "harvest_batches", target: "inventory.batches", featureKey: "inventory.batch_tracking" },
    { id: "produce_sales", target: "sales.invoices" },
    { id: "per_field_profit", target: "reports.manufacturing_production_cost" },
  ],
  dashboardReports: [
    "manufacturing.production_cost",
    "inventory.stock_valuation",
    "inventory.expiry_list",
    "manufacturing.batch_genealogy",
  ],
  relabels: {
    "manufacturing.production_order": { en: "Crop cycle", ar: "الدورة الزراعية" },
    "accounting.project": { en: "Field project", ar: "مشروع الحقل" },
    "inventory.batch": { en: "Harvest batch", ar: "دفعة الحصاد" },
    "inventory.serial": { en: "Head (livestock)", ar: "رأس (الماشية)" },
  },
};

export const INDUSTRY_PRESETS: Record<IndustryPresetId, IndustryPreset> = {
  "industry.wholesale": WHOLESALE_PRESET,
  "industry.electronics": ELECTRONICS_PRESET,
  "industry.healthcare": HEALTHCARE_PRESET,
  "industry.education": EDUCATION_PRESET,
  "industry.agriculture": AGRICULTURE_PRESET,
};

