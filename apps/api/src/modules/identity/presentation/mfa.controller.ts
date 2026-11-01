import { Body, Controller, Delete, HttpCode, HttpStatus, Inject, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { envelope } from "../../../infra/http/envelope";
import { identityOf } from "../../../infra/context/session-context";
import { RequirePermissions } from "../../../infra/auth/require-permissions.decorator";
import { MfaService } from "../application/mfa-service";
import { UnauthenticatedError } from "../domain/identity-errors";

/**
 * MFA routes (AUTHENTICATION §3): enroll → PENDING factor + secret shown
 * once; verify → confirmed only with a valid code; recovery codes
 * regenerate (hashed at rest); disable requires a valid code. All
 * self-scoped: identity.mfa.manage is granted to every authenticated user
 * for own resources (matrix §3.9 "every user (self)").
 */

const codeSchema = z.object({ code: z.string().min(6).max(10) });
const disableSchema = z.object({ code: z.string().min(6).max(10) });

@Controller("api/v1/identity/mfa")
export class MfaController {
  constructor(@Inject(MfaService) private readonly mfa: MfaService) {}

  @Post("totp/enroll")
  @RequirePermissions("identity.mfa.manage", { self: true })
  @HttpCode(HttpStatus.OK)
  async enroll(@Req() request: Request) {
    const identity = requireIdentity(request);
    const result = await this.mfa.enroll(identity.userId);
    return envelope(result);
  }

  @Post("totp/verify")
  @RequirePermissions("identity.mfa.manage", { self: true })
  @HttpCode(HttpStatus.OK)
  async verify(@Req() request: Request, @Body() body: unknown) {
    const identity = requireIdentity(request);
    const input = codeSchema.parse(body);
    await this.mfa.verify(identity.userId, input.code);
    return envelope({ confirmed: true });
  }

  @Delete("totp")
  @RequirePermissions("identity.mfa.manage", { self: true })
  async disable(@Req() request: Request, @Body() body: unknown) {
    const identity = requireIdentity(request);
    const input = disableSchema.parse(body);
    await this.mfa.disable(identity.userId, input.code);
    return envelope({ disabled: true });
  }

  @Post("recovery-codes")
  @RequirePermissions("identity.mfa.manage", { self: true })
  @HttpCode(HttpStatus.OK)
  async regenerate(@Req() request: Request) {
    const identity = requireIdentity(request);
    const codes = await this.mfa.regenerateRecoveryCodes(identity.userId);
    return envelope({ codes });
  }
}

function requireIdentity(request: Request) {
  const identity = identityOf(request);
  if (identity === undefined) {
    throw new UnauthenticatedError();
  }
  return identity;
}
