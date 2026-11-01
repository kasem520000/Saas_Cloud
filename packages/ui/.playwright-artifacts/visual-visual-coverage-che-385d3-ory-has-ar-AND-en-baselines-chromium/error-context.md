# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual/visual.spec.ts >> coverage check (both directions mandatory) >> every non-excluded story has ar AND en baselines
- Location: tests/visual/visual.spec.ts:181:3

# Error details

```
Error: missing baselines (one-direction stories fail the coverage check):
patterns-accounting--journal-grid-balanced-ar
patterns-accounting--journal-grid-balanced-en
patterns-accounting--journal-grid-unbalanced-ar
patterns-accounting--journal-grid-unbalanced-en
patterns-accounting--journal-grid-empty-ar
patterns-accounting--journal-grid-empty-en
patterns-accounting--summary-bar-balanced-ar
patterns-accounting--summary-bar-balanced-en
patterns-accounting--summary-bar-unbalanced-ar
patterns-accounting--summary-bar-unbalanced-en
patterns-accounting--approvals-queue-default-ar
patterns-accounting--approvals-queue-default-en
patterns-accounting--approvals-queue-empty-ar
patterns-accounting--approvals-queue-empty-en
patterns-itempicker--default-ar
patterns-itempicker--default-en
patterns-itempicker--empty-ar
patterns-itempicker--empty-en
patterns-partnerpicker--default-ar
patterns-partnerpicker--default-en
patterns-partnerpicker--loading-search-ar
patterns-partnerpicker--loading-search-en
patterns-treasury--shift-open-capture-ar
patterns-treasury--shift-open-capture-en
patterns-treasury--shift-close-variance-ar
patterns-treasury--shift-close-variance-en
patterns-treasury--shift-closed-summary-ar
patterns-treasury--shift-closed-summary-en
patterns-treasury--shift-supervisor-required-ar
patterns-treasury--shift-supervisor-required-en
catalog--buttons-ar
catalog--buttons-en
catalog--buttons-loading-ar
catalog--buttons-loading-en
catalog--buttons-disabled-ar
catalog--buttons-disabled-en
catalog--inputs-ar
catalog--inputs-en
catalog--inputs-error-ar
catalog--inputs-error-en
catalog--inputs-disabled-ar
catalog--inputs-disabled-en
catalog--money-inputs-ar
catalog--money-inputs-en
catalog--money-inputs-error-ar
catalog--money-inputs-error-en
catalog--controls-ar
catalog--controls-en
catalog--controls-error-ar
catalog--controls-error-en
catalog--date-pickers-ar
catalog--date-pickers-en
catalog--status-badges-ar
catalog--status-badges-en
catalog--overlays-ar
catalog--overlays-en
catalog--toasts-ar
catalog--toasts-en
catalog--states-ar
catalog--states-en
catalog--breadcrumb-pagination-ar
catalog--breadcrumb-pagination-en
catalog--data-table-default-ar
catalog--data-table-default-en
catalog--data-table-empty-ar
catalog--data-table-empty-en
catalog--data-table-error-ar
catalog--data-table-error-en
catalog--data-table-loading-ar
catalog--data-table-loading-en
catalog--sidebar-ar
catalog--sidebar-en
catalog--app-shell-page-ar
catalog--app-shell-page-en
catalog--command-menu-open-ar
catalog--command-menu-open-en
catalog--icons-ar
catalog--icons-en
catalog--data-table-ten-k-ar
catalog--data-table-ten-k-en

expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 82

- Array []
+ Array [
+   "patterns-accounting--journal-grid-balanced-ar",
+   "patterns-accounting--journal-grid-balanced-en",
+   "patterns-accounting--journal-grid-unbalanced-ar",
+   "patterns-accounting--journal-grid-unbalanced-en",
+   "patterns-accounting--journal-grid-empty-ar",
+   "patterns-accounting--journal-grid-empty-en",
+   "patterns-accounting--summary-bar-balanced-ar",
+   "patterns-accounting--summary-bar-balanced-en",
+   "patterns-accounting--summary-bar-unbalanced-ar",
+   "patterns-accounting--summary-bar-unbalanced-en",
+   "patterns-accounting--approvals-queue-default-ar",
+   "patterns-accounting--approvals-queue-default-en",
+   "patterns-accounting--approvals-queue-empty-ar",
+   "patterns-accounting--approvals-queue-empty-en",
+   "patterns-itempicker--default-ar",
+   "patterns-itempicker--default-en",
+   "patterns-itempicker--empty-ar",
+   "patterns-itempicker--empty-en",
+   "patterns-partnerpicker--default-ar",
+   "patterns-partnerpicker--default-en",
+   "patterns-partnerpicker--loading-search-ar",
+   "patterns-partnerpicker--loading-search-en",
+   "patterns-treasury--shift-open-capture-ar",
+   "patterns-treasury--shift-open-capture-en",
+   "patterns-treasury--shift-close-variance-ar",
+   "patterns-treasury--shift-close-variance-en",
+   "patterns-treasury--shift-closed-summary-ar",
+   "patterns-treasury--shift-closed-summary-en",
+   "patterns-treasury--shift-supervisor-required-ar",
+   "patterns-treasury--shift-supervisor-required-en",
+   "catalog--buttons-ar",
+   "catalog--buttons-en",
+   "catalog--buttons-loading-ar",
+   "catalog--buttons-loading-en",
+   "catalog--buttons-disabled-ar",
+   "catalog--buttons-disabled-en",
+   "catalog--inputs-ar",
+   "catalog--inputs-en",
+   "catalog--inputs-error-ar",
+   "catalog--inputs-error-en",
+   "catalog--inputs-disabled-ar",
+   "catalog--inputs-disabled-en",
+   "catalog--money-inputs-ar",
+   "catalog--money-inputs-en",
+   "catalog--money-inputs-error-ar",
+   "catalog--money-inputs-error-en",
+   "catalog--controls-ar",
+   "catalog--controls-en",
+   "catalog--controls-error-ar",
+   "catalog--controls-error-en",
+   "catalog--date-pickers-ar",
+   "catalog--date-pickers-en",
+   "catalog--status-badges-ar",
+   "catalog--status-badges-en",
+   "catalog--overlays-ar",
+   "catalog--overlays-en",
+   "catalog--toasts-ar",
+   "catalog--toasts-en",
+   "catalog--states-ar",
+   "catalog--states-en",
+   "catalog--breadcrumb-pagination-ar",
+   "catalog--breadcrumb-pagination-en",
+   "catalog--data-table-default-ar",
+   "catalog--data-table-default-en",
+   "catalog--data-table-empty-ar",
+   "catalog--data-table-empty-en",
+   "catalog--data-table-error-ar",
+   "catalog--data-table-error-en",
+   "catalog--data-table-loading-ar",
+   "catalog--data-table-loading-en",
+   "catalog--sidebar-ar",
+   "catalog--sidebar-en",
+   "catalog--app-shell-page-ar",
+   "catalog--app-shell-page-en",
+   "catalog--command-menu-open-ar",
+   "catalog--command-menu-open-en",
+   "catalog--icons-ar",
+   "catalog--icons-en",
+   "catalog--data-table-ten-k-ar",
+   "catalog--data-table-ten-k-en",
+ ]
```

# Test source

```ts
  94  |       await page.waitForSelector("html[data-visual-ready='true']", { state: "attached", timeout: 15_000 });
  95  |       await expect.soft(page).toHaveScreenshot(`${entry.id}-ar-comfortable.png`);
  96  |     }
  97  |   });
  98  | 
  99  |   for (const viewport of [
  100 |     { width: 390, height: 844 },
  101 |     { width: 1024, height: 768 },
  102 |     { width: 1280, height: 800 },
  103 |   ]) {
  104 |     test(`archetype viewports ${viewport.width} — ar + en`, async ({ page, browserName }) => {
  105 |       test.skip(browserName !== "chromium", "baselines are chromium-pinned (report parity)");
  106 |       await page.setViewportSize(viewport);
  107 |       for (const locale of ["ar", "en"] as const) {
  108 |         await page.goto(storyUrl("catalog--app-shell-page", locale, "compact"));
  109 |         await page.waitForSelector("html[data-visual-ready='true']", { state: "attached", timeout: 15_000 });
  110 |         if (!QUARANTINE.has("catalog--app-shell-page")) {
  111 |           await expect.soft(page).toHaveScreenshot(`archetype-${viewport.width}-${locale}.png`, { fullPage: false });
  112 |         }
  113 |       }
  114 |     });
  115 |   }
  116 | });
  117 | 
  118 | test.describe("axe — 0 violations per story (inside the visual harness)", () => {
  119 |   test("axe clean on every story, both directions", async ({ page }) => {
  120 |     // PHASE-006: the catalog grew 26 → 28 stories (pickers); the single
  121 |     // axe sweep needs a linearly-scaled budget (56 analyses).
  122 |     test.setTimeout(180_000);
  123 |     const entries = await storyIndex();
  124 |     for (const entry of entries) {
  125 |       for (const locale of ["ar", "en"] as const) {
  126 |         await page.goto(storyUrl(entry.id, locale, "compact"));
  127 |         await page.waitForSelector("html[data-visual-ready='true']", { state: "attached", timeout: 15_000 });
  128 |         const results = await new AxeBuilder({ page }).analyze();
  129 |         const critical = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  130 |         expect.soft(critical, `${entry.id} [${locale}] axe violations`).toEqual([]);
  131 |       }
  132 |     }
  133 |   });
  134 | });
  135 | 
  136 | test.describe("geometry invariants (RTL §10 / VISUAL_TESTING §4)", () => {
  137 |   test("sidebar sits at the start edge in both directions", async ({ page }) => {
  138 |     for (const locale of ["ar", "en"] as const) {
  139 |       await page.setViewportSize({ width: 1280, height: 800 });
  140 |       await page.goto(storyUrl("catalog--app-shell-page", locale, "compact"));
  141 |       await page.waitForSelector("html[data-visual-ready='true']", { state: "attached", timeout: 15_000 });
  142 |       const nav = page.getByRole("navigation").first();
  143 |       const box = await nav.boundingBox();
  144 |       expect(box).not.toBeNull();
  145 |       if (locale === "ar") {
  146 |         // RTL: sidebar at the RIGHT edge (start) — within 8px of the viewport end
  147 |         expect(box!.x + box!.width).toBeGreaterThan(1280 - 8);
  148 |       } else {
  149 |         expect(box!.x).toBeLessThan(8);
  150 |       }
  151 |     }
  152 |   });
  153 | 
  154 |   test("amount digits identical across locales (never mirrored)", async ({ page }) => {
  155 |     const values: Record<string, string> = {};
  156 |     for (const locale of ["ar", "en"] as const) {
  157 |       await page.goto(storyUrl("catalog--app-shell-page", locale, "compact"));
  158 |       await page.waitForSelector("html[data-visual-ready='true']", { state: "attached", timeout: 15_000 });
  159 |       const cell = page.locator('[role="gridcell"] span[dir="ltr"]').first();
  160 |       values[locale] = (await cell.textContent()) ?? "";
  161 |     }
  162 |     expect(values.ar).toBe(values.en);
  163 |     expect(values.ar).toMatch(/^-?\d+\.\d+$/); // digits, dot, minus — never reversed
  164 |   });
  165 | 
  166 |   test("breadcrumb separator mirrors with direction", async ({ page }) => {
  167 |     const xs: Record<string, number> = {};
  168 |     for (const locale of ["ar", "en"] as const) {
  169 |       await page.goto(storyUrl("catalog--breadcrumb-pagination", locale, "compact"));
  170 |       await page.waitForSelector("html[data-visual-ready='true']", { state: "attached", timeout: 15_000 });
  171 |       const sep = page.locator('nav svg').first();
  172 |       xs[locale] = (await sep.boundingBox())?.x ?? -1;
  173 |     }
  174 |     expect(xs.ar).toBeGreaterThan(0);
  175 |     expect(xs.en).toBeGreaterThan(0);
  176 |     expect(xs.ar).not.toBe(xs.en); // mirrored position (row flips) — same story, mirrored geometry
  177 |   });
  178 | });
  179 | 
  180 | test.describe("coverage check (both directions mandatory)", () => {
  181 |   test("every non-excluded story has ar AND en baselines", async () => {
  182 |     const entries = (await storyIndex()).map((e) => e.id).filter((id) => !NO_SNAPSHOT.has(id));
  183 |     // resolve from the spec file (worker cwd is not the package root)
  184 |     const specDir = dirname(fileURLToPath(import.meta.url));
  185 |     const baselines = (await readdir(
  186 |       join(specDir, "../../__image_snapshots__/visual/visual.spec.ts-snapshots"),
  187 |     ).catch(() => [])).join("\n");
  188 |     const missing: string[] = [];
  189 |     for (const id of entries) {
  190 |       // platform suffix (-chromium-linux) is appended by Playwright
  191 |       if (!baselines.includes(`${id}-ar-`)) missing.push(`${id}-ar`);
  192 |       if (!baselines.includes(`${id}-en-`)) missing.push(`${id}-en`);
  193 |     }
> 194 |     expect(missing, `missing baselines (one-direction stories fail the coverage check):\n${missing.join("\n")}`).toEqual([]);
      |                                                                                                                  ^ Error: missing baselines (one-direction stories fail the coverage check):
  195 |   });
  196 | });
  197 | 
```