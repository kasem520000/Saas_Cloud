/**
 * PHASE-034 T6/T7 — consolidation run orchestration (ADR-0018 §2/§5, BR-056,
 * INV-026). A run is a READ-ONLY aggregation over member books: precheck that
 * every member's fiscal period is closed (else typed MEMBER_PERIOD_OPEN —
 * rejected, not warned), read member balances via the audited platform reader,
 * translate to the group base currency with dated rates (INV-008), subtract
 * posted eliminations, and store an immutable versioned snapshot. Member books
 * are never written (asserted byte-for-byte by the isolation suite).
 */
import { randomUUID } from "node:crypto";

import { Decimal } from "@erp/domain-core";
import { Inject, Injectable } from "@nestjs/common";

import { AuditService } from "../../audit/api/audit";
import type { EliminationLeg } from "./journal-builders";
import { translate } from "./fx-translation";
import { ConsolidationReaderService } from "./reader-service";
import { ConsolidationGroupNotFoundError, MemberPeriodOpenError, RunNotCompletableError } from "../domain/consolidation-errors";
import * as store from "../infrastructure/consolidation.store";

@Injectable()
export class ConsolidationRunService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    private readonly reader: ConsolidationReaderService,
  ) {}

  async queueRun(input: { groupId: string; fiscalPeriodId: string; asOf: string; actorId: string | null }): Promise<store.ConsolidationRunRow> {
    const group = await store.findGroupById(input.groupId);
    if (group === undefined) throw new ConsolidationGroupNotFoundError(input.groupId);
    const run = await store.insertRun({ id: randomUUID(), groupId: input.groupId, fiscalPeriodId: input.fiscalPeriodId, createdBy: input.actorId });
    await this.audit.record({
      action: "consolidation.run_queued", entityType: "consolidation_run", entityId: run.id,
      actorId: input.actorId ?? undefined, after: { groupId: input.groupId, asOf: input.asOf },
    });
    return run;
  }

  /**
   * Execute a QUEUED run. BR-056 precheck: every ACTIVE member must have the
   * period CLOSED. Snapshot is deterministic: same inputs ⇒ same bytes.
   */
  async execute(input: { runId: string; asOf: string; actorId: string | null }): Promise<store.ConsolidationRunRow> {
    const run = await store.findRunById(input.runId);
    if (run === undefined || run.status !== "QUEUED") throw new RunNotCompletableError(input.runId, run?.status ?? "NOT_FOUND");
    const group = await store.findGroupById(run.groupId);
    if (group === undefined) throw new ConsolidationGroupNotFoundError(run.groupId);
    const members = await store.listGroupEntities(run.groupId);

    // BR-056: closed member periods only.
    for (const m of members) {
      const years = await this.reader.readMemberFiscalYears(m.memberTenantId);
      const covering = years.find((y) => y.startDate <= input.asOf && input.asOf <= y.endDate);
      if (covering === undefined || covering.status !== "CLOSED") {
        throw new MemberPeriodOpenError(m.memberTenantId);
      }
    }

    await store.updateRunStatus({ id: run.id, status: "RUNNING", markStarted: true });

    // Read-only member aggregation + dated-FX translation + eliminations.
    const memberStatements: Record<string, { accountCode: string; purposeKey: string | null; balance: string }[]> = {};
    for (const m of members) {
      const balances = await this.reader.readMemberBalances(m.memberTenantId, input.asOf);
      await this.reader.auditRead(
        { runId: run.id, memberTenantId: m.memberTenantId, actorId: input.actorId, scope: "account_balances", rowsRead: balances.length },
        { actorId: input.actorId },
      );
      const translated: { accountCode: string; purposeKey: string | null; balance: string }[] = [];
      for (const b of balances) {
        const net = new Decimal(b.debit).sub(new Decimal(b.credit));
        const memberCurrency = await this.memberBaseCurrency(m.memberTenantId);
        const amount = net.abs().toString();
        const base = await translate(amount, memberCurrency, input.asOf, group.baseCurrency);
        translated.push({ accountCode: b.accountCode, purposeKey: b.purposeKey, balance: net.isNegative() ? `-${base}` : base });
      }
      memberStatements[m.memberTenantId] = translated;
    }

    // Eliminations subtract (INV-026): Σ members − eliminations.
    const eliminations = await store.listPostedEliminations(run.groupId, run.fiscalPeriodId);
    const eliminationEffect: Record<string, string> = {};
    for (const e of eliminations) {
      for (const leg of e.lines as EliminationLeg[]) {
        const key = leg.purpose;
        const signed = leg.direction === "DEBIT" ? new Decimal(leg.amount) : new Decimal(leg.amount).mul(-1);
        eliminationEffect[key] = (new Decimal(eliminationEffect[key] ?? 0).add(signed)).toString();
      }
    }

    const snapshot = {
      runId: run.id,
      groupId: run.groupId,
      asOf: input.asOf,
      baseCurrency: group.baseCurrency,
      fxTranslationMethod: group.fxTranslationMethod,
      memberStatements,
      eliminations: eliminationEffect,
      invariant: "INV-026: consolidated = Σ member statements (group currency, dated FX) − eliminations",
    };
    await store.updateRunStatus({ id: run.id, status: "COMPLETED", snapshot, markCompleted: true });
    await this.audit.record({
      action: "consolidation.run_completed", entityType: "consolidation_run", entityId: run.id,
      actorId: input.actorId ?? undefined, after: { members: members.length, eliminations: eliminations.length },
    });
    const done = await store.findRunById(run.id);
    return done as store.ConsolidationRunRow;
  }

  private async memberBaseCurrency(memberTenantId: string): Promise<string> {
    const { getDb } = await import("../../../infra/db/client");
    type TenantDb = import("../../../infra/db/client").TenantDb;
    const { sql } = await import("drizzle-orm");
    return getDb().transaction(async (tx: TenantDb) => {
      await tx.execute(sql`SELECT set_config('erp.tenant_id', ${memberTenantId}, true)`);
      const rows = await tx.execute(sql<{ c: string }>`SELECT base_currency AS c FROM tenants WHERE id = ${memberTenantId}`);
      return (rows.rows[0] as unknown as { c: string } | undefined)?.c ?? "SAR";
    });
  }
}
