/**
 * /{locale}/fixed-assets/new — asset create/edit form (PHASE-026 T13,
 * PAGE_ARCHETYPES §3; requires fixed_assets.assets.create).
 */
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../../components/app-shell";
import { getDictionary, isLocale, type Locale } from "../../../../i18n/dictionaries";
import { fetchApi, requireSessionToken } from "../../../../lib/server-api";

interface CategoryRow {
  id: string;
  code: string;
  name: string;
}

export default async function NewAssetPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const localeValue = locale as Locale;
  const d = getDictionary(localeValue);

  await requireSessionToken(localeValue);

  const categories = await fetchApi<readonly CategoryRow[]>(
    "fixed-assets/categories?active=true",
  );

  return (
    <AppShell locale={localeValue} pagePath="fixed-assets" title={d.faNewAsset}>
      <form action="/api/fixed-assets/assets" method="post">
        <label>
          {d.faCode}
          <input name="code" required />
        </label>
        <label>
          {d.faName}
          <input name="name" required />
        </label>
        <label>
          {d.faCategory}
          <select name="categoryId" required>
            {(categories.ok ? categories.data : []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {d.faCost}
          <input name="cost" inputMode="decimal" required />
        </label>
        <label>
          {d.faSalvage}
          <input name="salvageValue" inputMode="decimal" defaultValue="0" />
        </label>
        <label>
          {d.faLifeMonths}
          <input name="usefulLifeMonths" type="number" min={1} required />
        </label>
        <button type="submit">{d.loading === "" ? "Save" : "Save"}</button>
      </form>
    </AppShell>
  );
}
