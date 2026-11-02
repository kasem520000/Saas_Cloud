import { describe, expect, it } from "vitest";

import {
  CancelAfterConsumptionError,
  IllegalTransitionError,
  transition,
  type ProductionOrderStatus,
} from "../domain/production-order";

describe("PHASE-018 production order lifecycle (T2, DOCUMENT_LIFECYCLE §3)", () => {
  const legal: Array<[ProductionOrderStatus, Parameters<typeof transition>[1], ProductionOrderStatus]> = [
    ["DRAFT", "RELEASE", "RELEASED"],
    ["DRAFT", "CANCEL", "CANCELLED"],
    ["RELEASED", "START", "IN_PROGRESS"],
    ["RELEASED", "CONSUME", "IN_PROGRESS"],
    ["RELEASED", "CANCEL", "CANCELLED"],
    ["IN_PROGRESS", "CONSUME", "IN_PROGRESS"],
    ["IN_PROGRESS", "COMPLETE", "COMPLETED"],
    ["IN_PROGRESS", "CANCEL", "CANCELLED"],
  ];

  it.each(legal)("%s --%s--> %s", (from, event, expected) => {
    expect(transition(from, event)).toBe(expected);
  });

  it("rejects illegal transitions", () => {
    expect(() => transition("DRAFT", "COMPLETE")).toThrow(IllegalTransitionError);
    expect(() => transition("COMPLETED", "CONSUME")).toThrow(IllegalTransitionError);
    expect(() => transition("CANCELLED", "RELEASE")).toThrow(IllegalTransitionError);
  });

  it("CANCELLED only before any consumption", () => {
    expect(() => transition("IN_PROGRESS", "CANCEL", "0.5")).toThrow(CancelAfterConsumptionError);
    expect(transition("IN_PROGRESS", "CANCEL", "0")).toBe("CANCELLED");
  });
});
