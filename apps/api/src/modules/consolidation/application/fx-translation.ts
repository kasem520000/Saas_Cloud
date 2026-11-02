/**
 * PHASE-034 T7 — FX translation for consolidation runs (ADR-0018 §4, INV-008):
 * dated stored rates from `exchange_rates` (base-per-1-foreign, > 0), never
 * recomputed; missing rate is fail-closed (RATE_MISSING). Method comes from
 * the group config only (OQ-V2-2 resolved in DR-006 §4: CLOSING_RATE default,
 * per-group override TEMPORAL).
 */
import { sql } from "drizzle-orm";

import { ambientTx } from "../../../infra/db/tenant-context";
import { FxRateMissingError } from "../domain/consolidation-errors";

/** Dated stored rate lookup inside the ambient tenant (rates are tenant-owned). */
export async function datedRate(currency: string, asOf: string, _baseCurrency: string): Promise<string> {
  if (currency === _baseCurrency) return "1";
  const tx = ambientTx();
  if (tx === undefined) throw new Error("datedRate requires a tenant context");
  const rows = await tx.execute(sql<{ rate: string }>`
    SELECT rate::text AS rate FROM exchange_rates
     WHERE tenant_id = erp.current_tenant_id()
       AND currency_code = ${currency}
       AND rate_date <= ${asOf}
     ORDER BY rate_date DESC LIMIT 1
  `);
  const rate = (rows.rows[0] as { rate: string } | undefined)?.rate;
  if (rate === undefined || Number(rate) <= 0) throw new FxRateMissingError(currency, asOf);
  return rate;
}

/** Translate a document amount into the group base currency (INV-008: amount × stored rate). */
export async function translate(amount: string, currency: string, asOf: string, baseCurrency: string): Promise<string> {
  if (currency === baseCurrency) return amount;
  const rate = await datedRate(currency, asOf, baseCurrency);
  // decimal-string multiply at 8dp, half-up — reuse domain-core Decimal.
  const { Decimal } = await import("@erp/domain-core");
  return new Decimal(amount).mul(new Decimal(rate)).toFixed(8);
}
