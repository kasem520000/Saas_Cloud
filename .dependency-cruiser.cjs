/**
 * Dependency rules for the ERP monorepo.
 * Source of truth: docs/architecture/DEPENDENCY_RULES.md
 *
 * Client rules (§3) are enforced from PHASE-001. API module-layer rules (§1) match
 * zero files while no module folders exist and activate mechanically as the
 * `apps/api/src/modules/<module>/{domain,application,infrastructure,api,presentation}`
 * folders appear in later phases — no config change is needed then.
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "DEPENDENCY_RULES.md §2.1 — no cycles; cyclic needs move responsibility down.",
      from: {},
      to: { circular: true },
    },
    {
      name: "clients-never-import-api-internals",
      severity: "error",
      comment: "§3 — clients may never import apps/api internals.",
      from: { path: "^(apps/web|apps/desktop|apps/mobile)" },
      to: { path: "^apps/api" },
    },
    {
      name: "clients-never-import-other-clients",
      severity: "error",
      comment: "§3 — client apps do not import each other.",
      from: { path: "^apps/web" },
      to: { path: "^apps/(desktop|mobile)" },
    },
    {
      name: "desktop-never-imports-other-clients",
      severity: "error",
      from: { path: "^apps/desktop" },
      to: { path: "^apps/(web|mobile)" },
    },
    {
      name: "mobile-never-imports-other-clients",
      severity: "error",
      from: { path: "^apps/mobile" },
      to: { path: "^apps/(web|desktop)" },
    },
    {
      name: "api-never-imports-clients",
      severity: "error",
      from: { path: "^apps/api" },
      to: { path: "^apps/(web|desktop|mobile)" },
    },
    {
      name: "packages-never-import-apps",
      severity: "error",
      comment: "Packages are lower layers than apps.",
      from: { path: "^packages" },
      to: { path: "^apps" },
    },
    {
      name: "domain-core-imports-nothing-first-party",
      severity: "error",
      comment: "domain-core is the shared kernel: it imports no first-party code (§1).",
      from: { path: "^packages/domain-core" },
      to: { path: "^(apps|packages/(contracts|ui|config))" },
    },
    {
      name: "contracts-imports-nothing-first-party",
      severity: "error",
      comment: "contracts is the single source of API truth (ADR-0002 rule 1): standalone.",
      from: { path: "^packages/contracts" },
      to: { path: "^(apps|packages/(domain-core|ui|config))" },
    },
    {
      name: "ui-imports-only-contracts-domain-core",
      severity: "error",
      comment:
        "PHASE-005 (DEPENDENCY_RULES §3): packages/ui may depend on contracts " +
        "(nav payload types) + domain-core (Money types) ONLY — never on apps " +
        "or the config tooling package; data flows via props/headless hooks.",
      from: { path: "^packages/ui" },
      to: { path: "^(apps|packages/config)" },
    },
    {
      name: "web-imports-only-ui-contracts-domain-core",
      severity: "error",
      comment: "§3 — web: ui + contracts + domain-core only (config is tooling).",
      from: { path: "^apps/web" },
      to: { path: "^packages/config" },
    },
    {
      name: "desktop-imports-only-ui-contracts-domain-core",
      severity: "error",
      comment: "§3 — desktop: ui + contracts + domain-core only.",
      from: { path: "^apps/desktop" },
      to: { path: "^packages/config" },
    },
    {
      name: "mobile-imports-only-contracts-domain-core",
      severity: "error",
      comment: "§3 — mobile: contracts + domain-core only; React Native never imports packages/ui.",
      from: { path: "^apps/mobile" },
      to: { path: "^packages/(ui|config)" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    // PHASE-005: boundary fixtures (meta-tested) + built harness artifacts
    // (storybook output, baselines) are not source-graph subjects.
    exclude: "(__boundary-violations__|__ui-violations__|dist-storybook|__image_snapshots__|\.playwright-artifacts)",
  },
};
