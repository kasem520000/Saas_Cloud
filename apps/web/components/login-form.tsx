"use client";

/**
 * Login form. Errors are localized by stable code:
 * INVALID_CREDENTIALS / MFA_REQUIRED (reveals the MFA field) /
 * RATE_LIMITED + Retry-After / UNAUTHENTICATED (= account lockout window).
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent, JSX } from "react";

import { Button, Input } from "@erp/ui";

import { getDictionary, type Locale } from "../i18n/dictionaries";
import type { LoginResult } from "../lib/api-types";
import { bffFetch } from "../lib/client-api";
import { localizedLoginError } from "../lib/messages";
import { ErrorNotice } from "./notices";

export function LoginForm({ locale }: { locale: Locale }): JSX.Element {
  const d = getDictionary(locale);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [showMfa, setShowMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body: Record<string, string> = { email, password };
    if (showMfa && mfaCode !== "") {
      body.mfaCode = mfaCode;
    }
    const result = await bffFetch<LoginResult>("session", { method: "POST", body });
    if (result.ok) {
      router.replace(`/${locale}`);
      router.refresh();
      return;
    }
    if (result.error.code === "MFA_REQUIRED") {
      setShowMfa(true);
    }
    setError(localizedLoginError(d, result.error, result.retryAfterSeconds));
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-gray-600">{d.loginSubtitle}</p>
      <Input
        id="login-email"
        label={d.loginEmailLabel}
        type="email"
        name="email"
        autoComplete="email"
        required
        value={email}
        onValueChange={setEmail}
      />
      <Input
        id="login-password"
        label={d.loginPasswordLabel}
        type="password"
        name="password"
        autoComplete="current-password"
        required
        value={password}
        onValueChange={setPassword}
      />
      {showMfa && (
        <Input
          id="login-mfa"
          label={d.loginMfaLabel}
          type="text"
          name="mfaCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          hint={d.loginMfaHint}
          mono
          value={mfaCode}
          onValueChange={setMfaCode}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" loading={busy}>
          {d.loginSubmit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setShowMfa(!showMfa);
          }}
        >
          {showMfa ? d.loginMfaHide : d.loginMfaShow}
        </Button>
      </div>
      {error !== null && <ErrorNotice>{error}</ErrorNotice>}
    </form>
  );
}
