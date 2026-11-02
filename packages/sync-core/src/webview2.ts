/**
 * PHASE-021 T11 — WebView2 runtime probe logic (ADR-0013, RISK-017): Windows
 * desktop shell requires a minimum WebView2 runtime version; below minimum →
 * system-requirements path (no crash, no broken UI); supported-but-older →
 * degraded-capability notice. Pure version logic, unit-tested; the Rust side
 * reads the registry value and passes it here.
 */

export const MIN_WEBVIEW2_VERSION = "120.0.0.0"; // floor per ADR-0013 system requirements
export const RECOMMENDED_WEBVIEW2_VERSION = "130.0.0.0";

export type WebView2Probe =
  | { kind: "not-installed" }
  | { kind: "below-minimum"; version: string }
  | { kind: "supported-older"; version: string; degradedFeatures: readonly string[] }
  | { kind: "current"; version: string };

/** Compare dotted quad versions. */
export function compareQuad(a: string, b: string): number {
  const pa = a.split(".").map((x) => Number(x) || 0);
  const pb = b.split(".").map((x) => Number(x) || 0);
  for (let i = 0; i < 4; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const DEGRADED_FEATURES_120 = ["ecmascript-2024", "webview-devtools"] as const;

export function probeWebView2(installedVersion: string | null): WebView2Probe {
  if (installedVersion === null || installedVersion.trim() === "") return { kind: "not-installed" };
  if (compareQuad(installedVersion, MIN_WEBVIEW2_VERSION) < 0) {
    return { kind: "below-minimum", version: installedVersion };
  }
  if (compareQuad(installedVersion, RECOMMENDED_WEBVIEW2_VERSION) < 0) {
    return { kind: "supported-older", version: installedVersion, degradedFeatures: DEGRADED_FEATURES_120 };
  }
  return { kind: "current", version: installedVersion };
}
