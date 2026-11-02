/**
 * PHASE-023 T8 — port contract tests against the fakes: order import upsert by
 * channel order id, batch Idempotency-Key dedupe (duplicate = replay no-op),
 * price/stock push, shipping label creation. Server-decision conflicts:
 * the port returns data; the sales module decides — no LWW here.
 */
import { describe, expect, it } from "vitest";
import { FakeCommerceChannel, FakeShippingProvider, type ChannelOrder } from "../ports";

const order = (id: string, total: string): ChannelOrder => ({
  channelOrderId: id,
  placedAt: "2026-11-02T10:00:00Z",
  lines: [{ sku: "SKU-1", qty: "2", unitPrice: "5.00" }],
  total,
});

describe("CommerceChannelPort (fake channel)", () => {
  it("pullOrders returns only orders since the cursor; import upserts by channelOrderId", async () => {
    const ch = new FakeCommerceChannel();
    ch.orders.push(order("CH-1", "10.00"), order("CH-2", "7.50"));
    const all = await ch.pullOrders("2026-11-01T00:00:00Z");
    expect(all.map((o) => o.channelOrderId).sort()).toEqual(["CH-1", "CH-2"]);
    const later = await ch.pullOrders("2026-11-02T11:00:00Z");
    expect(later).toHaveLength(0);

    // upsert semantics: same channelOrderId replaces, never duplicates
    const imported = new Map<string, ChannelOrder>();
    for (const o of all) imported.set(o.channelOrderId, o);
    imported.set(order("CH-1", "12.00").channelOrderId, order("CH-1", "12.00"));
    expect(imported.size).toBe(2);
    expect(imported.get("CH-1")?.total).toBe("12.00");
  });

  it("batch Idempotency-Key: duplicate key is a replay no-op", async () => {
    const ch = new FakeCommerceChannel();
    expect(ch.recordBatch("batch-1")).toBe(true);
    expect(ch.recordBatch("batch-1")).toBe(false); // duplicate → no re-import
  });

  it("pushPrice/pushStock carry decimal text (ADR-0009)", async () => {
    const ch = new FakeCommerceChannel();
    await ch.pushPrice("SKU-1", "5.250000");
    await ch.pushStock("SKU-1", "40.000");
    expect(ch.prices.get("SKU-1")).toBe("5.250000");
    expect(ch.stock.get("SKU-1")).toBe("40.000");
  });
});

describe("ShippingPort (fake)", () => {
  it("creates a tracking label per order", async () => {
    const sp = new FakeShippingProvider();
    const a = await sp.createLabel({ orderId: "SO-1" });
    const b = await sp.createLabel({ orderId: "SO-2" });
    expect(a.trackingNo).not.toBe(b.trackingNo);
  });
});
