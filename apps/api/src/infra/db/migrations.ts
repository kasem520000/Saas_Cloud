import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Migration manifest (MIGRATION_STRATEGY §1): the ordered `NNNN_description`
 * tags mirror `apps/api/migrations/meta/_journal.json` and the SQL files on
 * disk. `/health/ready` compares `erp.schema_version()` (upserted by every
 * migration) against this list; a stale build against a newer schema fails
 * readiness. The unit test `migrations.spec.ts` asserts manifest ↔ journal ↔
 * files never drift.
 *
 * Convention: every `NNNN_*.sql` must upsert
 * `INSERT INTO erp._schema_state (key, value) VALUES ('schema_version', N)`
 * with its own number — enforced by the same unit test.
 */
export const MIGRATIONS: readonly string[] = [
  "0001_core_infra",
  "0002_rls_macro",
  "0003_identity_core",
  "0004_permissions_seed",
  "0005_system_role_templates_seed",
  "0006_tenancy_provisioning",
  "0007_accounts_schema",
  "0008_platform_seeds",
  "0009_partners_items",
  "0010_accounting_core",
  "0011_journal_tables",
  "0012_treasury",
  "0013_tax",
  "0014_inventory_core",
  "0015_inventory_tracking",
  "0016_purchasing_core",
  "0017_purchasing_ap",
  "0018_sales_core",
  "0019_sales_ar",
  "0020_reporting_core",
  "0021_billing_notifications",
  "0022_industry_configuration",
  "0023_pos_offline_slice",
  "0024_industry_templates_017",
  "0025_manufacturing_018",
  "0026_crm_projects_019",
];

/**
 * Module-system independent resolution (tsc CJS __dirname vs vitest ESM):
 * prefer the package-local `migrations/` of the invoking workspace, then the
 * monorepo-root-relative path for callers at other cwds.
 */
function resolveMigrationsDir(): string {
  const candidates = [
    join(process.cwd(), "migrations"),
    join(process.cwd(), "apps", "api", "migrations"),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "meta", "_journal.json"))) {
      return candidate;
    }
  }
  return candidates[0]!;
}

export const MIGRATIONS_DIR: string = resolveMigrationsDir();

export interface MigrationFile {
  tag: string;
  content: string;
}

/** Reads and returns every migration SQL file in manifest order. */
export function readMigrationFiles(): MigrationFile[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  const tags = files.map((name) => name.replace(/\.sql$/, ""));
  if (tags.join(",") !== MIGRATIONS.join(",")) {
    throw new Error(
      `Migration drift: manifest [${MIGRATIONS.join(", ")}] vs files [${tags.join(", ")}]`,
    );
  }
  return files.map((name, index) => ({
    tag: tags[index]!,
    content: readFileSync(join(MIGRATIONS_DIR, name), "utf8"),
  }));
}
