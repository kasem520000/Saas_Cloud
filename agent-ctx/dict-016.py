import io

p = "apps/web/i18n/dictionaries.ts"
src = io.open(p, encoding="utf-8").read()

iface_anchor = "  onboardingIndustryApplied: string;\n"
assert iface_anchor in src
iface_block = iface_anchor + """
  // -- PHASE-016 POS UI ---------------------------------------------------------
  navPosCounter: string;
  navPosTerminals: string;
  posTerminalsTitle: string;
  posTerminalsDescription: string;
  posTerminalCode: string;
  posTerminalName: string;
  posTerminalBranch: string;
  posTerminalCashAccount: string;
  posTerminalReceiptSize: string;
  posTerminalStatus: string;
  posTerminalRegister: string;
  posTerminalActivate: string;
  posTerminalDeactivate: string;
  posTerminalNone: string;
  posCounterTitle: string;
  posCounterScanPlaceholder: string;
  posCounterCart: string;
  posCounterTotal: string;
  posCounterPay: string;
  posCounterClear: string;
  posCounterSalePosted: string;
  posCounterSaleFailed: string;
  posCounterOfflineBanner: string;
  posCounterQueued: string;
  posCounterEmpty: string;
"""

ar_anchor = None
# find the ar onboardingIndustryApplied line
import re
m = re.search(r'  onboardingIndustryApplied: "[^"]*",\n', src)
assert m
ar_line = m.group(0)
ar_block = ar_line + """
  // -- PHASE-016 POS UI ---------------------------------------------------------
  navPosCounter: "\u0646\u0642\u0637\u0629 \u0627\u0644\u0628\u064a\u0639",
  navPosTerminals: "\u0623\u062c\u0647\u0632\u0629 \u0646\u0642\u0627\u0637 \u0627\u0644\u0628\u064a\u0639",
  posTerminalsTitle: "\u0623\u062c\u0647\u0632\u0629 \u0646\u0642\u0627\u0637 \u0627\u0644\u0628\u064a\u0639",
  posTerminalsDescription: "\u0633\u062c\u0651\u0644 \u0627\u0644\u0623\u062c\u0647\u0632\u0629 \u0631\u0628\u0637\u0647 \u0628\u0627\u0644\u0641\u0631\u0639 \u0648\u0627\u0644\u0635\u0646\u062f\u0648\u0642 \u0648\u062d\u062c\u0645 \u0627\u0644\u0625\u064a\u0635\u0627\u0644",
  posTerminalCode: "\u0643\u0648\u062f \u0627\u0644\u062c\u0647\u0627\u0632",
  posTerminalName: "\u0627\u0644\u0627\u0633\u0645",
  posTerminalBranch: "\u0627\u0644\u0641\u0631\u0639",
  posTerminalCashAccount: "\u0627\u0644\u0635\u0646\u062f\u0648\u0642",
  posTerminalReceiptSize: "\u062d\u062c\u0645 \u0627\u0644\u0625\u064a\u0635\u0627\u0644 (mm)",
  posTerminalStatus: "\u0627\u0644\u062d\u0627\u0644\u0629",
  posTerminalRegister: "\u062a\u0633\u062c\u064a\u0644 \u062c\u0647\u0627\u0632",
  posTerminalActivate: "\u062a\u0641\u0639\u064a\u0644",
  posTerminalDeactivate: "\u0625\u064a\u0642\u0627\u0641",
  posTerminalNone: "\u0644\u0627 \u062a\u0648\u062c\u062f \u0623\u062c\u0647\u0632\u0629 \u0645\u0633\u062c\u0644\u0629",
  posCounterTitle: "\u0634\u0627\u0634\u0629 \u0627\u0644\u0628\u064a\u0639",
  posCounterScanPlaceholder: "\u0627\u0645\u0633\u062d \u0627\u0644\u0628\u0627\u0631\u0643\u0648\u062f \u0623\u0648 \u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u0641",
  posCounterCart: "\u0627\u0644\u0633\u0644\u0629",
  posCounterTotal: "\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a",
  posCounterPay: "\u062f\u0641\u0639",
  posCounterClear: "\u0625\u0644\u063a\u0627\u0621",
  posCounterSalePosted: "\u062a\u0645\u062a \u0627\u0644\u0628\u064a\u0639 \u0648\u0631\u0642\u0645 \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629",
  posCounterSaleFailed: "\u0641\u0634\u0644 \u0627\u0644\u0628\u064a\u0639",
  posCounterOfflineBanner: "\u063a\u064a\u0631 \u0645\u062a\u0635\u0644 — \u0627\u0644\u0645\u0628\u064a\u0639\u0627\u062a \u062a\u064f\u062d\u0641\u0638 \u0645\u062d\u0644\u064a\u064b\u0627 \u0648\u062a\u064f\u0632\u0646\u0645\u0644 \u0628\u0639\062f \u0627\u0644\u0627\u062a\u0635\u0627\u0644",
  posCounterQueued: "\u0639\u062f\u062f \u0627\u0644\u0645\u0628\u064a\u0639\u0627\u062a \u0627\u0644\u0645\u0624\u062c\u0644\u0629",
  posCounterEmpty: "\u0627\u0644\u0633\u0644\u0629 \u0641\u0627\u0631\u063a\u0629",
"""

src = src.replace(iface_anchor, iface_block, 1)
src = src.replace(ar_line, ar_block, 1)

# en block
m2 = re.search(r'  onboardingIndustryApplied: "[^"]*",\n', src[src.find("const en"):])
en_line = m2.group(0)
en_block = en_line + """
  // -- PHASE-016 POS UI ---------------------------------------------------------
  navPosCounter: "POS counter",
  navPosTerminals: "POS terminals",
  posTerminalsTitle: "POS terminals",
  posTerminalsDescription: "Register terminals bound to a branch, till cash account and receipt size",
  posTerminalCode: "Terminal code",
  posTerminalName: "Name",
  posTerminalBranch: "Branch",
  posTerminalCashAccount: "Till",
  posTerminalReceiptSize: "Receipt size (mm)",
  posTerminalStatus: "Status",
  posTerminalRegister: "Register terminal",
  posTerminalActivate: "Activate",
  posTerminalDeactivate: "Deactivate",
  posTerminalNone: "No terminals registered",
  posCounterTitle: "Counter sale",
  posCounterScanPlaceholder: "Scan barcode or type item name",
  posCounterCart: "Cart",
  posCounterTotal: "Total",
  posCounterPay: "Pay",
  posCounterClear: "Clear",
  posCounterSalePosted: "Sale posted, invoice",
  posCounterSaleFailed: "Sale failed",
  posCounterOfflineBanner: "Offline — sales are saved locally and sync when reconnected",
  posCounterQueued: "Queued sales",
  posCounterEmpty: "Cart is empty",
"""
src = src.replace(en_line, en_block, 1)

io.open(p, "w", encoding="utf-8").write(src)
print("dict ok")
