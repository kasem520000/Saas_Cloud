import { z } from "zod";

import {
  ISO_DATE,
  LOCALE,
  assertDecl,
  bilingual,
  col,
  defineReport,
  moneyCol,
  source,
} from "../kit";

/**
 * PHASE-034 T8 — the four consolidation report contracts (ADR-0018; v2.0
 * registry keys: consolidated.tb / consolidated.is / consolidated.bs /
 * consolidated.eliminations-log). All read the run snapshot (derived artifact)
 * and assert INV-026: consolidated = Σ member statements − eliminations.
 * Group views are labeled as such; member statutory books are untouched.
 */

const PARAMS = { groupId: z.string().uuid(), asOf: ISO_DATE, locale: LOCALE };

export const consolidatedTbContract = defineReport({
  id: "consolidated.tb",
  version: 1,
  title: bilingual("ميزان المجموعة الموحد", "Consolidated Trial Balance"),
  category: "consolidation",
  description: bilingual("ميزان المجموعة الموحد (مجموع الأعضاء − قيود الإقصاء)", "Group trial balance (sum of members minus eliminations)"),
  parameters: z.object(PARAMS),
  requiredPermission: "consolidation.reports.view",
  dataSources: [source("consolidation", "consolidation.snapshot", ["consolidation_runs", "group_entities", "journal_lines"], "Run snapshot + member GL read models", "Run snapshot + member GL read models")],
  scopeRules: { asOf: "required" },
  freshness: { semantics: "as-of", cacheTtlSeconds: 0 },
  assertions: [
    assertDecl("inv-026-tb", "consolidated TB = Σ member TBs (group currency, dated FX) − eliminations (INV-026)", "Consolidated TB does not tie to member statements minus eliminations", "consolidated TB ties per INV-026"),
  ],
  run: async () => ({
    columns: [col("code", "Code", "Code"), moneyCol("debit", "Debit", "Debit"), moneyCol("credit", "Credit", "Credit")],
    groups: [],
    rows: [],
    totals: [],
    assertionResults: [],
    notes: [bilingual("عرض مجموعة — لا يستبدل كشوفات الأعضاء", "Group view — does not replace member statutory books")],
  }),
});

export const consolidatedIsContract = defineReport({
  id: "consolidated.is",
  version: 1,
  title: bilingual("قائمة الدخل الموحدة", "Consolidated Income Statement"),
  category: "consolidation",
  description: bilingual("قائمة الدخل الموحدة للمجموعة (INV-026)", "Consolidated income statement (INV-026)"),
  parameters: z.object(PARAMS),
  requiredPermission: "consolidation.reports.view",
  dataSources: [source("consolidation", "consolidation.snapshot", ["consolidation_runs"], "Run snapshot", "Run snapshot")],
  scopeRules: { asOf: "required" },
  freshness: { semantics: "as-of", cacheTtlSeconds: 0 },
  assertions: [
    assertDecl("inv-026-is", "consolidated IS = Σ member IS − eliminations (INV-026)", "Consolidated IS does not tie", "consolidated IS ties per INV-026"),
  ],
  run: async () => ({
    columns: [col("line", "Line", "Line"), moneyCol("amount", "Amount", "Amount")],
    groups: [],
    rows: [],
    totals: [],
    assertionResults: [],
  }),
});

export const consolidatedBsContract = defineReport({
  id: "consolidated.bs",
  version: 1,
  title: bilingual("الميزانية العمومية الموحدة", "Consolidated Balance Sheet"),
  category: "consolidation",
  description: bilingual("الميزانية العمومية الموحدة للمجموعة (INV-026)", "Consolidated balance sheet (INV-026)"),
  parameters: z.object(PARAMS),
  requiredPermission: "consolidation.reports.view",
  dataSources: [source("consolidation", "consolidation.snapshot", ["consolidation_runs"], "Run snapshot", "Run snapshot")],
  scopeRules: { asOf: "required" },
  freshness: { semantics: "as-of", cacheTtlSeconds: 0 },
  assertions: [
    assertDecl("inv-026-bs", "consolidated BS balances: assets = liabilities + equity after eliminations (INV-026)", "Consolidated BS does not balance", "consolidated BS balances per INV-026"),
  ],
  run: async () => ({
    columns: [col("section", "Section", "Section"), moneyCol("amount", "Amount", "Amount")],
    groups: [],
    rows: [],
    totals: [],
    assertionResults: [],
  }),
});

export const eliminationsLogContract = defineReport({
  id: "consolidated.eliminations-log",
  version: 1,
  title: bilingual("سجل قيود الإقصاء", "Eliminations Log"),
  category: "consolidation",
  description: bilingual("قيود الإقصاء (G-32) مع ربط القيد المحاسبي", "Elimination journals (G-32) tied to their engine entries"),
  parameters: z.object(PARAMS),
  requiredPermission: "consolidation.reports.view",
  dataSources: [source("consolidation", "consolidation.eliminations", ["elimination_entries", "journal_entries"], "Elimination entries and their journals", "Elimination entries and their journals")],
  scopeRules: { asOf: "required" },
  freshness: { semantics: "current", cacheTtlSeconds: 60, invalidationEvents: ["consolidation_elimination.posted"] },
  assertions: [
    assertDecl("elimination-journal-tie", "every POSTED elimination ties 1:1 to a balanced CONSOLIDATION_ELIMINATION journal (BR-056, INV-006)", "Elimination does not tie to its journal", "every elimination ties to its G-32 journal"),
  ],
  run: async () => ({
    columns: [col("id", "ID", "ID"), col("status", "Status", "Status"), moneyCol("amount", "Amount", "Amount"), col("journal", "Journal", "Journal")],
    groups: [],
    rows: [],
    totals: [],
    assertionResults: [],
  }),
});
