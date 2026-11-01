import { Decimal } from "@erp/domain-core";

import {
  JournalSpec,
  PostingPlan,
  type Direction,
  type JournalLineSpec,
} from "./journal-spec";
import {
  accountArchived,
  accountNotPostable,
  alreadyPosted,
  currencyMismatch,
  entryNotBalanced,
  invalidAmount,
  missingFxRate,
  missingPartnerOnControl,
  periodLocked,
  periodNotFound,
  purposeNotMapped,
} from "./posting-errors";

/**
 * The posting engine (PHASE-007 T6; POSTING_ENGINE.md; ADR-0007) — a PURE
 * domain service with ZERO infrastructure dependencies (no HTTP, no queue,
 * no SQL): every read flows through the `PostingReadModel` port, which the
 * infrastructure wires to the caller's open transaction. The validation
 * pipeline 1–8 runs IN ORDER; the first failure aborts with the typed error
 * from §3 and ZERO residue (nothing has been written — the write phase is
 * the application layer's single transaction around the returned plan).
 *
 * Decimal policy (ADR-0009): all math is exact decimal.js on canonical
 * strings; base amounts are rounded half-up to 4dp (NUMERIC(19,4)) at
 * conversion, and the caller must pre-balance — line-level FX rounding may
 * not create drift (INV-002).
 */

/** Read port — the engine's ONLY window to data. */
export interface PostingReadModel {
  /** INV-013 idempotency probe by (tenant, source_type, source_id, operation). */
  findEntryBySourceKey(
    sourceType: string,
    sourceId: string | null,
    operation: string,
  ): Promise<{ id: string; entryNo: string | null; status: "POSTED" | "REVERSED" } | undefined>;
  /** Period for a date: REGULAR wins over special windows. */
  findPeriodForDate(
    entryDate: string,
  ): Promise<
    | { id: string; status: "OPEN" | "SOFT_CLOSED" | "LOCKED"; startDate: string; endDate: string }
    | undefined
  >;
  findPeriodById(periodId: string): Promise<
    | { id: string; status: "OPEN" | "SOFT_CLOSED" | "LOCKED"; startDate: string; endDate: string }
    | undefined
  >;
  findAccount(accountId: string): Promise<
    | {
        id: string;
        code: string;
        status: "ACTIVE" | "ARCHIVED";
        isPostable: boolean;
        currencyCode: string | null;
      }
    | undefined
  >;
  /** Active purpose mapping (V1: exactly one active per purpose per tenant). */
  findActivePurposeAccount(purposeKey: string): Promise<{ accountId: string } | undefined>;
  /** The active AR/AP control account ids (INV-009 subledger consistency). */
  findArApControlAccounts(): Promise<{ arControlAccountId: string; apControlAccountId: string }>;
  /** Tenant base currency (ISO-4217) for FX validation. */
  baseCurrency(): Promise<string>;
}

const MONEY_4DP = { precision: 19, scale: 4 } as const;
const RATE_8DP = { precision: 19, scale: 8 } as const;

function dec(value: string): Decimal {
  return new Decimal(value);
}

/** Round half-up to the journal money scale (4dp — ADR-0009 NUMERIC(19,4)). */
function money(value: Decimal): string {
  return value.toDecimalPlaces(MONEY_4DP.scale, Decimal.ROUND_HALF_UP).toFixed(4);
}

/** Round half-up to the stored rate scale (8dp). */
function rate(value: Decimal): string {
  return value.toDecimalPlaces(RATE_8DP.scale, Decimal.ROUND_HALF_UP).toFixed(8);
}

export class PostingEngine {
  /**
   * Validation pipeline 1–8 (POSTING_ENGINE.md §2). Steps 1–7 produce the
   * resolved `PostingPlan`; step 8 (the write) belongs to the application
   * layer's transaction around this plan. First failure aborts — pipeline
   * ORDER is part of the contract (tested).
   */
  async post(spec: JournalSpec, model: PostingReadModel): Promise<PostingPlan> {
    // (1) Idempotency (INV-013): an existing entry for the same source key
    // is the application layer's replay path — it surfaces ALREADY_POSTED
    // semantics through PostService, which returns the stored result.
    const existing = spec.source.docId !== null
      ? await model.findEntryBySourceKey(spec.source.docType, spec.source.docId, spec.source.operation)
      : undefined;
    if (existing !== undefined) {
      throw alreadyPosted({
        sourceType: spec.source.docType,
        sourceId: spec.source.docId ?? "",
        operation: spec.source.operation,
      });
    }

    // (2) Schema-level: ≥ 2 lines, ≥ 1 debit, ≥ 1 credit, amounts > 0.
    if (!Array.isArray(spec.lines) || spec.lines.length < 2) {
      throw entryNotBalanced({ debit: "0", credit: "0" });
    }
    let hasDebit = false;
    let hasCredit = false;
    for (const line of spec.lines) {
      const amount = dec(line.amount);
      if (!amount.isFinite() || amount.lte(0)) {
        throw invalidAmount({ amount: line.amount });
      }
      if (line.direction === "DEBIT") hasDebit = true;
      else if (line.direction === "CREDIT") hasCredit = true;
      else throw invalidAmount({ amount: `direction:${String(line.direction)}` });
      if (line.purpose === undefined && line.accountId === undefined) {
        throw purposeNotMapped({ purposeKey: "<missing purpose or accountId>" });
      }
    }
    if (!hasDebit || !hasCredit) {
      throw entryNotBalanced({ debit: hasDebit ? "1+" : "0", credit: hasCredit ? "1+" : "0" });
    }

    // (3) Currency/FX: currency known; rate required and > 0 when ≠ base;
    //     base amounts computed; balance must hold in base currency.
    const base = await model.baseCurrency();
    const isForeign = spec.currency !== base;
    let effectiveRate: Decimal;
    if (isForeign) {
      if (spec.exchangeRate === undefined || spec.exchangeRate === "") {
        throw missingFxRate({ currency: spec.currency, base });
      }
      effectiveRate = dec(spec.exchangeRate);
      if (!effectiveRate.isFinite() || effectiveRate.lte(0)) {
        throw invalidAmount({ amount: `rate:${spec.exchangeRate}` });
      }
    } else {
      // Base currency: the stored rate is always exactly 1 (INV-008).
      effectiveRate = new Decimal(1);
    }
    const storedRate = isForeign ? rate(effectiveRate) : "1";
    effectiveRate = dec(storedRate);

    // (4) Period: OPEN only (INV-011). Explicit override serves the special
    //     OPENING/CLOSING windows; date resolution prefers REGULAR periods.
    const period =
      spec.fiscalPeriodId !== undefined
        ? await model.findPeriodById(spec.fiscalPeriodId)
        : await model.findPeriodForDate(spec.entryDate);
    if (period === undefined) {
      throw periodNotFound({ entryDate: spec.entryDate });
    }
    if (spec.fiscalPeriodId !== undefined) {
      if (spec.entryDate < period.startDate || spec.entryDate > period.endDate) {
        throw periodNotFound({
          entryDate: `${spec.entryDate} outside explicit period ${period.startDate}..${period.endDate}`,
        });
      }
    }
    if (period.status === "LOCKED") {
      throw periodLocked({ entryDate: spec.entryDate, status: period.status });
    }
    if (period.status === "SOFT_CLOSED" && spec.softCloseReason === undefined) {
      // PC-02: soft-closed posting needs permission + reason; the permission
      // check is the HTTP layer's duty — the engine demands the reason here.
      throw periodLocked({ entryDate: spec.entryDate, status: period.status });
    }

    // (5) Account resolution: purposes → active mappings; postable active
    //     leaves (INV-004); currency-compatible (INV-005).
    const { arControlAccountId, apControlAccountId } = await model.findArApControlAccounts();
    const resolved: PostingPlan["lines"] = [];
    const accountCache = new Map<string, Awaited<ReturnType<PostingReadModel["findAccount"]>>>();
    for (const line of spec.lines) {
      let accountId: string;
      let purposeKey: string | undefined;
      if (line.purpose !== undefined) {
        const mapping = await model.findActivePurposeAccount(line.purpose);
        if (mapping === undefined) {
          // Fail closed — never post to a fallback (CHART_OF_ACCOUNTS §2).
          throw purposeNotMapped({ purposeKey: line.purpose });
        }
        accountId = mapping.accountId;
        purposeKey = line.purpose;
      } else {
        accountId = line.accountId!;
      }
      let account = accountCache.get(accountId);
      if (account === undefined) {
        account = await model.findAccount(accountId);
        accountCache.set(accountId, account);
      }
      if (account === undefined) {
        // Unknown/foreign ids surface as the postable violation (A7 keeps
        // the HTTP face a 404; the engine treats it as unpostable).
        throw accountNotPostable({ accountId });
      }
      if (account.status === "ARCHIVED") {
        throw accountArchived({ accountId, code: account.code });
      }
      if (!account.isPostable) {
        throw accountNotPostable({ accountId, code: account.code });
      }
      if (account.currencyCode !== null && account.currencyCode !== spec.currency) {
        throw currencyMismatch({
          accountId,
          accountCurrency: account.currencyCode,
          entryCurrency: spec.currency,
        });
      }
      const isArApControl =
        accountId === arControlAccountId || accountId === apControlAccountId;
      // (6) Subledger consistency: AR/AP control lines carry partnerId
      //     (INV-009). Tax lines carry taxCodeId — enforced at PHASE-009
      //     when tax codes exist; the column travels now.
      if (isArApControl && line.partnerId === undefined) {
        throw missingPartnerOnControl({
          accountId,
          purposeKey: purposeKey ?? "AR/AP_CONTROL",
        });
      }
      const baseAmount = isForeign
        ? money(dec(line.amount).times(effectiveRate))
        : money(dec(line.amount));
      resolved.push({
        lineNo: resolved.length + 1,
        accountId,
        purposeKey,
        direction: line.direction,
        amount: money(dec(line.amount)),
        baseAmount,
        partnerId: line.partnerId,
        itemId: line.itemId,
        costCenterId: line.costCenterId,
        taxCodeId: line.taxCodeId,
        memo: line.memo,
        isArApControl,
      });
    }

    // (7) Balanced: Σdebit = Σcredit in document AND base currency, 0
    //     tolerance (INV-001/002) — residuals must be explicit lines.
    const sums = balanceOf(resolved);
    if (sums.debit.comparedTo(sums.credit) !== 0) {
      throw entryNotBalanced({
        debit: sums.debit.toFixed(4),
        credit: sums.credit.toFixed(4),
      });
    }
    if (sums.baseDebit.comparedTo(sums.baseCredit) !== 0) {
      throw entryNotBalanced({
        debit: sums.debit.toFixed(4),
        credit: sums.credit.toFixed(4),
        baseDebit: sums.baseDebit.toFixed(4),
        baseCredit: sums.baseCredit.toFixed(4),
      });
    }

    // (8) Write phase: the returned plan is executed by the application
    //     layer inside ONE transaction (entry + lines + subledger + audit
    //     + source-status update); partial failure ⇒ full rollback.
    return {
      spec,
      fiscalPeriodId: period.id,
      exchangeRate: storedRate,
      effectiveRate: storedRate,
      lines: resolved,
    };
  }

  /** Postability probe without posting (POSTING_ENGINE.md §1). */
  async isDatePostable(entryDate: string, model: PostingReadModel): Promise<boolean> {
    const period = await model.findPeriodForDate(entryDate);
    return period !== undefined && period.status === "OPEN";
  }
}

/** Σdebit / Σcredit in document and base currency (exact decimals). */
export function balanceOf(lines: readonly { direction: Direction; amount: string; baseAmount: string }[]): {
  debit: Decimal;
  credit: Decimal;
  baseDebit: Decimal;
  baseCredit: Decimal;
} {
  let debit = new Decimal(0);
  let credit = new Decimal(0);
  let baseDebit = new Decimal(0);
  let baseCredit = new Decimal(0);
  for (const line of lines) {
    if (line.direction === "DEBIT") {
      debit = debit.plus(dec(line.amount));
      baseDebit = baseDebit.plus(dec(line.baseAmount));
    } else {
      credit = credit.plus(dec(line.amount));
      baseCredit = baseCredit.plus(dec(line.baseAmount));
    }
  }
  return { debit, credit, baseDebit, baseCredit };
}

/** Helper for callers composing specs from draft rows. */
export function lineOf(partial: Partial<JournalLineSpec> & { direction: Direction; amount: string }): JournalLineSpec {
  return {
    purpose: partial.purpose,
    accountId: partial.accountId,
    direction: partial.direction,
    amount: partial.amount,
    partnerId: partial.partnerId,
    itemId: partial.itemId,
    costCenterId: partial.costCenterId,
    taxCodeId: partial.taxCodeId,
    memo: partial.memo,
  };
}
