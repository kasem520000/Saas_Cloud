import {
  PER_IP_LOGIN_MAX_ATTEMPTS,
  PER_IP_LOGIN_WINDOW_MS,
  PER_IP_RESET_MAX_ATTEMPTS,
  PER_IP_RESET_WINDOW_MS,
  systemClock,
  type Clock,
} from "../domain/session-policy";
import { RateLimitedError } from "../domain/identity-errors";

/**
 * Per-IP sliding-window rate limiter (AUTHENTICATION §5.1; R-03/R-08):
 * in-memory counters on the hot path — deliberately cheap (PHASE-003 §6:
 * "no DB write on the hot path beyond failed attempts"). Multi-instance
 * deployments move the counter to the shared plane with the first scale-out
 * phase; the interface is the contract, the Map is the PHASE-003 substrate.
 * Headers/case toggles cannot reset a window (R-08): the key is the exact
 * remote IP string as seen by the server.
 */

interface Window {
  attempts: number[];
}

export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly clock: Clock = systemClock,
    private readonly maxAttempts: number = PER_IP_LOGIN_MAX_ATTEMPTS,
    private readonly windowMs: number = PER_IP_LOGIN_WINDOW_MS,
  ) {}

  /**
   * Record one attempt for the key and throw 429 (+Retry-After) once the
   * window is saturated. Callers invoke this BEFORE any DB work so the
   * cheap rejection dominates (R-06 principle at the login surface).
   */
  consume(key: string): void {
    const now = this.clock.now().getTime();
    const window = this.windows.get(key) ?? { attempts: [] };
    window.attempts = window.attempts.filter((at) => now - at < this.windowMs);
    window.attempts.push(now);
    this.windows.set(key, window);
    if (window.attempts.length > this.maxAttempts) {
      const remainingMs = window.attempts[0]! + this.windowMs - now;
      // Round UP to whole seconds (never retry early), exact integers.
      const retryAfterSeconds = Math.max(1, (remainingMs + 999) / 1000 | 0);
      throw new RateLimitedError(retryAfterSeconds);
    }
  }

  /** Successful logins clear the IP window (fresh budget, no penalty carry). */
  reset(key: string): void {
    this.windows.delete(key);
  }
}

/** Login-surface limiter (R-03). */
export function loginRateLimiter(clock: Clock = systemClock): RateLimiter {
  return new RateLimiter(clock, PER_IP_LOGIN_MAX_ATTEMPTS, PER_IP_LOGIN_WINDOW_MS);
}

/** Password-reset-request limiter (R-05: no email bombing). */
export function resetRateLimiter(clock: Clock = systemClock): RateLimiter {
  return new RateLimiter(clock, PER_IP_RESET_MAX_ATTEMPTS, PER_IP_RESET_WINDOW_MS);
}

/**
 * The counters are shared across every authentication surface (R-07):
 * API, BFF, and password-reset all funnel through these singletons.
 */
export const LOGIN_LIMITER = loginRateLimiter();
export const RESET_LIMITER = resetRateLimiter();
