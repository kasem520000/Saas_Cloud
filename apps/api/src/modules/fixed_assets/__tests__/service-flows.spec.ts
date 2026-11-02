import { describe, expect, it } from "vitest";
import {
  FixedAssetsService,
  NotFoundError,
  type AssetRow,
  type CategoryRow,
  type FixedAssetsStore,
  type RunRow,
} from "../application/fixed-assets-service";
import { rc10Check } from "../domain/reconcile";
import { grnDebitLine, bindAssetRefs } from "../application/purchase-capitalization";
import { isBalanced, type CategoryAccounts } from "../application/journal-builders";
import type { JournalSpec } from "../../../modules/accounting/domain/posting-engine/journal-spec";

const ACCTS: CategoryAccounts = { assetPurpose: "FIXED_ASSET", accumPurpose: "ACCUM_DEPRECIATION", expensePurpose: "DEPRECIATION_EXPENSE" };
const OK_STATES = { asset: true, accum: true, expense: true };

function makeHarness() {
  const categories = new Map<string, CategoryRow>();
  const assets = new Map<string, AssetRow>();
  const runs = new Map<string, RunRow>();
  const disposals = new Map<string, unknown>();
  const posted: JournalSpec[] = [];
  const store: FixedAssetsStore = {
    findCategory: async (_t, id) => categories.get(id),
    findAsset: async (_t, id) => assets.get(id),
    findRunByPeriod: async (_t, p) => runs.get(p),
    createRun: async (row) => { runs.set(row.fiscalPeriodId, row as RunRow); return row as RunRow; },
    saveRun: async (r) => { runs.set(r.fiscalPeriodId, r); },
    saveAsset: async (a) => { assets.set(a.id, a); },
    createDisposal: async (d) => { disposals.set((d as { assetId: string }).assetId, d); },
    findDisposalByAsset: async (_t, a) => disposals.get(a),
    periodStatus: async () => "OPEN",
  };
  const post = async (spec: JournalSpec) => { posted.push(spec); return { entryId: `je-${posted.length}` }; };
  const svc = new FixedAssetsService(store, post);
  const cat: CategoryRow = { id: "cat-1", tenantId: "t1", code: "MACH", active: true, accounts: ACCTS, accountStates: OK_STATES };
  categories.set(cat.id, cat);
  return { svc, store, posted, cat, assets, runs, disposals };
}

const assetInput = { code: "A-001", categoryId: "cat-1", cost: "12000.0000", salvageValue: "0.0000", usefulLifeMonths: 60, method: "STRAIGHT_LINE" as const };

describe("PHASE-026 service flows", () => {
  it("asset create: valid; foreign category → typed 404, zero partial", async () => {
    const { svc, assets } = makeHarness();
    const a = await svc.createAsset("t1", assetInput);
    expect(a.status).toBe("ACTIVE");
    expect(assets.size).toBe(1);
    await expect(svc.createAsset("t1", { ...assetInput, categoryId: "nope" })).rejects.toBeInstanceOf(NotFoundError);
    expect(assets.size).toBe(1);
  });

  it("asset create: BR-041 unmapped category blocked; invalid cost/salvage rejected", async () => {
    const { svc, cat } = makeHarness();
    cat.accountStates = { ...OK_STATES, expense: false };
    await expect(svc.createAsset("t1", assetInput)).rejects.toMatchObject({ code: "PURPOSE_NOT_MAPPED" });
    cat.accountStates = OK_STATES;
    await expect(svc.createAsset("t1", { ...assetInput, cost: "-5" })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    await expect(svc.createAsset("t1", { ...assetInput, salvageValue: "12000" })).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
  });

  it("G-21 capitalize credit posts balanced AP journal (INV-009 partner line)", async () => {
    const { svc, posted } = makeHarness();
    await svc.createAsset("t1", assetInput);
    await svc.capitalize("t1", { assetId: "asset-A-001", funding: "CREDIT", partnerId: "p-1", entryDate: "2026-11-01", currency: "YER" });
    expect(posted).toHaveLength(1);
    expect(isBalanced(posted[0]!)).toBe(true);
    expect(posted[0]!.lines[1]).toMatchObject({ purpose: "AP_CONTROL", partnerId: "p-1" });
  });

  it("G-21 opening variant carries accumulated-to-date and stores it on the asset", async () => {
    const { svc, posted, assets } = makeHarness();
    await svc.createAsset("t1", assetInput);
    await svc.capitalizeOpening("t1", { assetId: "asset-A-001", accumulatedToDate: "2400.0000", entryDate: "2026-01-01", currency: "YER" });
    expect(isBalanced(posted[0]!)).toBe(true);
    expect(assets.get("asset-A-001")!.accumulated).toBe("2400.0000");
  });

  it("run assembly: duplicate period → ALREADY_POSTED (one run per period)", async () => {
    const { svc, assets } = makeHarness();
    const a = await svc.createAsset("t1", assetInput);
    assets.set(a.id, a);
    await svc.assembleRun("t1", { fiscalPeriodId: "fp-1", entryDate: "2026-11-30", currency: "YER", assets: [a] });
    await expect(svc.assembleRun("t1", { fiscalPeriodId: "fp-1", entryDate: "2026-11-30", currency: "YER", assets: [a] }))
      .rejects.toMatchObject({ code: "ALREADY_POSTED" });
  });

  it("G-22 post: LOCKED period rejected (BR-042); OPEN posts one balanced journal and flips status", async () => {
    const { svc, store, posted, cat, assets } = makeHarness();
    const a = await svc.createAsset("t1", assetInput);
    assets.set(a.id, a);
    const run = await svc.assembleRun("t1", { fiscalPeriodId: "fp-1", entryDate: "2026-11-30", currency: "YER", assets: [a] });
    store.periodStatus = async () => "LOCKED";
    await expect(svc.postRun("t1", run.id, [cat])).rejects.toMatchObject({ code: "PERIOD_LOCKED" });
    store.periodStatus = async () => "OPEN";
    const { entryId } = await svc.postRun("t1", run.id, [cat]);
    expect(entryId).toBe("je-1");
    expect(posted[0]!.source.docType).toBe("depreciation_run");
    expect(isBalanced(posted[0]!)).toBe(true);
    expect(run.status).toBe("POSTED");
  });

  it("disposal G-23: SoD enforced, asset locked, exactly-once; loss mirror in journal", async () => {
    const { svc, posted, assets, disposals } = makeHarness();
    const a = await svc.createAsset("t1", assetInput);
    a.accumulated = "11800.0000";
    assets.set(a.id, a);
    await expect(svc.dispose("t1", { assetId: a.id, kind: "SCRAP", proceeds: "0", entryDate: "2026-11-02", currency: "YER", creatorId: "u-1", approverId: "u-1" }))
      .rejects.toMatchObject({ code: "SOD_VIOLATION" });
    const r = await svc.dispose("t1", { assetId: a.id, kind: "SALE", proceeds: "500.0000", entryDate: "2026-11-02", currency: "YER", creatorId: "u-1", approverId: "u-2" });
    expect(r.gainLoss).toBe("300.0000"); // 500 − NBV 200
    expect(isBalanced(posted[0]!)).toBe(true);
    expect(posted[0]!.lines).toContainEqual({ purpose: "ASSET_DISPOSAL_GAIN", direction: "CREDIT", amount: "300.0000" });
    expect(assets.get(a.id)!.status).toBe("DISPOSED");
    expect(disposals.size).toBe(1);
    await expect(svc.dispose("t1", { assetId: a.id, kind: "SCRAP", proceeds: "0", entryDate: "2026-11-03", currency: "YER", creatorId: "u-1", approverId: "u-2" }))
      .rejects.toMatchObject({ code: "ALREADY_DISPOSED" });
  });

  it("revaluation BR-044: posts reserve journal; DISPOSED asset rejected", async () => {
    const { svc, posted, assets } = makeHarness();
    const a = await svc.createAsset("t1", assetInput);
    assets.set(a.id, a);
    await svc.postRevaluation("t1", { assetId: a.id, grossDelta: "2000.0000", accumDelta: "0.0000", reserveDelta: "-2000.0000", entryDate: "2026-11-02", currency: "YER" });
    expect(isBalanced(posted[0]!)).toBe(true);
    a.status = "DISPOSED";
    await expect(svc.postRevaluation("t1", { assetId: a.id, grossDelta: "1", accumDelta: "0", reserveDelta: "-1", entryDate: "2026-11-03", currency: "YER" }))
      .rejects.toMatchObject({ code: "ASSET_LOCKED" });
  });
});

describe("RC-10 register↔GL tie", () => {
  it("OK when register ties to GL; BROKEN with diffs on drift", () => {
    expect(rc10Check({ registerGross: "12000.0000", registerAccumulated: "200.0000", glFixedAssetBalance: "12000.0000", glAccumBalance: "200.0000" })).toEqual({ state: "OK" });
    const broken = rc10Check({ registerGross: "12000.0000", registerAccumulated: "200.0000", glFixedAssetBalance: "11800.0000", glAccumBalance: "200.0000" });
    expect(broken.state).toBe("BROKEN");
    expect(broken).toMatchObject({ grossDiff: "200.0000" });
  });
});

describe("T5 purchasing capitalization hook", () => {
  it("capital-expense GRN line debits FIXED_ASSET; normal line debits INVENTORY", () => {
    expect(grnDebitLine({ lineId: "l1", amount: "5000.0000", capitalExpense: true, categoryPurpose: "FIXED_ASSET" }))
      .toEqual({ purpose: "FIXED_ASSET", direction: "DEBIT", amount: "5000.0000" });
    expect(grnDebitLine({ lineId: "l2", amount: "100.0000", capitalExpense: false }))
      .toEqual({ purpose: "INVENTORY", direction: "DEBIT", amount: "100.0000" });
    expect(() => grnDebitLine({ lineId: "l3", amount: "1", capitalExpense: true })).toThrow(/BR-041/);
    expect(bindAssetRefs({ grnId: "g1", invoiceId: "i1" }).refs).toEqual({ poId: null, grnId: "g1", invoiceId: "i1" });
  });
});
