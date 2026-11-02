import io

p = "apps/web/i18n/dictionaries.ts"
src = io.open(p, encoding="utf-8").read()

iface_keys = """
  // -- PHASE-014: subscription, billing, notifications, pricing, dashboard --
  navNotifications: string;
  navBilling: string;
  pricingTitle: string;
  pricingSubtitle: string;
  pricingPerMonth: string;
  pricingFeatures: string;
  pricingChoose: string;
  pricingCurrentPlan: string;
  pricingLoadError: string;
  pricingConfigNote: string;
  billingTitle: string;
  billingPlanLabel: string;
  billingStatusLabel: string;
  billingPeriodLabel: string;
  billingTrialEndsLabel: string;
  billingGraceEndsLabel: string;
  billingReadOnlyBanner: string;
  billingNoSubscription: string;
  billingUsageTitle: string;
  billingCurrent: string;
  billingLimit: string;
  billingUnlimited: string;
  billingHistoryTitle: string;
  billingInvoices: string;
  billingEvents: string;
  billingNumber: string;
  billingAmount: string;
  billingDue: string;
  billingPaidVia: string;
  billingCheckout: string;
  billingChangePlan: string;
  billingCheckoutError: string;
  billingOpenInvoicesNote: string;
  notifTitle: string;
  notifUnread: string;
  notifEmpty: string;
  notifPreferences: string;
  notifInApp: string;
  notifEmail: string;
  notifMarkRead: string;
  notifLoadError: string;
  dashWidgetsTitle: string;
  dashSalesToday: string;
  dashCashToday: string;
  dashArOverdue: string;
  dashStockLow: string;
  dashOpenReport: string;
  dashWidgetError: string;
  platformManualPaymentTitle: string;
  platformRecordPayment: string;
  platformPaymentReason: string;
  platformPaymentSuccess: string;
  platformPaymentError: string;
  platformNoOpenInvoices: string;
  statusTRIAL: string;
  statusACTIVE: string;
  statusGRACE: string;
  statusSUSPENDED: string;
  statusPAST_DUE: string;
  statusOPEN: string;
  statusPAID: string;
  statusVOID: string;
"""

ar_vals = """
  navNotifications: "الإشعارات",
  navBilling: "الاشتراك والفوترة",
  pricingTitle: "الأسعار والخطط",
  pricingSubtitle: "اختر الخطة المناسبة لنشاطك — كل الأسعار والحدود من إعدادات المنصة.",
  pricingPerMonth: "شهرياً",
  pricingFeatures: "المزايا",
  pricingChoose: "اختر هذه الخطة",
  pricingCurrentPlan: "خطتك الحالية",
  pricingLoadError: "تعذّر تحميل الخطط حالياً.",
  pricingConfigNote: "الأسعار معرّفة من الإعدادات (قيم مؤقتة — OQ-002).",
  billingTitle: "الاشتراك والفوترة",
  billingPlanLabel: "الخطة",
  billingStatusLabel: "الحالة",
  billingPeriodLabel: "فترة الاستحقاق",
  billingTrialEndsLabel: "انتهاء فترة التجربة",
  billingGraceEndsLabel: "انتهاء فترة السماح",
  billingReadOnlyBanner: "الحساب للقراءة فقط — سدد المستحقات لاستعادة الكتابة.",
  billingNoSubscription: "لا يوجد اشتراك نشط.",
  billingUsageTitle: "الاستخدام في الفترة الحالية",
  billingCurrent: "الحالي",
  billingLimit: "الحد",
  billingUnlimited: "غير محدود",
  billingHistoryTitle: "سجل الفوترة",
  billingInvoices: "الفواتير",
  billingEvents: "أحداث الفوترة",
  billingNumber: "الرقم",
  billingAmount: "المبلغ",
  billingDue: "تاريخ الاستحقاق",
  billingPaidVia: "طريقة السداد",
  billingCheckout: "متابعة الدفع",
  billingChangePlan: "تغيير الخطة",
  billingCheckoutError: "تعذّر بدء جلسة الدفع.",
  billingOpenInvoicesNote: "اختر خطة لفتح فاتورة وسدادها.",
  notifTitle: "مركز الإشعارات",
  notifUnread: "غير مقروء",
  notifEmpty: "لا توجد إشعارات بعد.",
  notifPreferences: "تفضيلات الإشعارات",
  notifInApp: "داخل التطبيق",
  notifEmail: "البريد الإلكتروني",
  notifMarkRead: "تحديد كمقروء",
  notifLoadError: "تعذّر تحميل الإشعارات.",
  dashWidgetsTitle: "مؤشرات اليوم",
  dashSalesToday: "مبيعات اليوم",
  dashCashToday: "الوضع النقدي",
  dashArOverdue: "ذمم متأخرة",
  dashStockLow: "أصناف منخفضة عن حد الطلب",
  dashOpenReport: "فتح التقرير",
  dashWidgetError: "تعذّر تحميل المؤشر",
  platformManualPaymentTitle: "تسجيل دفع يدوي (A-009)",
  platformRecordPayment: "تسجيل الدفع",
  platformPaymentReason: "سبب التسجيل اليدوي",
  platformPaymentSuccess: "تم تسجيل الدفع وتفعيل الاشتراك.",
  platformPaymentError: "تعذّر تسجيل الدفع.",
  platformNoOpenInvoices: "لا توجد فواتير مستحقة لهذا المستأجر.",
  statusTRIAL: "تجربة",
  statusACTIVE: "نشط",
  statusGRACE: "سماح — قراءة فقط",
  statusSUSPENDED: "موقوف",
  statusPAST_DUE: "متأخر السداد",
  statusOPEN: "مستحقة",
  statusPAID: "مدفوعة",
  statusVOID: "ملغاة",
"""

en_vals = """
  navNotifications: "Notifications",
  navBilling: "Subscription & billing",
  pricingTitle: "Pricing & plans",
  pricingSubtitle: "Pick the plan that fits your business — all prices and limits come from platform configuration.",
  pricingPerMonth: "per month",
  pricingFeatures: "Features",
  pricingChoose: "Choose this plan",
  pricingCurrentPlan: "Your current plan",
  pricingLoadError: "Plans could not be loaded right now.",
  pricingConfigNote: "Prices are configuration-driven (placeholder values — OQ-002).",
  billingTitle: "Subscription & billing",
  billingPlanLabel: "Plan",
  billingStatusLabel: "Status",
  billingPeriodLabel: "Billing period",
  billingTrialEndsLabel: "Trial ends",
  billingGraceEndsLabel: "Grace ends",
  billingReadOnlyBanner: "The workspace is read-only — pay the outstanding amount to restore write access.",
  billingNoSubscription: "No active subscription.",
  billingUsageTitle: "Usage this period",
  billingCurrent: "Current",
  billingLimit: "Limit",
  billingUnlimited: "Unlimited",
  billingHistoryTitle: "Billing history",
  billingInvoices: "Invoices",
  billingEvents: "Billing events",
  billingNumber: "Number",
  billingAmount: "Amount",
  billingDue: "Due date",
  billingPaidVia: "Paid via",
  billingCheckout: "Continue to payment",
  billingChangePlan: "Change plan",
  billingCheckoutError: "Could not start the checkout session.",
  billingOpenInvoicesNote: "Choose a plan to open an invoice and pay it.",
  notifTitle: "Notifications center",
  notifUnread: "unread",
  notifEmpty: "No notifications yet.",
  notifPreferences: "Notification preferences",
  notifInApp: "In-app",
  notifEmail: "Email",
  notifMarkRead: "Mark as read",
  notifLoadError: "Notifications could not be loaded.",
  dashWidgetsTitle: "Today's KPIs",
  dashSalesToday: "Sales today",
  dashCashToday: "Cash position",
  dashArOverdue: "Overdue receivables",
  dashStockLow: "Items below reorder point",
  dashOpenReport: "Open report",
  dashWidgetError: "Widget could not load",
  platformManualPaymentTitle: "Record manual payment (A-009)",
  platformRecordPayment: "Record payment",
  platformPaymentReason: "Manual recording reason",
  platformPaymentSuccess: "Payment recorded and the subscription activated.",
  platformPaymentError: "Could not record the payment.",
  platformNoOpenInvoices: "No open invoices for this tenant.",
  statusTRIAL: "Trial",
  statusACTIVE: "Active",
  statusGRACE: "Grace — read-only",
  statusSUSPENDED: "Suspended",
  statusPAST_DUE: "Past due",
  statusOPEN: "Open",
  statusPAID: "Paid",
  statusVOID: "Voided",
"""

anchor = "  navOnboarding: string;\n"
assert src.count(anchor) == 1
src = src.replace(anchor, anchor + iface_keys)

ar_anchor = '  navOnboarding: "تهيئة",\n'
assert src.count(ar_anchor) == 1
src = src.replace(ar_anchor, ar_anchor + ar_vals)

en_anchor = '  navOnboarding: "Onboarding",\n'
assert src.count(en_anchor) == 1
src = src.replace(en_anchor, en_anchor + en_vals)

io.open(p, "w", encoding="utf-8").write(src)
print("ok")
