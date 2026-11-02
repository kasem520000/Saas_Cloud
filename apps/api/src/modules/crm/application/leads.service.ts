import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";

import { requireTenantContext } from "../../../infra/db/tenant-context";
import { type TenantDb } from "../../../infra/db/client";
import { AuditService } from "../../audit/api/audit";
import { PartnerService } from "../../partners/application/partner-service";
import { PartnerCodeTakenError } from "../../partners/domain/partner-errors";
import { transitionLead, type LeadStatus } from "../domain/lead";

function tenantTx(): TenantDb {
  const context = requireTenantContext();
  if (context.tx === undefined) {
    throw new Error("crm requires an ambient tenant scope");
  }
  return context.tx;
}

export class LeadError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LeadError";
  }
}

/**
 * PHASE-019 T2 — leads + conversion to partner (create or merge with explicit
 * confirmation). Conversion links the lead to the partner forever and makes
 * the lead immutable (audit-clean provenance; BR-025 code rules on the
 * created partner are the partners module's job).
 */
@Injectable()
export class LeadsService {
  constructor(
    private readonly audit: AuditService,
    private readonly partners: PartnerService,
  ) {}

  /** QUALIFY or LOSE with reason — domain state machine enforced. */
  async transition(input: {
    leadId: string;
    action: "QUALIFY" | "LOSE";
    lostReason?: string;
    actorId: string;
  }): Promise<{ status: string }> {
    const rows = await tenantTx().execute(sql`SELECT * FROM leads WHERE id = ${input.leadId}`);
    const lead = rows.rows[0] as Record<string, unknown> | undefined;
    if (lead === undefined) throw new LeadError("NOT_FOUND", "lead not found");
    const next = transitionLead(lead.status as LeadStatus, input.action, input.lostReason);
    await tenantTx().execute(sql`
      UPDATE leads SET status = ${next}, lost_reason = ${input.action === "LOSE" ? (input.lostReason ?? null) : null}, "updated_at" = now()
      WHERE id = ${input.leadId}
    `);
    await this.audit.record({
      action: `crm.lead_${input.action === "QUALIFY" ? "qualified" : "lost"}`,
      entityType: "lead",
      entityId: input.leadId,
      actorId: input.actorId,
      after: { status: next },
    });
    return { status: next };
  }

  async create(input: {
    branchId: string;
    name: string;
    nameAr: string | null;
    source: string;
    ownerRepId: string | null;
    actorId: string;
  }): Promise<{ id: string }> {
    const rows = await tenantTx().execute(sql`
      INSERT INTO leads (tenant_id, branch_id, name, name_ar, source, owner_rep_id)
      VALUES (erp.current_tenant_id(), ${input.branchId}, ${input.name}, ${input.nameAr}, ${input.source}, ${input.ownerRepId})
      RETURNING id
    `);
    const id = (rows.rows[0] as { id: string }).id;
    await this.audit.record({
      action: "crm.lead_created",
      entityType: "lead",
      entityId: id,
      actorId: input.actorId,
      after: { name: input.name, source: input.source },
    });
    return { id };
  }

  async convert(input: {
    leadId: string;
    partnerId: string | null; // null → create a new partner
    newPartner?: { code: string; name: string; nameAr?: string | null };
    actorId: string;
  }): Promise<{ partnerId: string; created: boolean }> {
    const rows = await tenantTx().execute(sql`SELECT * FROM leads WHERE id = ${input.leadId}`);
    const lead = rows.rows[0] as Record<string, unknown> | undefined;
    if (lead === undefined) throw new LeadError("NOT_FOUND", "lead not found");
    const status = lead.status as LeadStatus;
    const next = transitionLead(status, "CONVERT"); // immutable-after enforced inside

    let partnerId = input.partnerId;
    let created = false;
    if (partnerId === null) {
      if (input.newPartner === undefined) throw new LeadError("PARTNER_REQUIRED", "new partner payload required");
      // create-or-merge through the partners module's published service
      // (BR-025 code rules live there); an explicit existing code merges.
      const existing = await this.partners.findActiveByCode(input.newPartner.code);
      if (existing !== undefined) {
        partnerId = existing.id; // merge into existing (explicit confirmation)
      } else {
        try {
          const partner = await this.partners.create(input.actorId, {
            kind: "CUSTOMER",
            code: input.newPartner.code,
            name: input.newPartner.name,
            nameAr: input.newPartner.nameAr ?? null,
            taxNumber: null,
            creditLimit: null,
            creditTermsId: null,
            priceListId: null,
          });
          partnerId = partner.id;
          created = true;
        } catch (error) {
          if (error instanceof PartnerCodeTakenError) {
            partnerId = (await this.partners.findActiveByCode(input.newPartner.code))?.id ?? null;
            if (partnerId === null) throw error;
          } else {
            throw error;
          }
        }
      }
    }
    await tenantTx().execute(sql`
      UPDATE leads SET status = ${next}, partner_id = ${partnerId}, converted_at = now(), "updated_at" = now()
      WHERE id = ${input.leadId}
    `);
    await this.audit.record({
      action: "crm.lead_converted",
      entityType: "lead",
      entityId: input.leadId,
      actorId: input.actorId,
      after: { partnerId, created },
    });
    return { partnerId, created };
  }
}
