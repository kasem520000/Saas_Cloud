import io

p = "apps/web/i18n/dictionaries.ts"
src = io.open(p, encoding="utf-8").read()

iface = """
  journeyTitle: string;
  journeyStepProfile: string;
  journeyStepCustomer: string;
  journeyStepInvoice: string;
  journeyStepPrint: string;
  journeyDone: string;
  journeyTodo: string;
"""
ar = """
  journeyTitle: "مسار أول فاتورة (Journey A)",
  journeyStepProfile: "إكمال ملف المنشأة والتهيئة",
  journeyStepCustomer: "إضافة أول عميل",
  journeyStepInvoice: "إصدار أول فاتورة بيع",
  journeyStepPrint: "طباعة/تصدير الفاتورة",
  journeyDone: "مكتمل",
  journeyTodo: "قيد الانتظار",
"""
en = """
  journeyTitle: "First-invoice journey (Journey A)",
  journeyStepProfile: "Complete the workspace profile & setup",
  journeyStepCustomer: "Add your first customer",
  journeyStepInvoice: "Issue the first sales invoice",
  journeyStepPrint: "Print / export the invoice",
  journeyDone: "Done",
  journeyTodo: "Pending",
"""

for anchor, block in [
    ("  navOnboarding: string;\n", iface),
    ('  navOnboarding: "تهيئة",\n', ar),
    ('  navOnboarding: "Onboarding",\n', en),
]:
    assert src.count(anchor) == 1, anchor
    src = src.replace(anchor, anchor + block)

io.open(p, "w", encoding="utf-8").write(src)
print("ok")
