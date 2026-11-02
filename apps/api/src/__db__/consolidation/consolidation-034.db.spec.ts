import { randomInt } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { ensureTestDb, superuserClient } from "../test-db";
import { withTenant } from "../../infra/db/tenant-context";
import { RegistrationService } from "../../modules/tenancy/application/registration-service";
import { PasswordService } from "../../modules/identity/api/identity";
import { AuditService } from "../../modules/audit/api/audit";
import { DrizzleAuditStore } from "../../modules/audit/infrastructure/drizzle-audit.store";
import { PostingService } from "../../modules/accounting/application/posting-service";
import { PartnerSubledgerService } from "../../modules/partners/application/subledger-service";
import { PeriodService } from "../../modules/accounting/application/period-service";
import * as journal from "../../modules/accounting/infrastructure/journal.store";
import { ConsolidationGroupService } from "../../modules/consolidation/application/group-service";
import { EliminationService } from "../../modules/consolidation/application/elimination-service";
import { ConsolidationReaderService } from "../../modules/consolidation/application/reader-service";
import { ConsolidationRunService } from "../../modules/consolidation/application/run-service";
import { translate } from "../../modules/consolidation/application/fx-translation";
import {
  EliminationAlreadyPostedError,
  EliminationNotBalancedError,
  FxRateMissingError,
  MemberPeriodOpenError,
} from "../../modules/consolidation/domain/consolidation-errors";

/**
 * PHASE-034 db evidence (real PG16, ADR-0018): G-32 elimination golden posted
 * via the engine into the OWNER's books only; BR-056 failure packs; closed-
 * period precheck; read-only run with INV-026 snapshot; zero member writes;
 * per-read audit rows; FX fail-closed (INV-008).
 */

const audit = new AuditService(new DrizzleAuditStore());
const passwords = new PasswordService();
const fakeEmail = { enqueue: async () => undefined };
const posting = new PostingService(audit, new PartnerSubledgerService(), null);
const periods = new PeriodService(audit);
const groupService = new ConsolidationGroupService(audit);
const reader = new ConsolidationReaderService(audit);
const eliminationService = new EliminationService(audit, posting);
const runService = new ConsolidationRunService(audit, reader);
const OWNER_PASSWORD = "an-extremely-strong-passphrase-1";

async function registerTenant(label: string) {
  const registration = new RegistrationService(passwords, audit, fakeEmail as never);
  const result = await registration.register({
    businessName: `${label} Co`,
    businessNameAr: `${label} شركة`,
    countryCode: "SA",
    baseCurrency: "SAR",
    industryTemplateKey: "industry.wholesale",
    taxRegistrationStatus: "REGISTERED",
    taxRegistrationNumber: "3001234567890003",
    ownerEmail: `${label}-${Date.now()}-${randomInt(1000)}@cons.test`,
    ownerFullName: "Owner",
    ownerPassword: OWNER_PASSWORD,
    ip: `10.7.${randomInt(1, 250)}.${randomInt(1, 250)}`,
  });
  return { tenantId: result.tenantId, userId: result.ownerUserId };
}

async function countRows(table: string, tenantId: string): Promise<number> {
  const su = await superuserClient();
  const r = await su.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = $1`, [tenantId],
  );
  await su.end();
  return r.rows[0]?.n ?? 0;
}

async function auditCount(tenantId: string, action: string): Promise<number> {
  const su = await superuserClient();
  const r = await su.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM audit_events WHERE tenant_id = $1 AND action = $2`, [tenantId, action],
  );
  await su.end();
  return r.rows[0]?.n ?? 0;
}

let owner: { tenantId: string; userId: string };
let member: { tenantId: string; userId: string };
let groupId: string;
let memberPeriodId: string;

beforeAll(async () => {
  ensureTestDb();
  owner = await registerTenant("owner");
  member = await registerTenant("member");
  // provision CoA (template now carries INTERCOMPANY_AR/AP purposes) + master data
  for (const t of [owner, member]) {
    await withTenant(t.tenantId, async () => {
      const tenancyStore = await import("../../modules/tenancy/infrastructure/tenancy.store");
      await tenancyStore.seedMasterDataBasics();
      await tenancyStore.provisionCoaTemplate();
    });
  }
  // member gets a fiscal year; year CLOSED (BR-056 satisfied for it)
  await withTenant(member.tenantId, async () => {
    const year = await periods.createYear(member.userId, { name: "FY2026", startDate: "2026-01-01", endDate: "2026-12-31" });
    const all = await import("../../modules/accounting/infrastructure/accounting.store");
    const jan = (await all.listPeriods(year.id)).find((p) => p.kind === "REGULAR" && p.startDate.startsWith("2026-01"));
    memberPeriodId = jan!.id;
    await all.setFiscalYearStatus(year.id, "CLOSED");
  });
  // owner gets a fiscal year too (elimination journals post in the OWNER's books)
  await withTenant(owner.tenantId, async () => {
    await periods.createYear(owner.userId, { name: "FY2026", startDate: "2026-01-01", endDate: "2026-12-31" });
  });
  // owner creates the group and adds the member legal entity
  await withTenant(owner.tenantId, async () => {
    const g = await groupService.createGroup({
      name: "Test Group", nameAr: null, baseCurrency: "SAR", fxTranslationMethod: "CLOSING_RATE", actorId: owner.userId,
    });
    groupId = g.id;
    await groupService.addMember({
      groupId: g.id, memberTenantId: member.tenantId, ownershipPercent: "100.0000", includeFrom: "2026-01-01", actorId: owner.userId,
    });
  });
});

describe("PHASE-034 — consolidation (ADR-0018) on real PG16", () => {
  it("T5 G-32 golden: balanced elimination posts via the engine into the OWNER's books only", async () => {
    const memberJournalsBefore = await countRows("journal_entries", member.tenantId);
    let entryId = "";
    await withTenant(owner.tenantId, async () => {
      const draft = await eliminationService.createDraft({
        groupId, fiscalPeriodId: memberPeriodId, description: "IC loan A→B", currency: "SAR",
        entryDate: "2026-01-31",
        legs: [
          { memberTenantId: member.tenantId, purpose: "INTERCOMPANY_AP", direction: "DEBIT", amount: "5000.0000" },
          { memberTenantId: member.tenantId, purpose: "INTERCOMPANY_AR", direction: "CREDIT", amount: "5000.0000" },
        ],
        actorId: owner.userId,
      });
      const posted = await eliminationService.post({ eliminationId: draft.id, entryDate: "2026-01-31", currency: "SAR", actorId: owner.userId });
      entryId = posted.journalEntryId;
    });
    // G-32 line-asserted in the owner's books
    const entry = await withTenant(owner.tenantId, () => journal.findEntryById(entryId));
    expect(entry?.sourceType).toBe("consolidation_elimination");
    const lines = await withTenant(owner.tenantId, () => journal.listLines(entryId));
    expect(lines).toHaveLength(2);
    const dr = lines.find((l) => l.direction === "DEBIT");
    const cr = lines.find((l) => l.direction === "CREDIT");
    expect(dr?.amount).toBe("5000.0000");
    expect(cr?.amount).toBe("5000.0000");
    // ZERO member writes (INV-026)
    expect(await countRows("journal_entries", member.tenantId)).toBe(memberJournalsBefore);
  });

  it("T5 failure packs: unbalanced → ENTRY_NOT_BALANCED; re-post → ALREADY_POSTED (BR-056 reversal-only)", async () => {
    await withTenant(owner.tenantId, async () => {
      await expect(
        eliminationService.createDraft({
          groupId, fiscalPeriodId: memberPeriodId, description: "bad", currency: "SAR", entryDate: "2026-01-31",
          legs: [{ memberTenantId: member.tenantId, purpose: "INTERCOMPANY_AP", direction: "DEBIT", amount: "100.0000" }],
          actorId: owner.userId,
        }),
      ).rejects.toBeInstanceOf(EliminationNotBalancedError);
      const draft = await eliminationService.createDraft({
        groupId, fiscalPeriodId: memberPeriodId, description: "ok", currency: "SAR", entryDate: "2026-01-31",
        legs: [
          { memberTenantId: member.tenantId, purpose: "INTERCOMPANY_AP", direction: "DEBIT", amount: "10.0000" },
          { memberTenantId: member.tenantId, purpose: "INTERCOMPANY_AR", direction: "CREDIT", amount: "10.0000" },
        ],
        actorId: owner.userId,
      });
      await eliminationService.post({ eliminationId: draft.id, entryDate: "2026-01-31", currency: "SAR", actorId: owner.userId });
      await expect(
        eliminationService.post({ eliminationId: draft.id, entryDate: "2026-01-31", currency: "SAR", actorId: owner.userId }),
      ).rejects.toBeInstanceOf(EliminationAlreadyPostedError);
      // reversal-only counter-entry works
      const rev = await eliminationService.reverse({ eliminationId: draft.id, entryDate: "2026-02-28", currency: "SAR", actorId: owner.userId });
      expect(rev.journalEntryId).toBeTruthy();
    });
  });

  it("T6 BR-056 precheck: member with open period ⇒ typed MEMBER_PERIOD_OPEN", async () => {
    const openMember = await registerTenant("openm");
    await withTenant(owner.tenantId, async () => {
      await groupService.addMember({
        groupId, memberTenantId: openMember.tenantId, ownershipPercent: "100.0000", includeFrom: "2026-01-01", actorId: owner.userId,
      });
    });
    // openMember has NO fiscal year at all → no closed covering period
    await withTenant(owner.tenantId, async () => {
      const run = await runService.queueRun({ groupId, fiscalPeriodId: memberPeriodId, asOf: "2026-01-31", actorId: owner.userId });
      await expect(runService.execute({ runId: run.id, asOf: "2026-01-31", actorId: owner.userId })).rejects.toBeInstanceOf(MemberPeriodOpenError);
    });
  });

  it("T6/T7 run: COMPLETED snapshot carries member statements − eliminations (INV-026); per-read audit rows; zero member writes", async () => {
    // remove the open member so the run can pass (mark REMOVED via direct store is not exposed; use a fresh group)
    let runId = "";
    const memberJournalsBefore = await countRows("journal_entries", member.tenantId);
    await withTenant(owner.tenantId, async () => {
      const g2 = await groupService.createGroup({ name: "Run Group", nameAr: null, baseCurrency: "SAR", fxTranslationMethod: "CLOSING_RATE", actorId: owner.userId });
      await groupService.addMember({ groupId: g2.id, memberTenantId: member.tenantId, ownershipPercent: "100.0000", includeFrom: "2026-01-01", actorId: owner.userId });
      const run = await runService.queueRun({ groupId: g2.id, fiscalPeriodId: memberPeriodId, asOf: "2026-01-31", actorId: owner.userId });
      runId = run.id;
      const done = await runService.execute({ runId: run.id, asOf: "2026-01-31", actorId: owner.userId });
      expect(done.status).toBe("COMPLETED");
      const snap = done.snapshot as { memberStatements: Record<string, unknown[]>; eliminations: Record<string, string>; invariant: string };
      expect(Object.keys(snap.memberStatements)).toContain(member.tenantId);
      expect(snap.invariant).toContain("INV-026");
    });
    expect(await countRows("journal_entries", member.tenantId)).toBe(memberJournalsBefore);
    expect(await auditCount(owner.tenantId, "consolidation.member_read")).toBeGreaterThanOrEqual(1);
    void runId;
  });

  it("T7 FX: missing dated rate is fail-closed (RATE_MISSING); stored rate translates exactly (INV-008)", async () => {
    await withTenant(owner.tenantId, async () => {
      await expect(translate("100.0000", "USD", "2026-01-31", "SAR")).rejects.toBeInstanceOf(FxRateMissingError);
      const { getDb } = await import("../../infra/db/client");
      const { sql } = await import("drizzle-orm");
      await getDb().transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('erp.tenant_id', ${owner.tenantId}, true)`);
        await tx.execute(sql`INSERT INTO exchange_rates (id, tenant_id, currency_code, rate_date, rate, source)
          VALUES (gen_random_uuid(), ${owner.tenantId}, 'USD', '2026-01-15', '3.75000000', 'MANUAL')
          ON CONFLICT DO NOTHING`);
      });
      const out = await translate("100.0000", "USD", "2026-01-31", "SAR");
      expect(out).toBe("375.00000000");
    });
  });
});
