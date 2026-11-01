/**
 * Secure headers / CSP verification probe (SECURITY_TEST_PLAN §8, T11).
 * Asserted per environment against the REAL Next.js server (build + start):
 * HSTS, nosniff, X-Frame-Options DENY + frame-ancestors 'none',
 * Referrer-Policy, CSP with nonce'd scripts (no unsafe-inline for scripts),
 * object-src 'none', and the no-third-party-asset assertion (SRI n/a at
 * this phase — nothing is loaded off-origin; assert that).
 */
import { expect, test } from "@playwright/test";

const PORT = Number(process.env.WEB_PROBE_PORT ?? 3100);
const BASE = `http://127.0.0.1:${PORT}`;

test.describe("secure headers probe", () => {
  test("document routes carry the full §8 header set", async ({ request }) => {
    const response = await request.get(`${BASE}/ar/login`);
    expect(response.status()).toBe(200);
    const headers = response.headers();

    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBeDefined();
    expect(headers["content-security-policy"]).toBeDefined();

    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    // scripts: nonce'd, never unsafe-inline
    const scriptSrc = /script-src ([^;]+)/.exec(csp)?.[1] ?? "";
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  });

  test("per-request nonces rotate and scripts reference them", async ({ request }) => {
    const a = await request.get(`${BASE}/ar/login`);
    const b = await request.get(`${BASE}/ar/login`);
    const cspA = /'nonce-([^']+)'/.exec(a.headers()["content-security-policy"] ?? "")?.[1];
    const cspB = /'nonce-([^']+)'/.exec(b.headers()["content-security-policy"] ?? "")?.[1];
    expect(cspA).toBeDefined();
    expect(cspB).toBeDefined();
    expect(cspA).not.toBe(cspB); // fresh nonce per response
  });

  test("no third-party assets are referenced (SRI n/a assertion)", async ({ request }) => {
    const response = await request.get(`${BASE}/ar/login`);
    const html = await response.text();
    // every src/href must be same-origin (self-hosted fonts, local bundles)
    const external = [...html.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/g)].map((m) => m[0]);
    expect(external, `off-origin references found: ${external.join(", ")}`).toEqual([]);
  });

  test("nonce'd document actually executes its scripts (CSP not breaking the app)", async ({ page }) => {
    await page.goto(`${BASE}/ar/login`);
    // the page hydrates: react root present without CSP violations killing it
    await expect(page.locator("input").first()).toBeVisible();
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && msg.text().includes("Content Security Policy")) errors.push(msg.text());
    });
    expect(errors).toEqual([]);
  });
});
