import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";

import { envelope } from "../../../../infra/http/envelope";
import { BillingService } from "../../application/billing/billing-service";

/**
 * PHASE-014 T2 — the payment-provider webhook (public plane: providers call
 * it without a session; signature verification + replay protection inside
 * the service — SECRETS_MANAGEMENT, INV-013 discipline). The sandbox
 * provider posts `X-Provider-Signature: t=…,v1=…` over the raw body.
 */

@Controller("api/v1/public/billing")
export class BillingWebhookController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async webhook(@Req() request: Request, @Body() body: unknown): Promise<unknown> {
    const raw = typeof body === "string" ? body : JSON.stringify(body ?? {});
    const signature = request.header("x-provider-signature") ?? "";
    const result = await this.billing.handleWebhook(raw, signature);
    return envelope(result);
  }
}
