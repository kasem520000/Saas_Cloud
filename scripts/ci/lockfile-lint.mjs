#!/usr/bin/env node
/**
 * PHASE-024 T7 — lockfile lint: no "*" or "" ranges on PRODUCTION deps of
 * any workspace package (SECURITY_TEST_PLAN dependency triage rule). Dev-only
 * wildcards are reported but not blocking. Exits 1 on prod wildcard.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../..", import.meta.url).pathname;
const pkgs = ["apps/api", "apps/web", "apps/desktop", "apps/mobile", "packages/sync-core", "packages/contracts", "packages/domain-core", "packages/ui"];

let violations = 0;
let checked = 0;
for (const pkg of pkgs) {
  const manifest = join(root, pkg, "package.json");
  let json;
  try {
    json = JSON.parse(readFileSync(manifest, "utf8"));
  } catch {
    continue;
  }
  checked += 1;
  for (const [name, range] of Object.entries(json.dependencies ?? {})) {
    if (range === "*" || range === "" || range === "latest") {
      console.error(`PROD WILDCARD: ${pkg} dependency ${name}@${range}`);
      violations += 1;
    }
  }
}
console.log(`lockfile-lint: ${checked} manifests checked, ${violations} prod wildcard(s)`);
process.exit(violations > 0 ? 1 : 0);
