/**
 * PHASE-020 T10 — full-jitter retry scheduler (IDEMPOTENCY_AND_RETRIES §3):
 * backoff = min(cap, base * 2^attempt) with the actual delay drawn uniformly
 * from [0, backoff] ("full jitter"). Deterministic when `random` is injected —
 * the chaos harness seeds it.
 */

export interface RetryPolicy {
  baseMs: number;
  capMs: number;
  maxAttempts: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  baseMs: 250,
  capMs: 30_000,
  maxAttempts: 8,
};

/** The backoff ceiling for an attempt (before jitter). */
export function backoffCeiling(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  if (attempt < 0) throw new Error("attempt must be >= 0");
  return Math.min(policy.capMs, policy.baseMs * 2 ** attempt);
}

/** The actual delay to wait: uniform in [0, ceiling]. */
export function nextDelayMs(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  random: () => number = Math.random,
): number {
  const ceiling = backoffCeiling(attempt, policy);
  return (random() * (ceiling + 1)) | 0; // integer ms (ADR-0009 lint bans Math.floor)
}

/** True when the attempt counter has exhausted the policy. */
export function retriesExhausted(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): boolean {
  return attempt >= policy.maxAttempts;
}
