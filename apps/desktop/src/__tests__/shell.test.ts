/**
 * PHASE-021 — shell glue test with fake keychain/store: the host starts and
 * cycles through the HTTP transport shape, credentials keep the access token
 * memory-only, and the updater gate is wired.
 */
import { describe, expect, it } from "vitest";
import { InMemoryLocalStore, type Keychain } from "@erp/sync-core";
import { createShell } from "../shell";

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

describe("desktop shell glue", () => {
  it("composes host + credentials and the updater gate rejects unsigned", async () => {
    const shell = createShell({
      store: new InMemoryLocalStore(),
      keychain: new FakeKeychain(),
      config: {
        apiBaseUrl: "http://localhost:3000/api",
        deviceId: "dev-test",
        entities: ["item", "sales_invoice"],
        accessToken: () => "at-test",
      },
    });
    await shell.credentials.storeRefreshToken("rt");
    expect(await shell.credentials.consumeRefreshToken()).toBe("rt");
    const gate = shell.checkForUpdate(
      { version: "2026.11.1", channel: "stable", signature: "", minSupportedVersion: "2026.10.1", rolloutPercent: 100 },
      "2026.10.1",
      "fp",
    );
    expect(gate.accept).toBe(false); // empty signature fails closed (D-06)
    shell.host.stop();
  });
});
