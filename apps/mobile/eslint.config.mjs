/**
 * PHASE-022 T3 — mobile lint config: extends the shared monorepo config and
 * adds (1) the dependency boundary — the app never imports @erp/ui or web DOM
 * (DEPENDENCY_RULES §3, ADR-0014); (2) the RTL rule — physical layout props
 * banned in RN code, logical props only (RTL_DESIGN_RULES).
 */
import { createEslintConfig } from "../../packages/config/eslint/index.mjs";

export default createEslintConfig({
  extraRules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          { name: "@erp/ui", message: "mobile never imports @erp/ui (ADR-0014) — port tokens, don't import them" },
          { name: "react-dom", message: "web DOM is banned on mobile" },
        ],
      },
    ],
    "no-restricted-properties": [
      "error",
      { property: "marginLeft", message: "physical props banned — use marginStart (RTL)" },
      { property: "marginRight", message: "physical props banned — use marginEnd" },
      { property: "paddingLeft", message: "physical props banned — use paddingStart" },
      { property: "paddingRight", message: "physical props banned — use paddingEnd" },
      { property: "left", message: "physical props banned — use insetInlineStart" },
      { property: "right", message: "physical props banned — use insetInlineEnd" },
    ],
    "no-restricted-syntax": [
      "error",
      ...["marginLeft", "marginRight", "paddingLeft", "paddingRight", "left", "right"].map((prop) => ({
        selector: `Property[key.name="${prop}"]`,
        message: `physical style prop "${prop}" banned in RN code — use the logical/inset variant (RTL_DESIGN_RULES)`,
      })),
    ],
  },
});
