/**
 * PHASE-027 T8/T10/T11 — installment plan service over ports: activation with
 * BR-048 total equality, immutable schedule, collections, waive, flat late fee
 * (G-28). Plans are a collection overlay — no new AR open items (INV-016 tie).
 */
import { Decimal } from "@erp/domain-core";

import {
  assertPlanTotalEqualsSource,
  buildSchedule,
  computeFlatLateFee,
  isOverdue,
  InstallmentRuleError,
  type Frequency,
  type ScheduleLine,
} from "../domain/schedule";
import { buildG28LateFee } from "../../notes/application/journal-builders";
import type { JournalSpec } from "../../../modules/accounting/domain/posting-engine/journal-spec";

export interface PlanRow {
  id: string;
  tenantId: string;
  partnerId: string;
  sourceType: string;
  sourceId: string;
  totalAmount: string;
  downPayment: string;
  count: number;
  startDate: string;
  frequency: Frequency;
  lateFeePolicy: { rate: string; cap?: string; graceDays?: number };
  status: "DRAFT" | "ACTIVE" | "CLOSED" | "DEFAULTED";
}
export interface PlanLineRow extends ScheduleLine {
  id: string;
  planId: string;
  status: "PENDING" | "DUE" | "PAID" | "OVERDUE" | "WAIVED";
  collected: string;
  receiptRefs: string[];
}

export interface PlansStore {
  findSourceDoc(tenantId: string, sourceType: string, sourceId: string): Promise<{ total: string } | undefined>;
  findPlan(tenantId: string, id: string): Promise<PlanRow | undefined>;
  savePlan(plan: PlanRow): Promise<void>;
  saveLines(lines: PlanLineRow[]): Promise<void>;
  lines(planId: string): Promise<PlanLineRow[]>;
  saveLine(line: PlanLineRow): Promise<void>;
  listActivePlans(tenantId: string): Promise<PlanRow[]>;
}

export type PostPort = (spec: JournalSpec) => Promise<{ entryId: string }>;

export class PlanNotFoundError extends Error {
  constructor(id: string) {
    super(`installment plan not found in this tenant: ${id}`);
    this.name = "PlanNotFoundError";
  }
}

export class InstallmentsService {
  constructor(
    private readonly store: PlansStore,
    private readonly post: PostPort,
  ) {}

  /** Create DRAFT plan and build the schedule (not yet immutable). */
  async createPlan(tenantId: string, input: Omit<PlanRow, "id" | "tenantId" | "status">) {
    const source = await this.store.findSourceDoc(tenantId, input.sourceType, input.sourceId);
    if (!source) throw new PlanNotFoundError(`source:${input.sourceId}`); // typed 404
    assertPlanTotalEqualsSource(input.totalAmount, source.total, input.downPayment);
    const plan: PlanRow = { ...input, id: `plan-${input.sourceId}`, tenantId, status: "DRAFT" };
    await this.store.savePlan(plan);
    const lines: PlanLineRow[] = buildSchedule({ total: input.totalAmount, count: input.count, startDate: input.startDate, frequency: input.frequency })
      .map((l) => ({ ...l, id: `${plan.id}-L${l.seq}`, planId: plan.id, status: "PENDING" as const, collected: "0.0000", receiptRefs: [] }));
    await this.store.saveLines(lines);
    return { plan, lines };
  }

  /** Activate: schedule becomes immutable (BR-048). */
  async activate(tenantId: string, planId: string) {
    const plan = await this.store.findPlan(tenantId, planId);
    if (!plan) throw new PlanNotFoundError(planId);
    if (plan.status !== "DRAFT") throw new InstallmentRuleError("SCHEDULE_IMMUTABLE", "only a DRAFT plan can be activated (BR-048)");
    plan.status = "ACTIVE";
    await this.store.savePlan(plan);
    return plan;
  }

  /** Collect a receipt amount against the earliest unpaid line (INV-016 bounds). */
  async collect(tenantId: string, planId: string, amount: string, receiptRef: string) {
    const plan = await this.store.findPlan(tenantId, planId);
    if (!plan) throw new PlanNotFoundError(planId);
    if (plan.status !== "ACTIVE") throw new InstallmentRuleError("SCHEDULE_IMMUTABLE", "plan not ACTIVE");
    const lines = (await this.store.lines(planId)).sort((a, b) => a.seq - b.seq);
    let remaining = new Decimal(amount);
    for (const line of lines) {
      if (remaining.lte(0)) break;
      if (line.status === "PAID" || line.status === "WAIVED") continue;
      const outstanding = new Decimal(line.amount).minus(line.collected);
      const apply = remaining.gte(outstanding) ? outstanding : remaining;
      line.collected = new Decimal(line.collected).add(apply).toFixed(4);
      line.receiptRefs = [...line.receiptRefs, receiptRef];
      if (new Decimal(line.collected).gte(new Decimal(line.amount))) line.status = "PAID";
      remaining = remaining.minus(apply);
      await this.store.saveLine(line);
    }
    if (remaining.gt(0)) throw new InstallmentRuleError("INV016_BOUNDS", "collection exceeds outstanding plan lines (INV-016)");
    return lines;
  }

  /** WAIVE: single manual transition — permission-gated at the edge, reason + audit here. */
  async waive(_tenantId: string, planId: string, lineId: string, reason: string) {
    if (!reason.trim()) throw new InstallmentRuleError("REASON_REQUIRED", "waive requires a reason");
    const line = (await this.store.lines(planId)).find((l) => l.id === lineId);
    if (!line) throw new PlanNotFoundError(`line:${lineId}`);
    line.status = "WAIVED";
    await this.store.saveLine(line);
    return line;
  }

  /** Job-derived OVERDUE recompute (T9) — the ONLY path that writes OVERDUE;
   *  idempotent; no manual status writes exist by construction. */
  async recomputeOverdue(_tenantId: string, asOf: string) {
    const plans = await this.store.listActivePlans(_tenantId);
    let flipped = 0;
    for (const plan of plans) {
      const grace = plan.lateFeePolicy.graceDays ?? 0;
      for (const line of await this.store.lines(plan.id)) {
        const overdue = isOverdue(line.dueDate, line.status, asOf, grace);
        const shouldBe = overdue ? "OVERDUE" : line.status === "OVERDUE" ? "PENDING" : line.status;
        if (shouldBe !== line.status) {
          line.status = shouldBe as PlanLineRow["status"];
          flipped++;
          await this.store.saveLine(line);
        }
      }
    }
    return { derived: true, asOf, flipped };
  }

  /** G-28 flat late fee on an overdue line — engine-only posting, cap honored, no compounding. */
  async chargeLateFee(tenantId: string, planId: string, lineId: string, entryDate: string) {
    const plan = await this.store.findPlan(tenantId, planId);
    if (!plan) throw new PlanNotFoundError(planId);
    const line = (await this.store.lines(planId)).find((l) => l.id === lineId);
    if (!line) throw new PlanNotFoundError(`line:${lineId}`);
    const grace = plan.lateFeePolicy.graceDays ?? 0;
    if (!isOverdue(line.dueDate, line.status, entryDate, grace)) {
      throw new InstallmentRuleError("NOT_OVERDUE", "late fee only on overdue lines (job-derived)");
    }
    const overdueAmount = new Decimal(line.amount).minus(line.collected).toFixed(4);
    const fee = computeFlatLateFee(overdueAmount, plan.lateFeePolicy);
    if (Number(fee) <= 0) return { fee, entryId: null };
    const { entryId } = await this.post(
      buildG28LateFee({ planId, lineId, entryDate, currency: "YER", amount: fee, partnerId: plan.partnerId }),
    );
    return { fee, entryId };
  }
}
