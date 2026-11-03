/**
 * `pnpm db:seed` — idempotent demo seed: registers the test company
 * (شركة الاختبار / "Demo Trading Co.") with a known owner account, then adds a
 * demo customer and a demo service item inside that tenant. Re-running is a
 * no-op (the owner email is the idempotency key). Requires the DB migrated
 * (pnpm db:migrate) and DATABASE_URL set (pnpm env:setup).
 */
import "./load-env";

import { sql } from "drizzle-orm";

import { getDb } from "../src/infra/db/client";
import { withPlatformScope, withTenant } from "../src/infra/db/tenant-context";
import { AuditService } from "../src/modules/audit/api/audit";
import { DrizzleAuditStore } from "../src/modules/audit/infrastructure/drizzle-audit.store";
import { PasswordService } from "../src/modules/identity/api/identity";
import { RegistrationService } from "../src/modules/tenancy/application/registration-service";
import { PartnerService } from "../src/modules/partners/application/partner-service";
import { ItemService } from "../src/modules/items/application/item-service";
import * as itemStore from "../src/modules/items/infrastructure/items.store";

const DEMO_EMAIL = "demo.owner@erp-demo.test";
const DEMO_PASSWORD = "Demo-12345-strong";

async function main(): Promise<void> {
  const db = getDb();

  const exists = await withPlatformScope(async (tx) => {
    const rows = await tx.execute(sql<{ n: number }>`
      SELECT count(*)::int AS n FROM users WHERE lower(email) = ${DEMO_EMAIL}
    `);
    return ((rows.rows[0] as unknown as { n: number }).n) > 0;
  });
  if (exists) {
    console.log(`db:seed: demo company already seeded (${DEMO_EMAIL}) — nothing to do.`);
    return;
  }

  const audit = new AuditService(new DrizzleAuditStore());
  const registration = new RegistrationService(new PasswordService(), audit, {
    enqueue: async () => undefined,
  });
  const result = await registration.register({
    businessName: "Demo Trading Co.",
    businessNameAr: "شركة الاختبار للتجارة",
    countryCode: "SA",
    baseCurrency: "SAR",
    industryTemplateKey: "industry.wholesale",
    taxRegistrationStatus: "REGISTERED",
    taxRegistrationNumber: "3000000000000003",
    ownerEmail: DEMO_EMAIL,
    ownerFullName: "Demo Owner",
    ownerPassword: DEMO_PASSWORD,
    ip: "127.0.0.1",
  });

  await withTenant(result.tenantId, async () => {
    const partners = new PartnerService(audit);
    await partners.create(result.ownerUserId, {
      kind: "CUSTOMER",
      code: "CUST-DEMO-001",
      name: "Demo Customer",
      nameAr: "عميل تجريبي",
      taxNumber: null,
      creditLimit: "50000.0000",
      creditTermsId: null,
      priceListId: null,
    });
    const items = new ItemService(audit);
    const uom = await itemStore.findUomByCode("PCS");
    if (uom !== undefined) {
      await items.create(result.ownerUserId, {
        sku: "SVC-CONSULT-001",
        name: "Consulting hour",
        nameAr: "ساعة استشارة",
        kind: "SERVICE",
        uomId: uom.id,
        categoryId: null,
        taxCodeId: null,
        costingMethod: "WAC",
        trackBatch: false,
        trackSerial: false,
        trackImei: false,
        hasExpiry: false,
        reorderLevel: null,
        reorderQty: null,
      });
    }
  });

  console.log("db:seed: demo company created:");
  console.log(`  tenant   : ${result.tenantId}`);
  console.log(`  owner    : ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log("  template : industry.wholesale (applied at registration)");
  console.log("  data     : customer CUST-DEMO-001 (limit 50,000 SAR) + service item SVC-CONSULT-001");
  await db.$client.end();
}

main().catch((error) => {
  console.error("db:seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
