/**
 * PHASE-022 core logic tests: token parity vs the web token source, AR/EN
 * catalog parity, digits policy, registration capability rules, read-only
 * device class, LRU pruning budget, van-sale LOCAL-VALID + state machine,
 * companion capability gate, Android scheduler budgets, rejection-table
 * parity with CONFLICT_RESOLUTION §3.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { theme, colors, formatMoney } from "../theme/tokens";
import { catalogs, isRTL, renderDigits, t } from "../i18n";
import { isReadOnlyDevice, validateRegistration } from "../device/registration";
import { ReadOnlyLocalStore } from "../store/read-only";
import { planEviction, CACHE_BUDGET_BYTES } from "../store/pruning";
import { validateVanSale, transition } from "../fieldsales/van-sale";
import { canPerform } from "../companion/capability-gate";
import { REJECTION_ACTIONS, isAdministrative } from "../reconciliation/rejection-actions";
import { AndroidSyncScheduler, budgetedLimits, BACKGROUND_FETCH_MIN_MS, PULL_BUDGET_BYTES, PUSH_BUDGET_BYTES, PERSONAL_PULL_BUDGET_BYTES } from "../sync/scheduler";
import { InMemoryLocalStore, SyncHost } from "@erp/sync-core";

describe("T2 token parity vs packages/ui source", () => {
  it("mobile theme colors/borders match the web token source", () => {
    const src = readFileSync(join(__dirname, "../../../../packages/ui/src/tokens/tokens.ts"), "utf8");
    // semantic colors must exist verbatim in the web token source
    for (const value of [colors.brand, colors.success, colors.warning, colors.danger, colors.ink, colors.inkMuted, colors.surfaceMuted]) {
      expect(src).toContain(`"${value}"`);
    }
    expect(theme.borders.strong).toBe("#9CA3AF");
    expect(theme.borders.subtle).toBe("#E5E7EB");
    expect(formatMoney("12.50", "SAR", "ar")).toBe("12.50 SAR"); // latn digits (ADR-0009)
  });
});

describe("T3 i18n/RTL", () => {
  it("AR/EN catalogs have identical keys (parity)", () => {
    expect(Object.keys(catalogs.ar).sort()).toEqual(Object.keys(catalogs.en).sort());
  });
  it("ar is RTL, en is LTR; digits policy renders latn identifiers and arab on request", () => {
    expect(isRTL("ar")).toBe(true);
    expect(isRTL("en")).toBe(false);
    expect(renderDigits("INV-2026-001", "latn")).toBe("INV-2026-001");
    expect(renderDigits("123", "arab")).toBe("١٢٣");
    expect(t("ar", "asOf", { ts: "now" })).toContain("now");
  });
});

describe("T4 registration capabilities", () => {
  it("van_sales device is writable; personal_account-only is read-only", () => {
    expect(isReadOnlyDevice(["personal_account"])).toBe(true);
    expect(isReadOnlyDevice(["van_sales"])).toBe(false);
    expect(validateRegistration({ platform: "android", name: "x", capabilities: ["van_sales"] })).toBeNull();
    expect(validateRegistration({ platform: "android", name: "x", capabilities: [] })).toBe("NO_CAPABILITY");
    expect(validateRegistration({ platform: "android", name: "x", capabilities: ["admin" as never] })).toBe("UNKNOWN_CAPABILITY");
  });
});

describe("T5/T9 read-only device class + pruning", () => {
  it("ReadOnlyLocalStore refuses every write path", async () => {
    const ro = new ReadOnlyLocalStore(new InMemoryLocalStore());
    await expect(
      ro.enqueue({ commandId: "c", entityType: "x", intent: "create", idempotencyKey: "k", payload: "{}" }),
    ).rejects.toThrow("READ_ONLY_DEVICE");
    await expect(ro.markAcked("c")).rejects.toThrow("READ_ONLY_DEVICE");
    expect(await ro.outboxCount()).toBe(0);
    await ro.setCursor("item", 3); // cursors allowed (pull-only class)
    expect(await ro.getCursor("item")).toBe(3);
  });

  it("LRU pruning evicts least-recently-used until under the 128 MB budget", () => {
    const entries = [
      { key: "old", bytes: 100 * 1024 * 1024, lastUsedAt: 1 },
      { key: "mid", bytes: 40 * 1024 * 1024, lastUsedAt: 2 },
      { key: "new", bytes: 10 * 1024 * 1024, lastUsedAt: 3 },
    ];
    expect(planEviction(entries)).toEqual(["old"]); // 150MB total → evicting old (100MB) leaves 50MB ≤ 128MB
    expect(planEviction([{ key: "small", bytes: 1000, lastUsedAt: 1 }])).toEqual([]);
    expect(CACHE_BUDGET_BYTES).toBe(128 * 1024 * 1024);
  });
});

describe("T7 van-sale LOCAL-VALID + honest state machine", () => {
  const stock = [{ itemId: "i1", availableQty: "5.000" }];
  it("pre-validates against the van snapshot (advisory)", () => {
    expect(validateVanSale([{ itemId: "i1", qty: "2", unitPrice: "10.00" }], stock)).toEqual({ ok: true });
    expect(validateVanSale([{ itemId: "i1", qty: "9", unitPrice: "10.00" }], stock)).toMatchObject({ ok: false, code: "VAN_STOCK_INSUFFICIENT" });
    expect(validateVanSale([], stock)).toMatchObject({ code: "EMPTY_LINES" });
  });
  it("state machine has no fabricated transitions", () => {
    expect(transition("DRAFT_LOCAL", "enqueue")).toBe("PENDING_SYNC");
    expect(transition("PENDING_SYNC", "ack")).toBe("POSTED");
    expect(transition("PENDING_SYNC", "reject")).toBe("REJECTED");
    expect(transition("REJECTED", "enqueue")).toBe("PENDING_SYNC"); // resend = new command
    expect(transition("POSTED", "reject")).toBe("POSTED"); // posted is terminal
  });
});

describe("T8 companion capability gate", () => {
  it("approvals are ONLINE-ONLY; reads are cached", () => {
    expect(canPerform("approve", false)).toEqual({ allowed: false, reason: "APPROVALS_ONLINE_ONLY" });
    expect(canPerform("approve", true).allowed).toBe(true);
    expect(canPerform("view_dashboard", false).allowed).toBe(true);
  });
});

describe("T6 Android scheduler budgets", () => {
  it("background fetch never more often than 15 min (Doze-safe)", () => {
    const s = new AndroidSyncScheduler(new SyncHost({ store: new InMemoryLocalStore(), transport: { status: async () => ({ contractVersion: 1 }), pull: async () => ({ items: [], nextCursorSeq: 0, hasMore: false, contractVersion: 1 }), push: async () => ({ results: [] }) }, deviceId: "d", entities: [] }), {});
    expect(s.scheduleBackgroundFetch(100_000, 90_000)).toBe(90_000); // too early → keep old
    expect(s.scheduleBackgroundFetch(100_000 + BACKGROUND_FETCH_MIN_MS, 100_000)).toBe(100_000 + BACKGROUND_FETCH_MIN_MS);
    s.stop();
  });
  it("cellular budgets: pull ≤ 8 MB, push ≤ 2 MB, personal background ≤ 256 KB", () => {
    expect(PULL_BUDGET_BYTES).toBe(8 * 1024 * 1024);
    expect(PUSH_BUDGET_BYTES).toBe(2 * 1024 * 1024);
    expect(budgetedLimits({ pullBytes: 0, pushBytes: 0 }, false).maxPullBytes).toBe(PULL_BUDGET_BYTES);
    expect(budgetedLimits({ pullBytes: 0, pushBytes: 0 }, true).maxPullBytes).toBe(PERSONAL_PULL_BUDGET_BYTES);
  });
});

describe("T10 rejection table parity with CONFLICT_RESOLUTION §3", () => {
  it("matches the doc table and administrative reasons have no actions", () => {
    const doc = readFileSync(join(__dirname, "../../../../docs/offline/CONFLICT_RESOLUTION.md"), "utf8");
    for (const reason of Object.keys(REJECTION_ACTIONS)) {
      expect(doc).toContain(reason);
    }
    expect(isAdministrative("DEVICE_REVOKED")).toBe(true);
    expect(isAdministrative("PERIOD_LOCKED")).toBe(false);
    expect(REJECTION_ACTIONS.STALE_VERSION).toEqual(["review-and-merge", "discard-local-edit"]);
  });
});
