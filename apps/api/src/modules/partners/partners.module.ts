import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { FilesModule } from "../files/files.module";
import { PartnerService } from "./application/partner-service";
import { CreditTermsService } from "./application/credit-terms-service";
import { CreditCheckService } from "./application/credit-check-service";
import { OpeningBalancesService } from "./application/opening-balances-service";
import { PartnersController } from "./presentation/partners.controller";

/**
 * Partners module (PHASE-006 §2.1): the unified partner directory with
 * contacts/addresses, credit terms (BR-026), the BR-001 credit-check
 * interface (enforcement lands with sales approval, PHASE-012), and
 * opening-balance DRAFT capture (the G-16 subledger source — nothing posts
 * before PHASE-007). Consumes audit (interceptor + service) and the files
 * module's attachments service via their api surfaces.
 */
@Module({
  imports: [AuditModule, FilesModule],
  controllers: [PartnersController],
  providers: [PartnerService, CreditTermsService, CreditCheckService, OpeningBalancesService],
  exports: [PartnerService, CreditTermsService, CreditCheckService, OpeningBalancesService],
})
export class PartnersModule {}
