/**
 * PHASE-023 T7 — sa-ncb-csv parser contract: fixed-column fixture parses with
 * correct signed amounts (credit +, debit −), malformed rows are PARKED
 * (never guessed amounts), and a bad header is rejected.
 */
import { describe, expect, it } from "vitest";
import { saNcbCsvAdapter } from "../sa-ncb";
import { StatementFormatError } from "../index";

const FIXTURE = [
  "Date,Description,Debit,Credit,Balance",
  "2026-11-01,POS settlement,,1500.00,11500.00",
  "02/11/2026,Supplier payment,250.50,,11249.50",
  "garbage-row-with-bad-amount,x,abc,,999",
].join("\n");

describe("sa-ncb-csv adapter", () => {
  it("parses the fixture with correct signs and parks the malformed row", async () => {
    const parsed = await saNcbCsvAdapter.parse({ fileName: "st.csv", content: Buffer.from(FIXTURE) });
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0]).toMatchObject({ lineDate: "2026-11-01", amount: "1500", description: "POS settlement" });
    expect(parsed.lines[1]).toMatchObject({ lineDate: "2026-11-02", amount: "-250.5" });
    expect(parsed.parkedLines).toHaveLength(1);
    expect(parsed.parkedLines?.[0]).toContain("garbage-row");
    expect(parsed.closingBalance).toBe("999"); // last row's balance cell — parked row still carries the file's closing balance cell
  });

  it("rejects a file without the required header", () => {
    expect(() => saNcbCsvAdapter.parse({ fileName: "x.csv", content: Buffer.from("a,b,c\n1,2,3\n") })).toThrow(StatementFormatError);
  });

  it("handles BOM", async () => {
    const parsed = await saNcbCsvAdapter.parse({ fileName: "st.csv", content: Buffer.from("﻿" + FIXTURE) });
    expect(parsed.lines).toHaveLength(2);
  });
});
