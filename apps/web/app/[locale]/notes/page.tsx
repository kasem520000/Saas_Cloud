/**
 * /{locale}/notes — notes register list (PHASE-027 T14; requires
 * notes.notes.view; 403 → "no permission" state). Custody timeline lives on
 * the note detail page (T14 TimelinePanel pattern).
 */
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../components/app-shell";
import { ErrorState } from "../../../components/client-ui";
import { RetryButton } from "../../../components/retry-button";
import { getDictionary, isLocale, type Locale } from "../../../i18n/dictionaries";
import { fetchApi, requireSessionToken } from "../../../lib/server-api";

interface NoteRow {
  id: string;
  number: string;
  kind: string;
  direction: string;
  maturityDate: string;
  amount: string;
  status: string;
}

export default async function NotesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const localeValue = locale as Locale;
  const d = getDictionary(localeValue);

  await requireSessionToken(localeValue);

  const notes = await fetchApi<readonly NoteRow[]>("notes/notes?limit=25");
  if (!notes.ok && notes.status === 401) notFound();
  if (!notes.ok) {
    return (
      <AppShell locale={localeValue} pagePath="notes" title={d.ntTitle}>
        <ErrorState title={d.loading} detail={String(notes.error)} retry={<RetryButton label={d.loading} />} />
      </AppShell>
    );
  }

  return (
    <AppShell locale={localeValue} pagePath="notes" title={d.ntTitle}>
      <table>
        <thead>
          <tr>
            <th>{d.ntNumber}</th>
            <th>{d.ntMaturity}</th>
            <th>{d.ntAmount}</th>
            <th>{d.ntStatus}</th>
          </tr>
        </thead>
        <tbody>
          {notes.data.map((n) => (
            <tr key={n.id}>
              <td>{n.number}</td>
              <td>{n.maturityDate}</td>
              <td>{n.amount}</td>
              <td>{n.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppShell>
  );
}
