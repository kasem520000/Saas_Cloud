/**
 * Loads the repo-root .env into process.env (without overriding variables that
 * are already set), so every script entry point — drizzle-kit config, seed,
 * db:local, dev credentials — works after a plain `pnpm env:setup` without
 * manually exporting anything. No-op when .env is absent (the callers then
 * fail with their own clear "X is not configured" errors).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadDotEnv(): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
    resolve(__dirname, "../../../.env"),
  ];
  const file = candidates.find((c) => existsSync(c));
  if (file === undefined) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();
