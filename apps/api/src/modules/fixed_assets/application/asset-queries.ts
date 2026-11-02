/**
 * PHASE-026 T11 — the fixed-assets query service consumed by the report
 * contracts (provenance: owned tables only — no source of truth → no report).
 * Read-port based so contracts stay unit-testable; the drizzle store binds
 * the port over the ambient tenant transaction.
 */
export interface AssetRegisterRow {
  code: string;
  name: string;
  categoryCode: string;
  branchCode: string | null;
  status: string;
  cost: string;
  accumulated: string;
  nbv: string;
  acquisitionDate: string;
}

export interface FixedAssetsReadPort {
  assetRegister(filter: {
    categoryCode?: string | null;
    status?: string | null;
    asOf: string;
  }): Promise<AssetRegisterRow[]>;
  depreciationSchedule(assetCode?: string | null): Promise<
    Array<{ assetCode: string; period: string; amount: string; accumulated: string }>
  >;
  movements(fromDate: string, toDate: string): Promise<
    Array<{ date: string; kind: string; assetCode: string; amount: string }>
  >;
}

/** Thin service wrapper (mirrors the other module query services' shape). */
export class FixedAssetsQueriesService {
  constructor(private readonly port: FixedAssetsReadPort) {}
  assetRegister(filter: Parameters<FixedAssetsReadPort["assetRegister"]>[0]) {
    return this.port.assetRegister(filter);
  }
  depreciationSchedule(assetCode?: string | null) {
    return this.port.depreciationSchedule(assetCode);
  }
  movements(fromDate: string, toDate: string) {
    return this.port.movements(fromDate, toDate);
  }
}
