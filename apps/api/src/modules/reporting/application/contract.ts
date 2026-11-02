import type { z } from "zod";

/**
 * PHASE-013 · report contract types (REPORT_CONTRACT.md §1–§2, normative).
 * A report IS its contract: identity, parameters, scope, permission,
 * currency handling, data sources, aggregation, drill-down, exports,
 * localization, freshness, and reconciliation assertions. Contracts are
 * code-defined TypeScript modules (REPORTING_ARCHITECTURE §2) — tenants
 * save parameter sets, never new logic.
 */

export type Bilingual = { readonly ar: string; readonly en: string };

export type ReportCategory =
  | "financial"
  | "ar-ap"
  | "sales"
  | "purchasing"
  | "inventory"
  | "treasury"
  | "tax"
  | "platform"
  | "industry"
  | "services"
  | "fixed-assets";

export type DataSourceModule =
  | "accounting"
  | "sales"
  | "purchasing"
  | "inventory"
  | "treasury"
  | "tax"
  | "partners"
  | "audit"
  | "identity"
  | "tenancy"
  | "reporting"
  | "distribution"
  | "manufacturing"
  | "crm"
  | "fixed_assets";

export interface DataSourceDecl {
  readonly module: DataSourceModule;
  readonly service: string;
  readonly tables: readonly string[];
  readonly purpose: Bilingual;
}

export interface MeasureDecl {
  readonly id: string;
  readonly kind: "sum" | "count" | "balance" | "derived";
  readonly source?: string;
  readonly rounding?: string;
}

export interface DrillTargetDecl {
  readonly from: string;
  readonly route: string;
  readonly label: Bilingual;
  /** Permission required at the hop (checked at link generation, §4). */
  readonly permission: string;
}

export interface AssertionDecl {
  readonly id: string;
  readonly invariant?: string;
  readonly check: string;
  readonly onFailure: "block-export";
  readonly message: Bilingual;
}

export type ExecutionClass = "inline" | "job";

/** Contract-level metadata (REPORT_CONTRACT §1) + the executable runner. */
export interface ReportContract {
  readonly id: string;
  readonly version: number;
  readonly title: Bilingual;
  readonly category: ReportCategory;
  readonly description: Bilingual;

  /** Zod schema for the run parameters (validated before execution). */
  readonly parameters: z.ZodType<ReportParams>;

  readonly scopeRules: {
    readonly tenant: true;
    readonly branches: "required" | "optional" | "fixed-all";
    readonly warehouses?: "optional" | "required";
    readonly costCenters?: "optional";
    readonly dateRange: "required" | "optional";
    readonly asOf: "required" | "optional" | "forbidden";
  };

  readonly requiredPermission: string;

  readonly currencyHandling: {
    readonly presentation: "base" | "document" | "both";
    readonly method: "posted-rates";
  };

  readonly dataSources: readonly DataSourceDecl[];

  readonly aggregation: {
    readonly groupBy: readonly string[];
    readonly measures: readonly MeasureDecl[];
    readonly sorting: readonly { by: string; dir: "asc" | "desc" }[];
    readonly zeroSuppression: "rows" | "none";
  };

  readonly totals: {
    readonly rowTotals: boolean;
    readonly grandTotals: "sum" | "balance-check" | "none";
    readonly subTotalsByGroup: boolean;
  };

  readonly drillTargets: readonly DrillTargetDecl[];

  readonly exportFormats: readonly ("pdf" | "xlsx" | "csv")[];
  readonly printTemplate?: "a4-report" | "a4-document";

  readonly localization: {
    readonly numerals: "western";
    readonly direction: "per-run-locale";
    readonly labels: "registry-bilingual";
  };

  readonly freshness: {
    readonly semantics: "as-of" | "current";
    readonly cacheTtlSeconds: number;
    readonly invalidationEvents: readonly string[];
  };

  readonly assertions: readonly AssertionDecl[];

  /** Inline vs pg-boss job (REPORTING_ARCHITECTURE §3). */
  readonly executionClass: ExecutionClass;

  /**
   * The executable derivation (ADR-0011: read-only through module-owned
   * authorized query services — never raw cross-module SQL). Returns the
   * result content; the run service wraps it into the stored envelope.
   */
  readonly run: (ctx: RunContext, params: ReportParams) => Promise<ReportContent>;
}

/** Normalized run parameters (REPORT_CONTRACT §1 required keys). */
export interface ReportParams {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly asOf?: string | null;
  readonly asOfDate?: string;
  readonly period?: string;
  readonly branchIds?: readonly string[] | null;
  readonly warehouseIds?: readonly string[] | null;
  readonly partnerId?: string;
  readonly partnerIds?: readonly string[];
  readonly customerId?: string;
  readonly supplierId?: string;
  readonly itemId?: string;
  readonly vehicleId?: string;
  readonly repId?: string;
  readonly routeId?: string;
  readonly batchId?: string;
  readonly traceDirection?: string;
  readonly customerIds?: readonly string[];
  readonly supplierIds?: readonly string[];
  readonly repIds?: readonly string[];
  readonly categoryIds?: readonly string[];
  readonly fiscalYearId?: string;
  readonly jurisdiction?: string;
  readonly currency?: "base" | "document";
  readonly locale: "ar" | "en";
  readonly grouping?: string;
  readonly zeroSuppression?: boolean;
  readonly includeOpening?: boolean;
  readonly comparative?: "none" | "prior-period" | "prior-year";
  readonly buckets?: readonly string[];
  readonly status?: string;
  readonly sourceType?: string;
  readonly exceptionType?: string;
  readonly noSaleDays?: number;
  readonly varianceThreshold?: string;
  readonly countSessionId?: string;
  readonly serial?: string;
  readonly direction?: "sales" | "purchases";
  readonly role?: "CUSTOMER" | "SUPPLIER";
  readonly dimension?: string;
  readonly action?: string;
  readonly onlyNegative?: boolean;
  readonly openOnly?: boolean;
  readonly accountId?: string;
  readonly accountIds?: readonly string[];
  readonly costCenterId?: string;
  readonly cashAccountId?: string;
  readonly userId?: string;
  readonly reportKey?: string;
  readonly runStatus?: string;
  readonly entryType?: string;
  readonly matchResult?: string;
  [key: string]: unknown;
}

/** Effective execution context (scope intersection applied, §3–§5). */
export interface RunContext {
  readonly tenantId: string;
  readonly userId: string | null;
  /** Effective branch scope AFTER intersection with grants (null = all). */
  readonly effectiveBranchIds: readonly string[] | null;
  readonly baseCurrency: string;
  readonly permissions: ReadonlySet<string>;
  readonly correlationId?: string;
}

/** Result content produced by a contract's run() (envelope minus chrome). */
export interface ReportContent {
  readonly columns: readonly ReportColumn[];
  readonly groups: readonly ReportGroup[];
  readonly rows: readonly ReportRow[];
  readonly totals: readonly ReportTotal[];
  /** Assertion results (executable checks — REPORT_RECONCILIATION §1). */
  readonly assertionResults: readonly AssertionResult[];
  /** Optional statement-level notes (e.g. the CF indirect-method limitation). */
  readonly notes?: readonly Bilingual[];
}

export interface ReportColumn {
  readonly id: string;
  readonly label: Bilingual;
  readonly type: "text" | "money" | "qty" | "date" | "status" | "link";
  readonly numeric?: boolean;
  readonly widthHint?: number;
}

export interface ReportGroup {
  readonly key: string;
  readonly label: Bilingual;
  readonly subtotal?: Record<string, string>;
}

export interface ReportRow {
  readonly key: string;
  readonly values: Record<string, string | number | null>;
  readonly groupKey?: string;
  readonly drillLinks?: readonly DrillLink[];
}

export interface DrillLink {
  readonly label: Bilingual;
  readonly route: string;
}

export interface ReportTotal {
  readonly id: string;
  readonly label: Bilingual;
  readonly amount: string;
  readonly kind: "sum" | "check";
}

export interface AssertionResult {
  readonly id: string;
  readonly status: "PASS" | "FAIL";
  readonly detail?: Bilingual;
  /** The exact compared values (persisted for audit review, §1.5). */
  readonly compared?: { readonly left: string; readonly right: string };
}

/** The stored runtime result envelope (REPORT_CONTRACT §2, normative). */
export interface ReportResult {
  readonly reportId: string;
  readonly contractVersion: number;
  readonly runId: string;
  readonly paramsEcho: Record<string, unknown>;
  readonly columns: readonly ReportColumn[];
  readonly groups: readonly ReportGroup[];
  readonly rows: readonly ReportRow[];
  readonly totals: readonly ReportTotal[];
  readonly assertions: readonly AssertionResult[];
  readonly freshness: {
    readonly computedAt: string;
    readonly asOf?: string | null;
    readonly cacheState: "fresh" | "stale" | "recomputed";
  };
  readonly formatting: {
    readonly baseCurrency: string;
    readonly numerals: "western";
    readonly locale: "ar" | "en";
  };
  readonly notes?: readonly Bilingual[];
}

/** Registry snapshot row (navigation + command menu, §2). */
export interface RegistrySnapshotRow {
  readonly id: string;
  readonly title: Bilingual;
  readonly category: ReportCategory;
  readonly requiredPermission: string;
  readonly version: number;
  readonly executionClass: ExecutionClass;
  readonly exportFormats: readonly string[];
  readonly semantics: "as-of" | "current";
}
