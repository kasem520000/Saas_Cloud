import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { envelope } from "../../../infra/http/envelope";
import { identityOf, type SessionContext } from "../../../infra/context/session-context";
import { RequirePermissions } from "../../../infra/auth/require-permissions.decorator";
import { RequireFeature } from "../../../infra/auth/require-feature.decorator";
import { UnauthenticatedError } from "../../identity/api/identity";
import { ConfigurationService } from "../application/configuration.service";
import { TemplateApplyService } from "../application/template-apply.service";

/**
 * PHASE-015 — tenant-plane configuration routes (CONFIGURATION_ENGINE §8;
 * matrix §3.8): the effective-config read (request-scoped: L6 overlay +
 * L9 derivation included), the template registry read, and the audited
 * apply/switch/preview actions (BR-038). Every route carries its matrix key
 * (route-permissions.ts).
 */

const templateKeySchema = z.object({ key: z.string().regex(/^industry\.[a-z][a-z0-9_]{2,30}$/) });

function requireIdentity(request: Request): SessionContext {
  const identity = identityOf(request);
  if (identity === undefined) {
    throw new UnauthenticatedError();
  }
  return identity;
}

@Controller("api/v1/configuration")
export class ConfigurationController {
  constructor(
    private readonly configuration: ConfigurationService,
    private readonly applyService: TemplateApplyService,
  ) {}

  /** GET /api/v1/configuration/effective-config — tenant-static merge + L6/L9. */
  @Get("effective-config")
  @RequirePermissions("configuration.config.read")
  @RequireFeature("industry.template_engine")
  async effectiveConfig(@Req() request: Request): Promise<unknown> {
    const identity = requireIdentity(request);
    const principal = {
      userId: identity.userId,
      role: identity.activeTenant?.roleKey ?? "member",
      branchScope: [] as string[],
      permissions: identity.permissions !== undefined ? [...identity.permissions] : [],
    };
    return envelope(await this.configuration.resolveForRequest(principal));
  }

  /** GET /api/v1/configuration/templates — the active registry (selection UIs). */
  @Get("templates")
  @RequirePermissions("configuration.config.read")
  @RequireFeature("industry.template_engine")
  async listTemplates(): Promise<unknown> {
    const rows = await this.configuration.listTemplates();
    return envelope({
      templates: rows.map((row) => ({
        key: row.key,
        name: row.name,
        nameAr: row.nameAr,
        version: row.version,
        isActive: row.isActive,
      })),
    });
  }

  /** GET /api/v1/configuration/template — the tenant's applied template. */
  @Get("template")
  @RequirePermissions("configuration.config.read")
  @RequireFeature("industry.template_engine")
  async appliedTemplate(): Promise<unknown> {
    const applied = await this.applyServicePreviewApplied();
    return envelope(applied);
  }

  /** POST /api/v1/configuration/templates/:key/preview — what-will-change diff. */
  @Post("templates/:key/preview")
  @RequirePermissions("industry.templates.manage")
  @RequireFeature("industry.template_switching")
  @HttpCode(HttpStatus.OK)
  async preview(@Req() request: Request, @Param("key") key: string): Promise<unknown> {
    requireIdentity(request);
    return envelope(await this.applyService.preview(key));
  }

  /** POST /api/v1/configuration/templates/:key/apply — idempotent audited apply. */
  @Post("templates/:key/apply")
  @RequirePermissions("industry.templates.manage")
  @RequireFeature("industry.template_engine")
  @HttpCode(HttpStatus.OK)
  async apply(@Req() request: Request, @Param("key") key: string, @Body() body: unknown): Promise<unknown> {
    const identity = requireIdentity(request);
    templateKeySchema.parse({ key });
    void body;
    return envelope(await this.applyService.apply(identity.userId, key));
  }

  /** POST /api/v1/configuration/templates/:key/switch — additive-only switch (BR-038). */
  @Post("templates/:key/switch")
  @RequirePermissions("industry.templates.switch")
  @RequireFeature("industry.template_switching")
  @HttpCode(HttpStatus.OK)
  async switch(@Req() request: Request, @Param("key") key: string): Promise<unknown> {
    const identity = requireIdentity(request);
    templateKeySchema.parse({ key });
    return envelope(await this.applyService.switch(identity.userId, key));
  }

  private async applyServicePreviewApplied(): Promise<unknown> {
    const manifest = await this.configuration.appliedTemplate();
    if (manifest === null) {
      return { applied: null };
    }
    return {
      applied: {
        key: manifest.id,
        version: manifest.version,
        terminologyKeys: Object.keys(manifest.terminology_overrides),
        navigationGroups: manifest.navigation_manifest.groups.map((g) => g.id),
        reportPins: manifest.report_defaults.filter((r) => r.pinned).map((r) => r.report_key),
        onboardingSteps: manifest.onboarding_steps.length,
      },
    };
  }
}
