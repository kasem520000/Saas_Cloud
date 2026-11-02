/**
 * PHASE-034 T3 — the audited platform-plane reader (ADR-0018 §3): the ONLY
 * sanctioned cross-tenant reader. It reads POSTED member GL read models
 * (journal lines / account balances) by switching the tenant GUC per member on
 * a dedicated connection, and records one audit row per read (run, member
 * tenant, actor, scope) into the OWNER tenant's audit trail. Zero writes to
 * member books by construction — the reader role holds SELECT only (grant
 * asserted by the isolation suite).
 */
import { sql } from "drizzle-orm";
import { getDb, type TenantDb } from "../../../infra/db/client";

import type { AuditService } from "../../audit/api/audit";

export interface MemberReadAudit {
  runId: string | null;
  memberTenantId: string;
  actorId: string | null;
  scope: string;
  rowsRead: number;
}

export interface MemberAccountBalance {
  accountId: string;
  accountCode: string;
  purposeKey: string | null;
  debit: string;
  credit: string;
}

export class ConsolidationReaderService {
  constructor(private readonly audit: AuditService) {}

  /**
   * Read a member tenant's posted account balances as of a date. The GUC is
   * set transaction-locally on a pooled connection — the member's RLS policy
   * confines the read to that member; this service never writes member rows.
   */
  async readMemberBalances(memberTenantId: string, asOf: string): Promise<MemberAccountBalance[]> {
    const db = getDb();
    return db.transaction(async (tx: TenantDb) => {
      await tx.execute(sql`SELECT set_config('erp.tenant_id', ${memberTenantId}, true)`);
      const rows = await tx.execute(sql<MemberAccountBalance>`
        SELECT a.id AS "accountId", a.code AS "accountCode", p.purpose_key AS "purposeKey",
               COALESCE(SUM(CASE WHEN l.direction = 'DEBIT' THEN l.amount ELSE 0 END), 0)::text AS "debit",
               COALESCE(SUM(CASE WHEN l.direction = 'CREDIT' THEN l.amount ELSE 0 END), 0)::text AS "credit"
          FROM accounts a
          LEFT JOIN account_purposes p ON p.account_id = a.id AND p.active_to IS NULL
          LEFT JOIN journal_lines l ON l.account_id = a.id
          LEFT JOIN journal_entries e ON e.id = l.journal_entry_id AND e.status = 'POSTED' AND e.entry_date <= ${asOf}
         WHERE a.tenant_id = ${memberTenantId}
         GROUP BY a.id, a.code, p.purpose_key
         ORDER BY a.code
      `);
      return rows.rows as unknown as MemberAccountBalance[];
    });
  }

  /** Read a member's fiscal-YEAR statuses (BR-056: members must be CLOSED). */
  async readMemberFiscalYears(memberTenantId: string): Promise<{ id: string; status: string; startDate: string; endDate: string }[]> {
    const db = getDb();
    return db.transaction(async (tx: TenantDb) => {
      await tx.execute(sql`SELECT set_config('erp.tenant_id', ${memberTenantId}, true)`);
      const rows = await tx.execute(sql<{ id: string; status: string; startDate: string; endDate: string }>`
        SELECT id, status, start_date AS "startDate", end_date AS "endDate" FROM fiscal_years WHERE tenant_id = ${memberTenantId} ORDER BY start_date
      `);
      return rows.rows as unknown as { id: string; status: string; startDate: string; endDate: string }[];
    });
  }

  /** Per-read audit row into the owner tenant (call inside the owner's withTenant). */
  async auditRead(a: MemberReadAudit, ownerActorScope: { actorId: string | null }): Promise<void> {
    await this.audit.record({
      action: "consolidation.member_read",
      entityType: "consolidation_run",
      entityId: a.runId ?? "reader",
      actorId: a.actorId ?? ownerActorScope.actorId ?? undefined,
      after: {
        memberTenantId: a.memberTenantId, scope: a.scope, rowsRead: a.rowsRead,
        runId: a.runId,
      },
    });
  }
}
