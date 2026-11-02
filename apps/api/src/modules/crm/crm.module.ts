import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AccountingModule } from "../accounting/accounting.module";
import { PartnersModule } from "../partners/partners.module";
import { CrmController } from "./presentation/crm.controller";
import { LeadsService } from "./application/leads.service";
import { ContractsService } from "./application/contracts.service";
import { CrmOperationsService } from "./application/operations.service";
import { CrmQueriesService } from "./application/crm-queries";

/**
 * PHASE-019 — crm module (MODULE_BOUNDARIES: crm → {partners, sales,
 * accounting, notifications, inventory} only; it never writes their tables —
 * the only ledger effect is contract billing through the centralized
 * PostingService, ADR-0007). Projects themselves are accounting-owned.
 */
@Module({
  imports: [AuditModule, AccountingModule, PartnersModule],
  controllers: [CrmController],
  providers: [LeadsService, ContractsService, CrmOperationsService, CrmQueriesService],
  exports: [LeadsService, ContractsService, CrmOperationsService, CrmQueriesService],
})
export class CrmModule {}
