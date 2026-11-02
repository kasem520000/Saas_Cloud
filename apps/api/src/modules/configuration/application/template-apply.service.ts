import { Injectable } from "@nestjs/common";

import { DomainError } from "@erp/domain-core";

import { AuditService } from "../../audit/api/audit";
import * as tenancyStore from "../../tenancy/infrastructure/tenancy.store";
import { publishTenancyEvent } from "./config-events";
import { dropTenantConfig } from "./config-cache";
import * as registry from "../infrastructure/template-registry.store";
import {
  validateManifest,
  manifestHash,
  type IndustryManifest,
} from "../domain/industry-manifest";
import { missingClosure } from "../domain/feature-catalog";

/**
 * PHASE-015 T5/T6/T7 — template apply / switch / preview (BR-038 additive-only,
 * README §4–§5). One idempotent, audited transaction per apply:
 *
 * - the manifest is schema-validated (fail closed) and content-hashed;
 * - `required_feature_keys` + REQUIRED capability prerequisites are checked
 *   against the active entitlements (BR-040 closure) — a missing REQUIRED blocks
 *   with the specific missing chain + guided plan selection; phase-gated
 *   prerequisites are labeled "coming with PHASE-016" and degrade to back-office
 *   mode (never a broken screen);
 * - the applied state (key, version, hash, overrides) records on
 *   `tenant_industry_config`; the previous terminology/navigation set is
 *   ARCHIVED read-only (R2/R6) — switching never deletes tenant data, never
 *   touches explicit settings, accounts or numbering (R1–R5, INV-021);
 * - every apply/switch writes an audit event with the before/after diff and
 *   emits the §9 invalidation event (`template.applied` / `template.switched`).
 */

export class TemplateNotFoundError extends DomainError {
  constructor(readonly key: string) {
    super("configuration/template-not-found", `Unknown industry template: ${key}`);
    this.name = "TemplateNotFoundError";
  }
}

export class TemplatePrerequisitesMissingError extends DomainError {
  constructor(
    readonly templateKey: string,
    readonly missing: readonly string[],
    readonly phaseGated: readonly string[],
  ) {
    super(
      "configuration/template-prerequisites-missing",
      `Template ${templateKey} blocked — missing required feature keys: ${missing.join(", ")}`,
    );
    this.name = "TemplatePrerequisitesMissingError";
  }
}

export interface TemplateDiff {
  templateKey: string;
  version: string;
  manifestHash: string;
  addedCapabilities: string[];
  archivedCapabilities: string[];
  terminologyAdded: string[];
  terminologyArchived: string[];
  numberingAdded: string[];
  reportsPinned: string[];
  onboardingSteps: number;
  blocked: boolean;
  missingRequired: string[];
  phaseGated: { key: string; phase: string }[];
}

export interface ApplyResult {
  applied: boolean;
  alreadyApplied: boolean;
  templateKey: string;
  version: string;
  manifestHash: string;
}

@Injectable()
export class TemplateApplyService {
  constructor(private readonly audit: AuditService) {}

  /** Load + validate a registry manifest (fail closed). */
  private async loadManifest(key: string): Promise<{ row: registry.IndustryTemplateRow; manifest: IndustryManifest }> {
    const row = await registry.findTemplate(key);
    if (row === undefined || !row.isActive) {
      throw new TemplateNotFoundError(key);
    }
    return { row, manifest: validateManifest(row.manifest) };
  }

  /**
   * Entitlement + phase-gate check (README §4): `required_feature_keys` must
   * close against the active entitlements (BR-040) — EXCEPT keys that a
   * capability_prerequisite declares as arriving in a later phase: those are
   * phase-gated ("coming with PHASE-016") and degrade to back-office mode,
   * never block. REQUIRED prerequisites available now (PHASE-015/earlier)
   * missing from the plan DO block with the missing chain named.
   */
  private checkPrerequisites(
    manifest: IndustryManifest,
    activeKeys: ReadonlySet<string>,
  ): { missing: string[]; phaseGated: { key: string; phase: string }[] } {
    const phaseGated = new Map<string, string>();
    for (const prereq of Object.values(manifest.capability_prerequisites)) {
      // Later-phase prerequisites gate their keys (degrade, not block).
      if (prereq.available_from_phase > "PHASE-018") {
        for (const key of prereq.feature_keys) {
          phaseGated.set(key, prereq.available_from_phase);
        }
      }
    }
    const missing: string[] = [];
    for (const key of manifest.required_feature_keys) {
      for (const m of missingClosure(key, activeKeys)) {
        if (phaseGated.has(m)) continue; // phase-gated: labeled, not blocking
        if (!missing.includes(m)) missing.push(m);
      }
    }
    for (const prereq of Object.values(manifest.capability_prerequisites)) {
      if (prereq.level !== "REQUIRED" || prereq.available_from_phase > "PHASE-018") continue;
      for (const key of prereq.feature_keys) {
        if (!activeKeys.has(key) && !phaseGated.has(key) && !missing.includes(key)) {
          missing.push(key);
        }
      }
    }
    return {
      missing: missing.sort(),
      phaseGated: [...phaseGated.entries()]
        .map(([key, phase]) => ({ key, phase }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    };
  }

  /** Diff preview: what applying/switching `key` would change (README §5 UI). */
  async preview(key: string): Promise<TemplateDiff> {
    const { row, manifest } = await this.loadManifest(key);
    const applied = await registry.getAppliedConfig();
    const activeKeys = new Set((await tenancyStore.listActiveEntitlements()).map((e) => e.featureKey));
    const { missing, phaseGated } = this.checkPrerequisites(manifest, activeKeys);
    const current =
      applied !== undefined && applied.templateKey !== key
        ? await registry.findTemplate(applied.templateKey)
        : undefined;
    const currentManifest = current !== undefined ? validateManifest(current.manifest) : null;

    const addedCaps = manifest.required_feature_keys.filter(
      (k) => currentManifest === null || !currentManifest.required_feature_keys.includes(k),
    );
    const archivedCaps =
      currentManifest !== null
        ? currentManifest.required_feature_keys.filter(
            (k) => !manifest.required_feature_keys.includes(k),
          )
        : [];
    const termAdded = Object.keys(manifest.terminology_overrides).filter(
      (k) => currentManifest === null || !(k in currentManifest.terminology_overrides),
    );
    const termArchived =
      currentManifest !== null
        ? Object.keys(currentManifest.terminology_overrides).filter(
            (k) => !(k in manifest.terminology_overrides),
          )
        : [];

    return {
      templateKey: row.key,
      version: row.version,
      manifestHash: manifestHash(manifest),
      addedCapabilities: addedCaps,
      archivedCapabilities: archivedCaps,
      terminologyAdded: termAdded,
      terminologyArchived: termArchived,
      numberingAdded: Object.keys(manifest.document_numbering_defaults),
      reportsPinned: manifest.report_defaults.filter((r) => r.pinned).map((r) => r.report_key),
      onboardingSteps: manifest.onboarding_steps.length,
      blocked: missing.length > 0,
      missingRequired: missing,
      phaseGated,
    };
  }

  /**
   * Apply a template (idempotent). Additive-only by construction: the only
   * write is the `tenant_industry_config` row — tenant data, explicit settings,
   * accounts and posted numbering are never touched (BR-038, R1–R10).
   */
  async apply(actorId: string, key: string): Promise<ApplyResult> {
    const { row, manifest } = await this.loadManifest(key);
    const hash = manifestHash(manifest);
    const activeKeys = new Set((await tenancyStore.listActiveEntitlements()).map((e) => e.featureKey));
    const { missing } = this.checkPrerequisites(manifest, activeKeys);
    if (missing.length > 0) {
      throw new TemplatePrerequisitesMissingError(key, missing, []);
    }

    const applied = await registry.getAppliedConfig();
    const alreadyApplied =
      applied !== undefined && applied.templateKey === row.key && applied.appliedManifestHash === hash;
    if (alreadyApplied) {
      return { applied: false, alreadyApplied: true, templateKey: row.key, version: row.version, manifestHash: hash };
    }

    const tenant = await tenancyStore.getOwnTenant();
    const archivedEntry =
      applied !== undefined
        ? {
            templateKey: applied.templateKey,
            version: applied.appliedVersion,
            manifestHash: applied.appliedManifestHash,
            archivedAt: new Date().toISOString(),
            reason: `switched to ${row.key}`,
          }
        : null;
    const archived = [...(applied?.archived ?? []), ...(archivedEntry !== null ? [archivedEntry] : [])];

    await registry.upsertAppliedConfig({
      tenantId: tenant.id,
      templateKey: row.key,
      appliedVersion: row.version,
      appliedManifestHash: hash,
      overrides: applied?.overrides ?? {},
      archived,
    });

    await this.audit.record({
      action: applied === undefined ? "template.applied" : "template.switched",
      entityType: "industry_template",
      entityId: tenant.id,
      actorId,
      before: applied !== undefined ? { templateKey: applied.templateKey, hash: applied.appliedManifestHash } : null,
      after: { templateKey: row.key, version: row.version, hash, archived: archived.length },
    });

    dropTenantConfig(tenant.id);
    publishTenancyEvent(
      applied === undefined
        ? { type: "template.applied", tenantId: tenant.id, templateKey: row.key }
        : { type: "template.switched", tenantId: tenant.id, fromKey: applied.templateKey, toKey: row.key },
    );

    return { applied: true, alreadyApplied: false, templateKey: row.key, version: row.version, manifestHash: hash };
  }

  /** Switch = apply with archival (BR-038: switching back is always possible). */
  async switch(actorId: string, toKey: string): Promise<ApplyResult> {
    return this.apply(actorId, toKey);
  }
}
