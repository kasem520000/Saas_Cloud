/**
 * @erp/database — shared DB-layer constants (one home for the names scripts,
 * migrations tooling, and the API agree on; ADR-0005 roles, ADR-0018 books).
 */

/** App-role connection (RLS enforced) — the URL `pnpm dev` and `pnpm db:seed` use. */
export const DATABASE_URL_ENV = "DATABASE_URL";
/** Migration/bootstrap connection (role erp_migrate) — used by drizzle-kit. */
export const MIGRATE_DATABASE_URL_ENV = "MIGRATE_DATABASE_URL";

export const DEFAULT_DATABASE_URL = "postgres://erp_app:erp_app@localhost:5432/erp";
export const DEFAULT_MIGRATE_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/erp";

export const APP_ROLE = "erp_app";
export const MIGRATE_ROLE = "erp_migrate";
export const CONSOLIDATION_READER_ROLE = "erp_consolidation"; // ADR-0018 §3, SELECT-only

/** Current schema_version after migration 0037 (PHASE-034). */
export const SCHEMA_VERSION = 37;

/** Posting-engine source_type for consolidation eliminations (G-32, BR-056). */
export const SOURCE_TYPE_CONSOLIDATION_ELIMINATION = "consolidation_elimination";
