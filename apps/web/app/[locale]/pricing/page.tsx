/**
 * PHASE-014 T7 — /{locale}/pricing (public marketing page): plan cards render
 * exclusively from GET /api/v1/public/plans (SUBSCRIPTION_AND_ENTITLEMENTS §1;
 * OQ-002 — prices are PLACEHOLDER seed values served from configuration, never
 * hard-coded here). Anonymous: no session → PublicShell, like /register.
 */
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { ErrorNotice } from "../../../components/notices";
import { PublicShell } from "../../../components/public-shell";
import { getDictionary, isLocale, type Locale } from "../../../i18n/dictionaries";
import type { PublicPlansResponse, PublicPlan } from "../../../lib/api-types";
import { fetchApi } from "../../../lib/server-api";

function planName(locale: Locale, plan: PublicPlan): string {
  return locale === "ar" ? plan.nameAr : plan.name;
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  const localeValue = locale as Locale;
  const d = getDictionary(localeValue);

  const plans = await fetchApi<PublicPlansResponse>("public/plans");

  return (
    <PublicShell locale={localeValue} pagePath="pricing" title={d.pricingTitle}>
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-col gap-1 text-center">
          <h1 className="text-2xl font-bold text-gray-900">{d.pricingTitle}</h1>
          <p className="text-sm text-gray-600">{d.pricingSubtitle}</p>
        </header>
        {!plans.ok ? (
          <ErrorNotice>{d.pricingLoadError}</ErrorNotice>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.data.plans
              .filter((plan) => plan.isActive)
              .map((plan) => (
                <section
                  key={plan.key}
                  className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <h2 className="text-lg font-semibold text-gray-900">
                    {planName(localeValue, plan)}
                  </h2>
                  <p className="text-2xl font-bold text-primary-700">
                    {plan.priceAmount}{" "}
                    <span className="text-sm font-normal text-gray-500">{plan.currencyCode}</span>
                    <span className="block text-xs font-normal text-gray-500">
                      {d.pricingPerMonth}
                    </span>
                  </p>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    {d.pricingFeatures}
                  </p>
                  <ul className="flex flex-col gap-1 text-sm text-gray-700">
                    {plan.featureKeys.slice(0, 8).map((key) => (
                      <li key={key} className="flex items-center gap-2">
                        <span aria-hidden className="text-primary-600">•</span>
                        <span className="font-mono text-xs">{key}</span>
                      </li>
                    ))}
                  </ul>
                  <a
                    href={`/${localeValue}/register`}
                    className="mt-auto inline-flex items-center justify-center rounded-md bg-primary-700 px-3 py-2 text-sm font-medium text-white hover:bg-primary-800"
                  >
                    {d.pricingChoose}
                  </a>
                </section>
              ))}
          </div>
        )}
        <p className="text-center text-xs text-gray-400">{d.pricingConfigNote}</p>
      </div>
    </PublicShell>
  );
}
