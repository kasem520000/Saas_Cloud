/**
 * /{locale}/mfa — self-service TOTP setup: enroll (secret + otpauth shown
 * as plain text "QR data"), verify, recovery codes (shown once, with a
 * regenerate button). All calls run through the BFF proxy.
 */
import { notFound } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../components/app-shell";
import { MfaPanel } from "../../../components/mfa-panel";
import { getDictionary, isLocale, type Locale } from "../../../i18n/dictionaries";
import { requireSessionToken } from "../../../lib/server-api";

export default async function MfaPage({
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

  return (
    <AppShell locale={localeValue} pagePath="mfa" title={d.mfaTitle}>
      <MfaPanel locale={localeValue} />
    </AppShell>
  );
}
