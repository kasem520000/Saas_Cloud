import { Controller, Get } from "@nestjs/common";

import { envelope } from "../../../../infra/http/envelope";
import * as store from "../../infrastructure/tenancy.store";

/**
 * PHASE-014 T7 — public pricing data (SUBSCRIPTION_AND_ENTITLEMENTS §1–§2):
 * `GET /api/v1/public/plans` feeds the marketing pricing pages. Anonymous,
 * tenant-data-free, rate-limited at the edge (public route registry); prices
 * and limits are the PLACEHOLDER seed values (OQ-002) — the page renders
 * from configuration only, never hard-coded numbers.
 */

@Controller("api/v1/public")
export class PlansController {
  @Get("plans")
  async listPlans(): Promise<unknown> {
    const plans = await store.listPlans();
    return envelope({
      plans: plans
        .filter((plan) => plan.isActive)
        .map((plan) => ({
          key: plan.key,
          name: plan.name,
          nameAr: plan.nameAr,
          priceAmount: plan.priceAmount,
          currencyCode: plan.currencyCode,
          billingPeriod: plan.billingPeriod,
          limits: plan.limits,
          featureKeys: plan.featureKeys,
          placeholder: true,
        })),
    });
  }
}
