import { Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { lastValueFrom, Observable } from "rxjs";

import { withPlatformScope, withTenant } from "../db/tenant-context";
import { isPlatformScoped, PLATFORM_SCOPE_KEY } from "../auth/platform-scope.decorator";
import { membershipOptions } from "../../modules/identity/infrastructure/identity.store";
import {
  TenantSuspendedError,
  TenantContextRequiredError,
} from "../../modules/identity/domain/identity-errors";
import { identityOf, type SessionContext } from "../context/session-context";

/**
 * Tenant-context interceptor (PHASE-003 T11; MULTI_TENANCY §2 lifecycle):
 * establish (session → user → active membership), validate (membership
 * ACTIVE, tenant ACTIVE — S-02 enforcement), propagate (AsyncLocalStorage →
 * `SET LOCAL` GUC via the PHASE-002 unit-of-work), and clear on the way
 * out. The handler (and everything it awaits) runs INSIDE the tenant
 * transaction: RLS covers every tenant-owned touch, and audit events land
 * in the same UoW. The correlation id flows from the RequestIdMiddleware
 * ALS scope into withTenant automatically. Suspended tenants fail with
 * 503 TENANT_SUSPENDED (M-09: state exists; the suspend action itself
 * ships in PHASE-004).
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const identity: SessionContext | undefined = identityOf(request);
    if (identity === undefined || identity.activeTenantId === null) {
      // Public + session-self routes run without a tenant scope; tenant
      // surfaces are guarded by RequirePermissions (which requires one).
      return next.handle();
    }
    const options =
      identity.memberships ?? (identity.memberships = await membershipOptions(identity.userId));
    const active = options.find(
      (option) =>
        option.tenantId === identity.activeTenantId && option.membershipStatus === "ACTIVE",
    );
    if (active === undefined) {
      throw new TenantContextRequiredError();
    }
    if (active.tenantStatus === "SUSPENDED") {
      // MULTI_TENANCY §3 rule 6: a suspended tenant keeps ONLY the admin
      // console accessible — never a tenant-scope session. (The platform
      // operations tenant is lifecycle-protected from suspension; if it
      // ever ends up suspended this fails closed too.)
      throw new TenantSuspendedError(); // 503 tenant_suspended (S-02)
    }
    identity.activeTenant = active;
    const platformRoute = isPlatformScoped(
      this.reflector.get<boolean | undefined>(PLATFORM_SCOPE_KEY, context.getHandler()),
      this.reflector.get<boolean | undefined>(PLATFORM_SCOPE_KEY, context.getClass()),
    );
    // Lazily enter the right UoW at subscription time: platform routes
    // run in the platform GUC envelope (ADR-0005 platform path; console
    // services add per-operation tenant scoping); every other route in
    // the tenant transaction (RLS on every tenant-owned touch; audit in
    // the same UoW). A business-tenant session on a platform route is
    // rejected by the permission guard BEFORE this interceptor commits
    // any scope — no cross-tenant envelope is ever handed to a tenant.
    return new Observable<unknown>((subscriber) => {
      void (platformRoute
        ? withPlatformScope(async () => {
            try {
              const result = await lastValueFrom(next.handle());
              subscriber.next(result);
              subscriber.complete();
            } catch (error) {
              subscriber.error(error);
            }
          })
        : withTenant(active.tenantId, async () => {
            try {
              const result = await lastValueFrom(next.handle());
              subscriber.next(result);
              subscriber.complete();
            } catch (error) {
              subscriber.error(error);
            }
          }));
    });
  }
}
