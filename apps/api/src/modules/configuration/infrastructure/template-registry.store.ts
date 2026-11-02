import { sql } from "drizzle-orm";

import { getDb } from "../../../infra/db/client";
import { ambientAnyTx } from "../../../infra/db/tenant-context";
import { requireTenantContext } from "../../../infra/db/tenant-context";

/**
 * PHASE-015 T4 — template registry + applied-config data access
 * (migration 0022). `industry_templates` and `feature_flags` are platform-owned
 * registries (global read, platform-scope write); `tenant_industry_config` is
 * tenant-scoped (macro RLS) — read inside the ambient tenant scope, written by
 * the apply/switch service in the same UoW.
 */

export interface IndustryTemplateRow {
  key: string;
  name: string;
  nameAr: string;
  version: string;
  manifest: unknown;
  isActive: boolean;
}

export interface FeatureFlagRow {
  key: string;
  name: string;
  nameAr: string;
  enabled: boolean;
  description: string;
}

export interface TenantIndustryConfigRow {
  tenantId: string;
  templateKey: string;
  appliedVersion: string;
  appliedManifestHash: string;
  appliedAt: string;
  overrides: Record<string, unknown>;
  archived: unknown[];
}

function handle() {
  return ambientAnyTx() ?? getDb();
}

function tenantTx() {
  const context = requireTenantContext();
  if (context.tx === undefined) {
    throw new Error("tenant_industry_config access requires an ambient tenant scope");
  }
  return context.tx;
}

export async function listTemplates(activeOnly = true): Promise<IndustryTemplateRow[]> {
  const rows = await handle().execute(sql`
    SELECT "key", "name", "name_ar" AS "nameAr", "version", "manifest", "is_active" AS "isActive"
    FROM "industry_templates"
    ${activeOnly ? sql`WHERE "is_active" = true` : sql``}
    ORDER BY "key"
  `);
  return rows.rows as unknown as IndustryTemplateRow[];
}

export async function findTemplate(key: string): Promise<IndustryTemplateRow | undefined> {
  const rows = await handle().execute(sql`
    SELECT "key", "name", "name_ar" AS "nameAr", "version", "manifest", "is_active" AS "isActive"
    FROM "industry_templates"
    WHERE "key" = ${key}
  `);
  return (rows.rows as unknown as IndustryTemplateRow[])[0];
}

export async function listFeatureFlags(): Promise<FeatureFlagRow[]> {
  const rows = await handle().execute(sql`
    SELECT "key", "name", "name_ar" AS "nameAr", "enabled", "description"
    FROM "feature_flags"
    ORDER BY "key"
  `);
  return rows.rows as unknown as FeatureFlagRow[];
}

export async function getAppliedConfig(): Promise<TenantIndustryConfigRow | undefined> {
  const rows = await tenantTx().execute(sql`
    SELECT "tenant_id" AS "tenantId", "template_key" AS "templateKey",
           "applied_version" AS "appliedVersion", "applied_manifest_hash" AS "appliedManifestHash",
           "applied_at" AS "appliedAt", "overrides", "archived"
    FROM "tenant_industry_config"
    LIMIT 1
  `);
  return (rows.rows as unknown as TenantIndustryConfigRow[])[0];
}

export async function upsertAppliedConfig(input: {
  tenantId: string;
  templateKey: string;
  appliedVersion: string;
  appliedManifestHash: string;
  overrides: Record<string, unknown>;
  archived: unknown[];
}): Promise<void> {
  await tenantTx().execute(sql`
    INSERT INTO "tenant_industry_config"
      ("tenant_id", "template_key", "applied_version", "applied_manifest_hash", "overrides", "archived")
    VALUES (${input.tenantId}, ${input.templateKey}, ${input.appliedVersion},
            ${input.appliedManifestHash}, ${JSON.stringify(input.overrides)}::jsonb,
            ${JSON.stringify(input.archived)}::jsonb)
    ON CONFLICT ("tenant_id") DO UPDATE SET
      "template_key" = EXCLUDED."template_key",
      "applied_version" = EXCLUDED."applied_version",
      "applied_manifest_hash" = EXCLUDED."applied_manifest_hash",
      "applied_at" = now(),
      "overrides" = EXCLUDED."overrides",
      "archived" = EXCLUDED."archived"
  `);
}
