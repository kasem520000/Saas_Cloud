/**
 * P4-T12a — /{locale}/settings (session, tenancy.settings.manage): the owner
 * console — profile card (name/nameAr/timezone via PUT tenancy/profile) plus
 * the typed settings cards (one PUT tenancy/settings/:key per field with
 * per-field saved/error feedback in the client component).
 */
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";

import { ErrorState } from "../../../components/client-ui";

import { AppShell } from "../../../components/app-shell";
import { Card } from "../../../components/card";
import { ErrorNotice } from "../../../components/notices";
import { ProfileForm } from "../../../components/profile-form";
import { RetryButton } from "../../../components/retry-button";
import { TenantSettingsForm } from "../../../components/tenant-settings-form";
import { getDictionary, isLocale, type Locale } from "../../../i18n/dictionaries";
import type { TenantProfile, TenantSettingsMap } from "../../../lib/api-types";
import { localizedApiError } from "../../../lib/messages";
import { fetchApi, requireSessionToken } from "../../../lib/server-api";

export default async function SettingsPage({
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

  const [profile, settings] = await Promise.all([
    fetchApi<TenantProfile>("tenancy/profile"),
    fetchApi<TenantSettingsMap>("tenancy/settings"),
  ]);
  if (
    (!profile.ok && profile.status === 401) ||
    (!settings.ok && settings.status === 401)
  ) {
    redirect(`/${locale}/login`);
  }

  let content: JSX.Element;
  if (!profile.ok) {
    const forbidden = profile.status === 403 || profile.error.code === "FORBIDDEN";
    content = (
      <ErrorState
        title={
          forbidden ? d.errorsForbidden : localizedApiError(d, profile.error, profile.retryAfterSeconds)
        }
        retry={forbidden ? undefined : <RetryButton label={d.retryLabel} />}
      />
    );
  } else {
    content = (
      <div className="flex flex-col gap-6">
        <Card title={d.settingsProfileTitle} ariaLabel={d.settingsProfileTitle} className="w-full max-w-xl">
          <ProfileForm
            locale={localeValue}
            initial={{ name: profile.data.name, nameAr: profile.data.nameAr, timezone: profile.data.timezone }}
          />
        </Card>
        {settings.ok ? (
          <TenantSettingsForm locale={localeValue} settings={settings.data} />
        ) : (
          settings.status !== 403 && (
            <ErrorNotice>
              {localizedApiError(d, settings.error, settings.retryAfterSeconds)}
            </ErrorNotice>
          )
        )}
      </div>
    );
  }

  return (
    <AppShell locale={localeValue} pagePath="settings" title={d.settingsTitle}>
      {content}
    </AppShell>
  );
}
