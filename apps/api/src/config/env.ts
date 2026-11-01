import { z } from "zod";

/**
 * PHASE-002 environment contract: parsed once, typed everywhere, fail-fast on
 * invalid values (never silently coerced). `.env.example` documents every key;
 * production values arrive via the environment, never from the repo.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  /** 0 = API process (HTTP + jobs client); 1 = worker process (jobs only). */
  WORKER_MODE: z.coerce.number().int().min(0).max(1).default(0),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  /** App-role connection (non-owner; RLS applies — ADR-0005 §2). */
  DATABASE_URL: z.string().optional(),
  /** Bootstrap/migration-role connection; never used by the app at runtime. */
  MIGRATE_DATABASE_URL: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_BUCKET: z.string().default("erp-files"),
  /** Signed-URL lifetime (OBSERVABILITY §security; dev default 15 min). */
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().max(3600).default(900),
  /** Upload size ceiling enforced at issuance (files module §2.7). */
  MAX_UPLOAD_BYTES: z.coerce.number()
    .int()
    .positive()
    .max(2_147_483_647)
    .default(25 * 1024 * 1024),
  /** OpenTelemetry no-op wiring (PHASE-002 §2.10; export off by default). */
  OTEL_ENABLED: z.coerce.number().int().min(0).max(1).default(0),
  /** TOTP-secret envelope key (PHASE-003; ADR-0015 §4). Dev/test derive a
   * local key when unset; production fails closed (SECRETS_MANAGEMENT). */
  IDENTITY_SECRET_KEY: z.string().optional(),
  IDENTITY_SECRET_KEY_ID: z.string().max(8).optional(),
  /** SMTP transport (PHASE-003 notifications adapter; mailpit in dev).
   * Unset host → emails disabled with a warning (documented dev shape). */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("no-reply@erp.local"),
  /** Public origin of the web/BFF surface (links inside emails). */
  WEB_BASE_URL: z.string().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

export type EnvSource = Record<string, string | undefined>;

/** Parse a given source (split from the singleton for testability). */
export function parseEnv(source: EnvSource): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

/** The parsed process environment (mutable container, refreshed via reloadEnv). */
export const env: Env = parseEnv(process.env);

/**
 * Re-parse the live `process.env` into the shared `env` object. Needed by
 * test bootstraps that set connection strings AFTER module import (vitest
 * imports specs before beforeAll) and by any process that inherits a
 * polluted ambient environment.
 */
export function reloadEnv(): void {
  const fresh = parseEnv(process.env);
  Object.assign(env, fresh);
}
