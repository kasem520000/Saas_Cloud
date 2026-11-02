/**
 * PHASE-023 T4 (gated path taken) — the ZATCA adapter as an UNVERIFIED
 * refuse-to-submit stub. DR-001-zatca-scope-and-timing is OPEN and the
 * verification gate (E_INVOICING_ARCHITECTURE §3: pinned official specs/SDK,
 * sandbox runs, legal review, two-person sign-off) cannot pass in this
 * environment — no official ZATCA sources are reachable from the sandbox and
 * no fabrication is permitted (integrations/README §4 rule 2, RISK-005).
 * Per the phase's gated-shipping rules the adapter therefore REFUSES every
 * real submission with an explicit error, and the completion report marks
 * the ZATCA adapter line INCOMPLETE with the named unmet items.
 */

import type { EInvoicingAdapter, SubmissionOutcome, SubmissionPayload } from "../../domain/adapter-port";

export class UnverifiedZatcaAdapter implements EInvoicingAdapter {
  readonly id = "zatca";
  readonly supportedCountries: readonly string[] = ["SA"];
  /** The regime facts in compliance-matrix/sa.md are REQUIRES_VERIFICATION. */
  readonly regimeVerified = false;

  async submit(_payload: SubmissionPayload): Promise<SubmissionOutcome> {
    // Refuse — never a guessed wire format, never a real submission.
    return {
      status: "FAILED",
      authorityReference: null,
      payloadDigest: null,
      error: {
        code: "UNVERIFIED_REGIME",
        adapter: "zatca",
        reason:
          "ZATCA adapter is UNVERIFIED: DR-001 open + verification gate unpassed (pinned spec/SDK, sandbox evidence, legal review, two-person sign-off missing). Refusing to submit.",
      },
    };
  }
}
