import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";

import { envelope, paginatedEnvelope } from "../../../infra/http/envelope";
import { identityOf, type SessionContext } from "../../../infra/context/session-context";
import { RequirePermissions } from "../../../infra/auth/require-permissions.decorator";
import { UnauthenticatedError } from "../../identity/api/identity";
import { AuditService } from "../../audit/api/audit";
import { CoaService } from "../application/coa-service";
import { PeriodService } from "../application/period-service";
import { FxService } from "../application/fx-service";
import { NumberingService } from "../application/numbering-service";
import { ReconciliationService } from "../application/reconciliation-service";

/**
 * Accounting routes (PHASE-007 §4; matrix §3.1): CoA + purposes, fiscal
 * years + period actions, exchange rates, cost centers, numbering audit
 * view, reconciliation runs, and the close checklist. Journal drafts and
 * GL queries live in their sibling controllers.
 */

function requireIdentity(request: Request): SessionContext {
  const identity = identityOf(request);
  if (identity === undefined) {
    throw new UnauthenticatedError();
  }
  return identity;
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "ISO date");

const accountCreateSchema = z.object({
  code: z.string().min(1).max(8),
  name: z.string().min(1).max(200),
  nameAr: z.string().min(1).max(200).nullish(),
  type: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  parentId: z.string().uuid().nullish(),
  currencyCode: z.string().length(3).nullish(),
  isGroup: z.boolean().optional(),
});

const accountPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nameAr: z.string().min(1).max(200).nullish(),
  parentId: z.string().uuid().nullish(),
  currencyCode: z.string().length(3).nullish(),
  code: z.string().min(1).max(8).optional(),
  version: z.number().int().positive().optional(),
});

const purposeMapSchema = z.object({
  purposeKey: z.string().min(3).max(40),
  accountId: z.string().uuid(),
  activeFrom: DATE,
});

const purposeSupersedeSchema = z.object({ activeTo: DATE });

const yearCreateSchema = z.object({
  name: z.string().min(1).max(50),
  startDate: DATE,
  endDate: DATE,
});

const reopenSchema = z.object({ reason: z.string().min(3).max(500) });

const rateUpsertSchema = z.object({
  currencyCode: z.string().length(3),
  rateDate: DATE,
  rate: z.string().regex(/^\d{1,12}(\.\d{1,8})?$/, "positive decimal"),
});

const costCenterCreateSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  nameAr: z.string().min(1).max(200).nullish(),
  parentId: z.string().uuid().nullish(),
});

const costCenterPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  nameAr: z.string().min(1).max(200).nullish(),
  isActive: z.boolean().optional(),
});

@Controller("api/v1/accounting")
export class AccountingController {
  constructor(
    @Inject(CoaService) private readonly coa: CoaService,
    @Inject(PeriodService) private readonly periods: PeriodService,
    @Inject(FxService) private readonly fx: FxService,
    @Inject(NumberingService) private readonly numbering: NumberingService,
    @Inject(ReconciliationService) private readonly reconciliation: ReconciliationService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // -- CoA -------------------------------------------------------------------

  @Get("accounts")
  @RequirePermissions("accounting.accounts.view")
  async listAccounts(
    @Query("type") type?: string,
    @Query("status") status?: string,
    @Query("q") q?: string,
  ): Promise<unknown> {
    const rows = await this.coa.list({ type, status, q });
    return paginatedEnvelope(rows, { limit: rows.length, hasMore: false });
  }

  @Get("accounts/:id")
  @RequirePermissions("accounting.accounts.view")
  async getAccount(@Param("id") id: string): Promise<unknown> {
    return envelope(await this.coa.get(id));
  }

  @Post("accounts")
  @RequirePermissions("accounting.accounts.manage")
  @HttpCode(HttpStatus.OK)
  async createAccount(@Req() request: Request, @Body() body: unknown): Promise<unknown> {
    const identity = requireIdentity(request);
    const input = accountCreateSchema.parse(body);
    return envelope(
      await this.coa.create(identity.userId, {
        code: input.code,
        name: input.name,
        nameAr: input.nameAr ?? null,
        type: input.type,
        parentId: input.parentId ?? null,
        currencyCode: input.currencyCode ?? null,
        isGroup: input.isGroup ?? false,
      }),
    );
  }

  @Patch("accounts/:id")
  @RequirePermissions("accounting.accounts.manage")
  async patchAccount(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const identity = requireIdentity(request);
    const input = accountPatchSchema.parse(body);
    return envelope(
      await this.coa.update(identity.userId, id, {
        name: input.name,
        nameAr: input.nameAr,
        parentId: input.parentId,
        currencyCode: input.currencyCode,
        code: input.code,
        version: input.version,
      }),
    );
  }

  @Post("accounts/:id/archive")
  @RequirePermissions("accounting.accounts.archive")
  @HttpCode(HttpStatus.OK)
  async archiveAccount(@Req() request: Request, @Param("id") id: string): Promise<unknown> {
    const identity = requireIdentity(request);
    return envelope(await this.coa.archive(identity.userId, id));
  }

  @Get("purposes")
  @RequirePermissions("accounting.accounts.view")
  async listPurposes(): Promise<unknown> {
    return envelope(await this.coa.listPurposes());
  }

  @Post("purposes")
  @RequirePermissions("accounting.accounts.manage")
  @HttpCode(HttpStatus.OK)
  async mapPurpose(@Req() request: Request, @Body() body: unknown): Promise<unknown> {
    const identity = requireIdentity(request);
    const input = purposeMapSchema.parse(body);
    return envelope(
      await this.coa.mapPurpose(identity.userId, {
        purposeKey: input.purposeKey,
        accountId: input.accountId,
        activeFrom: input.activeFrom,
      }),
    );
  }

  @Post("purposes/:key/supersede")
  @RequirePermissions("accounting.accounts.manage")
  @HttpCode(HttpStatus.OK)
  async supersedePurpose(
    @Req() request: Request,
    @Param("key") key: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const identity = requireIdentity(request);
    const input = purposeSupersedeSchema.parse(body);
    await this.coa.supersedePurpose(identity.userId, key, input.activeTo);
    return envelope({ superseded: true });
  }

  // -- fiscal calendar --------------------------------------------------------

  @Get("fiscal-years")
  @RequirePermissions("accounting.journal_entries.view")
  async listYears(): Promise<unknown> {
    return envelope(await this.periods.listYears());
  }

  @Get("fiscal-years/:id")
  @RequirePermissions("accounting.journal_entries.view")
  async getYear(@Param("id") id: string): Promise<unknown> {
    return envelope(await this.periods.getYear(id));
  }

  @Get("fiscal-years/:id/periods")
  @RequirePermissions("accounting.journal_entries.view")
  async listPeriods(@Param("id") id: string): Promise<unknown> {
    return envelope(await this.periods.listPeriods(id));
  }

  @Post("fiscal-years")
  @RequirePermissions("accounting.fiscal_years.manage")
  @HttpCode(HttpStatus.OK)
  async createYear(@Req() request: Request, @Body() body: unknown): Promise<unknown> {
    const identity = requireIdentity(request);
    const input = yearCreateSchema.parse(body);
    return envelope(
      await this.periods.createYear(identity.userId, {
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
      }),
    );
  }

  @Get("periods/:id")
  @RequirePermissions("accounting.journal_entries.view")
  async getPeriod(@Param("id") id: string): Promise<unknown> {
    return envelope(await this.periods.getPeriod(id));
  }

  @Post("periods/:id/soft-close")
  @RequirePermissions("accounting.periods.soft_close")
  @HttpCode(HttpStatus.OK)
  async softClose(@Req() request: Request, @Param("id") id: string): Promise<unknown> {
    const identity = requireIdentity(request);
    return envelope(await this.periods.softClose(identity.userId, id));
  }

  @Post("periods/:id/lock")
  @RequirePermissions("accounting.periods.lock")
  @HttpCode(HttpStatus.OK)
  async lock(@Req() request: Request, @Param("id") id: string): Promise<unknown> {
    const identity = requireIdentity(request);
    return envelope(await this.periods.lock(identity.userId, id));
  }

  @Post("periods/:id/reopen")
  @RequirePermissions("accounting.periods.reopen")
  @HttpCode(HttpStatus.OK)
  async reopen(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const identity = requireIdentity(request);
    const input = reopenSchema.parse(body);
    return envelope(await this.periods.reopen(identity.userId, id, input.reason));
  }

  @Post("periods/:id/checklist")
  @RequirePermissions("accounting.periods.soft_close")
  @HttpCode(HttpStatus.OK)
  async closeChecklist(@Param("id") id: string): Promise<unknown> {
    return envelope(await this.reconciliation.closeChecklist(id));
  }

  // -- exchange rates -----------------------------------------------------------

  @Get("exchange-rates")
  @RequirePermissions("accounting.journal_entries.view")
  async listRates(
    @Query("currency") currency?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ): Promise<unknown> {
    return envelope(
      await this.fx.list({ currencyCode: currency, fromDate: from, toDate: to }),
    );
  }

  @Post("exchange-rates")
  @RequirePermissions("accounting.exchange_rates.manage")
  @HttpCode(HttpStatus.OK)
  async upsertRate(@Req() request: Request, @Body() body: unknown): Promise<unknown> {
    const identity = requireIdentity(request);
    const input = rateUpsertSchema.parse(body);
    return envelope(
      await this.fx.upsert(identity.userId, {
        currencyCode: input.currencyCode,
        rateDate: input.rateDate,
        rate: input.rate,
      }),
    );
  }

  // -- cost centers ---------------------------------------------------------------

  @Get("cost-centers")
  @RequirePermissions("accounting.journal_entries.view")
  async listCostCenters(): Promise<unknown> {
    const { listCostCenters } = await import("../infrastructure/accounting.store");
    return envelope(await listCostCenters());
  }

  @Post("cost-centers")
  @RequirePermissions("accounting.cost_centers.manage")
  @HttpCode(HttpStatus.OK)
  async createCostCenter(@Req() request: Request, @Body() body: unknown): Promise<unknown> {
    const identity = requireIdentity(request);
    const input = costCenterCreateSchema.parse(body);
    const { insertCostCenter } = await import("../infrastructure/accounting.store");
    const created = await insertCostCenter({
      code: input.code,
      name: input.name,
      nameAr: input.nameAr ?? null,
      parentId: input.parentId ?? null,
    });
    await this.audit.record({
      action: "accounting.cost_center_created",
      entityType: "cost_center",
      entityId: created.id,
      actorId: identity.userId,
      after: { code: created.code, name: created.name },
    });
    return envelope(created);
  }

  @Patch("cost-centers/:id")
  @RequirePermissions("accounting.cost_centers.manage")
  async patchCostCenter(
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<unknown> {
    const input = costCenterPatchSchema.parse(body);
    const { updateCostCenter } = await import("../infrastructure/accounting.store");
    const updated = await updateCostCenter(id, {
      name: input.name,
      nameAr: input.nameAr,
      isActive: input.isActive,
    });
    return envelope(updated);
  }

  // -- numbering audit view + reconciliation ----------------------------------------

  @Get("numbering/assignments")
  @RequirePermissions("accounting.journal_entries.view")
  async listAssignments(@Query("docType") docType?: string): Promise<unknown> {
    return envelope(await this.numbering.listAssignments({ docType }));
  }

  @Post("reconciliation/run")
  @RequirePermissions("accounting.journal_entries.view")
  @HttpCode(HttpStatus.OK)
  async runReconciliation(
    @Req() request: Request,
    @Body() body: unknown,
  ): Promise<unknown> {
    const identity = requireIdentity(request);
    const input = z
      .object({ kind: z.enum(["AR", "AP"]), asOf: DATE.optional() })
      .parse(body ?? {});
    const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
    const run =
      input.kind === "AR"
        ? await this.reconciliation.runArCheck({ asOf, runMode: "ON_DEMAND", checkedBy: identity.userId })
        : await this.reconciliation.runApCheck({ asOf, runMode: "ON_DEMAND", checkedBy: identity.userId });
    return envelope(run);
  }

  @Get("reconciliation/runs")
  @RequirePermissions("accounting.journal_entries.view")
  async listRuns(@Query("asOf") asOf?: string): Promise<unknown> {
    return envelope(
      await this.reconciliation.latestRuns(asOf ?? new Date().toISOString().slice(0, 10)),
    );
  }
}
