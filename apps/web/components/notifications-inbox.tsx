"use client";

/**
 * PHASE-014 T10 — notifications inbox client: mark-read
 * (PATCH /api/bff/notifications/:id/read) and per-event preferences
 * (PUT /api/bff/notifications/preferences). Session-scoped routes.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { JSX } from "react";

import { Button } from "@erp/ui";

import { getDictionary, type Locale } from "../i18n/dictionaries";
import type { NotificationPreferenceRow, NotificationRow } from "../lib/api-types";
import { bffFetch } from "../lib/client-api";

export function NotificationsInbox({
  locale,
  notifications,
  preferences,
}: {
  locale: Locale;
  notifications: readonly NotificationRow[];
  preferences: readonly NotificationPreferenceRow[];
}): JSX.Element {
  const d = getDictionary(locale);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function markRead(id: string): Promise<void> {
    setError(null);
    const result = await bffFetch(`notifications/${encodeURIComponent(id)}/read`, {
      method: "PATCH",
    });
    if (!result.ok) {
      setError(d.notifLoadError);
      return;
    }
    router.refresh();
  }

  async function togglePreference(
    eventType: string,
    inApp: boolean,
    email: boolean,
  ): Promise<void> {
    setError(null);
    const result = await bffFetch("notifications/preferences", {
      method: "PUT",
      body: { eventType, inApp, email },
    });
    if (!result.ok) {
      setError(d.notifLoadError);
      return;
    }
    router.refresh();
  }

  const title = (row: NotificationRow): string => (locale === "ar" ? row.title.ar : row.title.en);
  const body = (row: NotificationRow): string => (locale === "ar" ? row.body.ar : row.body.en);

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {notifications.length === 0 ? (
          <li className="text-sm text-gray-600">{d.notifEmpty}</li>
        ) : (
          notifications.map((row) => (
            <li
              key={row.id}
              className={`flex flex-col gap-1 rounded-md border p-3 ${
                row.readAt === null
                  ? "border-primary-200 bg-primary-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{title(row)}</span>
                <span className="font-mono text-xs text-gray-400">{row.type}</span>
                <span className="text-xs text-gray-400">{row.createdAt}</span>
                {row.readAt === null ? (
                  <Button variant="ghost" onClick={() => void markRead(row.id)}>
                    {d.notifMarkRead}
                  </Button>
                ) : null}
              </div>
              <p className="text-sm text-gray-700">{body(row)}</p>
            </li>
          ))
        )}
      </ul>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-gray-900">{d.notifPreferences}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-start text-xs text-gray-500">
              <th>{d.notifPreferences}</th>
              <th>{d.notifInApp}</th>
              <th>{d.notifEmail}</th>
            </tr>
          </thead>
          <tbody>
            {preferences.map((pref) => (
              <tr key={pref.id} className="border-t border-gray-100">
                <td className="font-mono text-xs">{pref.eventType}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={pref.inApp}
                    onChange={(e) =>
                      void togglePreference(pref.eventType, e.target.checked, pref.email)
                    }
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={pref.email}
                    onChange={(e) =>
                      void togglePreference(pref.eventType, pref.inApp, e.target.checked)
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {error !== null ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
