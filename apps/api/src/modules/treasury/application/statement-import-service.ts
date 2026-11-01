import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";

import { AuditService } from "../../audit/api/audit";
import * as store from "../infrastructure/treasury.store";
import {
  CashAccountTypeInvalidError,
  StatementFormatInvalidError,
  StatementNotFoundError,
  StatementTooLargeError,
} from "../domain/treasury-errors";
import {
  BANK_ADAPTERS,
  resolveAdapter,
  type ColumnMapping,
  type ParsedStatement,
} from "../infrastructure/bank-adapters";
import { requireActiveAccount } from "./document-support";

/**
 * Statement import service (PHASE-008 T10; §2.8): file-based import via
 * the pluggable adapter registry (CSV/XLSX, Arabic headers, BOM) —
 * idempotent per file hash (the same file never imports twice: the stored
 * statement returns as the idempotent replay), bounded by a hard row cap
 * (U-07), and confined to BANK-type accounts. The parse runs synchronously
 * inside the request's bounded window; the pg-boss async fan-out is the
 * documented scale-out seam for oversized histories (report §Deferred).
 * Statement lines are informational ONLY — never ledger entries.
 */
const IMPORT_ROW_CAP = 5000;

@Injectable()
export class StatementImportService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  /** The adapter registry listing (the UI wizard's adapter picker). */
  listAdapters() {
    return BANK_ADAPTERS.map((adapter) => ({
      id: adapter.id,
      label: adapter.label,
      extensions: adapter.extensions,
    }));
  }

  async list(filter: { cashAccountId?: string; status?: string; limit: number }) {
    return store.listStatements(filter);
  }

  async find(id: string): Promise<store.StatementRow> {
    const statement = await store.findStatementById(id);
    if (statement === undefined) {
      throw new StatementNotFoundError(id);
    }
    return statement;
  }

  async lines(id: string) {
    await this.find(id);
    return store.listStatementLines(id);
  }

  /**
   * Import (idempotent per file hash): parse → cap check → statement row +
   * line rows in the caller's transaction. Re-importing the same bytes
   * returns the STORED statement (idempotentReplay: true) — no duplicates.
   */
  async import(input: {
    cashAccountId: string;
    fileName: string;
    /** Base64-encoded file content (CSV text or an XLSX workbook). */
    contentBase64: string;
    periodStart?: string;
    periodEnd?: string;
    adapterId?: string;
    mapping?: ColumnMapping;
    actorId: string | null;
  }): Promise<{ statement: store.StatementRow; idempotentReplay: boolean }> {
    const accountRow = await store.findCashAccountById(input.cashAccountId);
    const account = requireActiveAccount(accountRow);
    if (account.type !== "BANK") {
      throw new CashAccountTypeInvalidError(
        `statements import into BANK accounts — ${account.name} is ${account.type}`,
      );
    }
    const content = Buffer.from(input.contentBase64, "base64");
    const fileHash = createHash("sha256").update(content).digest("hex");

    // Idempotency (§2.8): the same file never imports twice.
    const existing = await store.findStatementByHash(fileHash);
    if (existing !== undefined) {
      return { statement: existing, idempotentReplay: true };
    }

    const adapter = resolveAdapter(input.fileName, input.adapterId);
    let parsed: ParsedStatement;
    try {
      parsed = await adapter.parse({ fileName: input.fileName, content, mapping: input.mapping });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown parse failure";
      throw new StatementFormatInvalidError(`${adapter.id}: ${message}`);
    }
    if (parsed.lines.length === 0) {
      throw new StatementFormatInvalidError("the statement has no data rows");
    }
    if (parsed.lines.length > IMPORT_ROW_CAP) {
      throw new StatementTooLargeError(parsed.lines.length, IMPORT_ROW_CAP);
    }
    const dates = parsed.lines.map((line) => line.lineDate).sort();
    const periodStart = input.periodStart ?? dates[0]!;
    const periodEnd = input.periodEnd ?? dates[dates.length - 1]!;

    const statement = await store.insertStatement({
      cashAccountId: account.id,
      periodStart,
      periodEnd,
      fileName: input.fileName,
      fileHash,
      adapterId: adapter.id,
      openingBalance: parsed.openingBalance,
      closingBalance: parsed.closingBalance,
      lineCount: parsed.lines.length,
      createdBy: input.actorId,
    });
    for (const [index, line] of parsed.lines.entries()) {
      await store.insertStatementLine({
        bankStatementId: statement.id,
        lineNo: index + 1,
        lineDate: line.lineDate,
        amount: line.amount,
        reference: line.reference,
        description: line.description,
      });
    }
    await this.audit.record({
      action: "treasury.bank_statement_imported",
      entityType: "bank_statement",
      entityId: statement.id,
      actorId: input.actorId ?? undefined,
      after: {
        fileName: input.fileName,
        adapter: adapter.id,
        lines: parsed.lines.length,
        period: `${periodStart}..${periodEnd}`,
        account: account.name,
      },
    });
    return { statement, idempotentReplay: false };
  }
}
