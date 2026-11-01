"use client";

/**
 * PHASE-014 T3 — platform console manual-payment fallback (A-009): records a
 * manual payment on an OPEN invoice via POST
 * /api/bff/platform/tenants/:id/billing/invoices/:invoiceId/manual-payment
 * (server-guarded: platform.subscriptions.manage; reason required; audited
 * via_platform_admin). Produces the identical end state as the provider path.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { JSX } from "react";

import { Button, Input } from "@erp/ui";

import { getDictionary, type Locale } from "../i18n/dictionaries";
import type { ConsoleInvoiceRow } from "../lib/api-types";
import { bffFetch } from "../lib/client-api";

export function PlatformManualPayment({
  locale,
  tenantId,
  invoices,
}: {
  locale: Locale;
  tenantId: string;
  invoices: readonly ConsoleInvoiceRow[];
}): JSX.Element {
  const d = getDictionary(locale);
  const router = useRouter();
  const [invoiceId, setInvoiceId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const open = invoices.filter((invoice) => invoice.status === "OPEN");

  async function record(): Promise<void> {
    setBusy(true);
    setMessage(null);
    const result = await bffFetch(
      `platform/tenants/${encodeURIComponent(tenantId)}/billing/invoices/${encodeURIComponent(invoiceId)}/manual-payment`,
      { method: "POST", body: { reason } },
    );
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "err", text: d.platformPaymentError });
      return;
    }
    setMessage({ tone: "ok", text: d.platformPaymentSuccess });
    setReason("");
    router.refresh();
  }

  if (open.length === 0) {
    return <p className="text-sm text-gray-600">{d.platformNoOpenInvoices}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        className="w-full max-w-md rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        value={invoiceId}
        onChange={(e) => setInvoiceId(e.target.value)}
      >
        <option value="" disabled>
          {d.billingInvoices}…
        </option>
        {open.map((invoice) => (
          <option key={invoice.id} value={invoice.id}>
            {invoice.number} — {invoice.amount} {invoice.currencyCode} ({d.billingDue}: {invoice.dueDate})
          </option>
        ))}
      </select>
      <Input
        value={reason}
        onValueChange={setReason}
        placeholder={d.platformPaymentReason}
      />
      <div>
        <Button
          variant="primary"
          disabled={busy || invoiceId === "" || reason.trim() === ""}
          onClick={() => void record()}
        >
          {d.platformRecordPayment}
        </Button>
      </div>
      {message !== null ? (
        <p className={`text-sm ${message.tone === "ok" ? "text-green-700" : "text-red-600"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
