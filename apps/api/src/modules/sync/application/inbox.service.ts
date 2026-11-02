import { Injectable } from "@nestjs/common";

import { AuditService } from "../../audit/api/audit";
import * as store from "../infrastructure/sync.store";

/**
 * PHASE-020 T8/T13 — inbox retention job `sync.inbox.retention` (daily,
 * ADR-0008): inbox rows expire after ≥ 30 days; every command class keeps a
 * second durable dedupe layer after expiry (posting-operation keys for
 * financial intents — INV-013; the POS sync_commands table). The job is
 * idempotent and audited.
 */
@Injectable()
export class InboxService {
  constructor(private readonly audit: AuditService) {}

  async runRetention(actorId: string, now: Date = new Date()): Promise<{ deleted: number }> {
    const deleted = await store.deleteExpiredInbox(now.toISOString());
    await this.audit.record({
      action: "sync.inbox_retention",
      entityType: "inbox_commands",
      entityId: "00000000-0000-4000-8000-000000000000",
      actorId,
      after: { deleted, at: now.toISOString() },
    });
    return { deleted };
  }
}
