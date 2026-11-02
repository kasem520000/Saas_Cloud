# DR-004 — WebAuthn / passkeys as an MFA method

> **Status:** DECIDED (deferred to post-GA) · **Date:** 2026-11-02 ·
> **Phase:** PHASE-024 T4 (the decision record is the required output either
> way — not launch-blocking).

## Decision

**Not in GA.** TOTP + recovery codes remain the MFA methods (ADR-0015);
WebAuthn/passkeys are a post-GA decision-record item because they add a
platform-authenticator trust surface that wants its own pen-test row.

## Rationale

- MFA enforcement per role/plan (this phase) works with TOTP today; passkeys
  would slot into the same `mfa-policy` enforcement matrix without changing
  the 423 gate.
- The security gate for passkeys (authenticator attestation policy, device
  trust) belongs to the post-GA hardening cycle.

## Revisit trigger

GA re-test complete + a design partner requests passkeys → reopen this record.
