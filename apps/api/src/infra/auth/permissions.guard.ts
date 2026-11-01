import {
  Inject,
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

import { withTenant } from "../db/tenant-context";
import { AuditService } from "../../modules/audit/api/audit";
import { effectivePermissions } from "../../modules/identity/infrastructure/identity.store";
import { ForbiddenError, UnauthenticatedError } from "../../modules/identity/domain/identity-errors";
import { identityOf } from "../context/session-context";
import { withPlatformScope } from "../db/tenant-context";
import {
  isPlatformScoped,
  PLATFORM_SCOPE_KEY,
} from "./platform-scope.decorator";
import { REQUIRE_PERMISSIONS_KEY, type RequirePermissionMetadata } from "./require-permissions.decorator";

/**
 * PermissionsGuard (matrix §8 layer 1): the single admission point.
 * Anonymous → 401 UNAUTHENTICATED; authenticated without the key → 403
 * FORBIDDEN + audit event (risky-action audit rule) in the caller's tenant
 * scope. Effective permissions come from the definer projection
 * (pre-GUC resolution, migration 0003) for the session's ACTIVE membership;
 * self-scoped keys (identity.mfa.manage) are granted to every
 * authenticated user for self-targeted routes only.
 */

const SELF_SCOPE_KEYS = new Set(["identity.mfa.manage"]);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.get<RequirePermissionMetadata | undefined>(
      REQUIRE_PERMISSIONS_KEY,
      context.getHandler(),
    );
    if (metadata === undefined) {
      return true; // route declares no permission — session-only or public
    }
    const request = context.switchToHttp().getRequest<Request>();
    const identity = identityOf(request);
    if (identity === undefined) {
      throw new UnauthenticatedError(); // anonymous → 401 (acceptance 5)
    }
    const tenantId = identity.activeTenantId;
    if (tenantId === null) {
      throw new ForbiddenError(metadata.key);
    }
    const permissions =
      identity.permissions ??
      (identity.permissions = await effectivePermissions(identity.userId, tenantId));
    const granted =
      permissions.has(metadata.key) ||
      (metadata.self === true && SELF_SCOPE_KEYS.has(metadata.key));
    if (!granted) {
      const platformRoute = isPlatformScoped(
        this.reflector.get<boolean | undefined>(PLATFORM_SCOPE_KEY, context.getHandler()),
        this.reflector.get<boolean | undefined>(PLATFORM_SCOPE_KEY, context.getClass()),
      );
      if (platformRoute) {
        // S-07: platform-surface denials land on the PLATFORM trail (§2.9:
        // tenant_id NULL + via_platform_admin) — escalation attempts from
        // business-tenant sessions are visible to the platform auditor.
        await withPlatformScope(async () => {
          await this.audit.recordPlatform({
            action: "permission.denied",
            entityType: "user",
            entityId: identity.userId,
            actorId: identity.userId,
            after: { route_permission: metadata.key, target_tenant: tenantId },
          });
        }).catch(() => undefined);
      } else {
        await withTenant(tenantId, async () => {
          await this.audit.record({
            action: "permission.denied",
            entityType: "user",
            entityId: identity.userId,
            actorId: identity.userId,
            after: { route_permission: metadata.key },
          });
        }).catch(() => undefined);
      }
      throw new ForbiddenError(metadata.key); // 403 + audit (acceptance 5)
    }
    return true;
  }
}
