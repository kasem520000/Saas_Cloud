import { StatementQueries } from "../../accounting/application/statement-queries";
import { GlQueries } from "../../accounting/application/gl-queries";
import { ArQueriesService } from "../../sales/application/ar-queries";
import { ApQueriesService } from "../../purchasing/application/ap-queries";
import { SalesAnalyticsService } from "../../sales/application/sales-analytics";
import { ApAnalyticsService } from "../../purchasing/application/ap-analytics";
import { InventoryQueriesService } from "../../inventory/application/inventory-queries";
import { TreasuryQueriesService } from "../../treasury/application/treasury-queries";
import { PartnerQueriesService } from "../../partners/application/partner-queries";
import { TaxQueriesService } from "../../tax/application/tax-queries";
import { DistributionQueriesService } from "../../distribution/application/distribution-queries";
import { UserQueriesService } from "../../identity/application/user-queries";
import { AuditService } from "../../audit/api/audit";
import { DrizzleAuditStore } from "../../audit/infrastructure/drizzle-audit.store";

/**
 * PHASE-013 · the reporting service locator: contracts are static modules,
 * so the module-owned authorized query services they consume are provided
 * through lazy singletons (direct construction — the same pattern the db
 * fixtures use; every service here is a stateless reader over the ambient
 * tenant transaction).
 */

export interface ReportingServices {
  statements: StatementQueries;
  gl: GlQueries;
  ar: ArQueriesService;
  ap: ApQueriesService;
  salesAnalytics: SalesAnalyticsService;
  apAnalytics: ApAnalyticsService;
  inventory: InventoryQueriesService;
  treasury: TreasuryQueriesService;
  partners: PartnerQueriesService;
  tax: TaxQueriesService;
  distribution: DistributionQueriesService;
  users: UserQueriesService;
  audit: AuditService;
}

let bundle: ReportingServices | undefined;

export function reportingServices(): ReportingServices {
  if (bundle === undefined) {
    bundle = {
      statements: new StatementQueries(),
      gl: new GlQueries(),
      ar: new ArQueriesService(),
      ap: new ApQueriesService(),
      salesAnalytics: new SalesAnalyticsService(),
      apAnalytics: new ApAnalyticsService(),
      inventory: new InventoryQueriesService(),
      treasury: new TreasuryQueriesService(),
      partners: new PartnerQueriesService(),
      tax: new TaxQueriesService(),
      distribution: new DistributionQueriesService(),
      users: new UserQueriesService(),
      audit: new AuditService(new DrizzleAuditStore()),
    };
  }
  return bundle;
}
