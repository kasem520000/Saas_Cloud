/**
 * PHASE-023 T7 — bank-specific parser: "sa-ncb-csv" (fixed-column Saudi NCB-
 * style statement export: Date, Description, Debit, Credit, Balance).
 * Strict by design: rows that do not match the format are PARKED for manual
 * mapping — never guessed into bank_statement_lines (phase rule: no guessed
 * amounts). Re-import is idempotent per file checksum (handled by the import
 * service; the parser is pure).
 */

import { StatementFormatError, type BankAdapter, type ParsedStatement, type ParsedStatementLine } from "./index";

function parseAmount(raw: string): string | null {
  const t = raw.trim().replace(/,/g, "");
  if (t === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return t;
}

function toIsoDate(raw: string): string | null {
  const t = raw.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t) ?? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  if (m[1]!.length === 4) return `${m[1]}-${m[2]}-${m[3]}`;
  return `${m[3]}-${m[2]}-${m[1]}`; // DD/MM/YYYY
}

export const saNcbCsvAdapter: BankAdapter = {
  id: "sa-ncb-csv",
  label: { en: "Saudi NCB-style CSV (fixed columns)", ar: "CSV ثابت الأعمدة بنمط NCB" },
  extensions: [".csv"],
  parse(input): ParsedStatement {
    let text = input.content.toString("utf8");
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rows = text.split(/\r?\n/).filter((r) => r.trim() !== "");
    if (rows.length < 2) throw new StatementFormatError("sa-ncb-csv needs a header row + data rows");
    const header = rows[0]!.toLowerCase();
    for (const required of ["date", "debit", "credit", "balance"]) {
      if (!header.includes(required)) {
        throw new StatementFormatError(`sa-ncb-csv header must include "${required}"`);
      }
    }
    const lines: ParsedStatementLine[] = [];
    const parked: string[] = [];
    for (const row of rows.slice(1)) {
      const cells = row.split(",").map((c) => c.trim());
      const [date, description, debit, credit, balance] = cells;
      const iso = toIsoDate(date ?? "");
      const cell = (v: string | undefined) => (v === undefined || v.trim() === "" ? "0" : v);
      const amounts = [debit, credit, balance].map((a) => parseAmount(cell(a)));
      if (iso === null || amounts.some((a) => a === null)) {
        parked.push(row); // never guessed — parked for manual mapping
        continue;
      }
      const signed = parseAmount(cell(debit)) ?? "0";
      const creditAmt = parseAmount(cell(credit)) ?? "0";
      const amount = (Number(creditAmt) - Number(signed)).toString(); // credit positive, debit negative
      lines.push({ lineDate: iso, amount, reference: null, description: description ?? null });
    }
    return { lines, openingBalance: null, closingBalance: parseAmount(rows.at(-1)?.split(",")[4] ?? ""), parkedLines: parked };
  },
};
