import io

p = "apps/web/i18n/dictionaries.ts"
src = io.open(p, encoding="utf-8").read()

iface_block = """  navPlatformAudit: string;

  // -- PHASE-015 T11: industry templates UI -----------------------------------
  navTemplates: string;
  templatesPageTitle: string;
  templatesPageDescription: string;
  templatesCurrent: string;
  templatesNone: string;
  templatesApply: string;
  templatesSwitch: string;
  templatesPreview: string;
  templatesApplied: string;
  templatesSwitched: string;
  templatesApplyConfirm: string;
  templatesSwitchNote: string;
  templatesVersion: string;
  templatesStatusActive: string;
  templatesStatusInactive: string;
  onboardingIndustryTitle: string;
  onboardingIndustryDescription: string;
  onboardingIndustrySelect: string;
  onboardingIndustrySkip: string;
  onboardingIndustryApplied: string;
"""

ar_block = """  navPlatformAudit: "\u0633\u062c\u0644 \u0627\u0644\u0645\u0646\u0635\u0629",

  // -- PHASE-015 T11: industry templates UI -----------------------------------
  navTemplates: "\u0642\u0648\u0627\u0644\u0628 \u0627\u0644\u0635\u0646\u0627\u0639\u0629",
  templatesPageTitle: "\u0642\u0648\u0627\u0644\u0628 \u0627\u0644\u0635\u0646\u0627\u0639\u0629",
  templatesPageDescription: "\u0627\u062e\u062a\u0631 \u0642\u0627\u0644\u0628 \u0627\u0644\u0635\u0646\u0627\u0639\u0629 \u0644\u0644\u0645\u0646\u0634\u0623\u062a\u0643 \u0648\u0637\u0628\u0642\u0647 \u0623\u0648 \u0627\u0644\u062a\u0628\u062f\u064a\u0644 \u0628\u064a\u0646\u0647\u0627 \u0628\u0634\u0643\u0644 \u0625\u0636\u0627\u0641\u064a",
  templatesCurrent: "\u0627\u0644\u0642\u0627\u0644\u0628 \u0627\u0644\u0645\u0637\u0628\u0642 \u062d\u0627\u0644\u064a\u064b\u0627",
  templatesNone: "\u0644\u0627 \u064a\u0648\u062c\u062f \u0642\u0627\u0644\u0628 \u0645\u0637\u0628\u0642",
  templatesApply: "\u062a\u0637\u0628\u064a\u0642",
  templatesSwitch: "\u062a\u0628\u062f\u064a\u0644",
  templatesPreview: "\u0645\u0639\u0627\u064a\u0646\u0629",
  templatesApplied: "\u062a\u0645 \u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0642\u0627\u0644\u0628",
  templatesSwitched: "\u062a\u0645 \u0627\u0644\u062a\u0628\u062f\u064a\u0644 \u0625\u0644\u0649 \u0627\u0644\u0642\u0627\u0644\u0628",
  templatesApplyConfirm: "\u062a\u0637\u0643\u064a\u062f \u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0642\u0627\u0644\u0628\u061f",
  templatesSwitchNote: "\u0627\u0644\u062a\u0628\u062f\u064a\u0644 \u0625\u0636\u0627\u0641\u064a \u0641\u0642\u0637\u061f \u0644\u0627 \u064a\u0645\u0643\u0646 \u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a",
  templatesVersion: "\u0627\u0644\u0625\u0635\u062f\u0627\u0631",
  templatesStatusActive: "\u0645\u062a\u0648\u0641\u0631",
  templatesStatusInactive: "\u063a\u064a\u0631 \u0645\u062a\u0648\u0641\u0631",
  onboardingIndustryTitle: "\u0627\u062e\u062a\u0631 \u0635\u0646\u0627\u0639\u062a\u0643",
  onboardingIndustryDescription: "\u0627\u062e\u062a\u0631 \u0642\u0627\u0644\u0628 \u0635\u0646\u0627\u0639\u0629 \u064a\u0646\u0627\u0633\u0628\u0643 \u0644\u0644\u0645\u0646\u0634\u0623\u0629 \u0644\u064a\u062a\u0645 \u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a",
  onboardingIndustrySelect: "\u0627\u062e\u062a\u0631 \u0642\u0627\u0644\u0628\u064b\u0627",
  onboardingIndustrySkip: "\u062a\u062e\u0637\u064e",
  onboardingIndustryApplied: "\u062a\u0645 \u062a\u0637\u0628\u064a\u0642 \u0642\u0627\u0644\u0628 \u0627\u0644\u0635\u0646\u0627\u0639\u0629",
"""

en_block = """  navPlatformAudit: "Platform audit",

  // -- PHASE-015 T11: industry templates UI -----------------------------------
  navTemplates: "Industry templates",
  templatesPageTitle: "Industry templates",
  templatesPageDescription: "Pick the template matching your business and apply or switch between templates additively",
  templatesCurrent: "Current template",
  templatesNone: "No template applied",
  templatesApply: "Apply",
  templatesSwitch: "Switch",
  templatesPreview: "Preview",
  templatesApplied: "Template applied",
  templatesSwitched: "Switched to template",
  templatesApplyConfirm: "Apply this template?",
  templatesSwitchNote: "Switching is additive only — settings are never removed",
  templatesVersion: "Version",
  templatesStatusActive: "Available",
  templatesStatusInactive: "Unavailable",
  onboardingIndustryTitle: "Choose your industry",
  onboardingIndustryDescription: "Pick an industry template suited to your business — it tunes the workspace settings",
  onboardingIndustrySelect: "Choose a template",
  onboardingIndustrySkip: "Skip",
  onboardingIndustryApplied: "Industry template applied",
"""

src = src.replace("  navPlatformAudit: string;\n", iface_block, 1)
src = src.replace('  navPlatformAudit: "\u0633\u062c\u0644 \u0627\u0644\u0645\u0646\u0635\u0629",\n', ar_block, 1)
src = src.replace('  navPlatformAudit: "Platform audit",\n', en_block, 1)
io.open(p, "w", encoding="utf-8").write(src)
print("dict updated")
