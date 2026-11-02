"use client";

/**
 * PHASE-015 T11 — industry template picker: lists the active registry
 * (GET configuration/templates), previews the what-will-change diff (POST
 * templates/:key/preview) and applies (POST templates/:key/apply) or
 * switches (POST templates/:key/switch, additive-only per BR-038).
 * All actions are guarded server-side (industry.templates.manage /
 * industry.templates.switch); a 403 surfaces as an error line.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { JSX } from "react";

import { Button } from "@erp/ui";

import { getDictionary, type Locale } from "../i18n/dictionaries";
import type {
  AppliedTemplateView,
  IndustryTemplateRow,
  TemplateApplyView,
  TemplatePreviewView,
} from "../lib/api-types";
import { bffFetch } from "../lib/client-api";

export function TemplatePicker({
  locale,
  templates,
  applied,
}: {
  locale: Locale;
  templates: IndustryTemplateRow[];
  applied: AppliedTemplateView["applied"];
}): JSX.Element {
  const d = getDictionary(locale);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<TemplatePreviewView | null>(null);

  async function run(key: string, action: "preview" | "apply" | "switch"): Promise<void> {
    setBusy(`${action}:${key}`);
    setError(null);
    setNotice(null);
    const result = await bffFetch<TemplatePreviewView | TemplateApplyView>(
      `configuration/templates/${encodeURIComponent(key)}/${action}`,
      { method: "POST", body: {} },
    );
    setBusy(null);
    if (!result.ok) {
      setError(`${action} ${key}`);
      return;
    }
    if (action === "preview") {
      setPreview(result.data as TemplatePreviewView);
      return;
    }
    const done = result.data as TemplateApplyView;
    setNotice(
      action === "apply"
        ? `${d.templatesApplied}: ${done.templateKey}`
        : `${d.templatesSwitched}: ${done.templateKey}`,
    );
    setPreview(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {applied !== null && (
        <p className="text-sm">
          {d.templatesCurrent}: <strong>{applied.key}</strong> ({d.templatesVersion} {applied.version})
        </p>
      )}
      {applied === null && <p className="text-sm">{d.templatesNone}</p>}
      {error !== null && <p className="text-sm text-red-600">{error}</p>}
      {notice !== null && <p className="text-sm text-green-700">{notice}</p>}
      <ul className="flex flex-col gap-3">
        {templates.map((t) => {
          const isCurrent = applied?.key === t.key;
          return (
            <li key={t.key} className="rounded-lg border border-gray-200 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{locale === "ar" && t.nameAr ? t.nameAr : t.name}</p>
                  <p className="text-xs text-gray-500">
                    {t.key} · {d.templatesVersion} {t.version} ·{" "}
                    {t.isActive ? d.templatesStatusActive : d.templatesStatusInactive}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={busy !== null || !t.isActive}
                    onClick={() => void run(t.key, "preview")}
                  >
                    {d.templatesPreview}
                  </Button>
                  {isCurrent ? null : (
                    <Button
                      disabled={busy !== null || !t.isActive}
                      onClick={() => void run(t.key, applied === null ? "apply" : "switch")}
                    >
                      {applied === null ? d.templatesApply : d.templatesSwitch}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {applied !== null && <p className="text-xs text-gray-500">{d.templatesSwitchNote}</p>}
      {preview !== null && (
        <div className="rounded-lg border border-gray-200 p-4 text-sm">
          <p className="font-medium">
            {d.templatesPreview}: {preview.templateKey} ({preview.version})
          </p>
          {preview.blocked ? (
            <p className="text-red-600">— {preview.missingRequired.join(", ")}</p>
          ) : (
            <ul className="list-disc ms-5">
              {preview.addedCapabilities.map((c) => (
                <li key={c}>{c}</li>
              ))}
              {preview.phaseGated.map((g) => (
                <li key={g.key}>
                  {g.key} ({g.phase})
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
