import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { ConfigurationService } from "./application/configuration.service";
import { TemplateApplyService } from "./application/template-apply.service";
import { ConfigurationController } from "./presentation/configuration.controller";

/**
 * PHASE-015 configuration module (MODULE_BOUNDARIES.md: owns
 * `industry_templates, tenant_industry_config, feature_flags`; publishes
 * `resolveEffectiveConfig(tenant)`): the ten-layer resolution engine with
 * content-hash cache + §9 event invalidation, the validated template registry
 * (3 priority manifests), the BR-038 additive-only apply/switch service, and
 * the tenant-plane routes. Other modules consume ONLY the api/ surface.
 */
@Module({
  imports: [AuditModule],
  controllers: [ConfigurationController],
  providers: [ConfigurationService, TemplateApplyService],
  exports: [ConfigurationService, TemplateApplyService],
})
export class ConfigurationModule {}
