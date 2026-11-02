import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";

import { HealthController } from "./health/health.controller";
import { ReadinessService } from "./health/readiness.service";
import { InfrastructureModule } from "./infra/infra.module";
import { RequestIdMiddleware } from "./infra/observability/request-id.middleware";
import { SessionMiddleware } from "./infra/auth/session.middleware";
import { PermissionsGuard } from "./infra/auth/permissions.guard";
import { TenantContextInterceptor } from "./infra/context/tenant-context.interceptor";
import { ErrorModelFilter } from "./infra/http/error.filter";
import { IdempotencyKeyGuard } from "./infra/http/idempotency.guard";
import { AuditModule } from "./modules/audit/audit.module";
import { FilesModule } from "./modules/files/files.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { ConfigurationModule } from "./modules/configuration/configuration.module";
import { PosModule } from "./modules/pos/pos.module";
import { ManufacturingModule } from "./modules/manufacturing/manufacturing.module";
import { CrmModule } from "./modules/crm/crm.module";
import { SyncModule } from "./modules/sync/sync.module";
import { TenancyModule } from "./modules/tenancy/tenancy.module";
import { PartnersModule } from "./modules/partners/partners.module";
import { ItemsModule } from "./modules/items/items.module";
import { AccountingModule } from "./modules/accounting/accounting.module";
import { TreasuryModule } from "./modules/treasury/treasury.module";
import { TaxModule } from "./modules/tax/tax.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { PurchasingModule } from "./modules/purchasing/purchasing.module";
import { SalesModule } from "./modules/sales/sales.module";
import { ReportingModule } from "./modules/reporting/reporting.module";
import { AuditEventsController } from "./modules/audit/presentation/audit-events.controller";
import { FeatureEntitlementsGuard } from "./infra/auth/feature-entitlements.guard";
import { SubscriptionReadOnlyGuard } from "./infra/auth/subscription-read-only.guard";
import { UsageLimitsGuard } from "./infra/auth/usage-limits.guard";

/**
 * PHASE-007 module graph: the previous substrates + the accounting core —
 * the posting engine (ADR-0007), fiscal calendar, GL queries, manual +
 * recurring journals with approvals, numbering, opening-balances posting,
 * year-end close, and the AR/AP reconciliation framework. The
 * partner-subledger port binding lives in AccountingModule (Nest module
 * scoping) — see there for the seam rationale.
 */
@Module({
  imports: [
    InfrastructureModule,
    AuditModule,
    FilesModule,
    IdentityModule,
    NotificationsModule,
    ConfigurationModule,
    PosModule,
    ManufacturingModule,
    CrmModule,
    SyncModule,
    TenancyModule,
    PartnersModule,
    ItemsModule,
    AccountingModule,
    TreasuryModule,
    TaxModule,
    InventoryModule,
    PurchasingModule,
    SalesModule,
    ReportingModule,
  ],
  controllers: [HealthController, AuditEventsController],
  providers: [
    ReadinessService,
    { provide: APP_FILTER, useClass: ErrorModelFilter },
    { provide: APP_GUARD, useClass: IdempotencyKeyGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: FeatureEntitlementsGuard },
    { provide: APP_GUARD, useClass: SubscriptionReadOnlyGuard },
    { provide: APP_GUARD, useClass: UsageLimitsGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*").apply(SessionMiddleware).forRoutes("*");
  }
}
