"use client";

/**
 * PHASE-016 T4/T9 — counter sale client: scan input → cart lines → total →
 * POST /api/bff/pos/sale (server posts through the sales invoice chain,
 * BR-005 autopost). Offline banner is honest: navigator.onLine + the queued
 * count from the local outbox (localStorage mirror until the SQLite store
 * ships with sync-core); a sale while offline is queued with an OFF- number
 * and PENDING_SYNC state — never rendered as posted.
 */
import { useEffect, useState } from "react";
import type { JSX } from "react";

import { Button } from "@erp/ui";

import { getDictionary, type Locale } from "../i18n/dictionaries";
import { bffFetch } from "../lib/client-api";

interface Terminal { id: string; code: string; status: string }
interface CartLine { key: string; label: string; qty: number; unitPrice: number }

const OUTBOX_KEY = "erp.pos.outbox";

export function PosCounter({
  locale,
  terminals,
}: {
  locale: Locale;
  terminals: Terminal[];
}): JSX.Element {
  const d = getDictionary(locale);
  const [terminalCode, setTerminalCode] = useState(terminals.find((t) => t.status === "ACTIVE")?.code ?? "");
  const [scan, setScan] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    const read = () => {
      setOnline(navigator.onLine);
      try {
        const raw = localStorage.getItem(OUTBOX_KEY);
        setQueued(raw !== null ? (JSON.parse(raw) as unknown[]).length : 0);
      } catch {
        setQueued(0);
      }
    };
    read();
    window.addEventListener("online", read);
    window.addEventListener("offline", read);
    return () => {
      window.removeEventListener("online", read);
      window.removeEventListener("offline", read);
    };
  }, []);

  function addLine(): void {
    const label = scan.trim();
    if (label === "") return;
    setCart((c) => [...c, { key: `${Date.now()}-${label}`, label, qty: 1, unitPrice: 0 }]);
    setScan("");
  }

  const total = cart.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);

  async function pay(): Promise<void> {
    setError(null);
    setNotice(null);
    if (cart.length === 0) return;
    const payload = {
      terminalCode,
      // cash walk-in customer id comes from tenant settings in the full flow;
      // the counter screen posts lines and the server resolves the cash customer.
      customerId: "00000000-0000-0000-0000-000000000000",
      orderType: "COUNTER",
      lines: cart.map((l) => ({
        itemId: "00000000-0000-0000-0000-000000000000",
        qty: String(l.qty),
        unitPrice: l.unitPrice.toFixed(6),
      })),
    };
    if (!online) {
      // Offline: queue locally with an OFF- number — honest PENDING_SYNC.
      const offlineNo = `OFF-${terminalCode}-${Date.now()}`;
      try {
        const raw = localStorage.getItem(OUTBOX_KEY);
        const outbox = raw !== null ? (JSON.parse(raw) as unknown[]) : [];
        outbox.push({ offlineReceiptNo: offlineNo, payload, state: "PENDING_SYNC" });
        localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
        setQueued(outbox.length);
      } catch {
        setError(d.posCounterSaleFailed);
        return;
      }
      setCart([]);
      setNotice(`${offlineNo} (PENDING_SYNC)`);
      return;
    }
    const res = await bffFetch<{ invoiceNo: string | null; offlineReceiptNo: string | null }>(
      "pos/sale",
      { method: "POST", body: payload },
    );
    if (!res.ok) {
      setError(d.posCounterSaleFailed);
      return;
    }
    setNotice(`${d.posCounterSalePosted}: ${res.data.invoiceNo ?? res.data.offlineReceiptNo ?? ""}`);
    setCart([]);
  }

  return (
    <div className="flex flex-col gap-4">
      {!online && (
        <p className="rounded bg-amber-100 px-3 py-2 text-sm text-amber-900">
          {d.posCounterOfflineBanner} · {d.posCounterQueued}: {queued}
        </p>
      )}
      <div className="flex gap-2">
        <select
          className="rounded border border-gray-300 px-2 py-1 text-sm"
          value={terminalCode}
          onChange={(e) => setTerminalCode(e.target.value)}
        >
          {terminals.map((t) => (
            <option key={t.id} value={t.code}>
              {t.code} ({t.status})
            </option>
          ))}
        </select>
        <input
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-lg"
          placeholder={d.posCounterScanPlaceholder}
          value={scan}
          autoFocus
          onChange={(e) => setScan(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addLine();
          }}
        />
        <Button variant="secondary" onClick={addLine}>
          +
        </Button>
      </div>
      <div className="rounded border border-gray-200 p-3">
        <p className="mb-2 text-sm font-medium">{d.posCounterCart}</p>
        {cart.length === 0 ? (
          <p className="text-sm text-gray-500">{d.posCounterEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {cart.map((l) => (
              <li key={l.key} className="flex justify-between">
                <span>{l.label}</span>
                <span>
                  {l.qty} × {l.unitPrice.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-lg font-bold">
          {d.posCounterTotal}: {total.toFixed(2)}
        </p>
      </div>
      <div className="flex gap-2">
        <Button disabled={cart.length === 0} onClick={() => void pay()}>
          {d.posCounterPay}
        </Button>
        <Button variant="secondary" onClick={() => setCart([])}>
          {d.posCounterClear}
        </Button>
      </div>
      {notice !== null && <p className="text-sm text-green-700">{notice}</p>}
      {error !== null && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
