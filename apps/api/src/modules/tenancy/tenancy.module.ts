import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { ConfigurationModule } from "../configuration/configuration.module";
import { IdentityModule } from "../identity/identity.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RegistrationService } from "./application/registration-service";
import { OnboardingService } from "./application/onboarding-service";
import { BranchService } from "./application/branch-service";
import { SettingsService } from "./application/settings-service";
import { EntitlementsService } from "./application/entitlements-service";
import { LifecycleService } from "./application/lifecycle-service";
import { SupportAccessService } from "./application/support-access-service";
import { PlatformConsoleService } from "./application/platform-console-service";
import { RegistrationController } from "./presentation/public/registration.controller";
import { TenancyController } from "./presentation/tenancy.controller";
import { PlatformConsoleController } from "./presentation/platform/platform.controller";

/**
 * Tenancy module (PHASE-004; MODULE_BOUNDARIES.md): owns tenants,
 * branches, settings, plans, subscriptions, entitlements, support
 * sessions; publishes tenant context, resolveEntitlements and the branch
 * registry. Dependencies per DEPENDENCY_RULES §2: identity (memberships,
 * sessions, role templates) + audit + configuration (feature catalog,
 * settings schema, §9 events) + notifications (registration email).
 */
@Module({
  imports: [AuditModule, ConfigurationModule, IdentityModule, NotificationsModule],
  controllers: [RegistrationController, TenancyController, PlatformConsoleController],
  providers: [
    RegistrationService,
    OnboardingService,
    BranchService,
    SettingsService,
    EntitlementsService,
    LifecycleService,
    SupportAccessService,
    PlatformConsoleService,
  ],
  exports: [
    RegistrationService,
    EntitlementsService,
    LifecycleService,
    SupportAccessService,
  ],
})
export class TenancyModule {}

