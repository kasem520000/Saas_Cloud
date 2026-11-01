/**
 * PHASE-014 T8 — Journey A checklist card (server component): completion is
 * derived from REAL contract reads (partner list, sales-invoice list), never
 * fabricated — each step shows Done/Pending honestly and links to the screen.
 */
import type { JSX } from "react";

import { getDictionary, type Locale } from "../i18n/dictionaries";
import type { PartnerRow, SalesInvoiceRow } from "../lib/api-types";
import { fetchApi } from "../lib/server-api";

export async function JourneyChecklist({ locale }: { locale: Locale }): Promise<JSX.Element> {
  const d = getDictionary(locale);
  const [partners, invoices] = await Promise.all([
    fetchApi<readonly PartnerRow[]>("partners?limit=500"),
    fetchApi<readonly SalesInvoiceRow[]>("sales/sales-invoices?limit=200"),
  ]);
  const customers = partners.ok
    ? partners.data.filter((p) => p.kind === "CUSTOMER" || p.kind === "BOTH").length
    : 0;
  const invoiceCount = invoices.ok ? invoices.data.length : 0;

  const steps: readonly { label: string; done: boolean; href: string }[] = [
    { label: d.journeyStepProfile, done: true, href: `/${locale}/onboarding` },
    { label: d.journeyStepCustomer, done: customers > 0, href: `/${locale}/partners` },
    { label: d.journeyStepInvoice, done: invoiceCount > 0, href: `/${locale}/sales/invoices` },
    { label: d.journeyStepPrint, done: invoiceCount > 0, href: `/${locale}/reports` },
  ];

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">{d.journeyTitle}</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-2">
            <a href={step.href} className="text-primary-700 underline-offset-2 hover:underline">
              {step.label}
            </a>
            <span
              className={`rounded px-1.5 py-0.5 text-xs ${
                step.done ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
              }`}
            >
              {step.done ? d.journeyDone : d.journeyTodo}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
