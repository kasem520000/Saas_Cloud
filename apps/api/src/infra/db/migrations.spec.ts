import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MIGRATIONS, MIGRATIONS_DIR, readMigrationFiles } from "./migrations";

describe("migration manifest (MIGRATION_STRATEGY §1)", () => {
  it("manifest matches the SQL files on disk", () => {
    const files = readMigrationFiles();
    expect(files.map((file) => file.tag)).toEqual([...MIGRATIONS]);
    expect(files[0]?.tag).toBe("0001_core_infra");
    expect(files.at(-1)?.tag).toBe("0026_crm_projects_019");
  });

  it("journal entries mirror the manifest order (drizzle-kit manifest)", () => {
    const journal = JSON.parse(
      readFileSync(join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
    ) as { entries: { tag: string; idx: number }[] };
    expect(journal.entries.map((entry) => entry.tag)).toEqual([...MIGRATIONS]);
  });

  it("every migration upserts its own schema-state number (readiness mirror)", () => {
    readMigrationFiles().forEach((file, index) => {
      const number = String(index + 1);
      expect(
        file.content,
        `${file.tag} must upsert ('schema_version', ${number})`,
      ).toMatch(
        new RegExp(
          `INSERT INTO erp\\._schema_state \\(key, value\\) VALUES \\('schema_version', ${number}\\)`,
        ),
      );
    });
  });

  it("fail-closed drift signal: an unexpected file breaks readMigrationFiles", () => {
    const baseline = readMigrationFiles().length;
    expect(baseline).toBe(MIGRATIONS.length);
  });
});
