import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { ensureTestDb, seedTenants, superuserClient } from "../test-db";
import { requireTenantContext, withTenant } from "../../infra/db/tenant-context";
import { AuditService } from "../../modules/audit/api/audit";
import { DrizzleAuditStore } from "../../modules/audit/infrastructure/drizzle-audit.store";
import { PostingService } from "../../modules/accounting/application/posting-service";
import { PeriodService } from "../../modules/accounting/application/period-service";
import { PartnerSubledgerService } from "../../modules/partners/application/subledger-service";
import { ContractsService } from "../../modules/crm/application/contracts.service";
import { LeadsService } from "../../modules/crm/application/leads.service";
import { PartnerService } from "../../modules/partners/application/partner-service";

/**
 * PHASE-019 golden db evidence (real PG16, app-role services): contract
 * billing posts ONLY through PostingService — DR AR_CONTROL (partner) ·
 * CR SALES_REVENUE with the project stamped on every journal line; the
 * billing run is idempotent per (contract, period) (INV-013); posting into
 * a LOCKED period is rejected (INV-011); schedule expansion is re-runnable;
 * lead conversion creates the partner and freezes the lead.
 */

const TENANT_C = "88888888-8888-8888-8888-888888888888";
const C_ACTOR = "dddddddd-0000-4000-8000-0000000000c1";

const audit = new AuditService(new DrizzleAuditStore());
const posting = new PostingService(audit, new PartnerSubledgerService(), null);
const periods = new PeriodService(audit);
const contracts = new ContractsService(audit, posting);
const leads = new LeadsService(audit, new PartnerService(audit));

async function txQuery<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const ctx = requireTenantContext();
  if (ctx.tx === undefined) throw new Error("no ambient tx");
  const inlined = text.replace(/\$\d+/g, (m) => {
    const v = params[Number(m.slice(1)) - 1];
    return typeof v === "string" ? "'" + v.replace(/'/g, "''") + "'" : String(v);
  });
  const res = await ctx.tx.execute(sql.raw(inlined));
  return res.rows as T[];
}

let branchId = "";
let partnerId = "";
let projectId = "";
let contractId = "";
let leadId = "";

beforeAll(async () => {
  ensureTestDb();
  const superuser = await superuserClient();
  await seedTenants(superuser as never);
  await superuser.query(
    `INSERT INTO tenants (id, name, name_ar, base_currency, country_code, timezone) VALUES
       ($1, 'Tenant C (crm)', 'المستأجر ج', 'SAR', 'SA', 'Asia/Riyadh')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT_C],
  );
  await superuser.query(
    `INSERT INTO users (id, email, full_name, password_hash, status) VALUES
       ($1, 'crm-actor@fixture.test', 'Crm Actor', 'x', 'ACTIVE')
     ON CONFLICT (id) DO NOTHING`,
    [C_ACTOR],
  );
  await superuser.end();

  await withTenant(TENANT_C, async () => {
    const tenancyStore = await import("../../modules/tenancy/infrastructure/tenancy.store");
    const accountingStore = await import("../../modules/accounting/infrastructure/accounting.store");
    await tenancyStore.seedMasterDataBasics();
    await tenancyStore.provisionCoaTemplate();
    // AR_CONTROL + SALES_REVENUE purposes must be mapped before billing posts.
    const mapPurpose = async (purposeKey: string, code: string) => {
      const account = await accountingStore.findAccountByCode(code);
      if (account === undefined) throw new Error(`account ${code} missing from CoA template`);
      if ((await accountingStore.findActivePurpose(purposeKey)) === undefined) {
        await tenancyStore.insertAccountPurpose({ purposeKey, accountId: account.id, activeFrom: "2026-01-01" });
      }
    };
    await mapPurpose("AR_CONTROL", "1200");
    await mapPurpose("SALES_REVENUE", "4000");

    await periods.createYear(C_ACTOR, { name: "FY2026", startDate: "2026-01-01", endDate: "2026-12-31" });

    const branch = await txQuery<{ id: string }>(
      `INSERT INTO branches (id, tenant_id, code, name) VALUES
         ('cccccccc-0000-4000-8000-0000000000b0', erp.current_tenant_id(), 'MAIN', 'Main')
       ON CONFLICT DO NOTHING RETURNING id`,
    );
    branchId = branch[0]?.id ?? (await txQuery<{ id: string }>(`SELECT id FROM branches WHERE code = 'MAIN'`))[0]!.id;

    const partner = await txQuery<{ id: string }>(
      `INSERT INTO partners (id, tenant_id, kind, code, name) VALUES
         ('cccccccc-0000-4000-8000-0000000000b1', erp.current_tenant_id(), 'CUSTOMER', 'C-0001', 'Client One')
       ON CONFLICT DO NOTHING RETURNING id`,
    );
    partnerId = partner[0]?.id ?? (await txQuery<{ id: string }>(`SELECT id FROM partners WHERE code = 'C-0001'`))[0]!.id;

    const project = await txQuery<{ id: string }>(
      `INSERT INTO projects (id, tenant_id, code, name) VALUES
         ('cccccccc-0000-4000-8000-0000000000b2', erp.current_tenant_id(), 'CASE-001', 'Case One')
       ON CONFLICT DO NOTHING RETURNING id`,
    );
    projectId = project[0]?.id ?? (await txQuery<{ id: string }>(`SELECT id FROM projects WHERE code = 'CASE-001'`))[0]!.id;

    const lead = await txQuery<{ id: string }>(
      `INSERT INTO leads (id, tenant_id, branch_id, name, source, status) VALUES
         ('cccccccc-0000-4000-8000-0000000000b3', erp.current_tenant_id(), $1, 'Walk-in Lead', 'WALK_IN', 'QUALIFIED')
       ON CONFLICT DO NOTHING RETURNING id`,
      [branchId],
    );
    leadId = lead[0]?.id ?? (await txQuery<{ id: string }>(`SELECT id FROM leads WHERE name = 'Walk-in Lead'`))[0]!.id;

    const created = await contracts.create({
      branchId,
      contractNo: "SC-2026-0001",
      partnerId,
      projectId,
      feeModel: "RETAINER",
      startDate: "2026-01-15",
      endDate: "2026-02-14",
      actorId: C_ACTOR,
    });
    contractId = created.id;
    // one undated retainer line — the monthly amount the schedule expands from
    await txQuery(
      `INSERT INTO contract_schedule_lines (tenant_id, contract_id, description, amount, due_date)
       VALUES (erp.current_tenant_id(), $1, 'Monthly retainer', 3100.0000, NULL)`,
      [contractId],
    );
  });
});

describe("PHASE-019 contract billing golden (real PG)", () => {
  it("schedule expansion produces the prorated partial months 1700.0000 + 1550.0000 and is re-runnable", async () => {
    await withTenant(TENANT_C, async () => {
      const first = await contracts.expandSchedule({ contractId, actorId: C_ACTOR });
      expect(first.entries).toBe(2);
      const again = await contracts.expandSchedule({ contractId, actorId: C_ACTOR });
      expect(again.entries).toBe(2);
      const rows = await txQuery<{ description: string; amount: string; due_date: string }>(
        `SELECT description, amount::text, due_date::text AS due_date FROM contract_schedule_lines
         WHERE contract_id = $1 AND due_date IS NOT NULL ORDER BY due_date`,
        [contractId],
      );
      expect(rows).toHaveLength(2);
      expect(rows[0]?.amount).toBe("1700.0000");
      expect(rows[1]?.amount).toBe("1550.0000");
    });
  });

  it("billing run posts DR AR_CONTROL (partner) · CR SALES_REVENUE with the project stamped on both lines", async () => {
    await withTenant(TENANT_C, async () => {
      const result = await contracts.billPeriod({
        contractId,
        periodKey: "2026-01",
        amount: "1700.0000",
        entryDate: "2026-01-31",
        actorId: C_ACTOR,
      });
      expect(result.idempotentReplay).toBe(false);

      const lines = await txQuery<{
        purpose: string;
        direction: string;
        amount: string;
        partner_id: string | null;
        project_id: string | null;
      }>(
        `SELECT p.purpose_key AS purpose, l.direction, l.amount::text AS amount,
                l.partner_id, l.project_id
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.journal_entry_id
         JOIN accounts a ON a.id = l.account_id
         LEFT JOIN account_purposes p ON p.account_id = a.id AND p.active_to IS NULL
         WHERE e.source_type = 'contract_invoice'
         ORDER BY l.line_no`,
      );
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatchObject({ purpose: "AR_CONTROL", direction: "DEBIT", amount: "1700.0000", partner_id: partnerId, project_id: projectId });
      expect(lines[1]).toMatchObject({ purpose: "SALES_REVENUE", direction: "CREDIT", amount: "1700.0000", project_id: projectId });

      // partner subledger row in the same transaction (INV-009)
      const sub = await txQuery<{ n: number }>(
        `SELECT count(*)::int AS n FROM partner_subledger_entries WHERE partner_id = $1`,
        [partnerId],
      );
      expect(sub[0]?.n).toBe(1);
    });
  });

  it("re-running the same (contract, period) is an idempotent replay — zero duplicates (INV-013)", async () => {
    await withTenant(TENANT_C, async () => {
      const replay = await contracts.billPeriod({
        contractId,
        periodKey: "2026-01",
        amount: "1700.0000",
        entryDate: "2026-01-31",
        actorId: C_ACTOR,
      });
      expect(replay.idempotentReplay).toBe(true);
      const entries = await txQuery<{ n: number }>(
        `SELECT count(*)::int AS n FROM journal_entries WHERE source_type = 'contract_invoice'`,
      );
      expect(entries[0]?.n).toBe(1);
    });
  });

  it("posting into a LOCKED period is rejected (INV-011) with zero ledger residue", async () => {
    await withTenant(TENANT_C, async () => {
      const periodRows = await periods.listPeriods();
      const feb = periodRows.find((p) => p.startDate === "2026-02-01");
      expect(feb).toBeDefined();
      // SOFT_CLOSED posting requires the BR-030 permission + reason — the
      // billing run carries neither, so it must be rejected (INV-011).
      await periods.softClose(C_ACTOR, feb!.id);
      await expect(
        contracts.billPeriod({
          contractId,
          periodKey: "2026-02",
          amount: "1550.0000",
          entryDate: "2026-02-14",
          actorId: C_ACTOR,
        }),
      ).rejects.toThrow();
      const entries = await txQuery<{ n: number }>(
        `SELECT count(*)::int AS n FROM journal_entries WHERE source_type = 'contract_invoice'`,
      );
      expect(entries[0]?.n).toBe(1);
    });
  });

  it("lead conversion creates the partner (BR-025 code), links it, and freezes the lead", async () => {
    await withTenant(TENANT_C, async () => {
      const result = await leads.convert({
        leadId,
        partnerId: null,
        newPartner: { code: "C-0002", name: "Converted Client", nameAr: "عميل محوَّل" },
        actorId: C_ACTOR,
      });
      expect(result.created).toBe(true);
      const row = await txQuery<{ status: string; partner_id: string | null; converted_at: string | null }>(
        `SELECT status, partner_id, converted_at::text AS converted_at FROM leads WHERE id = $1`,
        [leadId],
      );
      expect(row[0]?.status).toBe("CONVERTED");
      expect(row[0]?.partner_id).toBe(result.partnerId);
      expect(row[0]?.converted_at).not.toBeNull();
      // immutable after conversion
      await expect(
        leads.transition({ leadId, action: "QUALIFY", actorId: C_ACTOR }),
      ).rejects.toThrow();
      // audited (same ambient tx — the superuser conn cannot see it yet)
      const audits = await txQuery<{ action: string }>(
        `SELECT action FROM audit_events WHERE entity_type = 'lead' AND entity_id = $1`,
        [leadId],
      );
      expect(audits.map((a) => a.action)).toContain("crm.lead_converted");
    });
  });
});
