/**
 * `pnpm db:local` — embedded PostgreSQL 16 on the SAME port as DATABASE_URL
 * (default 5432), persistent data dir `.pgdata-local/` at the repo root.
 * Leave it running in its own terminal; `pnpm db:migrate` / `pnpm db:seed` /
 * `pnpm dev` then just work against postgres://...@localhost:5432/erp.
 * Stop with Ctrl+C. (Alternative to `pnpm db:up`'s docker postgres.)
 */
import "./load-env";

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import EmbeddedPostgres from "embedded-postgres";

const repoRoot = resolve(__dirname, "../../..");
const port = Number(process.env.DB_LOCAL_PORT ?? 5432);
const dataDir = process.env.DB_LOCAL_DATA_DIR ?? resolve(repoRoot, ".pgdata-local");
mkdirSync(dataDir, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
});

async function main(): Promise<void> {
  // Persistent data dir: initialise only on first run (PG_VERSION marks an
  // existing cluster) so `pnpm db:local` can be stopped and restarted.
  const { existsSync } = await import("node:fs");
  if (!existsSync(resolve(dataDir, "PG_VERSION"))) {
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase("erp");
  } catch {
    // database already exists on a restarted cluster — fine
  }

  console.log(`db:local: PostgreSQL 16 running on localhost:${port} (embedded, persistent at ${dataDir})`);
  console.log(`db:local: DATABASE_URL=postgres://erp_app:erp_app@localhost:${port}/erp`);
  console.log(`db:local: MIGRATE_DATABASE_URL=postgres://postgres:postgres@localhost:${port}/erp`);
  console.log("db:local: leave this terminal running. Next: pnpm db:migrate && pnpm db:seed && pnpm dev");

  const shutdown = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
  setInterval(() => undefined, 60_000); // keep the process alive
}

main().catch((error) => {
  console.error("db:local failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
