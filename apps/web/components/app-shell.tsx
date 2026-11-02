/**
 * P5-T12 — Authenticated app shell (server component). Resolves the
 * navigation payload server-side (GET /tenancy/navigation, envelope-
 * unwrapped by fetchApi) and renders the P6-T11a `ShellWithSearch` client
 * bridge — the @erp/ui `AppShell` plus the CommandMenu remote-search wiring
 * (debounced partner/item trigram search). On any navigation failure the
 * shell degrades to "no navigation" — the pages still enforce 401/403
 * themselves.
 *
 * Pages keep the PHASE-003 signature `AppShell({ locale, pagePath, title,
 * children })`: this component derives the sidebar active path, the
 * breadcrumbs (registry labels first, static dictionary fallbacks — plus the
 * P6-T11a dynamic-prefix rules for partners/:id and inventory/items/:id)
 * and the user menu (locale switch + logout).
 */
import type { JSX, ReactNode } from "react";

import { Breadcrumbs, Icon } from "./client-ui";
import type { Crumb } from "@erp/ui";
import type { ResolvedNavigation } from "@erp/contracts";

import { getDictionary, otherLocale, type Dictionary, type Locale } from "../i18n/dictionaries";
import { fetchApi } from "../lib/server-api";
import { LogoutButton } from "./logout-button";
import { ShellWithSearch } from "./shell-with-search";

/** Registry routes are sidebar `route` values; pagePath is the URL segment. */
function activePathFor(pagePath: string): string {
  if (pagePath === "") {
    return "/";
  }
  if (pagePath === "platform/tenants" || pagePath.startsWith("platform/tenants/")) {
    return "/platform";
  }
  return `/${pagePath}`;
}

/** Static breadcrumb fallback for routes not (yet) in the nav registry. */
const FALLBACK_CRUMBS: Record<string, { group?: keyof Dictionary; label: keyof Dictionary }> = {
  users: { group: "navSettings", label: "navUsers" },
  roles: { group: "navSettings", label: "navRoles" },
  branches: { group: "navSettings", label: "navBranches" },
  settings: { group: "navSettings", label: "navSettings" },
  "settings/password": { group: "navSettings", label: "navPassword" },
  sessions: { group: "navSettings", label: "navSessions" },
  mfa: { group: "navSettings", label: "navMfa" },
  onboarding: { group: "navSettings", label: "navOnboarding" },
  "configuration/templates": { group: "navSettings", label: "navTemplates" },
  "pos/terminals": { group: "navSettings", label: "navPosTerminals" },
  "pos/counter": { group: "navSettings", label: "navPosCounter" },
  "support-sessions": { group: "navSettings", label: "navSupport" },
  platform: { group: "navPlatformSection", label: "navPlatformConsole" },
  "platform/audit": { group: "navPlatformSection", label: "navPlatformAudit" },
  // -- P6-T11a master-data routes -------------------------------------------
  partners: { group: "navPartners", label: "navPartnersDirectory" },
  "partners/new": { group: "navPartners", label: "navPartnersNew" },
  "opening-balances": { group: "navPartners", label: "navOpeningBalances" },
  "inventory/items": { group: "navInventory", label: "navItems" },
  "inventory/items/new": { group: "navInventory", label: "navItemsNew" },
  "inventory/price-lists": { group: "navInventory", label: "navPriceLists" },
  "inventory/import": { group: "navInventory", label: "navImport" },
  // -- T14-UI treasury list routes (registry-driven when resolved; the new/
  // detail subroutes resolve via the dynamic-prefix rule below) ------------
  "treasury/accounts": { group: "navTreasury", label: "navTreasuryAccounts" },
  "treasury/receipts": { group: "navTreasury", label: "navTreasuryReceipts" },
  "treasury/receipts/new": { group: "navTreasury", label: "navTreasuryReceipts" },
  "treasury/payments": { group: "navTreasury", label: "navTreasuryPayments" },
  "treasury/payments/new": { group: "navTreasury", label: "navTreasuryPayments" },
  "treasury/expenses": { group: "navTreasury", label: "navTreasuryExpenses" },
  "treasury/transfers": { group: "navTreasury", label: "navTreasuryTransfers" },
  "treasury/shifts": { group: "navTreasury", label: "navTreasuryShifts" },
  "treasury/bank-rec": { group: "navTreasury", label: "navTreasuryBankRec" },
  // -- T-WEB (PHASE-013) report workspace (registry-driven when resolved) ----
  reports: { group: "navReports", label: "reportsNavWorkspace" },
};

/**
 * P6-T11a — detail routes carry dynamic ids (partners/:id, inventory/items/:id);
 * the exact map misses them, so dynamic-prefix rules resolve the GROUP and use
 * the page title (the record's localized name) as the leaf crumb.
 */
function fallbackCrumbsFor(
  pagePath: string,
  title: string,
  d: Dictionary,
): { groupLabel?: string; label: string } | undefined {
  if (pagePath.startsWith("partners/") && pagePath !== "partners/new") {
    return { groupLabel: d.navPartners, label: title };
  }
  if (pagePath.startsWith("inventory/items/") && pagePath !== "inventory/items/new") {
    return { groupLabel: d.navInventory, label: title };
  }
  // T14-UI — treasury detail routes (accounts/:id, receipts/:id, payments/:id).
  if (pagePath.startsWith("treasury/accounts/")) {
    return { groupLabel: d.navTreasury, label: d.navTreasuryAccounts };
  }
  if (pagePath.startsWith("treasury/receipts/")) {
    return { groupLabel: d.navTreasury, label: d.navTreasuryReceipts };
  }
  if (pagePath.startsWith("treasury/payments/")) {
    return { groupLabel: d.navTreasury, label: d.navTreasuryPayments };
  }
  return undefined;
}

export async function AppShell({
  locale,
  pagePath,
  title,
  children,
}: {
  locale: Locale;
  pagePath: string;
  title: string;
  children: ReactNode;
}): Promise<JSX.Element> {
  const d = getDictionary(locale);
  const other = otherLocale(locale);
  const otherHref = `/${other}${pagePath === "" ? "" : `/${pagePath}`}`;
  const activePath = activePathFor(pagePath);

  // Server-resolved navigation (NAVIGATION_MODEL §2): groups + shortcuts,
  // permission/entitlement-filtered by the API. Failure ⇒ no navigation.
  const navigationResult = await fetchApi<ResolvedNavigation>("tenancy/navigation");
  const navigation = navigationResult.ok ? navigationResult.data : undefined;

  // Breadcrumbs: registry labels when the route is in the resolved payload,
  // static dictionary labels otherwise; tenant detail nests under console.
  const crumbs: Crumb[] = [{ label: d.navHome, href: `/${locale}` }];
  const registryItem = navigation?.groups
    .flatMap((group) => group.items.map((item) => ({ group, item })))
    .find(({ item }) => item.route === activePath);
  if (registryItem !== undefined) {
    const groupLabel = registryItem.group.label[locale];
    if (groupLabel !== registryItem.item.label[locale]) {
      crumbs.push({ label: groupLabel });
    }
    crumbs.push({ label: registryItem.item.label[locale] });
  } else if (pagePath.startsWith("platform/tenants/")) {
    crumbs.push({ label: d.navPlatformConsole, href: `/${locale}/platform` });
    crumbs.push({ label: title });
  } else {
    const exact = FALLBACK_CRUMBS[pagePath];
    if (exact !== undefined) {
      const groupLabel = exact.group !== undefined ? d[exact.group] : undefined;
      if (groupLabel !== undefined && groupLabel !== d[exact.label]) {
        crumbs.push({ label: groupLabel });
      }
      crumbs.push({ label: d[exact.label] });
    } else {
      const dynamic = fallbackCrumbsFor(pagePath, title, d);
      if (dynamic !== undefined) {
        if (dynamic.groupLabel !== undefined && dynamic.groupLabel !== dynamic.label) {
          crumbs.push({ label: dynamic.groupLabel });
        }
        crumbs.push({ label: dynamic.label });
      }
    }
  }

  const userMenu = (
    <div className="flex items-center gap-2">
      <a
        lang={other}
        hrefLang={other}
        href={otherHref}
        className="inline-flex items-center gap-1.5 rounded-md border border-default bg-surface-card px-2 py-1 text-sm text-gray-700 outline-none hover:border-strong"
      >
        <Icon name="languages" size={14} />
        <span>{d.switchLabel}</span>
      </a>
      <LogoutButton locale={locale} label={d.signOut} />
    </div>
  );

  return (
    <ShellWithSearch
      locale={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      navigation={navigation}
      activePath={activePath}
      brand={{ name: d.appTitle }}
      strings={{
        skipToContent: d.shellSkipToContent,
        commandMenuLabel: d.shellCommandSearch,
        shortcutsTitle: d.shellShortcutsTitle,
        closeLabel: d.shellClose,
        moreLabel: d.shellMore,
      }}
      userMenu={userMenu}
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 lang={locale} className="text-lg font-semibold text-gray-900">
            {title}
          </h1>
          {crumbs.length > 1 && <Breadcrumbs items={crumbs} />}
        </div>
        {children}
      </div>
    </ShellWithSearch>
  );
}
