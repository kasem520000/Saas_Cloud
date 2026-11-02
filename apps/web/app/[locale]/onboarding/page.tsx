/**
 * P4-T12a — /{locale}/onboarding (session): the two-step workspace wizard.
 * The server pre-checks the session (401 → login) and — since every member
 * may read the derived entitlements payload — hides the wizard with a
 * feature notice when `platform.onboarding` is not granted. The wizard itself
 * posts to POST /api/bff/tenancy/onboarding/provision (feature-gated route).
 */
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";

import { ErrorState } from "../../../components/client-ui";

import { AppShell } from "../../../components/app-shell";
import { InfoNotice } from "../../../components/notices";
import { OnboardingWizard } from "../../../components/onboarding-wizard";
import { JourneyChecklist } from "../../../components/journey-checklist";
import { TemplatePicker } from "../../../components/template-picker";
import { Card } from "../../../components/card";
import { RetryButton } from "../../../components/retry-button";
import { getDictionary, isLocale, type Locale } from "../../../i18n/dictionaries";
import { ONBOARDING_FEATURE_KEY } from "../../../lib/constants";
import type { AppliedTemplateView, DerivedEntitlements, IndustryTemplatesResponse, TenantProfile } from "../../../lib/api-types";
import { localizedApiError } from "../../../lib/messages";
import { fetchApi, requireSessionToken } from "../../../lib/server-api";

export default async function OnboardingPage({
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

  await requireSessionToken(localeValue);

  // The provision route needs tenancy.settings.manage — the same permission
  // as the profile read, so a profile 401/403 decides access up front.
  const profile = await fetchApi<TenantProfile>("tenancy/profile");
  if (!profile.ok && profile.status === 401) {
    redirect(`/${locale}/login`);
  }

  const entitlements = await fetchApi<DerivedEntitlements>("tenancy/entitlements");
  const canProvision = !entitlements.ok || entitlements.data.featureKeys.includes(ONBOARDING_FEATURE_KEY);

  let content: JSX.Element;
  if (!profile.ok) {
    const forbidden = profile.status === 403 || profile.error.code === "FORBIDDEN";
    content = (
      <ErrorState
        title={
          forbidden
            ? d.errorsForbidden
            : localizedApiError(d, profile.error, profile.retryAfterSeconds)
        }
        retry={forbidden ? undefined : <RetryButton label={d.retryLabel} />}
      />
    );
  } else if (!canProvision) {
    content = <InfoNotice>{d.tenancyErrorFeatureNotEntitled}</InfoNotice>;
  } else {
    // PHASE-015 T11 — industry step: the active template registry, applied
    // from onboarding when the feature is entitled (graceful when not).
    const [templatesRes, appliedRes] = await Promise.all([
      fetchApi<IndustryTemplatesResponse>("configuration/templates"),
      fetchApi<AppliedTemplateView>("configuration/template"),
    ]);
    const showIndustry =
      templatesRes.ok && appliedRes.ok && templatesRes.data.templates.length > 0;
    content = (
      <div className="flex flex-col gap-4">
        <OnboardingWizard locale={localeValue} />
        {showIndustry ? (
          <Card title={d.onboardingIndustryTitle}>
            <p className="mb-4 text-sm text-gray-600">{d.onboardingIndustryDescription}</p>
            <TemplatePicker
              locale={localeValue}
              templates={templatesRes.data.templates}
              applied={appliedRes.ok ? appliedRes.data.applied : null}
            />
          </Card>
        ) : null}
        <JourneyChecklist locale={localeValue} />
      </div>
    );
  }

  return (
    <AppShell locale={localeValue} pagePath="onboarding" title={d.onboardingTitle}>
      {content}
    </AppShell>
  );
}
