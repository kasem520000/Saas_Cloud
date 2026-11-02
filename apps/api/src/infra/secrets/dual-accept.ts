/**
 * PHASE-024 T6 — secrets rotation dual-accept window (SECRETS_MANAGEMENT §3):
 * during rotation the verifier accepts BOTH the old and the new secret
 * (S-03 session-signing key, S-11 webhook signers), and after the window the
 * old secret MUST fail the canary check. Pure, unit-tested — the staging
 * drill execution itself is recorded as a CI/staging deferral with runbook.
 */

export interface DualAcceptVerifier<T> {
  /** Returns true if the credential verifies under old OR new secret. */
  verify(value: T, credential: string): boolean;
}

export class DualAcceptSecret<T> {
  constructor(
    private current: string,
    private previous: string | null,
    private readonly hash: (secret: string, value: T) => string,
    private readonly eq: (a: string, b: string) => boolean,
  ) {}

  rotate(newSecret: string): void {
    this.previous = this.current;
    this.current = newSecret;
  }

  /** Ends the dual-accept window: only the current secret verifies. */
  endWindow(): void {
    this.previous = null;
  }

  verify(value: T, credential: string): boolean {
    if (this.eq(this.hash(this.current, value), credential)) return true;
    if (this.previous !== null && this.eq(this.hash(this.previous, value), credential)) return true;
    return false;
  }

  /** Canary: after endWindow, a credential minted with the OLD secret fails. */
  oldSecretFailsCanary(oldSecret: string, value: T): boolean {
    return !this.eq(this.hash(oldSecret, value), this.hash(this.current, value)) && !this.verify(value, this.hash(oldSecret, value));
  }
}
