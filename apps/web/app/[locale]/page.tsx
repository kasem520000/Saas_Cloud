/**
 * Landing dashboard (replaces the PHASE-001 demo). No session cookie →
 * login. With a session: current user, active tenant + switcher, granted
 * permission count and links to the PHASE-003/004 admin screens.
 */
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";

import { ErrorState, Icon } from "../../components/client-ui";
import type { IconName } from "@erp/ui";

import { AppShell } from "../../components/app-shell";
import { DashboardWidgets } from "../../components/dashboard-widgets";
import { Card } from "../../components/card";
import { DefList } from "../../components/def-list";
import { RetryButton } from "../../components/retry-button";
import { TenantSwitcher, type TenantOption } from "../../components/tenant-switcher";
import { getDictionary, isLocale, type Locale } from "../../i18n/dictionaries";
import type { CurrentSession } from "../../lib/api-types";
import { localizedApiError, localizedStatus, localizedName, formatMessage } from "../../lib/messages";
import { fetchApi, getSessionToken } from "../../lib/server-api";

const SCREEN_TILES: Array<{ path: string; labelKey: "navUsers" | "navRoles" | "navBranches" | "navSessions" | "navMfa" | "navSettings" | "navSupport" | "navOnboarding" | "navPassword"; icon: IconName }> = [
  { path: "users", labelKey: "navUsers", icon: "users" },
  { path: "roles", labelKey: "navRoles", icon: "users-round" },
  { path: "branches", labelKey: "navBranches", icon: "building" },
  { path: "sessions", labelKey: "navSessions", icon: "lock" },
  { path: "mfa", labelKey: "navMfa", icon: "shield" },
  { path: "settings", labelKey: "navSettings", icon: "settings" },
  { path: "support-sessions", labelKey: "navSupport", icon: "mail" },
  { path: "onboarding", labelKey: "navOnboarding", icon: "book-check" },
  { path: "settings/password", labelKey: "navPassword", icon: "log-in" },
];

export default async function HomePage({
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

  const token = await getSessionToken();
  if (token === undefined) {
    redirect(`/${locale}/login`);
  }

  const current = await fetchApi<CurrentSession>("identity/sessions/current");
  if (!current.ok) {
    if (current.status === 401) {
      redirect(`/${locale}/login`);
    }
    return (
      <AppShell locale={localeValue} pagePath="" title={d.appTitle}>
        <ErrorState
          title={localizedApiError(d, current.error, current.retryAfterSeconds)}
          retry={<RetryButton label={d.retryLabel} />}
        />
      </AppShell>
    );
  }

  const session = current.data;
  const activeMembership = session.memberships.find(
    (membership) => membership.tenantId === session.activeTenantId,
  );
  const options: TenantOption[] = session.memberships.map((membership) => ({
    tenantId: membership.tenantId,
    label: localizedName(membership.tenantName, membership.tenantNameAr, localeValue),
    switchable: membership.membershipStatus === "ACTIVE" && membership.tenantStatus === "ACTIVE",
    isActive: membership.tenantId === session.activeTenantId,
    statusText: localizedStatus(d, membership.membershipStatus),
  }));

  const displayName = session.user.fullName === "" ? session.user.email : session.user.fullName;
  const roleKey = activeMembership?.roleKey ?? "—";

  return (
    <AppShell locale={localeValue} pagePath="" title={formatMessage(d.homeWelcome, { name: displayName })}>
      <div className="flex flex-col gap-6">
        <p className="font-mono text-sm text-gray-600">{session.user.email}</p>

        <DashboardWidgets locale={localeValue} />

        <Card ariaLabel={d.homeTenantLabel} className="w-full max-w-xl">
          <DefList
            items={[
              {
                term: d.homeTenantLabel,
                children:
                  activeMembership === undefined
                    ? "—"
                    : localizedName(
                        activeMembership.tenantName,
                        activeMembership.tenantNameAr,
                        localeValue,
                      ),
              },
              { term: d.homeRoleLabel, children: <span className="font-mono">{roleKey}</span> },
            ]}
          />
          <p className="mt-3 text-sm text-gray-600">
            {formatMessage(d.homePermissionsLabel, { count: session.permissions.length })}
          </p>
        </Card>

        <section aria-label={d.homeSwitchTenant} className="flex flex-col gap-2">
          <h2 className="text-md font-semibold text-gray-900">{d.homeSwitchTenant}</h2>
          <TenantSwitcher locale={localeValue} options={options} activeTenantId={session.activeTenantId} />
        </section>

        <section aria-label={d.homeScreens} className="flex flex-col gap-2">
          <h2 className="text-md font-semibold text-gray-900">{d.homeScreens}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {SCREEN_TILES.map((tile) => (
              <a
                key={tile.path}
                href={`/${locale}/${tile.path}`}
                className="flex flex-col gap-2 rounded-lg border border-subtle bg-surface-card p-4 shadow-e1 outline-none transition-colors duration-150 ease-standard hover:border-strong hover:bg-surface-sunken"
              >
                <Icon name={tile.icon} size={20} className="text-primary-700" />
                <span className="text-sm font-medium text-gray-900">{d[tile.labelKey]}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
