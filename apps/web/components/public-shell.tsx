/**
 * P5-T12 — Public (unauthenticated) shell for login / forgot-password /
 * accept-invitation / register: token background, slim brand bar with the
 * locale switch, and a centered card surface (no sidebar — no session yet).
 */
import type { JSX, ReactNode } from "react";

import { getDictionary, otherLocale, type Locale } from "../i18n/dictionaries";

export function PublicShell({
  locale,
  pagePath,
  title,
  children,
}: {
  locale: Locale;
  pagePath: string;
  title: string;
  children: ReactNode;
}): JSX.Element {
  const d = getDictionary(locale);
  const other = otherLocale(locale);

  return (
    <div className="flex min-h-screen flex-col bg-surface-page">
      <header className="flex items-center justify-between border-b border-subtle bg-surface-card px-4 py-2">
        <span className="text-md font-semibold text-primary-900">{d.appTitle}</span>
        <a
          lang={other}
          hrefLang={other}
          href={`/${other}/${pagePath}`}
          className="rounded-md px-2 py-1 text-sm text-gray-700 underline-offset-2 outline-none hover:bg-surface-sunken hover:underline"
        >
          {d.switchLabel}
        </a>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg">
          <div className="rounded-lg border border-subtle bg-surface-card p-6 shadow-e3">
            <h1 lang={locale} className="text-lg font-semibold text-gray-900">
              {title}
            </h1>
            <div className="mt-4 flex flex-col gap-4">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
