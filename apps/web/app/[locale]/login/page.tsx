/**
 * /{locale}/login — public. Already signed in → home. The form posts to the
 * dedicated BFF session route (POST /api/bff/session) which sets the
 * httpOnly session cookie; this component never touches the raw token.
 */
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";

import { LoginForm } from "../../../components/login-form";
import { PublicShell } from "../../../components/public-shell";
import { getDictionary, isLocale } from "../../../i18n/dictionaries";
import { getSessionToken } from "../../../lib/server-api";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  const d = getDictionary(locale);

  const token = await getSessionToken();
  if (token !== undefined) {
    redirect(`/${locale}`);
  }

  return (
    <PublicShell locale={locale} pagePath="login" title={d.loginTitle}>
      <LoginForm locale={locale} />
      <p>
        <a
          href={`/${locale}/forgot-password`}
          className="text-sm text-primary-700 underline-offset-2 hover:underline"
        >
          {d.loginForgotLink}
        </a>
      </p>
    </PublicShell>
  );
}
