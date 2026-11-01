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
import { UsageService } from "./application/usage-service";
import { SubscriptionsService } from "./application/subscriptions-service";
import { BillingService } from "./application/billing/billing-service";
import { SubscriptionLifecycleService } from "./application/subscription-lifecycle";
import { RegistrationController } from "./presentation/public/registration.controller";
import { PlansController } from "./presentation/public/plans.controller";
import { BillingWebhookController } from "./presentation/public/billing-webhook.controller";
import { TenancyController } from "./presentation/tenancy.controller";
import { PlatformConsoleController } from "./presentation/platform/platform.controller";

/**
 * Tenancy module (PHASE-004; MODULE_BOUNDARIES.md): owns tenants,
 * branches, settings, plans, subscriptions, entitlements, support
 * sessions; publishes tenant context, resolveEntitlements and the branch
 * registry. Dependencies per DEPENDENCY_RULES §2: identity (memberships,
 * sessions, role templates) + audit + configuration (feature catalog,
 * settings schema, §9 events) + notifications (registration email).
 *
 * PHASE-014 adds: the subscription billing service (sandbox checkout +
 * signed webhook + manual fallback), the subscription lifecycle sweep
 * (TRIAL→ACTIVE→GRACE→SUSPENDED), the usage-counter service (§6 limit
 * matrix), and the tenant-plane subscription/billing routes.
 */
@Module({
  imports: [AuditModule, ConfigurationModule, IdentityModule, NotificationsModule],
  controllers: [
    RegistrationController,
    PlansController,
    BillingWebhookController,
    TenancyController,
    PlatformConsoleController,
  ],
  providers: [
    RegistrationService,
    OnboardingService,
    BranchService,
    SettingsService,
    EntitlementsService,
    LifecycleService,
    SupportAccessService,
    PlatformConsoleService,
    UsageService,
    SubscriptionsService,
    BillingService,
    SubscriptionLifecycleService,
  ],
  exports: [
    RegistrationService,
    EntitlementsService,
    LifecycleService,
    SupportAccessService,
    UsageService,
    SubscriptionsService,
    BillingService,
  ],
})
export class TenancyModule {}
