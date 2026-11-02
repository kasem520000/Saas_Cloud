import { describe, expect, it } from "vitest";

import {
  assertInvoiceable,
  assertTransition,
  canTransition,
  JobCardStateError,
} from "../domain/job-card";

/**
 * PHASE-017 T3 — job-card state machine: DRAFT → IN_PROGRESS → COMPLETED →
 * INVOICED (+ CANCELLED). No ledger before INVOICED; cancellation blocked
 * after parts consumption; invoicing requires COMPLETED.
 */

describe("job-card state machine (PHASE-017 T3)", () => {
  it("happy path DRAFT → IN_PROGRESS → COMPLETED → INVOICED", () => {
    expect(canTransition("DRAFT", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS", "COMPLETED")).toBe(true);
    expect(canTransition("COMPLETED", "INVOICED")).toBe(true);
    expect(() => assertTransition("DRAFT", "IN_PROGRESS")).not.toThrow();
    expect(() => assertTransition("IN_PROGRESS", "COMPLETED")).not.toThrow();
    expect(() => assertTransition("COMPLETED", "INVOICED")).not.toThrow();
  });

  it("terminal states move nowhere (posted cards immutable)", () => {
    expect(canTransition("INVOICED", "DRAFT")).toBe(false);
    expect(canTransition("CANCELLED", "DRAFT")).toBe(false);
    expect(() => assertTransition("INVOICED", "CANCELLED")).toThrow(JobCardStateError);
  });

  it("skipping states is rejected (no DRAFT → COMPLETED)", () => {
    expect(canTransition("DRAFT", "COMPLETED")).toBe(false);
    expect(() => assertTransition("DRAFT", "INVOICED")).toThrow(/cannot move DRAFT/);
  });

  it("CANCELLED is allowed only before parts consumption", () => {
    expect(() => assertTransition("DRAFT", "CANCELLED")).not.toThrow();
    expect(() => assertTransition("DRAFT", "CANCELLED", { partsConsumed: true })).toThrow(
      /cannot be cancelled/,
    );
  });

  it("invoicing requires COMPLETED (no ledger before INVOICED)", () => {
    expect(() => assertInvoiceable("COMPLETED")).not.toThrow();
    expect(() => assertInvoiceable("IN_PROGRESS")).toThrow(/cannot be invoiced/);
    expect(() => assertInvoiceable("DRAFT")).toThrow(/cannot be invoiced/);
  });
});
