# Universal Business ERP Platform

Multi-tenant, multi-industry SaaS ERP for MENA/GCC markets — Arabic-first, fully
bilingual (AR/EN), RTL-first. This repository is the **consolidated canonical
baseline (Blueprint v1.1)** plus its implementation; the documentation blueprint
under `docs/` is the single source of truth, and code lands phase by phase per
the [25-phase roadmap](docs/planning/MASTER_ROADMAP.md).

> **Honest status:** implementation status lives in
> [docs/planning/IMPLEMENTATION_STATUS.md](docs/planning/IMPLEMENTATION_STATUS.md)
> — nothing is described as working until recorded there with evidence.

## Quickstart (docs/operations/DEVELOPMENT_SETUP.md §2)

Prerequisites: Node 22 LTS, pnpm 9, Docker with Compose v2, Python 3.12+.

```bash
pnpm install                 # workspace install (pnpm workspaces + Turborepo)
                             # native builds (better-sqlite3 etc.) are NOT run at install time,
                             # so install succeeds on any machine; to run the offline-sync
                             # (sqlite) tests on a machine with build tools, add
                             # "better-sqlite3" back to pnpm.onlyBuiltDependencies and reinstall
pnpm env:setup               # creates .env from .env.example (never overwrites)
pnpm db:up                   # docker compose: postgres:16 + redis (+ minio, mailpit)
#   alternative, no Docker:  pnpm db:local   # embedded PostgreSQL 16 on :5432 (leave running)
pnpm --filter @erp/config --filter @erp/contracts --filter @erp/database run build
pnpm db:migrate              # drizzle migrations + dev role passwords
pnpm db:seed                 # demo test company (idempotent; dev-only credentials)
pnpm dev                     # api on :3001, web on :3000 (hot reload)
```

`pnpm db:seed` creates the demo tenant «شركة الاختبار للتجارة» (Demo Trading Co.,
SA/SAR, wholesale template) with owner `demo.owner@erp-demo.test` /
`Demo-12345-strong`, a demo customer `CUST-DEMO-001` and a demo service item
`SVC-CONSULT-001`. Re-running is a no-op. The old manual flow
(`cp .env.example .env` + `docker compose up -d` + `pnpm dev`) still works.

Verify:

```bash
curl -fsS http://localhost:3001/health/live   # {"status":"ok","service":"erp-api",...}
docker compose ps                            # all services healthy
```

## Verification gates (CI-equivalent — `pnpm gate:local` runs them all)

| Gate | Command |
|------|---------|
| Typecheck (strict TS everywhere) | `pnpm typecheck` |
| Lint incl. module boundaries | `pnpm lint` |
| Dependency graph rules | `pnpm lint:depcruise` |
| Unit + property tests | `pnpm test` |
| Build all apps/packages | `pnpm build` |
| Docs validation (23 checks) | `pnpm docs:validate` |
| Boundary negative meta-test | `pnpm boundary:negative-test` |

CI runs the same gates on every push (`.github/workflows/ci.yml`) plus gitleaks
secret scanning.

## Repository layout (ADR-0002)

```
apps/
  api/        NestJS modular monolith (ADR-0001)
  web/        Next.js web client (ADR-0003)
  desktop/    Tauri shell (PHASE-021)
  mobile/     Expo Android (PHASE-022)
packages/
  contracts/  zod schemas + error codes — the single source of API truth
  domain-core/ shared kernel: UUIDv7, Money/Quantity/Rate, Result (ADR-0009)
  ui/         design system (PHASE-005)
  config/     shared tsconfig / eslint / prettier
docs/         the blueprint (authoritative)
scripts/      docs validation + boundary meta-test tooling
```

## For AI agents and engineers

Start at [docs/handoff/AGENT_START_HERE.md](docs/handoff/AGENT_START_HERE.md)
(the 15-step protocol). Project instructions summary: [AGENTS.md](AGENTS.md).
Document precedence: [docs/ARCHITECTURE_BASELINE.md](docs/ARCHITECTURE_BASELINE.md)
supersedes older overview docs; consolidation decisions CD-01…CD-12 are recorded
in [docs/CONSOLIDATION_REGISTER.md](docs/CONSOLIDATION_REGISTER.md).
