import { Module } from "@nestjs/common";

import { AccountingModule } from "../accounting/accounting.module";
import { TenancyModule } from "../tenancy/tenancy.module";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { WarehouseService } from "./application/warehouse-service";
import { StockService } from "./application/stock-service";
import { AdjustmentService } from "./application/adjustment-service";
import { TransferService } from "./application/transfer-service";
import { CountService } from "./application/count-service";
import { TrackingService } from "./application/tracking-service";
import { ReservationService } from "./application/reservation-service";
import { ReorderService } from "./application/reorder-service";
import { InventoryReconciliationService } from "./application/reconciliation-service";
import { MethodSwitchService } from "./application/method-switch-service";
import { OpeningStockService } from "./application/opening-stock-service";
import { RevaluationService } from "./application/revaluation-service";
import { InventoryController } from "./presentation/inventory.controller";

/**
 * Inventory module (PHASE-010): warehouses, the append-only stock ledger
 * (INV-010), WAC/FIFO valuation with 6-decimal cost precision (ADR-0009),
 * opening-stock posting (G-16), two-leg transfers (BR-016/G-15), the count
 * workspace (BR-015/G-13/G-14), batch/expiry/serial tracking with FEFO
 * (BR-017/BR-018), soft reservations, reorder monitoring (BR-019), the
 * INV-010 reconciliation job, and the INV-017 method-switch service.
 *
 * Dependencies (DEPENDENCY_RULES §2; the phase §4): accounting (the
 * posting engine — inventory NEVER writes GL tables, ADR-0007; numbering;
 * the reconciliation framework) + audit + notifications (the BR-019
 * reorder email adapter). Published for PHASE-011/012: receiveStock /
 * issueStock / availability / valuation queries (MODULE_BOUNDARIES —
 * inventory exclusively owns stock_moves + stock_layers).
 */
@Module({
  imports: [AccountingModule, AuditModule, NotificationsModule, TenancyModule],
  controllers: [InventoryController],
  providers: [
    WarehouseService,
    StockService,
    AdjustmentService,
    TransferService,
    CountService,
    TrackingService,
    ReservationService,
    ReorderService,
    InventoryReconciliationService,
    MethodSwitchService,
    OpeningStockService,
    RevaluationService,
  ],
  exports: [
    WarehouseService,
    StockService,
    AdjustmentService,
    TransferService,
    CountService,
    TrackingService,
    ReservationService,
    InventoryReconciliationService,
    MethodSwitchService,
    OpeningStockService,
    RevaluationService,
  ],
})
export class InventoryModule {}
