/**
 * PHASE-034 consolidation store (ADR-0018). All rows are OWNER-tenant scoped
 * (tenant_id = owner). Member books are NEVER written here — reads go through
 * the platform-plane reader service only. Engine writes flow only via
 * PostingEngine.post (ADR-0007).
 */
import { sql } from "drizzle-orm";

import { requireTenantContext, type TenantDb } from "../../../infra/db/tenant-context";

function tenantTx(): TenantDb {
  const context = requireTenantContext();
  if (context.tx === undefined) throw new Error("consolidation access requires an ambient tenant scope");
  return context.tx;
}

export interface ConsolidationGroupRow {
  id: string;
  name: string;
  nameAr: string | null;
  baseCurrency: string;
  fxTranslationMethod: string;
  status: string;
}

export interface GroupEntityRow {
  id: string;
  groupId: string;
  memberTenantId: string;
  ownershipPercent: string;
  includeFrom: string;
  status: string;
}

export interface EliminationEntryRow {
  id: string;
  groupId: string;
  fiscalPeriodId: string;
  description: string;
  status: string;
  lines: unknown;
  journalEntryId: string | null;
  reversalEntryId: string | null;
}

export interface ConsolidationRunRow {
  id: string;
  groupId: string;
  fiscalPeriodId: string;
  status: string;
  snapshot: unknown;
  snapshotVersion: number;
  error: string | null;
}

export async function insertGroup(input: {
  id: string; name: string; nameAr: string | null; baseCurrency: string; fxTranslationMethod: string;
}): Promise<ConsolidationGroupRow> {
  const rows = await tenantTx().execute(sql<ConsolidationGroupRow>`
    INSERT INTO consolidation_groups (id, tenant_id, name, name_ar, base_currency, fx_translation_method)
    VALUES (${input.id}, erp.current_tenant_id(), ${input.name}, ${input.nameAr}, ${input.baseCurrency}, ${input.fxTranslationMethod})
    RETURNING id, name, name_ar AS "nameAr", base_currency AS "baseCurrency", fx_translation_method AS "fxTranslationMethod", status
  `);
  return rows.rows[0] as unknown as ConsolidationGroupRow;
}

export async function findGroupById(id: string): Promise<ConsolidationGroupRow | undefined> {
  const rows = await tenantTx().execute(sql<ConsolidationGroupRow>`
    SELECT id, name, name_ar AS "nameAr", base_currency AS "baseCurrency", fx_translation_method AS "fxTranslationMethod", status
      FROM consolidation_groups WHERE id = ${id} AND tenant_id = erp.current_tenant_id() LIMIT 1
  `);
  return rows.rows[0] as unknown as ConsolidationGroupRow | undefined;
}

export async function listGroups(): Promise<ConsolidationGroupRow[]> {
  const rows = await tenantTx().execute(sql<ConsolidationGroupRow>`
    SELECT id, name, name_ar AS "nameAr", base_currency AS "baseCurrency", fx_translation_method AS "fxTranslationMethod", status
      FROM consolidation_groups WHERE tenant_id = erp.current_tenant_id() ORDER BY created_at DESC
  `);
  return rows.rows as unknown as ConsolidationGroupRow[];
}

export async function insertGroupEntity(input: {
  id: string; groupId: string; memberTenantId: string; ownershipPercent: string; includeFrom: string;
}): Promise<GroupEntityRow> {
  const rows = await tenantTx().execute(sql<GroupEntityRow>`
    INSERT INTO group_entities (id, tenant_id, group_id, member_tenant_id, ownership_percent, include_from)
    VALUES (${input.id}, erp.current_tenant_id(), ${input.groupId}, ${input.memberTenantId}, ${input.ownershipPercent}, ${input.includeFrom})
    RETURNING id, group_id AS "groupId", member_tenant_id AS "memberTenantId", ownership_percent::text AS "ownershipPercent", include_from AS "includeFrom", status
  `);
  return rows.rows[0] as unknown as GroupEntityRow;
}

export async function listGroupEntities(groupId: string): Promise<GroupEntityRow[]> {
  const rows = await tenantTx().execute(sql<GroupEntityRow>`
    SELECT id, group_id AS "groupId", member_tenant_id AS "memberTenantId", ownership_percent::text AS "ownershipPercent", include_from AS "includeFrom", status
      FROM group_entities WHERE group_id = ${groupId} AND tenant_id = erp.current_tenant_id() AND status = 'ACTIVE'
  `);
  return rows.rows as unknown as GroupEntityRow[];
}

export async function memberExists(memberTenantId: string): Promise<boolean> {
  // Platform-plane existence check: `tenants` RLS admits platform scope only
  // (0001 §3.2), so the check runs under withPlatformScope — a read-only
  // boolean existence probe, 404-shaped upstream (no data disclosure, A7).
  const { withPlatformScope } = await import("../../../infra/db/tenant-context");
  return withPlatformScope(async (tx) => {
    const rows = await tx.execute(sql<{ n: number }>`
      SELECT count(*)::int AS n FROM tenants WHERE id = ${memberTenantId}
    `);
    return ((rows.rows[0] as unknown as { n: number } | undefined)?.n ?? 0) > 0;
  });
}

export async function insertElimination(input: {
  id: string; groupId: string; fiscalPeriodId: string; description: string; lines: unknown; createdBy: string | null;
}): Promise<EliminationEntryRow> {
  const rows = await tenantTx().execute(sql<EliminationEntryRow>`
    INSERT INTO elimination_entries (id, tenant_id, group_id, fiscal_period_id, description, lines, created_by)
    VALUES (${input.id}, erp.current_tenant_id(), ${input.groupId}, ${input.fiscalPeriodId}, ${input.description}, ${JSON.stringify(input.lines)}::jsonb, ${input.createdBy})
    RETURNING id, group_id AS "groupId", fiscal_period_id AS "fiscalPeriodId", description, status, lines, journal_entry_id AS "journalEntryId", reversal_entry_id AS "reversalEntryId"
  `);
  return rows.rows[0] as unknown as EliminationEntryRow;
}

export async function findEliminationById(id: string): Promise<EliminationEntryRow | undefined> {
  const rows = await tenantTx().execute(sql<EliminationEntryRow>`
    SELECT id, group_id AS "groupId", fiscal_period_id AS "fiscalPeriodId", description, status, lines, journal_entry_id AS "journalEntryId", reversal_entry_id AS "reversalEntryId"
      FROM elimination_entries WHERE id = ${id} AND tenant_id = erp.current_tenant_id() LIMIT 1
  `);
  return rows.rows[0] as unknown as EliminationEntryRow | undefined;
}

export async function markEliminationPosted(id: string, journalEntryId: string, postedBy: string | null): Promise<void> {
  await tenantTx().execute(sql`
    UPDATE elimination_entries SET status = 'POSTED', journal_entry_id = ${journalEntryId}, posted_by = ${postedBy}, posted_at = now(), updated_at = now()
     WHERE id = ${id} AND tenant_id = erp.current_tenant_id()
  `);
}

export async function markEliminationReversed(id: string, reversalEntryId: string): Promise<void> {
  await tenantTx().execute(sql`
    UPDATE elimination_entries SET status = 'REVERSED', reversal_entry_id = ${reversalEntryId}, updated_at = now()
     WHERE id = ${id} AND tenant_id = erp.current_tenant_id()
  `);
}

export async function listPostedEliminations(groupId: string, fiscalPeriodId: string): Promise<EliminationEntryRow[]> {
  const rows = await tenantTx().execute(sql<EliminationEntryRow>`
    SELECT id, group_id AS "groupId", fiscal_period_id AS "fiscalPeriodId", description, status, lines, journal_entry_id AS "journalEntryId", reversal_entry_id AS "reversalEntryId"
      FROM elimination_entries WHERE group_id = ${groupId} AND fiscal_period_id = ${fiscalPeriodId} AND tenant_id = erp.current_tenant_id() AND status = 'POSTED'
  `);
  return rows.rows as unknown as EliminationEntryRow[];
}

export async function insertRun(input: {
  id: string; groupId: string; fiscalPeriodId: string; createdBy: string | null;
}): Promise<ConsolidationRunRow> {
  const rows = await tenantTx().execute(sql<ConsolidationRunRow>`
    INSERT INTO consolidation_runs (id, tenant_id, group_id, fiscal_period_id, created_by)
    VALUES (${input.id}, erp.current_tenant_id(), ${input.groupId}, ${input.fiscalPeriodId}, ${input.createdBy})
    RETURNING id, group_id AS "groupId", fiscal_period_id AS "fiscalPeriodId", status, snapshot, snapshot_version AS "snapshotVersion", error
  `);
  return rows.rows[0] as unknown as ConsolidationRunRow;
}

export async function findRunById(id: string): Promise<ConsolidationRunRow | undefined> {
  const rows = await tenantTx().execute(sql<ConsolidationRunRow>`
    SELECT id, group_id AS "groupId", fiscal_period_id AS "fiscalPeriodId", status, snapshot, snapshot_version AS "snapshotVersion", error
      FROM consolidation_runs WHERE id = ${id} AND tenant_id = erp.current_tenant_id() LIMIT 1
  `);
  return rows.rows[0] as unknown as ConsolidationRunRow | undefined;
}

export async function updateRunStatus(input: {
  id: string; status: string; snapshot?: unknown; error?: string | null; markStarted?: boolean; markCompleted?: boolean;
}): Promise<void> {
  await tenantTx().execute(sql`
    UPDATE consolidation_runs SET
      status = ${input.status},
      snapshot = COALESCE(${input.snapshot === undefined ? null : JSON.stringify(input.snapshot)}::jsonb, snapshot),
      error = COALESCE(${input.error ?? null}, error),
      started_at = CASE WHEN ${input.markStarted === true} THEN now() ELSE started_at END,
      completed_at = CASE WHEN ${input.markCompleted === true} THEN now() ELSE completed_at END
     WHERE id = ${input.id} AND tenant_id = erp.current_tenant_id()
  `);
}
