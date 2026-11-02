/**
 * PHASE-022 T11 — FCM adapter contract tests against a fake provider:
 * locale resolved before the call, unknown template fails closed (no payload),
 * per-tenant quota enforced, opt-in device tokens only (caller supplies them).
 */
import { describe, expect, it } from "vitest";
import { FcmChannelAdapter, type FcmMessage, type FcmProvider } from "./fcm-adapter";

class FakeFcm implements FcmProvider {
  sent: FcmMessage[] = [];
  async send(message: FcmMessage) {
    this.sent.push(message);
    return { messageId: `msg-${this.sent.length}` };
  }
}

describe("FcmChannelAdapter", () => {
  it("resolves locale before the call and delivers", async () => {
    const fcm = new FakeFcm();
    const adapter = new FcmChannelAdapter(fcm, 60, () => 1000);
    const r = await adapter.send({ deviceToken: "tok-1", templateKey: "sync_rejection", locale: "ar", params: {}, tenantId: "t1" });
    expect(r.delivered).toBe(true);
    expect(fcm.sent[0]?.title).toBe("عملية مرفوضة");
  });

  it("unknown template fails closed with no payload", async () => {
    const fcm = new FakeFcm();
    const adapter = new FcmChannelAdapter(fcm);
    const r = await adapter.send({ deviceToken: "tok-1", templateKey: "secret_payload", locale: "en", params: { x: "1" }, tenantId: "t1" });
    expect(r.delivered).toBe(false);
    expect(fcm.sent).toHaveLength(0);
  });

  it("per-tenant quota blocks after the limit", async () => {
    const fcm = new FakeFcm();
    let now = 1000;
    const adapter = new FcmChannelAdapter(fcm, 3, () => now);
    for (let i = 0; i < 3; i++) {
      const r = await adapter.send({ deviceToken: "tok", templateKey: "approval_due", locale: "en", params: {}, tenantId: "t1" });
      expect(r.delivered).toBe(true);
    }
    const blocked = await adapter.send({ deviceToken: "tok", templateKey: "approval_due", locale: "en", params: {}, tenantId: "t1" });
    expect(blocked.delivered).toBe(false);
    now += 61_000; // window resets
    const after = await adapter.send({ deviceToken: "tok", templateKey: "approval_due", locale: "en", params: {}, tenantId: "t1" });
    expect(after.delivered).toBe(true);
  });
});
