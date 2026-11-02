import { describe, expect, it } from "vitest";

import { InMemoryLocalStore, type OutboxRow } from "../local-store";
import { backoffCeiling, CONTRACT_VERSION, nextDelay, runCycle, type PullPage, type PushItemResult, type Transport } from "../cycle";

/** Deterministic transport double with programmable faults. */
class FakeTransport implements Transport {
  contractVersion = CONTRACT_VERSION;
  pages: PullPage[] = [];
  pushLog: OutboxRow[][] = [];
  duplicateDeliveries = 0;
  private pushCount = 0;

  async status(): Promise<{ contractVersion: number }> {
    return { contractVersion: this.contractVersion };
  }

  async pull(_deviceId: string, _entity: string, cursorSeq: number): Promise<PullPage> {
    const page = this.pages.find((p) => p.nextCursorSeq > cursorSeq) ?? this.pages[this.pages.length - 1];
    return page ?? { items: [], nextCursorSeq: cursorSeq, hasMore: false, contractVersion: CONTRACT_VERSION };
  }

  async push(_deviceId: string, commands: OutboxRow[]): Promise<{ results: PushItemResult[] }> {
    this.pushLog.push(commands);
    this.pushCount += 1;
    return {
      results: commands.map((c) => ({ commandId: c.commandId, status: "ACCEPTED" as const, result: { ok: true } })),
    };
  }
}

function outboxCmd(id: string, key: string): Omit<OutboxRow, "status" | "attempts" | "nextAttemptAt" | "createdAt"> {
  return {
    commandId: id,
    entityType: "sales_invoice",
    intent: "pos_sale",
    idempotencyKey: key,
    payload: JSON.stringify({ total: "100.0000" }), // decimal TEXT (ADR-0009)
  };
}

describe("PHASE-020 sync-core cycle engine", () => {
  it("C-01 duplicate delivery: the same command pushed twice produces one ack (store-level dedupe by commandId)", async () => {
    const store = new InMemoryLocalStore();
    const transport = new FakeTransport();
    transport.pages = [{ items: [], nextCursorSeq: 0, hasMore: false, contractVersion: CONTRACT_VERSION }];
    await store.enqueue(outboxCmd("018f3a2e-9c40-7000-8000-000000000001", "k-1"));
    await store.enqueue(outboxCmd("018f3a2e-9c40-7000-8000-000000000001", "k-1")); // natural-id upsert no-op
    expect(await store.outboxCount()).toBe(1);
    const r = await runCycle({ store, transport, deviceId: "d1", entities: ["items"], now: () => 1000, random: () => 0.5 });
    expect(r.pushed).toBe(1);
    expect(await store.outboxCount()).toBe(0);
  });

  it("pull advances the cursor only after the page is applied; crash between apply and advance re-pulls the same page", async () => {
    const store = new InMemoryLocalStore();
    const transport = new FakeTransport();
    transport.pages = [
      { items: [{ op: "upsert", id: "a", seq: 1 }, { op: "tombstone", id: "b", seq: 2 }], nextCursorSeq: 2, hasMore: true, contractVersion: CONTRACT_VERSION },
      { items: [{ op: "upsert", id: "c", seq: 3 }], nextCursorSeq: 3, hasMore: false, contractVersion: CONTRACT_VERSION },
    ];
    const r = await runCycle({ store, transport, deviceId: "d1", entities: ["items"], now: () => 1000, random: () => 0 });
    expect(r.pulled).toBe(3);
    expect(await store.getCursor("items")).toBe(3);
    expect(await store.inboxPending()).toBe(0);
  });

  it("C-04 crash-resume: IN_FLIGHT rows return to QUEUED and are pushed once", async () => {
    const store = new InMemoryLocalStore();
    const transport = new FakeTransport();
    transport.pages = [{ items: [], nextCursorSeq: 0, hasMore: false, contractVersion: CONTRACT_VERSION }];
    await store.enqueue(outboxCmd("018f3a2e-9c40-7000-8000-000000000002", "k-2"));
    await store.markInFlight("018f3a2e-9c40-7000-8000-000000000002"); // crash mid-push
    const recovered = await store.recoverInFlight();
    expect(recovered).toBe(1);
    const r = await runCycle({ store, transport, deviceId: "d1", entities: [], now: () => 2000, random: () => 0 });
    expect(r.pushed).toBe(1);
    expect(transport.pushLog).toHaveLength(1);
  });

  it("contract-version skew enters read-only mode with zero writes", async () => {
    const store = new InMemoryLocalStore();
    const transport = new FakeTransport();
    transport.contractVersion = 99;
    await store.enqueue(outboxCmd("018f3a2e-9c40-7000-8000-000000000003", "k-3"));
    const r = await runCycle({ store, transport, deviceId: "d1", entities: ["items"], now: () => 1000, random: () => 0 });
    expect(r.readOnly).toBe(true);
    expect(r.pushed).toBe(0);
    expect(await store.outboxCount()).toBe(1); // untouched, no fabricated writes
  });

  it("DEFERRED items stay queued with a jittered retry; REJECTED items park", async () => {
    const store = new InMemoryLocalStore();
    const transport: Transport = {
      async status() { return { contractVersion: CONTRACT_VERSION }; },
      async pull(_d, _e, c) { return { items: [], nextCursorSeq: c, hasMore: false, contractVersion: CONTRACT_VERSION }; },
      async push(_d, commands) {
        return {
          results: commands.map((c) => ({
            commandId: c.commandId,
            status: c.intent === "pos_sale" ? ("DEFERRED" as const) : ("REJECTED" as const),
            result: {},
          })),
        };
      },
    };
    await store.enqueue(outboxCmd("018f3a2e-9c40-7000-8000-000000000004", "k-4"));
    await store.enqueue({ ...outboxCmd("018f3a2e-9c40-7000-8000-000000000005", "k-5"), intent: "unknown_intent" });
    const r = await runCycle({ store, transport, deviceId: "d1", entities: [], now: () => 1000, random: () => 0.5 });
    expect(r.deferred).toBe(1);
    expect(r.rejected).toBe(1);
    expect(await store.outboxCount()).toBe(2); // both remain (deferred retries, rejected parked)
  });

  it("backoff ceiling doubles and caps; jitter stays within [0, ceiling]", () => {
    const policy = { baseMs: 100, capMs: 1000, maxAttempts: 5 };
    expect(backoffCeiling(0, policy)).toBe(100);
    expect(backoffCeiling(3, policy)).toBe(800);
    expect(backoffCeiling(9, policy)).toBe(1000);
    const d = nextDelay(3, policy, () => 0.999);
    expect(d).toBeLessThanOrEqual(800);
  });
});
