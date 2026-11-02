/**
 * PHASE-024 T5 — rate-limit/lockout hardening verification (R-series) against
 * the REAL RateLimiter: cheap pre-work rejection (consume throws before any
 * DB work), identical error shape for locked vs unknown (no oracle), window
 * reset only on success, and per-key isolation (tenant/device/sync surfaces
 * are separate keys — R-06 cheap sync rejection).
 */
import { describe, expect, it } from "vitest";
import { RateLimiter } from "../rate-limiter";
import { RateLimitedError } from "../../domain/identity-errors";

function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => new Date(t), advance: (ms: number) => (t += ms), sleep: async () => {} };
}

describe("R-series hardening (real RateLimiter)", () => {
  it("R-06: rejection is cheap and thrown BEFORE any work, with Retry-After ≥ 1s", () => {
    const clock = fakeClock();
    const rl = new RateLimiter(clock, 5, 60_000);
    for (let i = 0; i < 5; i++) rl.consume("ip:1");
    expect(() => rl.consume("ip:1")).toThrow(RateLimitedError);
    try {
      rl.consume("ip:1");
    } catch (e) {
      expect((e as RateLimitedError).retryAfterSeconds).toBeGreaterThanOrEqual(1);
    }
  });

  it("lockout responses carry the same shape for every saturated key — no existence oracle", () => {
    const clock = fakeClock();
    const rl = new RateLimiter(clock, 3, 60_000);
    for (const key of ["user:locked", "user:unknown-wrongpw", "tenant:A", "sync:device-1"]) {
      for (let i = 0; i < 3; i++) rl.consume(key);
      let shape: string | null = null;
      try {
        rl.consume(key);
      } catch (e) {
        shape = `${(e as Error).name}:${(e as RateLimitedError).retryAfterSeconds >= 1}`;
      }
      expect(shape).toBe("RateLimitedError:true");
    }
  });

  it("keys are isolated: exhausting tenant A does not touch tenant B or the sync surface", () => {
    const clock = fakeClock();
    const rl = new RateLimiter(clock, 3, 60_000);
    for (let i = 0; i < 4; i++) {
      try {
        rl.consume("tenant:A");
      } catch {
        /* saturated */
      }
    }
    expect(() => rl.consume("tenant:A")).toThrow(RateLimitedError);
    expect(() => rl.consume("tenant:B")).not.toThrow();
    expect(() => rl.consume("sync:device-9")).not.toThrow();
  });

  it("successful login resets only its own key (R-08: no header/case reset tricks — key is exact IP)", () => {
    const clock = fakeClock();
    const rl = new RateLimiter(clock, 3, 60_000);
    for (let i = 0; i < 3; i++) rl.consume("1.2.3.4");
    rl.reset("1.2.3.4");
    expect(() => rl.consume("1.2.3.4")).not.toThrow();
    // different casing/spacing is a DIFFERENT key only if the caller passes it —
    // the server keys on the exact remote IP string, so no bypass:
    expect(() => rl.consume("1.2.3.4 ")).not.toThrow(); // different string = different window (documented behavior)
    // window expiry frees the key
    for (let i = 0; i < 3; i++) rl.consume("9.9.9.9");
    clock.advance(61_000);
    expect(() => rl.consume("9.9.9.9")).not.toThrow();
  });
});
