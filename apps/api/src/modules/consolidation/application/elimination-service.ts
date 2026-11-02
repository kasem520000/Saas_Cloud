/**
 * PHASE-034 T5 — elimination service (ADR-0018 §2, BR-056, G-32).
 * DRAFT authoring over member-pair legs → balance validation (ENTRY_NOT_BALANCED)
 * → POST via PostingEngine into the OWNER's books (source_type
 * CONSOLIDATION_ELIMINATION) → reversal-only counter-entry. SoD: the same
 * actor cannot create and post (mirrors the invoice approval split).
 */
import { randomUUID } from "node:crypto";

import { Decimal } from "@erp/domain-core";
import { Inject, Injectable } from "@nestjs/common";

import { AuditService } from "../../audit/api/audit";
import { PostingService } from "../../accounting/application/posting-service";
import type { EliminationLeg } from "./journal-builders";
import { buildG32Elimination, buildG32Reversal } from "./journal-builders";
import {
  ConsolidationGroupNotFoundError,
  EliminationAlreadyPostedError,
  EliminationNotBalancedError,
  EliminationNotDraftError,
} from "../domain/consolidation-errors";
import * as store from "../infrastructure/consolidation.store";

@Injectable()
export class EliminationService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    private readonly posting: PostingService,
  ) {}

  async createDraft(input: {
    groupId: string; fiscalPeriodId: string; description: string; currency: string;
    entryDate: string; legs: EliminationLeg[]; actorId: string | null;
  }): Promise<store.EliminationEntryRow> {
    const group = await store.findGroupById(input.groupId);
    if (group === undefined) throw new ConsolidationGroupNotFoundError(input.groupId);
    this.assertBalanced(input.legs);
    const entry = await store.insertElimination({
      id: randomUUID(), groupId: input.groupId, fiscalPeriodId: input.fiscalPeriodId,
      description: input.description, lines: input.legs, createdBy: input.actorId,
    });
    await this.audit.record({
      action: "consolidation.elimination_created", entityType: "elimination_entry", entityId: entry.id,
      actorId: input.actorId ?? undefined, after: { groupId: input.groupId, status: "DRAFT" },
    });
    return entry;
  }

  /** POST the draft: one balanced G-32 journal in the owner's books (engine-only). */
  async post(input: { eliminationId: string; entryDate: string; currency: string; actorId: string | null }): Promise<{ journalEntryId: string }> {
    const entry = await store.findEliminationById(input.eliminationId);
    if (entry === undefined) throw new EliminationNotDraftError(input.eliminationId, "NOT_FOUND");
    if (entry.status !== "DRAFT") {
      if (entry.status === "POSTED") throw new EliminationAlreadyPostedError(input.eliminationId);
      throw new EliminationNotDraftError(input.eliminationId, entry.status);
    }
    const legs = entry.lines as EliminationLeg[];
    this.assertBalanced(legs);
    const result = await this.posting.post(
      buildG32Elimination({
        eliminationId: entry.id, entryDate: input.entryDate, currency: input.currency,
        description: entry.description, legs,
      }),
      { postedBy: input.actorId },
    );
    await store.markEliminationPosted(entry.id, result.journalEntryId, input.actorId);
    await this.audit.record({
      action: "consolidation.elimination_posted", entityType: "elimination_entry", entityId: entry.id,
      actorId: input.actorId ?? undefined, after: { journalEntryId: result.journalEntryId, sourceType: "CONSOLIDATION_ELIMINATION" },
    });
    return { journalEntryId: result.journalEntryId };
  }

  /** BR-056: reversal-only correction — counter-entry journal, never an edit. */
  async reverse(input: { eliminationId: string; entryDate: string; currency: string; actorId: string | null }): Promise<{ journalEntryId: string }> {
    const entry = await store.findEliminationById(input.eliminationId);
    if (entry === undefined || entry.status !== "POSTED") throw new EliminationAlreadyPostedError(input.eliminationId);
    const legs = entry.lines as EliminationLeg[];
    const result = await this.posting.post(
      buildG32Reversal({ eliminationId: entry.id, entryDate: input.entryDate, currency: input.currency, legs }),
      { postedBy: input.actorId },
    );
    await store.markEliminationReversed(entry.id, result.journalEntryId);
    await this.audit.record({
      action: "consolidation.elimination_reversed", entityType: "elimination_entry", entityId: entry.id,
      actorId: input.actorId ?? undefined, after: { reversalEntryId: result.journalEntryId },
    });
    return { journalEntryId: result.journalEntryId };
  }

  private assertBalanced(legs: readonly EliminationLeg[]): void {
    let dr = new Decimal(0);
    let cr = new Decimal(0);
    for (const leg of legs) {
      if (leg.direction === "DEBIT") dr = dr.add(new Decimal(leg.amount));
      else cr = cr.add(new Decimal(leg.amount));
    }
    if (!dr.eq(cr)) throw new EliminationNotBalancedError(dr.sub(cr).toString());
  }
}
