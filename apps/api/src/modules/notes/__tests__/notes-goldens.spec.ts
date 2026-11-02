import { describe, expect, it } from "vitest";
import {
  buildG24Receive,
  buildG25Collect,
  buildG26Dishonor,
  buildG27Issue,
  buildG27Paid,
  buildDiscount,
  buildG28LateFee,
  isBalanced,
} from "../application/journal-builders";
import {
  transition,
  assertDishonorReason,
  JOURNAL_BEARING_EVENTS,
  CUSTODY_ONLY_EVENTS,
  CustodyError,
  type NoteStatus,
} from "../domain/custody-machine";
import {
  assertPlanTotalEqualsSource,
  buildSchedule,
  computeFlatLateFee,
  isOverdue,
} from "../../installments/domain/schedule";

describe("G-24…G-28 goldens", () => {
  it("G-24: 1,000.00 cheque received against invoice — DR NOTES_RECEIVABLE · CR AR_CONTROL (partner)", () => {
    const spec = buildG24Receive({ noteId: "n1", entryDate: "2026-11-02", currency: "YER", amount: "1000.0000", partnerId: "p1" });
    expect(isBalanced(spec)).toBe(true);
    expect(spec.lines).toEqual([
      { purpose: "NOTES_RECEIVABLE", direction: "DEBIT", amount: "1000.0000" },
      { purpose: "AR_CONTROL", direction: "CREDIT", amount: "1000.0000", partnerId: "p1" },
    ]);
  });

  it("G-25: collect — DR CASH · CR NOTES_RECEIVABLE", () => {
    const spec = buildG25Collect({ noteId: "n1", entryDate: "2026-12-02", currency: "YER", amount: "1000.0000", cashPurpose: "CASH" });
    expect(isBalanced(spec)).toBe(true);
    expect(spec.lines[0]).toMatchObject({ purpose: "CASH", direction: "DEBIT" });
  });

  it("G-26: dishonor restores AR exactly + optional bank fee leg", () => {
    const spec = buildG26Dishonor({ noteId: "n1", entryDate: "2026-12-03", currency: "YER", amount: "1000.0000", partnerId: "p1", fee: "25.0000" });
    expect(isBalanced(spec)).toBe(true);
    expect(spec.lines).toContainEqual({ purpose: "AR_CONTROL", direction: "DEBIT", amount: "1000.0000", partnerId: "p1" });
    expect(spec.lines).toContainEqual({ purpose: "BANK_CHARGES", direction: "DEBIT", amount: "25.0000" });
  });

  it("G-27: issue pair — DR AP_CONTROL · CR NOTES_PAYABLE, then DR NOTES_PAYABLE · CR CASH", () => {
    const issue = buildG27Issue({ noteId: "n2", entryDate: "2026-11-02", currency: "YER", amount: "500.0000", partnerId: "p2" });
    const paid = buildG27Paid({ noteId: "n2", entryDate: "2027-02-02", currency: "YER", amount: "500.0000", cashPurpose: "BANK" });
    expect(isBalanced(issue)).toBe(true);
    expect(isBalanced(paid)).toBe(true);
    expect(issue.lines[1]).toMatchObject({ purpose: "NOTES_PAYABLE", direction: "CREDIT" });
  });

  it("BR-047 discount: fee explicit, never netted — DR CASH + DR NOTES_DISCOUNT_EXPENSE · CR NOTES_RECEIVABLE", () => {
    const spec = buildDiscount({ noteId: "n1", entryDate: "2026-11-10", currency: "YER", amount: "1000.0000", proceeds: "970.0000", fee: "30.0000" });
    expect(isBalanced(spec)).toBe(true);
    expect(spec.lines).toContainEqual({ purpose: "NOTES_DISCOUNT_EXPENSE", direction: "DEBIT", amount: "30.0000" });
  });

  it("G-28: flat late fee 2% of 500.00 = 10.00 — DR AR_CONTROL · CR LATE_FEE_INCOME", () => {
    const spec = buildG28LateFee({ planId: "pl1", lineId: "l1", entryDate: "2026-12-05", currency: "YER", amount: "10.0000", partnerId: "p1" });
    expect(isBalanced(spec)).toBe(true);
    expect(spec.lines).toEqual([
      { purpose: "AR_CONTROL", direction: "DEBIT", amount: "10.0000", partnerId: "p1" },
      { purpose: "LATE_FEE_INCOME", direction: "CREDIT", amount: "10.0000" },
    ]);
  });
});

describe("custody state machine (T2, INV-024)", () => {
  it("legal transitions incl. custody-only ENDORSE/DEPOSIT (BR-047)", () => {
    expect(transition("IN_CUSTODY", "ENDORSE")).toBe("ENDORSED_OUT");
    expect(transition("IN_CUSTODY", "DEPOSIT")).toBe("DEPOSITED");
    expect(transition("DEPOSITED", "COLLECT")).toBe("COLLECTED");
    expect(transition("IN_CUSTODY", "DISHONOR")).toBe("DISHONORED");
    expect(transition("IN_CUSTODY", "RECLASSIFY")).toBe("IN_CUSTODY"); // no custody change
  });

  it("illegal transitions rejected (terminal states only RECLASSIFY)", () => {
    expect(() => transition("COLLECTED" as NoteStatus, "COLLECT")).toThrowError(
      expect.objectContaining({ code: "INVALID_CUSTODY_TRANSITION" }),
    );
    expect(() => transition("DISHONORED", "DEPOSIT")).toThrow(CustodyError);
  });

  it("INV-024 mirror: journal-bearing events are exactly COLLECT/DISHONOR/DISCOUNT/RETURN; ENDORSE/DEPOSIT/RECLASSIFY post zero journal rows", () => {
    expect([...JOURNAL_BEARING_EVENTS].sort()).toEqual(["COLLECT", "DISCOUNT", "DISHONOR", "RETURN"]);
    expect([...CUSTODY_ONLY_EVENTS].sort()).toEqual(["DEPOSIT", "ENDORSE", "RECLASSIFY"]);
  });

  it("BR-046: dishonor requires a reason", () => {
    expect(() => assertDishonorReason("")).toThrowError(expect.objectContaining({ code: "DISHONOR_REASON_REQUIRED" }));
    expect(() => assertDishonorReason("  ")).toThrow(CustodyError);
    expect(() => assertDishonorReason("insufficient funds")).not.toThrow();
  });
});

describe("installment schedule (T8/T9/T11, BR-048/049)", () => {
  it("BR-048: plan total must equal source total; down < total", () => {
    expect(() => assertPlanTotalEqualsSource("1000.0000", "999.0000", "0")).toThrowError(
      expect.objectContaining({ code: "PLAN_TOTAL_MISMATCH" }),
    );
    expect(() => assertPlanTotalEqualsSource("1000.0000", "1000.0000", "1000.0000")).toThrowError(
      expect.objectContaining({ code: "INVALID_AMOUNT" }),
    );
    expect(() => assertPlanTotalEqualsSource("1000.0000", "1000.0000", "100.0000")).not.toThrow();
  });

  it("schedule: Σ lines = total exactly (final line absorbs residual)", () => {
    const lines = buildSchedule({ total: "1000.0000", count: 3, startDate: "2026-11-01", frequency: "MONTHLY" });
    expect(lines).toHaveLength(3);
    expect(lines.map((l) => l.amount)).toEqual(["333.3333", "333.3333", "333.3334"]);
    expect(lines.map((l) => l.dueDate)).toEqual(["2026-11-01", "2026-12-01", "2027-01-01"]);
  });

  it("BR-049: flat late fee with cap; no compounding path exists", () => {
    expect(computeFlatLateFee("500.0000", { rate: "0.02" })).toBe("10.0000");
    expect(computeFlatLateFee("500.0000", { rate: "0.02", cap: "5.0000" })).toBe("5.0000");
    expect(computeFlatLateFee("500.0000", { rate: "0" })).toBe("0.0000");
  });

  it("OVERDUE is derived only: due past + grace elapsed + unpaid", () => {
    expect(isOverdue("2026-11-01", "PENDING", "2026-11-10", 3)).toBe(true);
    expect(isOverdue("2026-11-01", "PENDING", "2026-11-03", 3)).toBe(false); // grace
    expect(isOverdue("2026-11-01", "PAID", "2026-11-10", 3)).toBe(false);
    expect(isOverdue("2026-11-01", "WAIVED", "2026-11-10", 3)).toBe(false);
  });
});
