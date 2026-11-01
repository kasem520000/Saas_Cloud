/**
 * PHASE-014 T10 — /{locale}/notifications: the in-app inbox (tenant-wide +
 * own rows), unread count badge, and per-event preferences (in-app / email).
 * Session-scoped routes — any signed-in member reaches this page.
 */
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";

import { ErrorState } from "../../../components/client-ui";
import { AppShell } from "../../../components/app-shell";
import { Card } from "../../../components/card";
import { NotificationsInbox } from "../../../components/notifications-inbox";
import { RetryButton } from "../../../components/retry-button";
import { getDictionary, isLocale, type Locale } from "../../../i18n/dictionaries";
import type {
  NotificationPreferenceRow,
  NotificationRow,
  UnreadCount,
} from "../../../lib/api-types";
import { localizedApiError } from "../../../lib/messages";
import { fetchApi, requireSessionToken } from "../../../lib/server-api";

export default async function NotificationsPage({
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

  const [rows, unread, prefs] = await Promise.all([
    fetchApi<readonly NotificationRow[]>("notifications?limit=100"),
    fetchApi<UnreadCount>("notifications/unread-count"),
    fetchApi<readonly NotificationPreferenceRow[]>("notifications/preferences"),
  ]);
  if (!rows.ok && rows.status === 401) {
    redirect(`/${localeValue}/login`);
  }

  const unreadCount = unread.ok ? unread.data.count : 0;
  const title = `${d.notifTitle}${unreadCount > 0 ? ` (${unreadCount} ${d.notifUnread})` : ""}`;

  let content: JSX.Element;
  if (!rows.ok) {
    content = (
      <ErrorState
        title={localizedApiError(d, rows.error, rows.retryAfterSeconds)}
        retry={<RetryButton label={d.retryLabel} />}
      />
    );
  } else {
    content = (
      <Card title={title}>
        <NotificationsInbox
          locale={localeValue}
          notifications={rows.data}
          preferences={prefs.ok ? prefs.data : []}
        />
      </Card>
    );
  }

  return (
    <AppShell locale={localeValue} pagePath="notifications" title={d.notifTitle}>
      {content}
    </AppShell>
  );
}
