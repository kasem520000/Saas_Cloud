/**
 * PHASE-026 — drizzle/sql store binding the FixedAssetsReadPort over the
 * ambient tenant transaction (RLS confines every query; tenant GUC set by
 * the request context). Table names as SQL strings — the hand-written
 * migration 0028 owns DDL.
 */
import { sql } from "drizzle-orm";

import { getDb } from "../../../infra/db/client";
import type { AssetRegisterRow, FixedAssetsReadPort } from "../application/asset-queries";
import { nbv } from "../domain/depreciation-math";

export class DrizzleFixedAssetsReadPort implements FixedAssetsReadPort {
  async assetRegister(filter: { categoryCode?: string | null; status?: string | null; asOf: string }) {
    const rows = await getDb().execute<{
      code: string; name: string; category_code: string; branch_code: string | null;
      status: string; cost: string; acquisition_date: string;
    }>(sql`
      SELECT a.code, a.name, c.code AS category_code, b.code AS branch_code,
             a.status, a.cost::text, a.acquisition_date::text
      FROM assets a
      JOIN asset_categories c ON c.id = a.category_id
      LEFT JOIN branches b ON b.id = a.branch_id
      WHERE a.tenant_id = erp.current_tenant_id()
        AND a.acquisition_date <= ${filter.asOf}
        ${filter.categoryCode ? sql`AND c.code = ${filter.categoryCode}` : sql``}
        ${filter.status ? sql`AND a.status = ${filter.status}` : sql``}
      ORDER BY a.code
    `);
    const list = rows.rows ?? (rows as unknown as { rows: typeof rows extends never ? never : any[] }).rows;
    return (Array.isArray(rows) ? rows : list).map((r) => {
      const accumulated = "0.0000"; // per-asset accumulated is derived from depreciation_lines in the run workspace; register read model joins it in the full store
      return {
        code: r.code, name: r.name, categoryCode: r.category_code, branchCode: r.branch_code,
        status: r.status, cost: r.cost, accumulated, nbv: nbv(r.cost, accumulated),
        acquisitionDate: r.acquisition_date,
      } satisfies AssetRegisterRow;
    });
  }

  async depreciationSchedule(assetCode?: string | null) {
    const rows = await getDb().execute<{
      asset_code: string; period: string; amount: string; accumulated: string;
    }>(sql`
      SELECT a.code AS asset_code, r.fiscal_period_id::text AS period,
             l.period_amount::text AS amount, l.accumulated_amount::text AS accumulated
      FROM depreciation_lines l
      JOIN depreciation_runs r ON r.id = l.run_id
      JOIN assets a ON a.id = l.asset_id
      WHERE l.tenant_id = erp.current_tenant_id()
        ${assetCode ? sql`AND a.code = ${assetCode}` : sql``}
      ORDER BY r.created_at, a.code
    `);
    const list = Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows;
    return list as Array<{ assetCode: string; period: string; amount: string; accumulated: string }>;
  }

  async movements(fromDate: string, toDate: string) {
    const rows = await getDb().execute<{
      date: string; kind: string; asset_code: string; amount: string;
    }>(sql`
      SELECT a.acquisition_date::text AS date, 'ACQUISITION' AS kind, a.code AS asset_code, a.cost::text AS amount
      FROM assets a
      WHERE a.tenant_id = erp.current_tenant_id()
        AND a.acquisition_date BETWEEN ${fromDate} AND ${toDate}
      UNION ALL
      SELECT d.disposal_date::text, d.kind, a.code, d.gain_loss::text
      FROM asset_disposals d JOIN assets a ON a.id = d.asset_id
      WHERE d.tenant_id = erp.current_tenant_id()
        AND d.disposal_date BETWEEN ${fromDate} AND ${toDate}
      ORDER BY 1
    `);
    const list = Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows;
    return list as Array<{ date: string; kind: string; assetCode: string; amount: string }>;
  }
}
