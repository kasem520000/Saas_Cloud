/**
 * Shared ESLint config for the ERP monorepo (source of truth per ADR-0002).
 *
 * Enforces from day one:
 *  - Module boundaries (eslint-plugin-boundaries) per
 *    docs/architecture/DEPENDENCY_RULES.md — client rules (§3) and API module
 *    layering (§1). Module-layer element patterns match zero files until module
 *    folders appear in later phases, then activate mechanically.
 *  - No `any` escapes (typescript-eslint recommended).
 *  - No floating math for money (Math.round/floor/ceil/trunc banned; use
 *    @erp/domain-core decimal helpers — ADR-0009).
 *  - Money/Quantity/Rate never constructed from JS numbers (custom rule).
 *  - No physical-direction utilities in packages/ui (custom rule — RTL rule,
 *    docs/ui/RTL_DESIGN_RULES.md).
 *
 * The negative boundary meta-test (scripts/ci/negative-boundary-test.sh) proves
 * that violations fail lint: `apps/web/src/__boundary-violations__/` is ignored
 * for the normal lint run and linted with --no-ignore by the meta-test, which
 * asserts a non-zero exit.
 */
import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import globals from "globals";
import tseslint from "typescript-eslint";

const MONEY_TYPES = ["Money", "Quantity", "Rate"];

/** Custom local plugin rules (kept inline so they version with the config). */
const erpRules = {
  rules: {
    /**
     * Money/Quantity/Rate must never be constructed from JS numbers
     * (ADR-0009: binary floating point is forbidden for money).
     * Runtime also rejects it; this makes it a lint error before it can run.
     */
    "no-money-from-number": {
      meta: {
        type: "problem",
        docs: { description: "Forbid constructing Money/Quantity/Rate from JS numbers (ADR-0009)." },
        schema: [],
        messages: {
          numberArg:
            "'{{callee}}' must not be constructed from a JS number. Use fromString()/fromMinorUnits() (ADR-0009: no floats for money).",
          bannedFactory:
            "Money.fromNumber() does not exist by design (ADR-0009). Parse strings with fromString() instead.",
        },
      },
      create(context) {
        return {
          NewExpression(node) {
            if (node.callee.type !== "Identifier" || !MONEY_TYPES.includes(node.callee.name)) return;
            const first = node.arguments[0];
            if (first && first.type === "Literal" && typeof first.value === "number") {
              context.report({ node, messageId: "numberArg", data: { callee: node.callee.name } });
            }
          },
          CallExpression(node) {
            if (
              node.callee.type === "MemberExpression" &&
              node.callee.object.type === "Identifier" &&
              MONEY_TYPES.includes(node.callee.object.name) &&
              node.callee.property.type === "Identifier" &&
              node.callee.property.name === "fromNumber"
            ) {
              context.report({ node, messageId: "bannedFactory" });
            }
          },
        };
      },
    },
    // (PHASE-003 note) the old inline no-physical-direction rule was
    // structurally dead (create() nested inside meta — never fired); PHASE-005
    // replaced it with erp-ui/no-physical-direction in packages/ui/lint with
    // the full banned list, the rtl-exempt protocol, and negative meta-tests.
  },
};

export function createEslintConfig(options = {}) {
  const { extraPlugins = {}, extraRules = {} } = options;
  return tseslint.config(
    {
      ignores: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.next/**",
        "**/coverage/**",
        "**/.turbo/**",
        // PHASE-005 harness outputs (built artifacts + baselines, never sources)
        "**/dist-storybook/**",
        "**/__image_snapshots__/**",
        "**/.playwright-artifacts/**",
        // Deliberate boundary-violation fixture: excluded from the normal lint run,
        // linted with --no-ignore by scripts/ci/negative-boundary-test.sh (PHASE-001
        // negative meta-test: boundary lint MUST fail a violating import).
        "**/__boundary-violations__/**",
        // PHASE-005 erp-ui lint negative fixtures — same pattern:
        // scripts/ci/negative-ui-rules-test.sh lints these with --no-ignore.
        "**/__ui-violations__/**",
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      settings: {
        // eslint-module-utils/resolve (used by boundaries) does not know ".ts"
        // without the TypeScript resolver — without it every workspace import
        // is misclassified as external and boundary rules silently pass.
        "import/resolver": {
          typescript: { alwaysTryTypes: true },
        },
        "boundaries/elements": [
          // API module layers (DEPENDENCY_RULES.md §1) — first-match wins, so these
          // must precede the coarse apps-api element. Zero matches until PHASE-002+.
          { type: "api-module-domain", pattern: "**/apps/api/src/modules/*/domain/**" },
          { type: "api-module-application", pattern: "**/apps/api/src/modules/*/application/**" },
          { type: "api-module-infrastructure", pattern: "**/apps/api/src/modules/*/infrastructure/**" },
          { type: "api-module-api", pattern: "**/apps/api/src/modules/*/api/**" },
          { type: "api-module-presentation", pattern: "**/apps/api/src/modules/*/presentation/**" },
          // Apps and packages (cwd-independent patterns).
          { type: "apps-api", pattern: "**/apps/api/**" },
          { type: "apps-web", pattern: "**/apps/web/**" },
          { type: "apps-desktop", pattern: "**/apps/desktop/**" },
          { type: "apps-mobile", pattern: "**/apps/mobile/**" },
          { type: "packages-contracts", pattern: "**/packages/contracts/**" },
          { type: "packages-domain-core", pattern: "**/packages/domain-core/**" },
          { type: "packages-ui", pattern: "**/packages/ui/**" },
          { type: "packages-config", pattern: "**/packages/config/**" },
        ],
      },
      plugins: {
        boundaries,
        "erp-rules": erpRules,
        ...extraPlugins,
      },
      languageOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
      },
      rules: {
        ...js.configs.recommended.rules,
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
        // DEPENDENCY_RULES.md §4 — floating math for money is banned.
        "no-restricted-properties": [
          "error",
          {
            object: "Math",
            property: "round",
            message: "Floating-point rounding is forbidden: use @erp/domain-core decimal helpers (ADR-0009 half-up).",
          },
          {
            object: "Math",
            property: "floor",
            message: "Floating-point rounding is forbidden: use @erp/domain-core decimal helpers (ADR-0009).",
          },
          {
            object: "Math",
            property: "ceil",
            message: "Floating-point rounding is forbidden: use @erp/domain-core decimal helpers (ADR-0009).",
          },
          {
            object: "Math",
            property: "trunc",
            message: "Floating-point rounding is forbidden: use @erp/domain-core decimal helpers (ADR-0009).",
          },
        ],
        "erp-rules/no-money-from-number": "error",
        ...extraRules,
        "boundaries/element-types": [
          "error",
          {
            default: "disallow",
            message:
              "${file.type} importing ${dependency.type} violates docs/architecture/DEPENDENCY_RULES.md",
            rules: [
              // API module layering (§1): domain imports only the shared kernel;
              // application orchestrates domain + other modules' api surfaces;
              // infrastructure implements interfaces declared upstream;
              // presentation (controllers) import application only.
              {
                from: ["api-module-domain"],
                allow: ["api-module-domain", "packages-domain-core"],
              },
              {
                from: ["api-module-application"],
                allow: [
                  "api-module-application",
                  "api-module-domain",
                  "api-module-api",
                  "packages-domain-core",
                  "packages-contracts",
                ],
              },
              {
                from: ["api-module-infrastructure"],
                allow: [
                  "api-module-infrastructure",
                  "api-module-domain",
                  "api-module-application",
                  "packages-domain-core",
                ],
              },
              { from: ["api-module-presentation"], allow: ["api-module-presentation", "api-module-application"] },
              { from: ["api-module-api"], allow: ["api-module-api", "api-module-application", "api-module-domain"] },
              // Apps (§3).
              {
                from: ["apps-api"],
                allow: [
                  "apps-api",
                  "packages-domain-core",
                  "packages-contracts",
                  "packages-ui",
                  "api-module-domain",
                  "api-module-application",
                  "api-module-infrastructure",
                  "api-module-api",
                  "api-module-presentation",
                ],
              },
              { from: ["apps-web"], allow: ["apps-web", "packages-ui", "packages-contracts", "packages-domain-core"] },
              {
                from: ["apps-desktop"],
                allow: ["apps-desktop", "packages-ui", "packages-contracts", "packages-domain-core"],
              },
              {
                from: ["apps-mobile"],
                allow: ["apps-mobile", "packages-contracts", "packages-domain-core"],
              },
              // Packages: shared kernel and contracts stay standalone (ADR-0002).
              { from: ["packages-domain-core"], allow: ["packages-domain-core"] },
              { from: ["packages-contracts"], allow: ["packages-contracts"] },
              { from: ["packages-ui"], allow: ["packages-ui"] },
              { from: ["packages-config"], allow: ["packages-config"] },
            ],
          },
        ],
      },
    },
    {
      // TypeScript files: the compiler enforces undefined/unused identifiers with
      // full type information; core no-undef/no-unused-vars are blind to TS
      // constructs (React UMD namespace, parameter properties) — the
      // @typescript-eslint/no-unused-vars rule stays fully active.
      files: ["**/*.{ts,tsx}"],
      rules: { "no-undef": "off", "no-unused-vars": "off" },
    },
    {
      // Tests deliberately call the forbidden factories (Money.fromNumber etc.)
      // to prove the runtime rejects them — production code stays lint-banned.
      files: ["**/*.{test,spec}.ts", "**/*.{test,spec}.tsx"],
      rules: { "erp-rules/no-money-from-number": "off" },
    },
    {
      files: ["**/apps/web/**/*.{js,ts,tsx,mjs}", "**/packages/ui/**/*.{js,ts,tsx,mjs}"],
      languageOptions: { globals: { ...globals.browser } },
    },
    {
      files: [
        "**/apps/api/**/*.{js,ts,mjs}",
        "**/scripts/**/*.{js,mjs,cjs}",
        "**/packages/config/**/*.{js,ts,mjs}",
        "**/packages/domain-core/**/*.{js,ts}",
        "**/packages/contracts/**/*.{js,ts}",
      ],
      languageOptions: { globals: { ...globals.node } },
    },
  );
}
