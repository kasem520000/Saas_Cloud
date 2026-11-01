"use client";

/**
 * P4-T12a — onboarding wizard (Wizard archetype): stepper (ordered list,
 * token styling), each step a form section (fieldset+legend), sticky action
 * rail. Step 1 collects the fiscal start month + the numbering assign-at
 * policy; POST /api/bff/tenancy/onboarding/provision returns the idempotent
 * diff; step 2 shows created-vs-existing counts (roles/accounts/purposes/
 * settings) and — when nothing was created — the "re-run produces zero
 * duplicates" hint.
 */
import { useState } from "react";
import type { JSX } from "react";

import { Button, Select } from "@erp/ui";

import { getDictionary, monthNames, type Locale } from "../i18n/dictionaries";
import type { ProvisionDiff } from "../lib/api-types";
import { bffFetch } from "../lib/client-api";
import { formatMessage, localizedTenancyError } from "../lib/messages";
import { Card } from "./card";
import { DefList } from "./def-list";
import { LinkButton } from "./link-button";
import { ErrorNotice, SuccessNotice } from "./notices";

type AssignAt = "posting" | "approval";

export function OnboardingWizard({ locale }: { locale: Locale }): JSX.Element {
  const d = getDictionary(locale);
  const [step, setStep] = useState<1 | 2>(1);
  const [fiscalMonth, setFiscalMonth] = useState("1");
  const [assignAt, setAssignAt] = useState<AssignAt>("posting");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<ProvisionDiff | null>(null);

  async function onProvision(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await bffFetch<ProvisionDiff>("tenancy/onboarding/provision", {
      method: "POST",
      body: {
        fiscalCalendarStartMonth: Number.parseInt(fiscalMonth, 10),
        numberingAssignAt: assignAt,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setError(localizedTenancyError(d, result.error, result.retryAfterSeconds));
      return;
    }
    setDiff(result.data);
    setStep(2);
  }

  const steps = [d.settingsFiscalNumberingTitle, d.onboardingResultTitle];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-600">{d.onboardingSubtitle}</p>

      {/* Stepper — ordered list, flows start→end, active step announced */}
      <ol className="flex flex-wrap items-center gap-2" aria-label={d.onboardingTitle}>
        {steps.map((label, index) => {
          const stepNumber = index + 1;
          const active = step === stepNumber;
          const done = step > stepNumber;
          return (
            <li key={label} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
              <span
                className={
                  active
                    ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 font-mono text-xs text-white"
                    : done
                      ? "flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 font-mono text-xs text-primary-800"
                      : "flex h-6 w-6 items-center justify-center rounded-full border border-default bg-surface-card font-mono text-xs text-gray-600"
                }
              >
                {stepNumber}
              </span>
              <span className={active ? "text-sm font-medium text-gray-900" : "text-sm text-gray-600"}>
                {label}
              </span>
              {stepNumber < steps.length && <span aria-hidden="true" className="text-gray-400">—</span>}
            </li>
          );
        })}
      </ol>
      <p className="sr-only">{formatMessage(d.wizardStepOf, { current: step, total: steps.length })}</p>

      {step === 2 && diff !== null ? (
        <div className="flex flex-col gap-4">
          <Card title={d.onboardingResultTitle} ariaLabel={d.onboardingResultTitle}>
            <DefList
              items={[
                {
                  term: d.onboardingRolesLabel,
                  children: (
                    <span>
                      {formatMessage(d.onboardingCreatedCount, {
                        created: diff.roles.created.length,
                        existing: diff.roles.existing.length,
                      })}
                      {diff.roles.created.length > 0 && (
                        <span className="font-mono text-xs text-gray-500"> — {diff.roles.created.join(", ")}</span>
                      )}
                    </span>
                  ),
                },
                {
                  term: d.onboardingAccountsLabel,
                  children: formatMessage(d.onboardingCreatedCount, {
                    created: diff.accounts.created,
                    existing: diff.accounts.existing,
                  }),
                },
                {
                  term: d.onboardingPurposesLabel,
                  children: formatMessage(d.onboardingCreatedCount, {
                    created: diff.purposes.created,
                    existing: diff.purposes.existing,
                  }),
                },
                {
                  term: d.onboardingSettingsLabel,
                  children: (
                    <span>
                      {formatMessage(d.onboardingCreatedCount, {
                        created: diff.settings.created.length,
                        existing: diff.settings.existing.length,
                      })}
                      {diff.settings.created.length > 0 && (
                        <span className="font-mono text-xs text-gray-500"> — {diff.settings.created.join(", ")}</span>
                      )}
                    </span>
                  ),
                },
              ]}
            />
            {diff.roles.created.length === 0 &&
              diff.accounts.created === 0 &&
              diff.purposes.created === 0 &&
              diff.settings.created.length === 0 && (
                <SuccessNotice className="mt-3">{d.onboardingZeroDuplicatesHint}</SuccessNotice>
              )}
          </Card>
          {/* Sticky action rail (Wizard archetype): primary exit + secondary */}
          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-subtle bg-surface-card py-3">
            <LinkButton href={`/${locale}`} variant="primary">
              {d.onboardingGoHome}
            </LinkButton>
            <LinkButton href={`/${locale}/branches`} variant="secondary">
              {d.onboardingGoBranches}
            </LinkButton>
          </div>
        </div>
      ) : (
        <Card className="w-full max-w-xl">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onProvision();
            }}
            noValidate
          >
            <fieldset className="flex flex-col gap-4" disabled={busy}>
              <legend className="mb-2 text-sm font-medium text-gray-700">
                {d.settingsFiscalNumberingTitle}
              </legend>
              <Select
                id="onb-fiscal-month"
                label={d.fiscalStartMonthLabel}
                value={fiscalMonth}
                onValueChange={setFiscalMonth}
                options={monthNames[locale].map((name, index) => ({
                  value: String(index + 1),
                  label: name,
                }))}
              />
              <Select
                id="onb-assign-at"
                label={d.numberingAssignAtLabel}
                value={assignAt}
                onValueChange={(value) => setAssignAt(value as AssignAt)}
                options={[
                  { value: "posting", label: d.numberingAssignAtPosting },
                  { value: "approval", label: d.numberingAssignAtApproval },
                ]}
              />
            </fieldset>
            {/* Sticky action rail — the single primary action of the step */}
            <div className="sticky bottom-0 mt-4 flex items-center justify-end gap-2 border-t border-subtle pt-3">
              <Button type="submit" variant="primary" loading={busy}>
                {d.onboardingProvisionButton}
              </Button>
            </div>
          </form>
          {error !== null && <ErrorNotice className="mt-3">{error}</ErrorNotice>}
        </Card>
      )}
    </div>
  );
}
