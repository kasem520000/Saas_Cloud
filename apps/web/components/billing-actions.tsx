"use client";

/**
 * PHASE-014 T2/T3 — billing page actions: sandbox checkout (POST
 * /api/bff/tenancy/subscriptions/checkout) and owner plan change
 * (POST /api/bff/tenancy/subscriptions/change-plan). Both are guarded
 * server-side (tenancy.subscription.manage + platform.subscriptions).
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { JSX } from "react";

import { Button } from "@erp/ui";

import { getDictionary, type Locale } from "../i18n/dictionaries";
import type { PublicPlan } from "../lib/api-types";
import { bffFetch } from "../lib/client-api";

export function BillingActions({
  locale,
  plans,
  currentPlanKey,
  hasOpenInvoice,
}: {
  locale: Locale;
  plans: PublicPlan[];
  currentPlanKey: string | null;
  hasOpenInvoice: boolean;
}): JSX.Element {
  const d = getDictionary(locale);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(planKey: string): Promise<void> {
    setBusy(planKey);
    setError(null);
    const result = await bffFetch("tenancy/subscriptions/checkout", {
      method: "POST",
      body: { planKey },
    });
    setBusy(null);
    if (!result.ok) {
      setError(d.billingCheckoutError);
      return;
    }
    router.refresh();
  }

  async function changePlan(planKey: string): Promise<void> {
    setBusy(`change-${planKey}`);
    setError(null);
    const result = await bffFetch("tenancy/subscriptions/change-plan", {
      method: "POST",
      body: { planKey },
    });
    setBusy(null);
    if (!result.ok) {
      setError(d.billingCheckoutError);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {plans
          .filter((plan) => plan.isActive && plan.key !== currentPlanKey)
          .map((plan) => (
            <span key={plan.key} className="flex gap-1">
              <Button
                variant="primary"
                disabled={busy !== null}
                onClick={() => void checkout(plan.key)}
              >
                {busy === plan.key ? "…" : `${d.billingCheckout} — ${locale === "ar" ? plan.nameAr : plan.name}`}
              </Button>
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void changePlan(plan.key)}
              >
                {busy === `change-${plan.key}` ? "…" : `${d.billingChangePlan} — ${locale === "ar" ? plan.nameAr : plan.name}`}
              </Button>
            </span>
          ))}
      </div>
      {hasOpenInvoice ? <p className="text-xs text-gray-500">{d.billingOpenInvoicesNote}</p> : null}
      {error !== null ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
