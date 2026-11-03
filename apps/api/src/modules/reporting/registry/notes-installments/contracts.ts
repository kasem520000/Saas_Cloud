import { z } from "zod";

import {
  ISO_DATE,
  ISO_DATETIME,
  LOCALE,
  assertDecl,
  bilingual,
  col,
  defineReport,
  moneyCol,
  source,
} from "../kit";

/**
 * PHASE-027 T12 — five report contracts (register §J): notes maturity
 * calendar, notes aging (footer tie to NOTES_RECEIVABLE), dishonored
 * register, installments schedule, installments aging. Provenance: owned
 * tables only — no source of truth, no report.
 */

const WINDOW = { dateFrom: ISO_DATE, dateTo: ISO_DATE, asOf: ISO_DATETIME.nullish(), locale: LOCALE };

export const notesMaturityCalendarContract = defineReport({
  id: "notes.maturity-calendar",
  version: 1,
  title: bilingual("Maturity calendar", "Maturity calendar"),
  category: "notes",
  description: bilingual("PDC maturity buckets, received vs issued, two-sided", "PDC maturity buckets, received vs issued, two-sided"),
  parameters: z.object({ asOf: ISO_DATE, noteDirection: z.enum(["RECEIVED", "ISSUED"]).optional(), locale: LOCALE, groupByClaim: z.boolean().optional() }),
  requiredPermission: "notes.notes.view",
  dataSources: [source("notes", "notes.pdcCalendar", ["notes", "note_events"], "Notes register and custody events", "Notes register and custody events")],
  scopeRules: { asOf: "required" },
  freshness: { semantics: "as-of", cacheTtlSeconds: 0 },
  assertions: [
    assertDecl("notes-open-tie", "sum(open received notes) == NOTES_RECEIVABLE GL balance", "Open notes do not tie to the GL balance", "sum open received notes ties to NOTES_RECEIVABLE"),
  ],
  run: async (_ctx, params) => ({
    columns: [col("bucket", "Bucket", "Bucket"), col("direction", "Direction", "Direction"), col("count", "Count", "Count"), moneyCol("amount", "Amount", "Amount")],
    groups: [],
    rows: [],
    totals: [],
    assertionResults: [],
    notes: [bilingual(`as-of ${String(params.asOf)}`, `as-of ${String(params.asOf)}`)],
  }),
});

export const notesAgingContract = defineReport({
  id: "notes.aging",
  version: 1,
  title: bilingual("Notes aging", "Notes aging"),
  category: "notes",
  description: bilingual("Uncollected notes bucketed by maturity date with GL footer tie", "Uncollected notes bucketed by maturity date with GL footer tie"),
  parameters: z.object({ asOf: ISO_DATE, locale: LOCALE, groupByClaim: z.boolean().optional() }),
  requiredPermission: "notes.notes.view",
  dataSources: [source("notes", "notes.aging", ["notes"], "Notes register", "Notes register")],
  scopeRules: { asOf: "required" },
  freshness: { semantics: "as-of", cacheTtlSeconds: 0 },
  assertions: [
    assertDecl("notes-aging-tie", "sum(aging buckets) == NOTES_RECEIVABLE balance", "Aging buckets do not tie to the GL balance", "sum aging buckets ties to NOTES_RECEIVABLE"),
  ],
  run: async () => ({ columns: [col("bucket", "Bucket", "Bucket"), moneyCol("amount", "Amount", "Amount")], groups: [], rows: [], totals: [], assertionResults: [] }),
});

export const notesDishonoredContract = defineReport({
  id: "notes.dishonored-register",
  version: 1,
  title: bilingual("Dishonored notes register", "Dishonored notes register"),
  category: "notes",
  description: bilingual("Dishonored notes per period/partner with reasons, drill to events", "Dishonored notes per period/partner with reasons, drill to events"),
  parameters: z.object(WINDOW),
  requiredPermission: "notes.notes.view",
  dataSources: [source("notes", "notes.dishonored", ["notes", "note_events"], "Notes and dishonor events", "Notes and dishonor events")],
  scopeRules: { asOf: "forbidden" },
  freshness: { semantics: "current", cacheTtlSeconds: 60, invalidationEvents: ["note.dishonored"] },
  assertions: [
    assertDecl("dishonor-restored", "every DISHONOR event has a journal restoring AR exactly (INV-024)", "A dishonor without exact AR restore", "every dishonor restores AR exactly"),
  ],
  run: async () => ({ columns: [col("date", "Date", "Date"), col("partner", "Partner", "Partner"), col("amount", "Amount", "Amount"), col("reason", "Reason", "Reason")], groups: [], rows: [], totals: [], assertionResults: [] }),
});

export const installmentsScheduleContract = defineReport({
  id: "installments.schedule",
  version: 1,
  title: bilingual("Installment schedule", "Installment schedule"),
  category: "installments",
  description: bilingual("Plan lines with statuses and receipt refs, as-of", "Plan lines with statuses and receipt refs, as-of"),
  parameters: z.object({ asOf: ISO_DATE, locale: LOCALE, planId: z.string().optional() }),
  requiredPermission: "installments.plans.view",
  dataSources: [source("installments", "installments.schedule", ["installment_plans", "installment_lines"], "Plans and lines", "Plans and lines")],
  scopeRules: { asOf: "required" },
  freshness: { semantics: "as-of", cacheTtlSeconds: 0 },
  assertions: [
    assertDecl("plan-lines-sum", "sum(line amounts) == plan total (BR-048)", "Plan lines do not sum to the plan total", "sum lines equals plan total"),
  ],
  run: async () => ({ columns: [col("seq", "Seq", "Seq"), col("dueDate", "Due", "Due"), moneyCol("amount", "Amount", "Amount"), col("status", "Status", "Status")], groups: [], rows: [], totals: [], assertionResults: [] }),
});

export const installmentsAgingContract = defineReport({
  id: "installments.aging",
  version: 1,
  title: bilingual("Installments aging", "Installments aging"),
  category: "installments",
  description: bilingual("Line buckets by due date", "Line buckets by due date"),
  parameters: z.object({ asOf: ISO_DATE, locale: LOCALE }),
  requiredPermission: "installments.plans.view",
  dataSources: [source("installments", "installments.aging", ["installment_lines", "installment_plans"], "Lines and plans", "Lines and plans")],
  scopeRules: { asOf: "required" },
  freshness: { semantics: "as-of", cacheTtlSeconds: 0 },
  assertions: [
    assertDecl("aging-tie", "sum(collected) <= invoice outstanding (INV-016)", "Collections exceed the invoice outstanding", "sum collected within INV-016 bounds"),
  ],
  run: async () => ({ columns: [col("bucket", "Bucket", "Bucket"), moneyCol("amount", "Amount", "Amount"), col("count", "Count", "Count")], groups: [], rows: [], totals: [], assertionResults: [] }),
});
