import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { PosModule } from "../pos/pos.module";
import { SyncController } from "./presentation/sync.controller";
import { DevicesService } from "./application/devices.service";
import { PullService } from "./application/pull.service";
import { PushService } from "./application/push.service";
import { InboxService } from "./application/inbox.service";

/**
 * PHASE-020 — the platform-wide sync module (MODULE_BOUNDARIES: sync →
 * {identity, audit, tenancy} + routes commands INTO owning modules via their
 * published services — never raw table writes). The PHASE-016 POS slice keeps
 * working on the same wire contracts (SYNC_PROTOCOL §11).
 */
@Module({
  imports: [AuditModule, PosModule],
  controllers: [SyncController],
  providers: [DevicesService, PullService, PushService, InboxService],
  exports: [DevicesService, PullService, PushService, InboxService],
})
export class SyncModule {}
