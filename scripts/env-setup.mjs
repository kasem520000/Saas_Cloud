#!/usr/bin/env node
/**
 * `pnpm env:setup` — one-time local environment bootstrap.
 * Copies .env.example → .env WITHOUT overwriting an existing .env
 * (real secrets are never clobbered). Prints the next commands.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const example = resolve(root, ".env.example");
const env = resolve(root, ".env");

if (!existsSync(example)) {
  console.error("env:setup: .env.example not found at repo root");
  process.exit(1);
}

if (existsSync(env)) {
  console.log("env:setup: .env already exists — left untouched (no overwrite).");
} else {
  copyFileSync(example, env);
  console.log("env:setup: created .env from .env.example");
}

// Make sure the two URLs the workflow relies on are present (append if missing).
let content = readFileSync(env, "utf8");
let changed = false;
for (const [key, value] of [
  ["DATABASE_URL", "postgres://erp_app:erp_app@localhost:5432/erp"],
  ["MIGRATE_DATABASE_URL", "postgres://postgres:postgres@localhost:5432/erp"],
]) {
  if (!new RegExp(`^${key}=`, "m").test(content)) {
    content += `\n${key}=${value}\n`;
    changed = true;
  }
}
if (changed) writeFileSync(env, content);

console.log("\nNext steps:");
console.log("  pnpm db:up        # postgres 16 + redis via docker compose");
console.log("  #   OR           pnpm db:local   # embedded PostgreSQL 16 on :5432 (leave running)");
console.log("  pnpm db:migrate");
console.log("  pnpm db:seed      # demo test company");
console.log("  pnpm dev          # api :3001 + web :3000");
