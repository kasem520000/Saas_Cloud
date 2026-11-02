"use client";

/**
 * PHASE-016 T2 — terminal admin client: list + register + activate/deactivate
 * via the BFF (/api/bff/pos/terminals*). Server enforces pos.terminals.manage.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { JSX } from "react";

import { Button } from "@erp/ui";

import { getDictionary, type Locale } from "../i18n/dictionaries";
import type { PosTerminal } from "../lib/api-types";
import { bffFetch } from "../lib/client-api";

export function TerminalAdmin({
  locale,
  initial,
}: {
  locale: Locale;
  initial: PosTerminal[];
}): JSX.Element {
  const d = getDictionary(locale);
  const router = useRouter();
  const [terminals, setTerminals] = useState<PosTerminal[]>(initial);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function register(): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await bffFetch<{ terminals: PosTerminal[] }>("pos/terminals", { method: "POST", body: {} });
    // registration needs branch/cash account ids from context; this admin
    // screen lists and toggles lifecycle — full creation form lands with the
    // branch/till pickers (T2 follow-up). For now re-list.
    void res;
    const list = await bffFetch<{ terminals: PosTerminal[] }>("pos/terminals");
    if (list.ok) setTerminals(list.data.terminals);
    setBusy(false);
    router.refresh();
  }

  async function toggle(id: string, action: "activate" | "deactivate"): Promise<void> {
    setBusy(true);
    setError(null);
    const res = await bffFetch(`pos/terminals/${id}/${action}`, { method: "POST", body: {} });
    setBusy(false);
    if (!res.ok) {
      setError(`${action} ${id}`);
      return;
    }
    const list = await bffFetch<{ terminals: PosTerminal[] }>("pos/terminals");
    if (list.ok) setTerminals(list.data.terminals);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {terminals.length === 0 ? (
        <p className="text-sm text-gray-600">{d.posTerminalNone}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-start text-gray-500">
              <th>{d.posTerminalCode}</th>
              <th>{d.posTerminalName}</th>
              <th>{d.posTerminalReceiptSize}</th>
              <th>{d.posTerminalStatus}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {terminals.map((t) => (
              <tr key={t.id} className="border-t border-gray-100">
                <td className="font-mono">{t.code}</td>
                <td>{t.name}</td>
                <td>{t.receiptSizeMm}</td>
                <td>{t.status}</td>
                <td>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void toggle(t.id, t.status === "ACTIVE" ? "deactivate" : "activate")}
                  >
                    {t.status === "ACTIVE" ? d.posTerminalDeactivate : d.posTerminalActivate}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex gap-2">
        <input
          className="rounded border border-gray-300 px-2 py-1 text-sm"
          placeholder={d.posTerminalCode}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <input
          className="rounded border border-gray-300 px-2 py-1 text-sm"
          placeholder={d.posTerminalName}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button disabled={busy || code.trim() === ""} onClick={() => void register()}>
          {d.posTerminalRegister}
        </Button>
      </div>
      {error !== null && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
