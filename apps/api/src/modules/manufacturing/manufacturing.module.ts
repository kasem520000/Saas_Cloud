import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AccountingModule } from "../accounting/accounting.module";
import { ManufacturingController } from "./presentation/manufacturing.controller";
import { ProductionOrderService } from "./application/production-order.service";
import { QcService } from "./application/qc.service";
import { ManufacturingQueriesService } from "./application/manufacturing-queries";

/**
 * PHASE-018 — manufacturing module (MODULE_BOUNDARIES: manufacturing →
 * {items, inventory, accounting, reporting} only; it never writes their
 * tables — stock/GL effects flow through their published services).
 */
@Module({
  imports: [AuditModule, AccountingModule],
  controllers: [ManufacturingController],
  providers: [ProductionOrderService, QcService, ManufacturingQueriesService],
  exports: [ProductionOrderService, QcService, ManufacturingQueriesService],
})
export class ManufacturingModule {}
