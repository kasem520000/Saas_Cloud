import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { identityOf } from "../context/session-context";
import { isPlatformScoped, PLATFORM_SCOPE_KEY } from "./platform-scope.decorator";
import { LIMIT_CHECK_KEY } from "./limit-check.decorator";
import { UsageService, type HardBlockKind } from "../../modules/tenancy/api";

/**
 * PHASE-014 T6 — usage-limits guard: enforces the §6 HARD-BLOCK tier on
 * annotated creation routes (invite user / create branch / create warehouse
 * / activate terminal / activate device). Soft warnings (80%/100%) are
 * emitted by the UsageService when counters cross; this guard only blocks
 * at the ceiling. Never applied to posting routes (INV-022).
 */
@Injectable()
export class UsageLimitsGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(UsageService) private readonly usage: UsageService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const kind = this.reflector.get<HardBlockKind | undefined>(LIMIT_CHECK_KEY, context.getHandler());
    if (kind === undefined) {
      return true;
    }
    const platformRoute = isPlatformScoped(
      this.reflector.get<boolean | undefined>(PLATFORM_SCOPE_KEY, context.getHandler()),
      this.reflector.get<boolean | undefined>(PLATFORM_SCOPE_KEY, context.getClass()),
    );
    if (platformRoute) {
      return true; // platform staff actions are not tenant-limited
    }
    const request = context.switchToHttp().getRequest<Request>();
    const identity = identityOf(request);
    if (identity === undefined || identity.activeTenantId === null) {
      return true;
    }
    await this.usage.assertCanCreateFor(identity.activeTenantId, kind);
    return true;
  }
}
