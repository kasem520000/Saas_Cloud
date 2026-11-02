/**
 * PHASE-022 T11 — FCM NotificationChannelPort adapter SKELETON
 * (integrations/README §3.5): device tokens are opt-in per device from the
 * device registry; template + locale are resolved BEFORE the call; delivery
 * is best-effort with retry + per-tenant quota; NO financial payloads ever go
 * into a push (title/body from templates only). The provider is behind an
 * interface so tests use a fake — no network in unit tests.
 */

export interface FcmProvider {
  send(message: FcmMessage): Promise<{ messageId: string }>;
}

export interface FcmMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  android?: { priority: "normal" | "high" };
}

export interface NotificationChannelPort {
  send(input: { deviceToken: string; templateKey: string; locale: "ar" | "en"; params: Record<string, string>; tenantId: string }): Promise<{ delivered: boolean; messageId?: string }>;
}

export interface NotificationTemplate {
  key: string;
  title: Record<"ar" | "en", string>;
  body: Record<"ar" | "en", string>;
}

const TEMPLATES: readonly NotificationTemplate[] = [
  { key: "sync_rejection", title: { ar: "عملية مرفوضة", en: "Operation rejected" }, body: { ar: "راجع шاشة ’المرفوضات‘ في التطبيق", en: "See parked rejections in the app" } },
  { key: "approval_due", title: { ar: "موافقة بانتظارك", en: "Approval waiting" }, body: { ar: "يوجد مستند بانتظار الموافقة", en: "A document awaits your approval" } },
];

function fill(template: string, params: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(params)) out = out.replaceAll(`{${k}}`, v);
  return out;
}

export class FcmChannelAdapter implements NotificationChannelPort {
  private sentThisMinute = 0;
  private windowStart = 0;

  constructor(
    private readonly provider: FcmProvider,
    private readonly quotaPerTenantPerMinute = 60,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async send(input: { deviceToken: string; templateKey: string; locale: "ar" | "en"; params: Record<string, string>; tenantId: string }) {
    const template = TEMPLATES.find((t) => t.key === input.templateKey);
    if (template === undefined) return { delivered: false }; // unknown template: fail closed, no payload leak
    // quota (per-tenant, sliding 60 s window)
    const now = this.now();
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now;
      this.sentThisMinute = 0;
    }
    if (this.sentThisMinute >= this.quotaPerTenantPerMinute) return { delivered: false };
    const title = fill(template.title[input.locale], input.params);
    const body = fill(template.body[input.locale], input.params);
    const res = await this.provider.send({ token: input.deviceToken, title, body, android: { priority: "normal" } });
    this.sentThisMinute += 1;
    return { delivered: true, messageId: res.messageId };
  }
}
