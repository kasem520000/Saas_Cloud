import { Inject, type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { identityOf } from "../context/session-context";
import { isPlatformScoped, PLATFORM_SCOPE_KEY } from "./platform-scope.decorator";
import { isPublicRoute, isSessionRoute, routeMatches } from "./route-permissions";
import { tenantSubscriptionReadOnly } from "../../modules/tenancy/api";
import { SubscriptionReadOnlyError } from "../../modules/tenancy/domain/tenancy-errors";

/**
 * PHASE-014 T5 — read-only grace enforcement (SUBSCRIPTION_AND_
 * ENTITLEMENTS §8): while the tenant's subscription is in GRACE, every
 * STATE-CHANGING tenant-plane route fails with the typed
 * `subscription_read_only` error naming the resolving action (pay).
 *
 * Reads are untouched, and the explicitly exempt routes stay alive —
 * reports runs/results, exports, print preview (the grace promise:
 * dashboards, reports, exports and printing continue), plan change (the
 * resolving action itself), notification read-marking, and session/auth
 * surfaces. Platform-plane routes are exempt (billing actions must work
 * during grace). One projection query per state-changing request, cached
 * on the request object.
 */

/** Routes that stay writable during read-only grace (method + path). */
export const READ_ONLY_EXEMPT_ROUTES: readonly { method: string; path: string }[] = [
  { method: "POST", path: "/api/v1/reporting/report-runs" },
  { method: "POST", path: "/api/v1/reporting/report-runs/:id/exports" },
  { method: "POST", path: "/api/v1/tenancy/subscriptions/change-plan" },
  { method: "POST", path: "/api/v1/tenancy/subscriptions/checkout" },
  { method: "PATCH", path: "/api/v1/notifications/:id/read" },
];

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function matchesRoute(method: string, url: string, pattern: string): boolean {
  return routeMatches({ method: method as "GET", path: pattern, permission: "" }, method, url.split("?")[0]!);
}

@Injectable()
export class SubscriptionReadOnlyGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();
    if (SAFE_METHODS.has(method)) {
      return true;
    }
    const url = request.originalUrl ?? request.url;
    if (isPublicRoute(method, url) || isSessionRoute(method, url)) {
      return true;
    }
    if (READ_ONLY_EXEMPT_ROUTES.some((r) => r.method === method && matchesRoute(method, url, r.path))) {
      return true;
    }
    const handler = context.getHandler();
    const controller = context.getClass();
    if (
      isPlatformScoped(
        this.reflector.get<boolean | undefined>(PLATFORM_SCOPE_KEY, handler),
        this.reflector.get<boolean | undefined>(PLATFORM_SCOPE_KEY, controller),
      )
    ) {
      return true;
    }
    const identity = identityOf(request);
    if (identity === undefined || identity.activeTenantId === null) {
      return true;
    }
    const cached = (request as unknown as { __readOnlyChecked?: boolean }).__readOnlyChecked;
    if (cached !== undefined) {
      if (cached) {
        throw new SubscriptionReadOnlyError("subscription in grace period");
      }
      return true;
    }
    const readOnly = await tenantSubscriptionReadOnly(identity.activeTenantId);
    (request as unknown as { __readOnlyChecked?: boolean }).__readOnlyChecked = readOnly;
    if (readOnly) {
      throw new SubscriptionReadOnlyError("subscription in grace period");
    }
    return true;
  }
}
