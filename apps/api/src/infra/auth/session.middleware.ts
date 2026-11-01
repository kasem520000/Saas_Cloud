import { Inject, Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

import { SessionService } from "../../modules/identity/application/session-service";
import * as store from "../../modules/identity/infrastructure/identity.store";
import { setIdentity, type SessionContext } from "../context/session-context";

/**
 * Session middleware (PHASE-003 T11): resolves the BFF-presented
 * X-Session-Token into a request-scoped identity context — the API plane
 * never reads cookies (CSRF-exempt by construction, AUTHENTICATION §1).
 * Failure here is deferred: public routes stay reachable without a
 * session; protected surfaces reject through the PermissionsGuard.
 */
@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}

  async use(request: Request, _response: Response, next: NextFunction): Promise<void> {
    const presented = request.header("x-session-token");
    if (presented !== undefined && presented !== "") {
      try {
        const validation = await this.sessions.validate(presented);
        const user = await store.findUserById(validation.userId);
        if (user !== undefined && user.status !== "DEACTIVATED") {
          const context: SessionContext = {
            sessionId: validation.sessionId,
            userId: user.id,
            user: {
              email: user.email,
              fullName: user.fullName,
              locale: user.locale,
              status: user.status,
            },
            activeTenantId: validation.activeTenantId,
          };
          setIdentity(request, context);
          // Sliding window bookkeeping (M-01): cheap, off the critical path.
          await store.touchSessionLastSeen(validation.sessionId).catch(() => undefined);
        }
      } catch {
        // Invalid/expired/revoked token → anonymous; guards will 401 where
        // the surface requires a session (uniform shape, no oracle).
      }
    }
    next();
  }
}
