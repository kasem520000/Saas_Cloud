import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { SalesModule } from "../sales/sales.module";
import { TerminalService } from "./application/terminal.service";
import { PosSaleService } from "./application/pos-sale.service";
import { SyncSliceService } from "./application/sync-slice.service";
import { PosController } from "./presentation/pos.controller";

/**
 * PHASE-016 pos module (MODULE_BOUNDARIES.md: owns `pos_terminals` +
 * `change_log`/`sync_cursors`/`sync_commands` POS-slice writes and the POS
 * channel fields on sales invoices; sales/shift/inventory writes go through
 * their owning modules' published services — never cross-module writes).
 * Publishes: terminal registry, online POS sale (sales-module invoice chain,
 * BR-005 autopost), and the narrow §11 sync slice (pull/push/status).
 */
@Module({
  imports: [AuditModule, SalesModule],
  controllers: [PosController],
  providers: [TerminalService, PosSaleService, SyncSliceService],
  exports: [TerminalService, PosSaleService, SyncSliceService],
})
export class PosModule {}
