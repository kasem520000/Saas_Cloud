import type { NextConfig } from "next";

/**
 * Workspace packages are consumed from TypeScript source (internal-packages
 * pattern); Next transpiles them. The design system joined in PHASE-005
 * (ADR-0016) — its CSS surface is imported from app/globals.css.
 *
 * Secure headers themselves are per-request (CSP nonce) in middleware.ts
 * (SECURITY_TEST_PLAN §8); this static layer covers non-document assets.
 */
const nextConfig: NextConfig = {
  transpilePackages: ["@erp/domain-core", "@erp/contracts", "@erp/ui"],
  // PHASE-021 T1: the Tauri shell (apps/desktop, ADR-0013) loads the static
  // export of this app. TAURI_BUILD=1 switches to `output: "export"`;
  // scripts/check-tauri-export.ts guards that no server-only feature leaks
  // into the exported tree.
  ...(process.env.TAURI_BUILD === "1"
    ? { output: "export" as const, trailingSlash: true, images: { unoptimized: true } }
    : {}),
  // Arabic-first entry: bare "/" redirects to the default locale segment
  // (the [locale] layout owns <html lang dir> — PHASE-003 §2.14).
  async redirects() {
    return [{ source: "/", destination: "/ar", permanent: false }];
  },
};

export default nextConfig;
