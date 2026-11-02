import { Module } from "@nestjs/common";

import { AccountingModule } from "../accounting/accounting.module";
import { AuditModule } from "../audit/audit.module";
import { ConsolidationGroupService } from "./application/group-service";
import { EliminationService } from "./application/elimination-service";
import { ConsolidationReaderService } from "./application/reader-service";
import { ConsolidationRunService } from "./application/run-service";

/**
 * PHASE-034 consolidation module (ADR-0018, ED-10): groups/membership
 * configuration, elimination entries posted via the engine into the owner's
 * books (G-32, BR-056), read-only consolidation runs over member books via the
 * single audited platform-plane reader (INV-026). Zero cross-tenant writes;
 * member RLS never relaxed.
 */
@Module({
  imports: [AccountingModule, AuditModule],
  providers: [ConsolidationGroupService, EliminationService, ConsolidationReaderService, ConsolidationRunService],
  exports: [ConsolidationGroupService, EliminationService, ConsolidationReaderService, ConsolidationRunService],
})
export class ConsolidationModule {}
