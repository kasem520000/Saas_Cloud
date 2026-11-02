/**
 * PHASE-024 T6 — dual-accept window semantics: old+new both verify during the
 * window; after endWindow only the new one verifies and the old-secret canary
 * FAILS (the drill's pass criterion).
 */
import { describe, expect, it } from "vitest";
import { createHmac, timingSafeEqual } from "node:crypto";
import { DualAcceptSecret } from "../dual-accept";

const hash = (secret: string, value: string) => createHmac("sha256", secret).update(value).digest("hex");
const eq = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

describe("secrets rotation dual-accept (S-03/S-11 class)", () => {
  it("window: both old and new credentials verify", () => {
    const v = new DualAcceptSecret<string>("old", null, hash, eq);
    v.rotate("new");
    expect(v.verify("payload", hash("old", "payload"))).toBe(true);
    expect(v.verify("payload", hash("new", "payload"))).toBe(true);
  });

  it("after endWindow: only the new secret verifies; old-secret canary FAILS", () => {
    const v = new DualAcceptSecret<string>("old", null, hash, eq);
    v.rotate("new");
    v.endWindow();
    expect(v.verify("payload", hash("new", "payload"))).toBe(true);
    expect(v.verify("payload", hash("old", "payload"))).toBe(false);
    expect(v.oldSecretFailsCanary("old", "payload")).toBe(true);
  });

  it("wrong secret never verifies, in or out of the window", () => {
    const v = new DualAcceptSecret<string>("old", null, hash, eq);
    expect(v.verify("payload", hash("evil", "payload"))).toBe(false);
    v.rotate("new");
    expect(v.verify("payload", hash("evil", "payload"))).toBe(false);
  });
});
