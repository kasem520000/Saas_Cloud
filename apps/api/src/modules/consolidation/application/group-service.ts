/**
 * PHASE-034 T4 — consolidation groups & membership service (ADR-0018 §1/§6).
 * Groups are configuration in the OWNER tenant; membership references member
 * legal entities (tenants). Foreign-tenant refs are rejected 404-shaped
 * (ForeignTenantRefError, A7). Every mutation is audited.
 */
import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { AuditService } from "../../audit/api/audit";
import { ConsolidationGroupNotFoundError, ForeignTenantRefError } from "../domain/consolidation-errors";
import * as store from "../infrastructure/consolidation.store";

@Injectable()
export class ConsolidationGroupService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async createGroup(input: {
    name: string; nameAr: string | null; baseCurrency: string; fxTranslationMethod: "CLOSING_RATE" | "TEMPORAL"; actorId: string | null;
  }): Promise<store.ConsolidationGroupRow> {
    const group = await store.insertGroup({
      id: randomUUID(), name: input.name, nameAr: input.nameAr,
      baseCurrency: input.baseCurrency, fxTranslationMethod: input.fxTranslationMethod,
    });
    await this.audit.record({
      action: "consolidation.group_created", entityType: "consolidation_group", entityId: group.id,
      actorId: input.actorId ?? undefined, after: { name: group.name, baseCurrency: group.baseCurrency },
    });
    return group;
  }

  async addMember(input: {
    groupId: string; memberTenantId: string; ownershipPercent: string; includeFrom: string; actorId: string | null;
  }): Promise<store.GroupEntityRow> {
    const group = await store.findGroupById(input.groupId);
    if (group === undefined) throw new ConsolidationGroupNotFoundError(input.groupId);
    if (!(await store.memberExists(input.memberTenantId))) throw new ForeignTenantRefError();
    const member = await store.insertGroupEntity({
      id: randomUUID(), groupId: input.groupId, memberTenantId: input.memberTenantId,
      ownershipPercent: input.ownershipPercent, includeFrom: input.includeFrom,
    });
    await this.audit.record({
      action: "consolidation.member_added", entityType: "group_entity", entityId: member.id,
      actorId: input.actorId ?? undefined,
      after: { groupId: input.groupId, memberTenantId: input.memberTenantId, ownershipPercent: input.ownershipPercent },
    });
    return member;
  }

  async listMembers(groupId: string): Promise<store.GroupEntityRow[]> {
    const group = await store.findGroupById(groupId);
    if (group === undefined) throw new ConsolidationGroupNotFoundError(groupId);
    return store.listGroupEntities(groupId);
  }
}
