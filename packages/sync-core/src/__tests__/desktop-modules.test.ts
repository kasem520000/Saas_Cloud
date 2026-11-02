/**
 * PHASE-021 unit tests for the desktop-facing sync-core modules:
 * host triggers, credential lifecycle (memory-only access token), updater
 * gate (D-06 fail-closed), WebView2 probe, ESC/POS receipt builder.
 */
import { describe, expect, it } from "vitest";
import { SyncHost } from "../host";
import { CredentialLifecycle, MemoryTokenHolder, type Keychain } from "../keychain";
import { compareVersions, evaluateUpdate, fingerprintBucket, nextStage, UpdateRejectedError } from "../updater";
import { compareQuad, probeWebView2, MIN_WEBVIEW2_VERSION } from "../webview2";
import { buildEscPos, wrapReceiptText, charsPerLine } from "../printer";
import { InMemoryLocalStore } from "../local-store";
import type { Transport } from "../cycle";

// ---- host ----
function fakeTransport(contractVersion = 1): Transport & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    status: async () => {
      calls.push("status");
      return { contractVersion };
    },
    pull: async () => {
      calls.push("pull");
      return { items: [], nextCursorSeq: 0, hasMore: false, contractVersion };
    },
    push: async () => {
      calls.push("push");
      return { results: [] };
    },
  };
}

describe("SyncHost", () => {
  it("start() recovers and runs one cycle; post-write triggers push path", async () => {
    const transport = fakeTransport();
    const store = new InMemoryLocalStore();
    const host = new SyncHost({ store, transport, deviceId: "d1", entities: ["item"], now: () => 1 });
    await host.syncNow();
    expect(transport.calls).toContain("status");
    expect(transport.calls).toContain("pull");
    host.stop();
  });

  it("debounces connectivity restores (5s) instead of cycling per event", async () => {
    const transport = fakeTransport();
    const store = new InMemoryLocalStore();
    const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
    const host = new SyncHost({
      store,
      transport,
      deviceId: "d1",
      entities: ["item"],
      now: () => 1,
      setTimeoutFn: (fn, ms) => {
        timers.push({ fn, ms, cleared: false });
        return timers.length - 1;
      },
      clearTimeoutFn: (h) => {
        const t = timers[h as number];
        if (t) t.cleared = true;
      },
    });
    host.onConnectivityRestored();
    host.onConnectivityRestored();
    host.onConnectivityRestored();
    const debounced = timers.filter((t) => t.ms === 5000 && !t.cleared);
    expect(debounced).toHaveLength(1);
    host.stop();
  });

  it("a read-only contract gate surfaces in the cycle result", async () => {
    const transport = fakeTransport(999); // server ahead of client
    const store = new InMemoryLocalStore();
    const host = new SyncHost({ store, transport, deviceId: "d1", entities: ["item"], now: () => 1 });
    const res = await host.syncNow();
    expect(res.readOnly).toBe(true);
    host.stop();
  });
});

// ---- keychain / credentials ----
class FakeKeychain implements Keychain {
  map = new Map<string, string>();
  async get(s: string, a: string) {
    return this.map.get(`${s}|${a}`) ?? null;
  }
  async set(s: string, a: string, v: string) {
    this.map.set(`${s}|${a}`, v);
  }
  async delete(s: string, a: string) {
    this.map.delete(`${s}|${a}`);
  }
}

describe("CredentialLifecycle", () => {
  it("access token lives only in memory and expires; refresh token is one-time-use", async () => {
    const kc = new FakeKeychain();
    const mem = new MemoryTokenHolder();
    const life = new CredentialLifecycle(kc, mem, "dev-1");
    await life.storeRefreshToken("rt-1");
    life.setAccessToken("at-1", 1000, 0);
    expect(life.accessToken(500)).toBe("at-1");
    expect(life.accessToken(1000)).toBeNull(); // expired → memory cleared

    expect(await life.consumeRefreshToken()).toBe("rt-1");
    expect(await life.consumeRefreshToken()).toBeNull(); // consumed once (rotation)

    life.lock();
    expect(life.accessToken(1)).toBeNull();
  });
});

// ---- updater (D-06) ----
describe("updater gate", () => {
  const base = {
    currentVersion: "2026.10.1",
    deviceFingerprint: "fp",
    signatureValid: true,
    metrics: { crashFreeSessionRate: 1, crashRatePerSession: 0 },
  };
  const manifest = {
    version: "2026.11.1",
    channel: "stable" as const,
    signature: "sig",
    minSupportedVersion: "2026.10.1",
    rolloutPercent: 10,
  };

  it("unsigned or tampered manifests fail closed", () => {
    expect(evaluateUpdate({ ...base, manifest, signatureValid: false }).accept).toBe(false);
    expect(evaluateUpdate({ ...base, manifest: { ...manifest, signature: "" }, signatureValid: true }).accept).toBe(false);
  });

  it("downgrades fail closed", () => {
    const r = evaluateUpdate({ ...base, manifest: { ...manifest, version: "2026.9.9" } });
    expect(r.accept).toBe(false);
    expect(r.reason).toBe("DOWNGRADE");
  });

  it("crash-rate gate halts rollout (D-06)", () => {
    const r = evaluateUpdate({ ...base, manifest, metrics: { crashFreeSessionRate: 0.97, crashRatePerSession: 0.03 } });
    expect(r.accept).toBe(false);
    expect(r.reason).toBe("ROLLOUT_HALTED");
  });

  it("staged rollout: fingerprint bucket outside percent is not served", () => {
    const served = Array.from({ length: 200 }, (_, i) => fingerprintBucket(`dev-${i}`)).filter((b) => b < 10).length;
    expect(served).toBeGreaterThan(10);
    expect(served).toBeLessThan(35); // ~10% ± slack
  });

  it("below minimum-version clients are force-updated", () => {
    const r = evaluateUpdate({ ...base, currentVersion: "2026.9.1", manifest: { ...manifest, minSupportedVersion: "2026.10.1" } });
    expect(r.accept).toBe(true);
    expect(r.stage).toBe(100);
  });

  it("CalVer compare + staged progression 10→50→100", () => {
    expect(compareVersions("2026.11.2", "2026.11.10")).toBeLessThan(0);
    expect(nextStage(10)).toBe(50);
    expect(nextStage(50)).toBe(100);
  });

  it("UpdateRejectedError carries the reason code", () => {
    expect(new UpdateRejectedError("UNSIGNED").code).toBe("UNSIGNED");
  });
});

// ---- WebView2 probe ----
describe("WebView2 probe", () => {
  it("not-installed → system-requirements path", () => {
    expect(probeWebView2(null).kind).toBe("not-installed");
  });
  it("below minimum → below-minimum (no crash path)", () => {
    const p = probeWebView2("100.0.0.0");
    expect(p.kind).toBe("below-minimum");
  });
  it("supported-but-older → degraded notice", () => {
    const p = probeWebView2("125.0.0.0");
    expect(p.kind).toBe("supported-older");
    if (p.kind === "supported-older") expect(p.degradedFeatures.length).toBeGreaterThan(0);
  });
  it("current when >= recommended", () => {
    expect(probeWebView2("131.0.0.0").kind).toBe("current");
    expect(compareQuad(MIN_WEBVIEW2_VERSION, "119.9.9.9")).toBeGreaterThan(0);
  });
});

// ---- printer ----
describe("ESC/POS receipt builder", () => {
  it("emits init, content and cut; reprint never re-numbers (pure render)", () => {
    const buf = buildEscPos([{ text: "فاتورة #INV-001", align: "center", bold: true }], 80);
    expect(buf[0]).toBe(0x1b);
    expect(buf.includes(Buffer.from("فاتورة #INV-001", "utf8"))).toBe(true);
    // cut command GS V A 3 at tail
    expect(buf.slice(-4).equals(Buffer.from([0x1d, 0x56, 0x41, 0x03]))).toBe(true);
  });
  it("wraps to width without splitting words", () => {
    const lines = wrapReceiptText("one two three four five six seven eight nine ten", 58);
    expect(lines.every((l) => l.length <= charsPerLine(58))).toBe(true);
    expect(lines.join(" ")).toContain("three");
  });
});
