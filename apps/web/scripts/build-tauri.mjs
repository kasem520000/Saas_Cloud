/**
 * PHASE-021 T1 — static-export build for the Tauri shell. The BFF routes
 * (app/api/bff/*) are browser-same-origin session proxies; the desktop shell
 * talks to apps/api directly over HTTP (apiBaseUrl), so they are moved aside
 * for the duration of `next build` with TAURI_BUILD=1 and restored after —
 * even on failure. Then runs the export guard.
 */
import { renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const apiDir = join(import.meta.dirname, "..", "app", "api");
const aside = join(import.meta.dirname, "..", ".api-bff-excluded-tmp"); // outside app/ — Next scans dot-dirs inside app/

if (existsSync(apiDir)) renameSync(apiDir, aside);
try {
  const res = spawnSync("pnpm", ["exec", "next", "build"], {
    stdio: "inherit",
    env: { ...process.env, TAURI_BUILD: "1" },
  });
  process.exitCode = res.status ?? 1;
} finally {
  if (existsSync(aside)) renameSync(aside, apiDir);
}
