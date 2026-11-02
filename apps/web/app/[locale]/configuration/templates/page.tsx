/**
 * PHASE-015 T11 — /{locale}/configuration/templates: industry template
 * registry (list/preview/apply/switch). Data: GET configuration/templates +
 * GET configuration/template — server-guarded (configuration.config.read +
 * industry.template_engine); manage actions enforce industry.templates.manage
 * server-side. The nav item lives in NAV_ITEMS (settings.templates).
 */
import { notFound, redirect } from "next/navigation";
import type { JSX } from "react";

import { AppShell } from "../../../../components/app-shell";
import { ErrorState } from "../../../../components/client-ui";
import { Card } from "../../../../components/card";
import { RetryButton } from "../../../../components/retry-button";
import { TemplatePicker } from "../../../../components/template-picker";
import { getDictionary, isLocale, type Locale } from "../../../../i18n/dictionaries";
import type {
  AppliedTemplateView,
  IndustryTemplatesResponse,
} from "../../../../lib/api-types";
import { localizedApiError } from "../../../../lib/messages";
import { fetchApi, requireSessionToken } from "../../../../lib/server-api";

export default async function TemplatesPage({
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

  const [templatesRes, appliedRes] = await Promise.all([
    fetchApi<IndustryTemplatesResponse>("configuration/templates"),
    fetchApi<AppliedTemplateView>("configuration/template"),
  ]);
  if (!templatesRes.ok && templatesRes.status === 401) {
    redirect(`/${localeValue}/login`);
  }

  let content: JSX.Element;
  if (!templatesRes.ok || !appliedRes.ok) {
    const failed = !templatesRes.ok ? templatesRes : (appliedRes as Extract<typeof appliedRes, { ok: false }>);
    content = (
      <ErrorState
        title={localizedApiError(d, failed.error, failed.retryAfterSeconds)}
        retry={<RetryButton label={d.retryLabel} />}
      />
    );
  } else {
    content = (
      <Card title={d.templatesPageTitle}>
        <p className="mb-4 text-sm text-gray-600">{d.templatesPageDescription}</p>
        <TemplatePicker
          locale={localeValue}
          templates={templatesRes.data.templates}
          applied={appliedRes.ok ? appliedRes.data.applied : null}
        />
      </Card>
    );
  }

  return (
    <AppShell locale={localeValue} pagePath="configuration/templates" title={d.templatesPageTitle}>
      {content}
    </AppShell>
  );
}
