/**
 * PHASE-026 — application services over ports (store + posting), so the full
 * flow is unit-testable without infrastructure. The NestJS controller and
 * drizzle store bind these ports; ADR-0007: posting only via JournalSpec.
 */
import { computePeriodDepreciation, disposalGainLoss, nbv } from "../domain/depreciation-math";
import {
  assertCategoryUsable,
  assertDisposable,
  assertRevaluable,
  assertRunPostable,
  assertSeparationOfDuties,
  assertValidCostSalage,
  FixedAssetsRuleError,
  type AssetStatus,
} from "../domain/fixed-assets-rules";
import {
  buildG21Cash,
  buildG21Credit,
  buildG21Opening,
  buildG22Run,
  buildG23Disposal,
  buildRevaluation,
  type CategoryAccounts,
} from "./journal-builders";
import type { JournalSpec } from "../../accounting/domain/posting-engine/journal-spec";

export interface CategoryRow {
  id: string;
  tenantId: string;
  code: string;
  active: boolean;
  accounts: CategoryAccounts;
  accountStates: { asset: boolean; accum: boolean; expense: boolean };
}
export interface AssetRow {
  id: string;
  tenantId: string;
  code: string;
  categoryId: string;
  cost: string;
  salvageValue: string;
  usefulLifeMonths: number;
  method: "STRAIGHT_LINE" | "DECLINING_BALANCE" | "UNITS_OF_PRODUCTION";
  status: AssetStatus;
  accumulated: string;
}
export interface RunRow {
  id: string;
  tenantId: string;
  fiscalPeriodId: string;
  status: "DRAFT" | "POSTED" | "REVERSED";
  lines: Array<{ assetId: string; periodAmount: string; accumulatedAfter: string }>;
}

export interface FixedAssetsStore {
  findCategory(tenantId: string, id: string): Promise<CategoryRow | undefined>;
  findAsset(tenantId: string, id: string): Promise<AssetRow | undefined>;
  findRunByPeriod(tenantId: string, fiscalPeriodId: string): Promise<RunRow | undefined>;
  createRun(row: Omit<RunRow, "status"> & { status: RunRow["status"] }): Promise<RunRow>;
  saveRun(run: RunRow): Promise<void>;
  saveAsset(asset: AssetRow): Promise<void>;
  createDisposal(d: Record<string, unknown>): Promise<void>;
  findDisposalByAsset(tenantId: string, assetId: string): Promise<unknown | undefined>;
  periodStatus(tenantId: string, fiscalPeriodId: string): Promise<"OPEN" | "SOFT_CLOSED" | "LOCKED">;
}

/** Posting port: returns the journal entry id (INV-013 idempotent inside). */
export type PostPort = (spec: JournalSpec) => Promise<{ entryId: string }>;

export class NotFoundError extends Error {
  constructor(kind: string, id: string) {
    super(`${kind} not found in this tenant: ${id}`);
    this.name = "NotFoundError"; // typed 404 at the HTTP edge (S-04/A7)
  }
}

export class FixedAssetsService {
  constructor(
    private readonly store: FixedAssetsStore,
    private readonly post: PostPort,
  ) {}

  private async categoryOr404(tenantId: string, categoryId: string): Promise<CategoryRow> {
    const c = await this.store.findCategory(tenantId, categoryId);
    if (!c) throw new NotFoundError("asset_category", categoryId);
    return c;
  }

  async createAsset(tenantId: string, input: Omit<AssetRow, "id" | "tenantId" | "status" | "accumulated">) {
    assertValidCostSalage(input.cost, input.salvageValue);
    const category = await this.categoryOr404(tenantId, input.categoryId);
    assertCategoryUsable({
      assetAccountActive: category.accountStates.asset,
      accumAccountActive: category.accountStates.accum,
      expenseAccountActive: category.accountStates.expense,
    });
    const asset: AssetRow = { ...input, id: `asset-${input.code}`, tenantId, status: "ACTIVE", accumulated: "0.0000" };
    await this.store.saveAsset(asset);
    return asset;
  }

  /** G-21 direct capitalization — credit (AP) or cash funding. */
  async capitalize(tenantId: string, input: {
    assetId: string; funding: "CREDIT" | "CASH"; partnerId?: string;
    entryDate: string; currency: string; reference?: string;
  }) {
    const asset = await this.store.findAsset(tenantId, input.assetId);
    if (!asset) throw new NotFoundError("asset", input.assetId);
    const category = await this.categoryOr404(tenantId, asset.categoryId);
    assertCategoryUsable({
      assetAccountActive: category.accountStates.asset,
      accumAccountActive: category.accountStates.accum,
      expenseAccountActive: category.accountStates.expense,
    });
    const spec =
      input.funding === "CREDIT"
        ? buildG21Credit({ docId: asset.id, entryDate: input.entryDate, currency: input.currency, amount: asset.cost, partnerId: input.partnerId ?? "", accounts: category.accounts, reference: input.reference })
        : buildG21Cash({ docId: asset.id, entryDate: input.entryDate, currency: input.currency, amount: asset.cost, accounts: category.accounts, reference: input.reference });
    return this.post(spec);
  }

  /** G-21 opening variant with accumulated-to-date (INV-023 from day one). */
  async capitalizeOpening(tenantId: string, input: { assetId: string; accumulatedToDate: string; entryDate: string; currency: string }) {
    const asset = await this.store.findAsset(tenantId, input.assetId);
    if (!asset) throw new NotFoundError("asset", input.assetId);
    const category = await this.categoryOr404(tenantId, asset.categoryId);
    const spec = buildG21Opening({ docId: asset.id, entryDate: input.entryDate, currency: input.currency, cost: asset.cost, accumulatedToDate: input.accumulatedToDate, accounts: category.accounts });
    const { entryId } = await this.post(spec);
    asset.accumulated = input.accumulatedToDate;
    await this.store.saveAsset(asset);
    return { entryId };
  }

  /** Assemble a depreciation run for a period: one per (tenant, period) — 409 on duplicate. */
  async assembleRun(tenantId: string, input: { fiscalPeriodId: string; entryDate: string; currency: string; assets: AssetRow[] }) {
    const existing = await this.store.findRunByPeriod(tenantId, input.fiscalPeriodId);
    if (existing) throw new FixedAssetsRuleError("ALREADY_POSTED", "A depreciation run already exists for this fiscal period (one per period)");
    const lines = input.assets
      .filter((a) => a.status === "ACTIVE")
      .map((a) => {
        const r = computePeriodDepreciation({
          cost: a.cost, salvageValue: a.salvageValue, usefulLifeMonths: a.usefulLifeMonths,
          method: a.method, openingNbv: nbv(a.cost, a.accumulated), accumulatedToDate: a.accumulated,
          monthsElapsed: 1,
        });
        return { assetId: a.id, periodAmount: r.periodAmount, accumulatedAfter: r.accumulatedAfter };
      });
    return this.store.createRun({ id: `run-${input.fiscalPeriodId}`, tenantId, fiscalPeriodId: input.fiscalPeriodId, status: "DRAFT", lines });
  }

  /** G-22 post: period-locked rejection (BR-042/INV-011), one journal per run, FULLY_DEPRECIATED flip. */
  async postRun(tenantId: string, runId: string, categories: CategoryRow[]) {
    const run = await this.store.findRunByPeriod(tenantId, runId.replace("run-", ""));
    const full = run ?? (await this.store.findRunByPeriod(tenantId, runId)) ?? undefined;
    if (!full) throw new NotFoundError("depreciation_run", runId);
    const periodStatus = await this.store.periodStatus(tenantId, full.fiscalPeriodId);
    assertRunPostable(periodStatus);
    const categoryTotals = categories.map((c) => ({
      accounts: c.accounts,
      amount: full.lines.reduce((s, l) => s + Number(l.periodAmount), 0).toFixed(4),
    }));
    const spec = buildG22Run({ runId: full.id, entryDate: new Date().toISOString().slice(0, 10), currency: "YER", categoryTotals });
    const { entryId } = await this.post(spec);
    full.status = "POSTED";
    await this.store.saveRun(full);
    return { entryId };
  }

  /** BR-044 revaluation post (reserve journal). */
  async postRevaluation(tenantId: string, input: { assetId: string; grossDelta: string; accumDelta: string; reserveDelta: string; entryDate: string; currency: string }) {
    const asset = await this.store.findAsset(tenantId, input.assetId);
    if (!asset) throw new NotFoundError("asset", input.assetId);
    assertRevaluable(asset.status);
    const category = await this.categoryOr404(tenantId, asset.categoryId);
    const spec = buildRevaluation({ docId: `rev-${asset.id}`, entryDate: input.entryDate, currency: input.currency, grossDelta: input.grossDelta, accumDelta: input.accumDelta, reserveDelta: input.reserveDelta, accounts: category.accounts });
    return this.post(spec);
  }

  /** G-23 disposal: exactly-once lock (INV-023), NBV floor, mandatory loss mirror, SoD second-user approval. */
  async dispose(tenantId: string, input: {
    assetId: string; kind: "SALE" | "SCRAP"; proceeds: string;
    entryDate: string; currency: string; creatorId: string; approverId: string; reference?: string;
  }) {
    if (await this.store.findDisposalByAsset(tenantId, input.assetId)) {
      throw new FixedAssetsRuleError("ALREADY_DISPOSED", "Asset already has a disposal (INV-023: exactly once)");
    }
    const asset = await this.store.findAsset(tenantId, input.assetId);
    if (!asset) throw new NotFoundError("asset", input.assetId);
    const currentNbv = nbv(asset.cost, asset.accumulated);
    assertDisposable({ status: asset.status, salvageValue: asset.salvageValue, netBookValue: currentNbv });
    assertSeparationOfDuties(input.creatorId, input.approverId);
    const category = await this.categoryOr404(tenantId, asset.categoryId);
    const gainLoss = disposalGainLoss(input.proceeds, currentNbv);
    const spec = buildG23Disposal({
      docId: `disp-${asset.id}`, entryDate: input.entryDate, currency: input.currency,
      proceeds: input.proceeds, accumulated: asset.accumulated, cost: asset.cost, gainLoss,
      accounts: category.accounts, reference: input.reference,
    });
    const { entryId } = await this.post(spec);
    asset.status = "DISPOSED"; // BR-043: disposal locks the asset
    await this.store.saveAsset(asset);
    await this.store.createDisposal({ assetId: asset.id, kind: input.kind, proceeds: input.proceeds, netBookValue: currentNbv, gainLoss, journalEntryId: entryId, createdBy: input.creatorId, approvedBy: input.approverId });
    return { entryId, gainLoss };
  }
}
