#!/usr/bin/env node
/**
 * PHASE-024 T7 — lightweight secret scan (gitleaks full-history runs in CI;
 * this is the fast local gate): high-entropy string assignments that look
 * like keys/tokens in tracked source files. Exits 1 on findings.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execSync("git ls-files", { encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(ts|tsx|js|mjs|sql|yml|yaml|env|example)$/.test(f))
  .filter((f) => !f.endsWith("pnpm-lock.yaml") && !f.endsWith("package.json"))
  .filter((f) => !f.includes("__tests__") && !f.includes("__db__") && !f.includes("dist-storybook") && !/\.(spec|test)\./.test(f) && !f.includes("dictionaries"));

const PATTERNS = [
  /(?:sk_live|sk_test|rk_live|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]+|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})["']?\s*[:=]/,
  /(?:SECRET|PASSWORD|API_KEY|PRIVATE_KEY)\s*[:=]\s*["'][^"'$\{]{8,}["']/i,
];

let findings = 0;
for (const f of files) {
  let content;
  try {
    content = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  for (const line of content.split("\n")) {
    if (line.includes("REPLACE_IN_CI") || line.includes("placeholder") || line.includes("$")) continue;
    for (const p of PATTERNS) {
      if (p.test(line)) {
        console.error(`secret-scan: ${f}: ${line.trim().slice(0, 80)}`);
        findings += 1;
        break;
      }
    }
  }
}
console.log(`secret-scan: ${files.length} files scanned, ${findings} finding(s)`);
process.exit(findings > 0 ? 1 : 0);
