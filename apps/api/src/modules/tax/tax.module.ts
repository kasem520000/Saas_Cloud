import { Module } from "@nestjs/common";

import { AccountingModule } from "../accounting/accounting.module";
import { AuditModule } from "../audit/audit.module";
import { FilesModule } from "../files/files.module";
import { TaxCodesService } from "./application/codes-service";
import { RegistrationService } from "./application/registration-service";
import { TaxResolverService } from "./application/tax-resolver-service";
import { VatReturnService } from "./application/vat-return-service";
import { PackService } from "./application/pack-service";
import { EInvoicingService } from "./application/einvoicing-service";
import { TaxReconciliationService } from "./application/tax-reconciliation-service";
import { TaxController } from "./presentation/tax.controller";

/**
 * Tax module (PHASE-009): the six-treatment engine, jurisdiction packs
 * (global read-only reference data — ADR-0010/ADR-0005 §3), tenant tax
 * codes + registrations, deterministic line→tax resolution with rate
 * snapshots (BR-033), the inclusive/exclusive pricing policy, the
 * NOT_REGISTERED / NO_VAT modes, the VAT return v1 with the INV-012
 * cross-check, and the EInvoicingAdapter port + fake adapter.
 *
 * Dependencies (DEPENDENCY_RULES §2; the phase §4): accounting (posting
 * engine, purposes — tax posts only via the engine, ADR-0007) + audit +
 * files (VAT return CSV/XLSX export). Consumed BY treasury (the G-11
 * expense leg), then sales/purchasing from their phases via the published
 * resolver + snapshot/summary contracts. Pack tables are seed-only: the
 * module NEVER writes jurisdictions/jurisdiction_tax_rates.
 */
@Module({
  imports: [AccountingModule, AuditModule, FilesModule],
  controllers: [TaxController],
  providers: [
    TaxResolverService,
    TaxCodesService,
    RegistrationService,
    VatReturnService,
    PackService,
    EInvoicingService,
    TaxReconciliationService,
  ],
  exports: [
    TaxResolverService,
    TaxCodesService,
    RegistrationService,
    VatReturnService,
    PackService,
    EInvoicingService,
    TaxReconciliationService,
  ],
})
export class TaxModule {}
