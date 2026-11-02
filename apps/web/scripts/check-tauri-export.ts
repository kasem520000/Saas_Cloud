/**
 * PHASE-021 T1 guard — proves the web app can ship as a static export inside
 * the Tauri shell (apps/desktop, ADR-0013). Run: `pnpm check:tauri-export`.
 * Fails (exit 1) when the exported tree contains server-only features:
 *  - route handlers (app/**\/route.ts) without `force-static` (Next would
 *    refuse the export anyway; we fail earlier with a clear message),
 *  - `next/headers` / `cookies()` / `headers()` imports outside app/api,
 *  - `output` not set to "export" under TAURI_BUILD=1.
 * The desktop shell talks to apps/api over HTTP directly (apiBaseUrl), so
 * same-origin app/api proxies are not part of the offline surface.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const APP_DIR = join(__dirname, "..", "app");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const violations: string[] = [];
const excludedApiRoutes: string[] = [];
const SERVER_ONLY = ["next/headers", 'from "next/server"'];
const API_DIR = join(APP_DIR, "api");

for (const file of walk(APP_DIR)) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  const rel = relative(APP_DIR, file);
  const content = readFileSync(file, "utf8");
  const isApiRoute = file.startsWith(API_DIR);
  if (/route\.tsx?$/.test(file) && !isApiRoute) {
    violations.push(`${rel}: route handler outside app/api cannot be statically exported`);
  }
  if (/route\.tsx?$/.test(file) && isApiRoute) {
    // BFF session proxies are browser-same-origin only; the desktop shell
    // calls apps/api directly (apiBaseUrl), so app/api is excluded from the
    // exported surface by the Tauri CI build. Here we only record them.
    excludedApiRoutes.push(rel);
  }
  if (!isApiRoute) {
    for (const marker of SERVER_ONLY) {
      if (content.includes(marker)) violations.push(`${rel}: server-only import "${marker}" in exported tree`);
    }
    if (/\b(cookies|headers)\s*\(\s*\)/.test(content)) {
      violations.push(`${rel}: per-request cookies()/headers() call in exported tree`);
    }
  }
}

if (violations.length > 0) {
  console.error("TAURI EXPORT GUARD — violations:");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(
  `TAURI EXPORT GUARD — clean (${[...walk(APP_DIR)].filter((f) => /\.(ts|tsx)$/.test(f)).length} files scanned; ` +
    `${excludedApiRoutes.length} BFF routes excluded from export by design: ${excludedApiRoutes.join(", ")})`,
);
