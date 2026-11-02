/**
 * /{locale}/fixed-assets — asset register list (PHASE-026 T13; requires
 * fixed_assets.assets.view; 403 → "no permission" state). Server fetches
 * page one; the client table owns status/category filters + search.
 */
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../components/app-shell";
import { ErrorState } from "../../../components/client-ui";
import { RetryButton } from "../../../components/retry-button";
import { getDictionary, isLocale, type Locale } from "../../../i18n/dictionaries";
import { fetchApi, requireSessionToken } from "../../../lib/server-api";

const PAGE_LIMIT = 25;

interface AssetRow {
  id: string;
  code: string;
  name: string;
  status: string;
  cost: string;
  accumulated: string;
  nbv: string;
}

export default async function FixedAssetsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const localeValue = locale as Locale;
  const d = getDictionary(localeValue);

  await requireSessionToken(localeValue);

  const assets = await fetchApi<readonly AssetRow[]>(
    `fixed-assets/assets?limit=${PAGE_LIMIT}`,
  );
  if (!assets.ok && assets.status === 401) notFound();
  if (!assets.ok) {
    return (
      <AppShell locale={localeValue} pagePath="fixed-assets" title={d.faTitle}>
        <ErrorState title={d.loading} detail={String(assets.error)} retry={<RetryButton label={d.loading} />} />
      </AppShell>
    );
  }

  return (
    <AppShell locale={localeValue} pagePath="fixed-assets" title={d.faTitle}>
      <table>
        <thead>
          <tr>
            <th>{d.faCode}</th>
            <th>{d.faName}</th>
            <th>{d.faStatus}</th>
            <th>{d.faCost}</th>
            <th>{d.faNbv}</th>
          </tr>
        </thead>
        <tbody>
          {assets.data.map((a) => (
            <tr key={a.id}>
              <td>{a.code}</td>
              <td>{a.name}</td>
              <td>{a.status}</td>
              <td>{a.cost}</td>
              <td>{a.nbv}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}
