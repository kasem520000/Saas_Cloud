import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * PHASE-002 infrastructure + PHASE-003 identity cluster (ADR-0004/0005,
 * DATABASE_CONVENTIONS §3–5; TABLES/tenancy-identity.md).
 *
 * Only infrastructure exists at this phase: the minimal `tenants` row (full
 * profile arrives with PHASE-004) and the append-only `audit_events` trail.
 * The PHASE-003 identity tables mirror migration `0003_identity_core.sql`
 * (sync rule, docs/database/README.md). Every tenant-owned table carries
 * `tenant_id uuid not null`, RLS policies, and `FORCE ROW LEVEL SECURITY` —
 * enforced by `scripts/check-rls.ts` in CI. Global/user-owned tables
 * (`users`, `permissions`, `sessions`, `devices`, `mfa_factors`) carry no
 * tenant RLS by design (PHASE-003 §4: service-mediated, permission-checked).
 */

/** Standard columns (DATABASE_CONVENTIONS §5). */
const standardColumns = {
  id: uuid("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
  version: integer("version").notNull().default(1),
} as const;

/**
 * PHASE-002 minimal tenant row: id, name (bilingual per conventions §4), status.
 * The full tenant profile (currency, country, timezone, industry template,
 * deleted_at) arrives with PHASE-003 per the phase plan §2 item 5.
 *
 * RLS: `tenant_isolation` policy via `erp.current_tenant_id()` plus the
 * platform-scope GUC path for admin-plane access (TENANT_ISOLATION §3.2).
 */
export const tenants = pgTable(
  "tenants",
  {
    ...standardColumns,
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    status: text("status").notNull().default("ACTIVE"),
    // PHASE-004 profile expansion (migration 0006; TABLES/tenancy-identity.md)
    baseCurrency: varchar("base_currency", { length: 3 }).notNull(),
    countryCode: varchar("country_code", { length: 2 }).notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    industryTemplateKey: text("industry_template_key"),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [index("ix_tenants_status").on(table.status)],
);

/**
 * Append-only audit trail (TENANT_ISOLATION, OBSERVABILITY §Audit vs telemetry;
 * INV-003 substrate). UPDATE/DELETE are denied by both grants and the
 * `erp.audit_events_guard()` trigger — enforced by attack tests A1–A5/A10.
 *
 * `actor_id`/`device_id` have no FK until users (PHASE-003) and devices
 * (PHASE-020) exist — expand-phase pattern (MIGRATION_STRATEGY §3).
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey(),
    // PHASE-004: NULL carries platform-scope rows (migration 0006 widening).
    tenantId: uuid("tenant_id"),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    correlationId: uuid("correlation_id"),
    deviceId: uuid("device_id"),
    at: timestamp("at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    // PHASE-004 (matrix §3.10/§7): true on every platform-admin-path action.
    viaPlatformAdmin: boolean("via_platform_admin").notNull().default(false),
  },
  (table) => [
    index("ix_audit_events_tenant_at").on(table.tenantId, table.at),
    index("ix_audit_events_tenant_entity_at").on(
      table.tenantId,
      table.entityType,
      table.entityId,
      table.at,
    ),
  ],
);

/**
 * PHASE-003 identity cluster (TABLES/tenancy-identity.md; migration 0003).
 * users/permissions/sessions/devices/mfa_factors: global or user-owned — no
 * tenant RLS (service-mediated, permission-checked). roles/role_permissions
 * carry the documented template-variant RLS policy; memberships/invitations
 * the standard macro policy.
 */
export const users = pgTable(
  "users",
  {
    ...standardColumns,
    email: text("email").notNull(),
    phone: text("phone"),
    fullName: text("full_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: text("status").notNull().default("PENDING"),
    locale: text("locale").notNull().default("ar"),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true, mode: "string" }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [index("ix_users_status").on(table.status)],
);

export const permissions = pgTable(
  "permissions",
  {
    key: text("key").primaryKey(),
    module: text("module").notNull(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("ix_permissions_module").on(table.module)],
);

export const roles = pgTable(
  "roles",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id"),
    key: text("key").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    isSystem: boolean("is_system").notNull().default(false),
  },
  (table) => [index("ix_roles_tenant").on(table.tenantId)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull(),
    tenantId: uuid("tenant_id"),
    permissionId: text("permission_id").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    grantedBy: uuid("granted_by"),
  },
  (table) => [index("ix_role_permissions_tenant").on(table.tenantId)],
);

export const memberships = pgTable(
  "memberships",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    userId: uuid("user_id").notNull(),
    roleId: uuid("role_id").notNull(),
    branchScope: uuid("branch_scope").array(),
    status: text("status").notNull().default("ACTIVE"),
  },
  (table) => [
    index("ix_memberships_tenant_user").on(table.tenantId, table.userId),
    index("ix_memberships_user").on(table.userId),
  ],
);

export const devices = pgTable("devices", {
  ...standardColumns,
  userId: uuid("user_id").notNull(),
  platform: text("platform").notNull(),
  name: text("name"),
  deviceKeyHash: text("device_key_hash").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    activeTenantId: uuid("active_tenant_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
    ip: varchar("ip", { length: 45 }),
    deviceId: uuid("device_id"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ix_sessions_user_expires").on(table.userId, table.expiresAt),
    index("ix_sessions_active_tenant").on(table.activeTenantId),
  ],
);

export const mfaFactors = pgTable(
  "mfa_factors",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id").notNull(),
    kind: text("kind").notNull().default("TOTP"),
    secretEnc: text("secret_enc").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "string" }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "string" }),
    recoveryCodesHash: text("recovery_codes_hash").array(),
  },
  (table) => [index("ix_mfa_factors_user").on(table.userId)],
);

export const invitations = pgTable(
  "invitations",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    email: text("email").notNull(),
    roleId: uuid("role_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "string" }),
    status: text("status").notNull().default("PENDING"),
    invitedBy: uuid("invited_by").notNull(),
  },
  (table) => [index("ix_invitations_tenant_status").on(table.tenantId, table.status)],
);

// ---------------------------------------------------------------------------
// PHASE-004 tenancy provisioning cluster (migrations 0006–0008;
// TABLES/tenancy-identity.md + TABLES/core-accounting.md).
// ---------------------------------------------------------------------------

/** Global reference: ISO-4217 currencies (no tenant_id, no RLS — read-only). */
export const currencies = pgTable("currencies", {
  code: varchar("code", { length: 3 }).primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  minorUnits: integer("minor_units").notNull().default(2),
  symbol: text("symbol"),
  isActive: boolean("is_active").notNull().default(true),
});

/** Global reference: in-scope countries + display defaults. */
export const countries = pgTable("countries", {
  code: varchar("code", { length: 2 }).primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  defaultLocale: text("default_locale").notNull().default("ar"),
  currencyCode: varchar("currency_code", { length: 3 }).notNull(),
  dateFormat: text("date_format").notNull().default("dd/MM/yyyy"),
  timeZone: text("time_zone").notNull().default("UTC"),
  isActive: boolean("is_active").notNull().default(true),
});

/** Global reference: industry-template index (list only; engine = PHASE-015). */
export const industryTemplates = pgTable("industry_templates", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  version: text("version").notNull().default("1.0.0"),
  manifest: jsonb("manifest").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

/** Global reference: default bilingual CoA template (CHART_OF_ACCOUNTS §3). */
export const chartOfAccountsTemplate = pgTable("chart_of_accounts_template", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  type: text("type").notNull(),
  isGroup: boolean("is_group").notNull().default(false),
  parentCode: text("parent_code"),
  purposeKey: text("purpose_key"),
});

/** Operating units (tenant-owned, macro RLS; deactivate — never delete). */
export const branches = pgTable(
  "branches",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    address: jsonb("address"),
    isActive: boolean("is_active").notNull().default(true),
    // PHASE-006 (migration 0009): BR-003 "branch default list" level.
    defaultPriceListId: uuid("default_price_list_id"),
  },
  (table) => [
    index("ix_branches_tenant").on(table.tenantId),
    uniqueIndex("uq_branches_tenant_code").on(table.tenantId, table.code),
  ],
);

/** Typed key-value tenant settings (L5; macro RLS). */
export const tenantSettings = pgTable(
  "tenant_settings",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedBy: uuid("updated_by"),
  },
  (table) => [
    index("ix_tenant_settings_tenant").on(table.tenantId),
    uniqueIndex("uq_tenant_settings_tenant_key").on(table.tenantId, table.key),
  ],
);

/** Platform-level subscription plans (RLS: tenant read + platform write path). */
export const plans = pgTable(
  "plans",
  {
    ...standardColumns,
    key: text("key").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar").notNull(),
    priceAmount: numeric("price_amount", { precision: 19, scale: 4 }).notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    billingPeriod: text("billing_period").notNull().default("MONTHLY"),
    limits: jsonb("limits").notNull(),
    featureKeys: text("feature_keys").array().notNull(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [uniqueIndex("uq_plans_key").on(table.key)],
);

/** Tenant plan assignment (minimal — billing columns land PHASE-014). */
export const subscriptions = pgTable(
  "subscriptions",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    planId: uuid("plan_id").notNull(),
    status: text("status").notNull().default("ACTIVE"),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    providerRef: text("provider_ref"),
    // PHASE-014 (migration 0021): lifecycle window columns + dunning step.
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true, mode: "string" }),
    graceEndsAt: timestamp("grace_ends_at", { withTimezone: true, mode: "string" }),
    dunningStep: integer("dunning_step").notNull().default(0),
  },
  (table) => [index("ix_subscriptions_tenant").on(table.tenantId)],
);

/** Materialized feature grants (macro RLS; upserted by the entitlement service). */
export const entitlements = pgTable(
  "entitlements",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    featureKey: text("feature_key").notNull(),
    source: text("source").notNull().default("PLAN"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("ix_entitlements_tenant").on(table.tenantId),
    uniqueIndex("uq_entitlements_tenant_feature").on(table.tenantId, table.featureKey),
  ],
);

/** Time-boxed audited support sessions (matrix §7; macro RLS). */
export const supportSessions = pgTable(
  "support_sessions",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    platformUserId: uuid("platform_user_id").notNull(),
    optIn: boolean("opt_in").notNull().default(false),
    ticketRef: text("ticket_ref"),
    reason: text("reason").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "string" }),
    closedBy: uuid("closed_by"),
    status: text("status").notNull().default("ACTIVE"),
  },
  (table) => [index("ix_support_sessions_tenant_status").on(table.tenantId, table.status)],
);

/** CoA nodes (created in 004 for onboarding instantiation; posting = 007). */
export const accounts = pgTable(
  "accounts",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar").notNull(),
    type: text("type").notNull(),
    parentId: uuid("parent_id"),
    isPostable: boolean("is_postable").notNull().default(false),
    currencyCode: varchar("currency_code", { length: 3 }),
    status: text("status").notNull().default("ACTIVE"),
  },
  (table) => [
    index("ix_accounts_tenant_parent").on(table.tenantId, table.parentId),
    index("ix_accounts_tenant_type").on(table.tenantId, table.type),
    uniqueIndex("uq_accounts_tenant_code").on(table.tenantId, table.code),
  ],
);

/** Purpose → account mapping (posting engine resolution substrate, 007). */
export const accountPurposes = pgTable(
  "account_purposes",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    purposeKey: text("purpose_key").notNull(),
    accountId: uuid("account_id").notNull(),
    activeFrom: date("active_from").notNull(),
    activeTo: date("active_to"),
  },
  (table) => [
    index("ix_account_purposes_tenant").on(table.tenantId),
    uniqueIndex("uq_account_purposes_tenant_purpose_active")
      .on(table.tenantId, table.purposeKey)
      .where(sql`${table.activeTo} IS NULL`),
  ],
);

// ---------------------------------------------------------------------------
// PHASE-006 master-data cluster (migration 0009; TABLES/trade-inventory.md).
// ---------------------------------------------------------------------------

/** Net-N payment terms; NET-7/15/30/60 seeded read-only per tenant (BR-026). */
export const creditTerms = pgTable(
  "credit_terms",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    days: integer("days").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
  },
  (table) => [
    index("ix_credit_terms_tenant").on(table.tenantId),
    uniqueIndex("uq_credit_terms_tenant_code").on(table.tenantId, table.code),
  ],
);

/** Sale/purchase price lists (BR-003 level 1 source). */
export const priceLists = pgTable(
  "price_lists",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    kind: text("kind").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    status: text("status").notNull().default("ACTIVE"),
  },
  (table) => [index("ix_price_lists_tenant_kind").on(table.tenantId, table.kind)],
);

/** Unified customer/supplier directory (BR-025; soft-delete tombstone). */
export const partners = pgTable(
  "partners",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    kind: text("kind").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    taxNumber: text("tax_number"),
    creditLimit: numeric("credit_limit", { precision: 19, scale: 4 }),
    creditTermsId: uuid("credit_terms_id"),
    priceListId: uuid("price_list_id"),
    status: text("status").notNull().default("ACTIVE"),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("ix_partners_tenant_kind").on(table.tenantId, table.kind),
    index("ix_partners_tenant_status").on(table.tenantId, table.status),
    index("ix_partners_tenant_credit_terms").on(table.tenantId, table.creditTermsId),
    uniqueIndex("uq_partners_tenant_code").on(table.tenantId, table.code),
  ],
);

export const partnerContacts = pgTable(
  "partner_contacts",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    partnerId: uuid("partner_id").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    role: text("role"),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (table) => [
    index("ix_partner_contacts_tenant_partner").on(table.tenantId, table.partnerId),
  ],
);

export const partnerAddresses = pgTable(
  "partner_addresses",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    partnerId: uuid("partner_id").notNull(),
    type: text("type").notNull(),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: text("city"),
    countryCode: varchar("country_code", { length: 2 }),
    geo: jsonb("geo"),
  },
  (table) => [
    index("ix_partner_addresses_tenant_partner").on(table.tenantId, table.partnerId),
  ],
);

/** Bilingual item taxonomy tree (cycle-free by service invariant). */
export const itemCategories = pgTable(
  "item_categories",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    parentId: uuid("parent_id"),
    // PHASE-009 (migration 0013): category-default tax code (T5).
    defaultTaxCodeId: uuid("default_tax_code_id"),
    status: text("status").notNull().default("ACTIVE"),
  },
  (table) => [
    index("ix_item_categories_tenant_parent").on(table.tenantId, table.parentId),
    uniqueIndex("uq_item_categories_tenant_code").on(table.tenantId, table.code),
  ],
);

/** Units of measure: 8 is_system rows per tenant + tenant extensions. */
export const uoms = pgTable(
  "uoms",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    isSystem: boolean("is_system").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    index("ix_uoms_tenant").on(table.tenantId),
    uniqueIndex("uq_uoms_tenant_code").on(table.tenantId, table.code),
  ],
);

/** Exact decimal conversion factors (compose-exactly property, T2). */
export const uomConversions = pgTable(
  "uom_conversions",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    fromUomId: uuid("from_uom_id").notNull(),
    toUomId: uuid("to_uom_id").notNull(),
    factor: numeric("factor", { precision: 19, scale: 6 }).notNull(),
  },
  (table) => [
    index("ix_uom_conversions_tenant_from").on(table.tenantId, table.fromUomId),
    index("ix_uom_conversions_tenant_to").on(table.tenantId, table.toUomId),
    uniqueIndex("uq_uom_conversions_tenant_pair").on(
      table.tenantId,
      table.fromUomId,
      table.toUomId,
    ),
  ],
);

/** Item master (sku rules; tax_code_id FK deferred to PHASE-009). */
export const items = pgTable(
  "items",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    kind: text("kind").notNull(),
    uomId: uuid("uom_id").notNull(),
    categoryId: uuid("category_id"),
    // Expand-migrate-contract (PHASE-009 adds the FK + validation).
    taxCodeId: uuid("tax_code_id"),
    costingMethod: text("costing_method").notNull().default("WAC"),
    trackBatch: boolean("track_batch").notNull().default(false),
    trackSerial: boolean("track_serial").notNull().default(false),
    trackImei: boolean("track_imei").notNull().default(false),
    hasExpiry: boolean("has_expiry").notNull().default(false),
    reorderLevel: numeric("reorder_level", { precision: 19, scale: 6 }),
    reorderQty: numeric("reorder_qty", { precision: 19, scale: 6 }),
    basePrice: numeric("base_price", { precision: 19, scale: 6 }),
    status: text("status").notNull().default("ACTIVE"),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("ix_items_tenant_kind").on(table.tenantId, table.kind),
    index("ix_items_tenant_category").on(table.tenantId, table.categoryId),
    index("ix_items_tenant_status").on(table.tenantId, table.status),
    uniqueIndex("uq_items_tenant_sku").on(table.tenantId, table.sku),
  ],
);

/** Item barcodes, per UoM, tenant-wide scan-unique. */
export const barcodes = pgTable(
  "barcodes",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    itemId: uuid("item_id").notNull(),
    uomId: uuid("uom_id").notNull(),
    code: text("code").notNull(),
  },
  (table) => [
    index("ix_barcodes_tenant_item").on(table.tenantId, table.itemId),
    uniqueIndex("uq_barcodes_tenant_code").on(table.tenantId, table.code),
    uniqueIndex("uq_barcodes_tenant_item_uom_code").on(
      table.tenantId,
      table.itemId,
      table.uomId,
      table.code,
    ),
  ],
);

/** Price list rows: per-UoM unit price with min-qty tiers. */
export const priceListItems = pgTable(
  "price_list_items",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    priceListId: uuid("price_list_id").notNull(),
    itemId: uuid("item_id").notNull(),
    uomId: uuid("uom_id").notNull(),
    unitPrice: numeric("unit_price", { precision: 19, scale: 6 }).notNull(),
    minQty: numeric("min_qty", { precision: 19, scale: 6 }).notNull().default("1"),
  },
  (table) => [
    index("ix_price_list_items_tenant_list_item").on(
      table.tenantId,
      table.priceListId,
      table.itemId,
    ),
    uniqueIndex("uq_price_list_items_tier").on(
      table.tenantId,
      table.priceListId,
      table.itemId,
      table.uomId,
      table.minQty,
    ),
  ],
);

/** Partners-owned read model (draft-aware sums until PHASE-007 posts). */
export const partnerBalances = pgTable(
  "partner_balances",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    partnerId: uuid("partner_id").notNull(),
    openBalance: numeric("open_balance", { precision: 19, scale: 4 })
      .notNull()
      .default("0"),
    draftBalance: numeric("draft_balance", { precision: 19, scale: 4 })
      .notNull()
      .default("0"),
    overdueAmount: numeric("overdue_amount", { precision: 19, scale: 4 })
      .notNull()
      .default("0"),
    lastRecomputedAt: timestamp("last_recomputed_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_partner_balances_tenant_partner").on(table.tenantId, table.partnerId),
  ],
);

/** Opening-balance DRAFT capture (status CHECK-locked to DRAFT here). */
export const openingBalanceDocs = pgTable(
  "opening_balance_docs",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    kind: text("kind").notNull(),
    partnerId: uuid("partner_id"),
    accountId: uuid("account_id"),
    itemId: uuid("item_id"),
    qty: numeric("qty", { precision: 19, scale: 6 }),
    unitCost: numeric("unit_cost", { precision: 19, scale: 6 }),
    amount: numeric("amount", { precision: 19, scale: 4 }),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    note: text("note"),
    status: text("status").notNull().default("DRAFT"),
  },
  (table) => [index("ix_obd_tenant_kind").on(table.tenantId, table.kind)],
);

/** Attachments (ENTITY_CATALOG: 002 infra / 006 usage) — owner linkage. */
export const fileObjects = pgTable(
  "file_objects",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    ownerType: text("owner_type").notNull(),
    ownerId: uuid("owner_id").notNull(),
    storageKey: text("storage_key").notNull(),
    name: text("name").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    contentType: text("content_type").notNull(),
    checksum: text("checksum"),
    uploadedBy: uuid("uploaded_by"),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("ix_file_objects_tenant_owner").on(
      table.tenantId,
      table.ownerType,
      table.ownerId,
    ),
    uniqueIndex("uq_file_objects_tenant_storage_key").on(table.tenantId, table.storageKey),
  ],
);

/** Preview-gated bulk import state (commit = idempotent per token). */
export const importJobs = pgTable(
  "import_jobs",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    kind: text("kind").notNull(),
    format: text("format").notNull(),
    uploadToken: text("upload_token").notNull(),
    fileKey: text("file_key").notNull(),
    fileName: text("file_name"),
    status: text("status").notNull().default("PREVIEWING"),
    totalRows: integer("total_rows").notNull().default(0),
    validRows: integer("valid_rows").notNull().default(0),
    invalidRows: integer("invalid_rows").notNull().default(0),
    duplicateRows: integer("duplicate_rows").notNull().default(0),
    committedRows: integer("committed_rows").notNull().default(0),
    report: jsonb("report"),
    error: text("error"),
    committedAt: timestamp("committed_at", { withTimezone: true, mode: "string" }),
    createdBy: uuid("created_by"),
  },
  (table) => [
    index("ix_import_jobs_tenant_status").on(table.tenantId, table.status),
    index("ix_import_jobs_tenant_created").on(table.tenantId, table.createdAt),
    uniqueIndex("uq_import_jobs_tenant_token").on(table.tenantId, table.uploadToken),
  ],
);

// ---------------------------------------------------------------------------
// PHASE-007 accounting core (migrations 0010/0011; TABLES/core-accounting.md).
// ---------------------------------------------------------------------------

/** Fiscal years: idempotent by (tenant, name); CLOSE flips at year-end. */
export const fiscalYears = pgTable(
  "fiscal_years",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: text("status").notNull().default("OPEN"),
  },
  (table) => [
    index("ix_fiscal_years_tenant_window").on(table.tenantId, table.startDate, table.endDate),
    uniqueIndex("uq_fiscal_years_tenant_name").on(table.tenantId, table.name),
  ],
);

/** Fiscal periods: REGULAR months + special OPENING/CLOSING windows. */
export const fiscalPeriods = pgTable(
  "fiscal_periods",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    fiscalYearId: uuid("fiscal_year_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("REGULAR"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: text("status").notNull().default("OPEN"),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "string" }),
    closedBy: uuid("closed_by"),
    reopenedAt: timestamp("reopened_at", { withTimezone: true, mode: "string" }),
    reopenedBy: uuid("reopened_by"),
    reopenReason: text("reopen_reason"),
  },
  (table) => [
    index("ix_fiscal_periods_tenant_dates").on(table.tenantId, table.startDate, table.endDate),
    index("ix_fiscal_periods_tenant_year").on(table.tenantId, table.fiscalYearId),
  ],
);

/** Dated exchange rates — base per 1 foreign (INV-008). */
export const exchangeRates = pgTable(
  "exchange_rates",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    rateDate: date("rate_date").notNull(),
    rate: numeric("rate", { precision: 19, scale: 8 }).notNull(),
    source: text("source").notNull().default("MANUAL"),
  },
  (table) => [
    index("ix_exchange_rates_tenant_currency_date").on(
      table.tenantId,
      table.currencyCode,
      sql`${table.rateDate} DESC`,
    ),
    uniqueIndex("uq_exchange_rates_tenant_currency_date").on(
      table.tenantId,
      table.currencyCode,
      table.rateDate,
    ),
  ],
);

/** Cost centers: analytical dimension (basic tree). */
export const costCenters = pgTable(
  "cost_centers",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    parentId: uuid("parent_id"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    index("ix_cost_centers_tenant_parent").on(table.tenantId, table.parentId),
    uniqueIndex("uq_cost_centers_tenant_code").on(table.tenantId, table.code),
  ],
);

/** Recurring journal definitions (generation creates DRAFTs only). */
export const recurringJournals = pgTable(
  "recurring_journals",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    name: text("name").notNull(),
    template: jsonb("template").notNull(),
    schedule: text("schedule").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    nextRunDate: date("next_run_date").notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: "string" }),
    status: text("status").notNull().default("ACTIVE"),
  },
  (table) => [
    index("ix_recurring_journals_tenant_due").on(table.tenantId, table.status, table.nextRunDate),
  ],
);

/** Per-doc-type approval policies (BR-034). */
export const approvalPolicies = pgTable(
  "approval_policies",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    docType: text("doc_type").notNull(),
    policy: jsonb("policy").notNull(),
    appliesFrom: date("applies_from").notNull(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    index("ix_approval_policies_tenant_type").on(table.tenantId, table.docType, table.appliesFrom),
    uniqueIndex("uq_approval_policies_tenant_type_from").on(
      table.tenantId,
      table.docType,
      table.appliesFrom,
    ),
  ],
);

/** ADR-0006 numbering store: per-(tenant, branch, type, period) sequences. */
export const numberingSequences = pgTable(
  "numbering_sequences",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    docType: text("doc_type").notNull(),
    branchId: uuid("branch_id"),
    periodKey: text("period_key"),
    nextValue: bigint("next_value", { mode: "bigint" }).notNull().default(1n),
    format: text("format").notNull().default("{PREFIX}-{SEQ:6}"),
  },
  (table) => [index("ix_numbering_sequences_tenant").on(table.tenantId)],
);

/** Numbering audit ledger (INV-021: voided numbers stay reserved). */
export const numberAssignments = pgTable(
  "number_assignments",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    docType: text("doc_type").notNull(),
    branchId: uuid("branch_id"),
    periodKey: text("period_key"),
    number: text("number").notNull(),
    value: bigint("value", { mode: "bigint" }).notNull(),
    documentId: uuid("document_id"),
    voidedAt: timestamp("voided_at", { withTimezone: true, mode: "string" }),
    voidedBy: uuid("voided_by"),
  },
  (table) => [
    index("ix_number_assignments_tenant_doc").on(table.tenantId, table.docType, table.createdAt),
  ],
);

/** Manual journal drafts (JOURNAL_RULES §1 lifecycle document). */
export const manualJournals = pgTable(
  "manual_journals",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    status: text("status").notNull().default("DRAFT"),
    entryDate: date("entry_date").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 19, scale: 8 }),
    rateSource: text("rate_source").notNull().default("TABLE"),
    description: text("description"),
    descriptionAr: text("description_ar"),
    reference: text("reference"),
    recurrenceId: uuid("recurrence_id"),
    templateId: uuid("template_id"),
    postedJournalId: uuid("posted_journal_id"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "string" }),
    postedBy: uuid("posted_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    submittedBy: uuid("submitted_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    approvedBy: uuid("approved_by"),
    approvalStep: integer("approval_step").notNull().default(0),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    index("ix_manual_journals_tenant_status_date").on(table.tenantId, table.status, table.entryDate),
    index("ix_manual_journals_tenant_recurrence").on(table.tenantId, table.recurrenceId),
  ],
);

/** Manual journal draft lines (cascade with the draft). */
export const manualJournalLines = pgTable(
  "manual_journal_lines",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    manualJournalId: uuid("manual_journal_id").notNull(),
    lineNo: integer("line_no").notNull(),
    accountId: uuid("account_id").notNull(),
    direction: text("direction").notNull(),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    partnerId: uuid("partner_id"),
    itemId: uuid("item_id"),
    costCenterId: uuid("cost_center_id"),
    taxCodeId: uuid("tax_code_id"),
    memo: text("memo"),
    memoAr: text("memo_ar"),
  },
  (table) => [
    index("ix_manual_journal_lines_tenant_entry").on(table.tenantId, table.manualJournalId),
    index("ix_manual_journal_lines_tenant_account").on(table.tenantId, table.accountId),
    uniqueIndex("uq_manual_journal_lines_entry_line").on(table.manualJournalId, table.lineNo),
  ],
);

/** Journal templates (line structure without amounts; documents, not postings). */
export const journalTemplates = pgTable(
  "journal_templates",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    lines: jsonb("lines").notNull(),
  },
  () => [],
);

/** Journal entries — append-only, the posting engine's artifact (INV-003/013). */
export const journalEntries = pgTable(
  "journal_entries",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    entryNo: text("entry_no"),
    entryDate: date("entry_date").notNull(),
    fiscalPeriodId: uuid("fiscal_period_id").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 19, scale: 8 }).notNull().default("1"),
    status: text("status").notNull().default("POSTED"),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id"),
    operation: text("operation").notNull(),
    reversalOfId: uuid("reversal_of_id"),
    reversedById: uuid("reversed_by_id"),
    description: text("description"),
    descriptionAr: text("description_ar"),
    postReason: text("post_reason"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    postedBy: uuid("posted_by"),
  },
  (table) => [
    index("ix_journal_entries_tenant_date").on(table.tenantId, table.entryDate),
    index("ix_journal_entries_tenant_period").on(table.tenantId, table.fiscalPeriodId),
    index("ix_journal_entries_tenant_source").on(table.tenantId, table.sourceType, table.sourceId),
    uniqueIndex("uq_journal_entries_tenant_source_op")
      .on(table.tenantId, table.sourceType, table.sourceId, table.operation)
      .where(sql`${table.sourceId} IS NOT NULL`),
    uniqueIndex("uq_journal_entries_tenant_entry_no")
      .on(table.tenantId, table.entryNo)
      .where(sql`${table.entryNo} IS NOT NULL`),
  ],
);

/** Journal lines — append-only, positive magnitudes (INV-003/008). */
export const journalLines = pgTable(
  "journal_lines",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    journalEntryId: uuid("journal_entry_id").notNull(),
    lineNo: integer("line_no").notNull(),
    accountId: uuid("account_id").notNull(),
    direction: text("direction").notNull(),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    baseAmount: numeric("base_amount", { precision: 19, scale: 4 }).notNull(),
    partnerId: uuid("partner_id"),
    itemId: uuid("item_id"),
    costCenterId: uuid("cost_center_id"),
    taxCodeId: uuid("tax_code_id"),
    memo: text("memo"),
    memoAr: text("memo_ar"),
  },
  (table) => [
    index("ix_journal_lines_tenant_entry").on(table.tenantId, table.journalEntryId),
    index("ix_journal_lines_tenant_account").on(table.tenantId, table.accountId),
    index("ix_journal_lines_tenant_partner").on(table.tenantId, table.partnerId),
    uniqueIndex("uq_journal_lines_entry_line").on(table.journalEntryId, table.lineNo),
  ],
);

/** Partner subledger rows (partners-module-owned; INV-009 from entry #1). */
export const partnerSubledgerEntries = pgTable(
  "partner_subledger_entries",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    partnerId: uuid("partner_id").notNull(),
    journalEntryId: uuid("journal_entry_id").notNull(),
    journalLineId: uuid("journal_line_id").notNull(),
    entryDate: date("entry_date").notNull(),
    direction: text("direction").notNull(),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    baseAmount: numeric("base_amount", { precision: 19, scale: 4 }).notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id"),
    memo: text("memo"),
  },
  (table) => [
    index("ix_partner_subledger_tenant_partner").on(table.tenantId, table.partnerId, table.entryDate),
    index("ix_partner_subledger_tenant_entry").on(table.tenantId, table.journalEntryId),
    uniqueIndex("uq_partner_subledger_entries_line").on(table.journalLineId),
  ],
);

/** Reconciliation run records (RC-01..03; PC-04 lock gate). */
export const reconciliationRuns = pgTable(
  "reconciliation_runs",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    kind: text("kind").notNull(),
    asOf: date("as_of").notNull(),
    fiscalPeriodId: uuid("fiscal_period_id"),
    status: text("status").notNull(),
    controlBalance: numeric("control_balance", { precision: 19, scale: 4 }).notNull(),
    subledgerBalance: numeric("subledger_balance", { precision: 19, scale: 4 }).notNull(),
    diffCount: integer("diff_count").notNull().default(0),
    diff: jsonb("diff"),
    runMode: text("run_mode").notNull().default("ON_DEMAND"),
    checkedBy: uuid("checked_by"),
  },
  (table) => [
    index("ix_reconciliation_runs_tenant_kind_date").on(table.tenantId, table.kind, table.asOf),
  ],
);

// ---------------------------------------------------------------------------
// PHASE-008 — treasury cluster (migration 0012): cash/bank/petty accounts,
// the append-only movement ledger (INV-019), receipts/payments + allocations
// (INV-016), expense categories + claims (BR-023), transfers with charges
// (G-12), cashier shifts (BR-021), and bank statement import/matching (BR-022).
// ---------------------------------------------------------------------------

/** Treasury accounts — each IS a GL account (1:1 per tenant; INV-019). */
export const cashAccounts = pgTable(
  "cash_accounts",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    type: text("type").notNull(),
    accountId: uuid("account_id").notNull(),
    branchId: uuid("branch_id"),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    status: text("status").notNull().default("ACTIVE"),
    openedAt: timestamp("opened_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "string" }),
    closedBy: uuid("closed_by"),
    closeReason: text("close_reason"),
  },
  (table) => [
    uniqueIndex("uq_cash_accounts_tenant_account").on(table.tenantId, table.accountId),
    uniqueIndex("uq_cash_accounts_tenant_name").on(table.tenantId, table.name),
    index("ix_cash_accounts_tenant_type_status").on(table.tenantId, table.type, table.status),
  ],
);

/** Immutable IN/OUT money rows (INV-019 substrate; append-only 🔒). */
export const cashMovements = pgTable(
  "cash_movements",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    cashAccountId: uuid("cash_account_id").notNull(),
    direction: text("direction").notNull(),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 19, scale: 8 }).notNull().default("1"),
    baseAmount: numeric("base_amount", { precision: 19, scale: 4 }).notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    valueDate: date("value_date").notNull(),
    memo: text("memo"),
    memoAr: text("memo_ar"),
  },
  (table) => [
    uniqueIndex("uq_cash_movements_source_side").on(
      table.tenantId,
      table.sourceType,
      table.sourceId,
      table.cashAccountId,
      table.direction,
    ),
    index("ix_cash_movements_tenant_account_date").on(table.tenantId, table.cashAccountId, table.valueDate),
    index("ix_cash_movements_tenant_source").on(table.tenantId, table.sourceType, table.sourceId),
  ],
);

/** Receipts — money-in documents (G-05/G-06). */
export const receipts = pgTable(
  "receipts",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    status: text("status").notNull().default("DRAFT"),
    receiptNo: text("receipt_no"),
    cashAccountId: uuid("cash_account_id").notNull(),
    partnerId: uuid("partner_id").notNull(),
    method: text("method").notNull(),
    payerName: text("payer_name"),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 19, scale: 8 }),
    valueDate: date("value_date").notNull(),
    reference: text("reference"),
    description: text("description"),
    descriptionAr: text("description_ar"),
    allocatedAmount: numeric("allocated_amount", { precision: 19, scale: 4 }).notNull().default("0"),
    fxGainLoss: numeric("fx_gain_loss", { precision: 19, scale: 4 }).notNull().default("0"),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    submittedBy: uuid("submitted_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    approvedBy: uuid("approved_by"),
    postedJournalId: uuid("posted_journal_id"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "string" }),
    postedBy: uuid("posted_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    index("ix_receipts_tenant_status_date").on(table.tenantId, table.status, table.valueDate),
    index("ix_receipts_tenant_partner").on(table.tenantId, table.partnerId),
  ],
);

/** Payments — the money-out mirror (G-10). */
export const payments = pgTable(
  "payments",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    status: text("status").notNull().default("DRAFT"),
    paymentNo: text("payment_no"),
    cashAccountId: uuid("cash_account_id").notNull(),
    partnerId: uuid("partner_id").notNull(),
    method: text("method").notNull(),
    payeeName: text("payee_name"),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 19, scale: 8 }),
    valueDate: date("value_date").notNull(),
    reference: text("reference"),
    description: text("description"),
    descriptionAr: text("description_ar"),
    allocatedAmount: numeric("allocated_amount", { precision: 19, scale: 4 }).notNull().default("0"),
    fxGainLoss: numeric("fx_gain_loss", { precision: 19, scale: 4 }).notNull().default("0"),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    submittedBy: uuid("submitted_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    approvedBy: uuid("approved_by"),
    postedJournalId: uuid("posted_journal_id"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "string" }),
    postedBy: uuid("posted_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    index("ix_payments_tenant_status_date").on(table.tenantId, table.status, table.valueDate),
    index("ix_payments_tenant_partner").on(table.tenantId, table.partnerId),
  ],
);

/** Settlement allocations (INV-016; exactly one of receipt/payment). */
export const treasuryAllocations = pgTable(
  "treasury_allocations",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    receiptId: uuid("receipt_id"),
    paymentId: uuid("payment_id"),
    openItemId: uuid("open_item_id").notNull(),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_treasury_allocations_receipt_item").on(
      table.tenantId,
      table.receiptId,
      table.openItemId,
    ),
    uniqueIndex("uq_treasury_allocations_payment_item").on(
      table.tenantId,
      table.paymentId,
      table.openItemId,
    ),
    index("ix_treasury_allocations_tenant_item").on(table.tenantId, table.openItemId),
  ],
);

/** Expense categories (BR-023): bilingual, mapped to expense accounts. */
export const expenseCategories = pgTable(
  "expense_categories",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar").notNull(),
    accountId: uuid("account_id").notNull(),
    approvalMode: text("approval_mode").notNull().default("single-approver"),
    isActive: boolean("is_active").notNull().default(true),
  },
  (table) => [
    uniqueIndex("uq_expense_categories_tenant_code").on(table.tenantId, table.code),
    index("ix_expense_categories_tenant_active").on(table.tenantId, table.isActive),
  ],
);

/** Expense claims (BR-023; G-11; reserved tax_code_id → PHASE-009). */
export const expenses = pgTable(
  "expenses",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    status: text("status").notNull().default("DRAFT"),
    expenseNo: text("expense_no"),
    categoryId: uuid("category_id").notNull(),
    cashAccountId: uuid("cash_account_id").notNull(),
    payeeName: text("payee_name").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 19, scale: 8 }),
    taxCodeId: uuid("tax_code_id"),
    receiptFileId: uuid("receipt_file_id"),
    valueDate: date("value_date").notNull(),
    description: text("description"),
    descriptionAr: text("description_ar"),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    submittedBy: uuid("submitted_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    approvedBy: uuid("approved_by"),
    postedJournalId: uuid("posted_journal_id"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "string" }),
    postedBy: uuid("posted_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    index("ix_expenses_tenant_status_date").on(table.tenantId, table.status, table.valueDate),
    index("ix_expenses_tenant_category").on(table.tenantId, table.categoryId),
  ],
);

/** Account↔account transfers with charges (G-12). */
export const cashTransfers = pgTable(
  "cash_transfers",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    status: text("status").notNull().default("DRAFT"),
    transferNo: text("transfer_no"),
    fromAccountId: uuid("from_account_id").notNull(),
    toAccountId: uuid("to_account_id").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    feeAmount: numeric("fee_amount", { precision: 19, scale: 4 }).notNull().default("0"),
    exchangeRate: numeric("exchange_rate", { precision: 19, scale: 8 }),
    valueDate: date("value_date").notNull(),
    reference: text("reference"),
    description: text("description"),
    descriptionAr: text("description_ar"),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    submittedBy: uuid("submitted_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    approvedBy: uuid("approved_by"),
    postedJournalId: uuid("posted_journal_id"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "string" }),
    postedBy: uuid("posted_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    index("ix_cash_transfers_tenant_status_date").on(table.tenantId, table.status, table.valueDate),
  ],
);

/** Cashier shifts (BR-021): float, manual capture feed, close + variance. */
export const cashierShifts = pgTable(
  "cashier_shifts",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    status: text("status").notNull().default("OPEN"),
    shiftNo: text("shift_no"),
    cashAccountId: uuid("cash_account_id").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 19, scale: 8 }),
    openingAmount: numeric("opening_amount", { precision: 19, scale: 4 }).notNull().default("0"),
    capturedIn: numeric("captured_in", { precision: 19, scale: 4 }).notNull().default("0"),
    capturedOut: numeric("captured_out", { precision: 19, scale: 4 }).notNull().default("0"),
    expectedAmount: numeric("expected_amount", { precision: 19, scale: 4 }),
    countedAmount: numeric("counted_amount", { precision: 19, scale: 4 }),
    difference: numeric("difference", { precision: 19, scale: 4 }),
    variancePostedJournalId: uuid("variance_posted_journal_id"),
    supervisorId: uuid("supervisor_id"),
    supervisorVerifiedAt: timestamp("supervisor_verified_at", { withTimezone: true, mode: "string" }),
    closeReason: text("close_reason"),
    openedAt: timestamp("opened_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "string" }),
    closedBy: uuid("closed_by"),
  },
  (table) => [
    uniqueIndex("uq_cashier_shifts_one_open_per_account").on(table.tenantId, table.cashAccountId),
    index("ix_cashier_shifts_tenant_status").on(table.tenantId, table.status, table.openedAt),
  ],
);

/** Imported bank statements (BR-022; idempotent per file hash). */
export const bankStatements = pgTable(
  "bank_statements",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    status: text("status").notNull().default("IMPORTED"),
    cashAccountId: uuid("cash_account_id").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    fileName: text("file_name").notNull(),
    fileHash: text("file_hash").notNull(),
    adapterId: text("adapter_id").notNull(),
    openingBalance: numeric("opening_balance", { precision: 19, scale: 4 }),
    closingBalance: numeric("closing_balance", { precision: 19, scale: 4 }),
    lineCount: integer("line_count").notNull().default(0),
    importedAt: timestamp("imported_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true, mode: "string" }),
    reconciledBy: uuid("reconciled_by"),
  },
  (table) => [
    uniqueIndex("uq_bank_statements_tenant_hash").on(table.tenantId, table.fileHash),
    index("ix_bank_statements_tenant_account_period").on(
      table.tenantId,
      table.cashAccountId,
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

/** Statement lines — informational only, never ledger entries. */
export const bankStatementLines = pgTable(
  "bank_statement_lines",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    bankStatementId: uuid("bank_statement_id").notNull(),
    lineNo: integer("line_no").notNull(),
    lineDate: date("line_date").notNull(),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    reference: text("reference"),
    description: text("description"),
    matchedMovementId: uuid("matched_movement_id"),
    matchedAt: timestamp("matched_at", { withTimezone: true, mode: "string" }),
    matchedBy: uuid("matched_by"),
    matchMode: text("match_mode"),
  },
  (table) => [
    uniqueIndex("uq_bank_statement_lines_statement_no").on(table.bankStatementId, table.lineNo),
    index("ix_bank_statement_lines_tenant_statement").on(table.tenantId, table.bankStatementId, table.lineNo),
    index("ix_bank_statement_lines_tenant_movement").on(table.tenantId, table.matchedMovementId),
  ],
);

// ---------------------------------------------------------------------------
// PHASE-009 — tax cluster (migration 0013): the six-treatment engine,
// jurisdiction packs (global reference data, ADR-0010), tenant tax codes +
// registrations + staged pack bindings, the INV-012 document-summary
// substrate, VAT returns, and the e-invoicing submission registry (schema
// only — adapters PHASE-023).
// ---------------------------------------------------------------------------

/** Tax treatments (TAX_ENGINE §1) — global reference, seed-only. */
export const taxTreatments = pgTable(
  "tax_treatments",
  {
    key: text("key").primaryKey(),
    name: text("name").notNull(),
    nameAr: text("name_ar").notNull(),
    taxable: boolean("taxable").notNull(),
    outputTaxBox: text("output_tax_box"),
    inputTaxBox: text("input_tax_box"),
    sortOrder: integer("sort_order").notNull(),
  },
);

/** Jurisdiction packs (COUNTRY_PACKS §2–§5) — global reference, seed-only. */
export const jurisdictions = pgTable(
  "jurisdictions",
  {
    id: uuid("id").primaryKey(),
    countryCode: char("country_code", { length: 2 }).notNull().unique(),
    countryName: text("country_name").notNull(),
    countryNameAr: text("country_name_ar").notNull(),
    currencyCode: char("currency_code", { length: 3 }).notNull(),
    minorUnits: integer("minor_units").notNull(),
    vatStatus: text("vat_status").notNull(),
    packVersion: text("pack_version").notNull(),
    descriptor: jsonb("descriptor").notNull(),
    verificationStatus: text("verification_status").notNull().default("REQUIRES_VERIFICATION"),
    sourceRef: text("source_ref").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "string" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
);

/** Versioned effective-dated pack rates (TAX_ENGINE §3) — global reference. */
export const jurisdictionTaxRates = pgTable(
  "jurisdiction_tax_rates",
  {
    id: uuid("id").primaryKey(),
    jurisdictionId: uuid("jurisdiction_id").notNull(),
    treatment: text("treatment").notNull(),
    rate: numeric("rate", { precision: 8, scale: 4 }).notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    sourceRef: text("source_ref").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_jurisdiction_rates_window").on(
      table.jurisdictionId,
      table.treatment,
      table.effectiveFrom,
    ),
    index("ix_jurisdiction_rates_lookup").on(
      table.jurisdictionId,
      table.treatment,
      table.effectiveFrom,
    ),
  ],
);

/** Tenant tax codes — the treatment binder bound to a jurisdiction pack. */
export const taxCodes = pgTable(
  "tax_codes",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    countryCode: char("country_code", { length: 2 }).notNull(),
    defaultTreatment: text("default_treatment").notNull(),
    snapshotPolicy: text("snapshot_policy").notNull().default("STAMP_AT_POSTING"),
    status: text("status").notNull().default("ACTIVE"),
    createdBy: uuid("created_by"),
  },
  (table) => [
    uniqueIndex("uq_tax_codes_tenant_code").on(table.tenantId, table.code),
    index("ix_tax_codes_tenant_country_status").on(
      table.tenantId,
      table.countryCode,
      table.status,
    ),
  ],
);

/** Tenant tax registrations per jurisdiction (TAX_ENGINE §1). */
export const taxRegistrations = pgTable(
  "tax_registrations",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    countryCode: char("country_code", { length: 2 }).notNull(),
    status: text("status").notNull(),
    registrationNumber: text("registration_number"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    deregisteredAt: date("deregistered_at"),
    note: text("note"),
    createdBy: uuid("created_by"),
  },
  (table) => [
    uniqueIndex("uq_tax_registrations_tenant_country").on(table.tenantId, table.countryCode),
    index("ix_tax_registrations_tenant_country").on(table.tenantId, table.countryCode),
  ],
);

/** Staged pack bindings — the tenant's pinned pack version per country. */
export const taxPackBindings = pgTable(
  "tax_pack_bindings",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    countryCode: char("country_code", { length: 2 }).notNull(),
    packVersion: text("pack_version").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    appliedBy: uuid("applied_by"),
    createdBy: uuid("created_by"),
  },
  (table) => [
    uniqueIndex("uq_tax_pack_bindings_tenant_country").on(table.tenantId, table.countryCode),
  ],
);

/** Document tax summaries — INV-012's document side, append-only. */
export const taxDocumentSummaries = pgTable(
  "tax_document_summaries",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    documentDate: date("document_date").notNull(),
    fiscalPeriodId: uuid("fiscal_period_id"),
    countryCode: char("country_code", { length: 2 }).notNull(),
    direction: text("direction").notNull(),
    treatment: text("treatment").notNull(),
    rate: numeric("rate", { precision: 8, scale: 4 }).notNull(),
    taxCodeId: uuid("tax_code_id"),
    taxableBase: numeric("taxable_base", { precision: 19, scale: 4 }).notNull(),
    taxAmount: numeric("tax_amount", { precision: 19, scale: 4 }).notNull(),
    snapshot: jsonb("snapshot").notNull(),
  },
  (table) => [
    uniqueIndex("uq_tax_document_summaries_group").on(
      table.tenantId,
      table.sourceType,
      table.sourceId,
      table.direction,
      table.treatment,
      table.rate,
      table.taxCodeId,
    ),
    index("ix_tax_summaries_period").on(
      table.tenantId,
      table.countryCode,
      table.documentDate,
      table.direction,
    ),
    index("ix_tax_summaries_source").on(table.tenantId, table.sourceType, table.sourceId),
  ],
);

/** VAT returns — draft → ready (INV-012 green) → filed-by-human. */
export const vatReturns = pgTable(
  "vat_returns",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    countryCode: char("country_code", { length: 2 }).notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: text("status").notNull().default("DRAFT"),
    summary: jsonb("summary").notNull(),
    crossCheck: jsonb("cross_check").notNull(),
    crossCheckOk: boolean("cross_check_ok").notNull().default(false),
    preparedAt: timestamp("prepared_at", { withTimezone: true, mode: "string" }),
    preparedBy: uuid("prepared_by"),
    filedAt: timestamp("filed_at", { withTimezone: true, mode: "string" }),
    filedBy: uuid("filed_by"),
    filingReference: text("filing_reference"),
    filingNote: text("filing_note"),
    createdBy: uuid("created_by"),
  },
  (table) => [
    uniqueIndex("uq_vat_returns_window").on(
      table.tenantId,
      table.countryCode,
      table.periodStart,
      table.periodEnd,
    ),
    index("ix_vat_returns_tenant_period").on(
      table.tenantId,
      table.countryCode,
      table.periodStart,
      table.periodEnd,
    ),
  ],
);

/** E-invoicing submission registry (schema only — adapters PHASE-023). */
export const eInvoicingSubmissions = pgTable(
  "e_invoicing_submissions",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    countryCode: char("country_code", { length: 2 }).notNull(),
    adapterId: text("adapter_id").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    status: text("status").notNull().default("PENDING"),
    payloadDigest: text("payload_digest"),
    authorityReference: text("authority_reference"),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    respondedAt: timestamp("responded_at", { withTimezone: true, mode: "string" }),
    errorDetail: jsonb("error_detail"),
    createdBy: uuid("created_by"),
  },
  (table) => [
    uniqueIndex("uq_e_invoicing_submissions_source").on(
      table.tenantId,
      table.sourceType,
      table.sourceId,
    ),
    index("ix_e_invoicing_tenant_status").on(
      table.tenantId,
      table.countryCode,
      table.status,
    ),
  ],
);

// ---------------------------------------------------------------------------
// PHASE-010 inventory cluster (migrations 0014_inventory_core.sql +
// 0015_inventory_tracking.sql; TABLES/trade-inventory.md §inventory).

/** Warehouses: stock locations under a branch (G-15 account override). */
export const warehouses = pgTable(
  "warehouses",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    inventoryAccountId: uuid("inventory_account_id"),
    isActive: boolean("is_active").notNull().default(true),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true, mode: "string" }),
    deactivatedBy: uuid("deactivated_by"),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("uq_warehouses_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_warehouses_tenant_code").on(table.tenantId, table.code),
    uniqueIndex("uq_warehouses_tenant_name").on(table.tenantId, table.name),
    index("ix_warehouses_tenant_branch").on(table.tenantId, table.branchId),
    index("ix_warehouses_tenant_active").on(table.tenantId, table.isActive),
  ],
);

/** Per-item-per-warehouse defaults (BR-019 reorder substrate). */
export const itemWarehouseSettings = pgTable(
  "item_warehouse_settings",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    itemId: uuid("item_id").notNull(),
    warehouseId: uuid("warehouse_id").notNull(),
    reorderLevel: numeric("reorder_level", { precision: 19, scale: 6 })
      .notNull()
      .default("0"),
    minQty: numeric("min_qty", { precision: 19, scale: 6 })
      .notNull()
      .default("0"),
    lastReorderAlertedAt: timestamp("last_reorder_alerted_at", {
      withTimezone: true,
      mode: "string",
    }),
  },
  (table) => [
    uniqueIndex("uq_item_warehouse_settings_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_item_warehouse_settings_tenant_item_wh").on(
      table.tenantId,
      table.itemId,
      table.warehouseId,
    ),
    index("ix_item_warehouse_settings_tenant_wh").on(table.tenantId, table.warehouseId),
  ],
);

/**
 * Stock movements — the append-only ledger 🔒 (INV-010/017/018). No
 * updated_at: the table is INSERT-only (grants + guard trigger mirror
 * cash_movements). qty is always positive; direction carries the sign;
 * value_amount is the exact 4-decimal journal quantum.
 */
export const stockMoves = pgTable(
  "stock_moves",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    itemId: uuid("item_id").notNull(),
    warehouseId: uuid("warehouse_id").notNull(),
    direction: text("direction").notNull(),
    moveKind: text("move_kind").notNull(),
    qty: numeric("qty", { precision: 19, scale: 6 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 19, scale: 6 }).notNull(),
    valueAmount: numeric("value_amount", { precision: 19, scale: 4 }).notNull(),
    batchId: uuid("batch_id"),
    serialId: uuid("serial_id"),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    movedAt: date("moved_at").notNull(),
    reason: text("reason"),
    memo: text("memo"),
    memoAr: text("memo_ar"),
    postedJournalId: uuid("posted_journal_id"),
  },
  (table) => [
    uniqueIndex("uq_stock_moves_id_tenant").on(table.id, table.tenantId),
    index("ix_stock_moves_tenant_item_wh_date").on(
      table.tenantId,
      table.itemId,
      table.warehouseId,
      table.movedAt,
    ),
    index("ix_stock_moves_tenant_wh_date").on(table.tenantId, table.warehouseId, table.movedAt),
    index("ix_stock_moves_tenant_source").on(table.tenantId, table.sourceType, table.sourceId),
    index("ix_stock_moves_tenant_journal").on(table.tenantId, table.postedJournalId),
    index("ix_stock_moves_tenant_batch").on(table.tenantId, table.batchId),
    index("ix_stock_moves_tenant_serial").on(table.tenantId, table.serialId),
  ],
);

/** FIFO cost layers (created at receipt; consumed rows stay at qty 0). */
export const stockLayers = pgTable(
  "stock_layers",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
    itemId: uuid("item_id").notNull(),
    warehouseId: uuid("warehouse_id").notNull(),
    remainingQty: numeric("remaining_qty", { precision: 19, scale: 6 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 19, scale: 6 }).notNull(),
    sourceMoveId: uuid("source_move_id"),
    receivedAt: date("received_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_stock_layers_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_stock_layers_source_move").on(table.tenantId, table.sourceMoveId),
    index("ix_stock_layers_tenant_item_wh_received").on(
      table.tenantId,
      table.itemId,
      table.warehouseId,
      table.receivedAt,
    ),
  ],
);

/** On-hand read model (transactionally maintained; BR-013 negative policy). */
export const itemStock = pgTable(
  "item_stock",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    itemId: uuid("item_id").notNull(),
    warehouseId: uuid("warehouse_id").notNull(),
    qty: numeric("qty", { precision: 19, scale: 6 })
      .notNull()
      .default("0"),
    avgCost: numeric("avg_cost", { precision: 19, scale: 6 })
      .notNull()
      .default("0"),
  },
  (table) => [
    uniqueIndex("uq_item_stock_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_item_stock_tenant_item_wh").on(
      table.tenantId,
      table.itemId,
      table.warehouseId,
    ),
    index("ix_item_stock_tenant_wh").on(table.tenantId, table.warehouseId),
  ],
);

/** Stock transfers (DRAFT → IN_TRANSIT → POSTED; BR-16/G-15). */
export const stockTransfers = pgTable(
  "stock_transfers",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    transferNo: text("transfer_no"),
    fromWarehouseId: uuid("from_warehouse_id").notNull(),
    toWarehouseId: uuid("to_warehouse_id").notNull(),
    status: text("status").notNull().default("DRAFT"),
    dispatchDate: date("dispatch_date"),
    dispatchedBy: uuid("dispatched_by"),
    receiveDate: date("receive_date"),
    receivedBy: uuid("received_by"),
    postedJournalId: uuid("posted_journal_id"),
    note: text("note"),
    noteAr: text("note_ar"),
  },
  (table) => [
    uniqueIndex("uq_stock_transfers_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_stock_transfers_tenant_no").on(table.tenantId, table.transferNo),
    index("ix_stock_transfers_tenant_status").on(table.tenantId, table.status, table.createdAt),
    index("ix_stock_transfers_tenant_from").on(table.tenantId, table.fromWarehouseId),
    index("ix_stock_transfers_tenant_to").on(table.tenantId, table.toWarehouseId),
  ],
);

/** Transfer lines: one line per item per transfer. */
export const stockTransferLines = pgTable(
  "stock_transfer_lines",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
    transferId: uuid("transfer_id").notNull(),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id").notNull(),
    qty: numeric("qty", { precision: 19, scale: 6 }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_stock_transfer_lines_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_stock_transfer_lines_no").on(table.transferId, table.lineNo),
    uniqueIndex("uq_stock_transfer_lines_item").on(table.tenantId, table.transferId, table.itemId),
    index("ix_stock_transfer_lines_tenant_transfer").on(table.tenantId, table.transferId, table.lineNo),
  ],
);

/** Manual stock adjustments (G-13/G-14; reason OTHER needs counter account). */
export const stockAdjustments = pgTable(
  "stock_adjustments",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    adjustmentNo: text("adjustment_no"),
    warehouseId: uuid("warehouse_id").notNull(),
    itemId: uuid("item_id").notNull(),
    reason: text("reason").notNull(),
    deltaQty: numeric("delta_qty", { precision: 19, scale: 6 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 19, scale: 6 }),
    counterAccountId: uuid("counter_account_id"),
    status: text("status").notNull().default("DRAFT"),
    postingDate: date("posting_date"),
    postedBy: uuid("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "string" }),
    postedJournalId: uuid("posted_journal_id"),
    note: text("note"),
    noteAr: text("note_ar"),
  },
  (table) => [
    uniqueIndex("uq_stock_adjustments_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_stock_adjustments_tenant_no").on(table.tenantId, table.adjustmentNo),
    index("ix_stock_adjustments_tenant_status").on(table.tenantId, table.status, table.createdAt),
    index("ix_stock_adjustments_tenant_wh").on(table.tenantId, table.warehouseId),
  ],
);

/** Soft reservations (availability netting only — hard policies PHASE-015). */
export const stockReservations = pgTable(
  "stock_reservations",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    itemId: uuid("item_id").notNull(),
    warehouseId: uuid("warehouse_id").notNull(),
    qty: numeric("qty", { precision: 19, scale: 6 }).notNull(),
    holderType: text("holder_type").notNull(),
    holderId: uuid("holder_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
    status: text("status").notNull().default("ACTIVE"),
    releasedAt: timestamp("released_at", { withTimezone: true, mode: "string" }),
    releasedBy: uuid("released_by"),
    consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "string" }),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("uq_stock_reservations_id_tenant").on(table.id, table.tenantId),
    index("ix_stock_reservations_netting").on(
      table.tenantId,
      table.itemId,
      table.warehouseId,
      table.status,
    ),
  ],
);

/** Batch/lot registry (BR-017 FEFO basis). */
export const itemBatches = pgTable(
  "item_batches",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    itemId: uuid("item_id").notNull(),
    batchNo: text("batch_no").notNull(),
    expiryDate: date("expiry_date"),
    sourceRef: text("source_ref"),
    status: text("status").notNull().default("ACTIVE"),
  },
  (table) => [
    uniqueIndex("uq_item_batches_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_item_batches_tenant_item_no").on(table.tenantId, table.itemId, table.batchNo),
    index("ix_item_batches_tenant_item_expiry").on(
      table.tenantId,
      table.itemId,
      table.expiryDate,
    ),
    index("ix_item_batches_tenant_status").on(table.tenantId, table.status),
  ],
);

/** Serial/IMEI unit registry (BR-018 return binding). */
export const itemSerials = pgTable(
  "item_serials",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    itemId: uuid("item_id").notNull(),
    serialNo: text("serial_no").notNull(),
    imei: text("imei"),
    status: text("status").notNull().default("in_stock"),
    currentOwner: text("current_owner"),
    soldAt: date("sold_at"),
    returnedAt: date("returned_at"),
  },
  (table) => [
    uniqueIndex("uq_item_serials_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_item_serials_tenant_item_no").on(table.tenantId, table.itemId, table.serialNo),
    uniqueIndex("uq_item_serials_tenant_imei").on(table.tenantId, table.imei),
    index("ix_item_serials_tenant_item_status").on(table.tenantId, table.itemId, table.status),
  ],
);

/** Count sessions (DRAFT → COUNTED → VARIANCE_REVIEW → POSTED; BR-015). */
export const stockCounts = pgTable(
  "stock_counts",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    countNo: text("count_no"),
    warehouseId: uuid("warehouse_id").notNull(),
    status: text("status").notNull().default("DRAFT"),
    blind: boolean("blind").notNull().default(false),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true, mode: "string" }).notNull(),
    countedBy: uuid("counted_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    supervisorOverride: boolean("supervisor_override").notNull().default(false),
    postingDate: date("posting_date"),
    postedJournalId: uuid("posted_journal_id"),
    variance: jsonb("variance"),
    note: text("note"),
    noteAr: text("note_ar"),
  },
  (table) => [
    uniqueIndex("uq_stock_counts_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_stock_counts_tenant_no").on(table.tenantId, table.countNo),
    index("ix_stock_counts_tenant_status").on(table.tenantId, table.status, table.createdAt),
    index("ix_stock_counts_tenant_wh").on(table.tenantId, table.warehouseId),
  ],
);

/** Count lines (frozen snapshot + counted qty + variance value impact). */
export const stockCountLines = pgTable(
  "stock_count_lines",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    stockCountId: uuid("stock_count_id").notNull(),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id").notNull(),
    batchId: uuid("batch_id"),
    systemQty: numeric("system_qty", { precision: 19, scale: 6 }).notNull(),
    countedQty: numeric("counted_qty", { precision: 19, scale: 6 }),
    recounted: boolean("recounted").notNull().default(false),
    recountNote: text("recount_note"),
    valueImpact: numeric("value_impact", { precision: 19, scale: 4 }),
  },
  (table) => [
    uniqueIndex("uq_stock_count_lines_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_stock_count_lines_no").on(table.stockCountId, table.lineNo),
    uniqueIndex("uq_stock_count_lines_count_item_plain").on(table.stockCountId, table.itemId),
    uniqueIndex("uq_stock_count_lines_count_item_batch").on(
      table.stockCountId,
      table.itemId,
      table.batchId,
    ),
    index("ix_stock_count_lines_tenant_count").on(table.tenantId, table.stockCountId, table.lineNo),
  ],
);

// ---------------------------------------------------------------------------
// PHASE-011 purchasing cluster (migrations 0016/0017): procure-to-pay
// documents (PR/PO/GRN/supplier invoice/debit note), landed costs, and the
// audited AP re-allocation documents. Posted rows are immutable by service
// discipline + shape CHECKs (the treasury pattern).

/** Internal requisitions (approval routing → PO). */
export const purchaseRequests = pgTable(
  "purchase_requests",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    branchId: uuid("branch_id").notNull(),
    requestNo: text("request_no"),
    neededBy: date("needed_by"),
    status: text("status").notNull().default("DRAFT"),
    note: text("note"),
    noteAr: text("note_ar"),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    submittedBy: uuid("submitted_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    approvedBy: uuid("approved_by"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true, mode: "string" }),
    rejectedBy: uuid("rejected_by"),
    rejectionReason: text("rejection_reason"),
    convertedOrderId: uuid("converted_order_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    uniqueIndex("uq_purchase_requests_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_purchase_requests_tenant_no").on(table.tenantId, table.requestNo),
    index("ix_purchase_requests_tenant_status").on(table.tenantId, table.status, table.createdAt),
    index("ix_purchase_requests_tenant_branch").on(table.tenantId, table.branchId),
  ],
);

export const purchaseRequestLines = pgTable(
  "purchase_request_lines",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull(),
    requestId: uuid("request_id").notNull(),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id").notNull(),
    qty: numeric("qty", { precision: 19, scale: 6 }).notNull(),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("uq_purchase_request_lines_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_purchase_request_lines_req_line").on(
      table.tenantId,
      table.requestId,
      table.lineNo,
    ),
    index("ix_purchase_request_lines_tenant_item").on(table.tenantId, table.itemId),
  ],
);

/** Supplier orders (DRAFT → ISSUED → CLOSED; amendments as linked revisions). */
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    branchId: uuid("branch_id").notNull(),
    supplierId: uuid("supplier_id").notNull(),
    orderNo: text("order_no"),
    orderDate: date("order_date").notNull(),
    expectedDate: date("expected_date"),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 19, scale: 8 }),
    revisionOfId: uuid("revision_of_id"),
    revisionNo: integer("revision_no").notNull().default(1),
    status: text("status").notNull().default("DRAFT"),
    totalNet: numeric("total_net", { precision: 19, scale: 4 }).notNull().default("0"),
    totalTax: numeric("total_tax", { precision: 19, scale: 4 }).notNull().default("0"),
    totalGross: numeric("total_gross", { precision: 19, scale: 4 }).notNull().default("0"),
    taxSummary: jsonb("tax_summary"),
    note: text("note"),
    noteAr: text("note_ar"),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    submittedBy: uuid("submitted_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    approvedBy: uuid("approved_by"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true, mode: "string" }),
    rejectedBy: uuid("rejected_by"),
    rejectionReason: text("rejection_reason"),
    issuedAt: timestamp("issued_at", { withTimezone: true, mode: "string" }),
    issuedBy: uuid("issued_by"),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "string" }),
    closedBy: uuid("closed_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    uniqueIndex("uq_purchase_orders_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_purchase_orders_tenant_no").on(table.tenantId, table.orderNo),
    index("ix_purchase_orders_tenant_status").on(table.tenantId, table.status, table.orderDate),
    index("ix_purchase_orders_tenant_supplier").on(table.tenantId, table.supplierId, table.orderDate),
    index("ix_purchase_orders_tenant_branch").on(table.tenantId, table.branchId),
    index("ix_purchase_orders_revision_chain").on(table.tenantId, table.revisionOfId),
  ],
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull(),
    orderId: uuid("order_id").notNull(),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id").notNull(),
    qty: numeric("qty", { precision: 19, scale: 6 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 19, scale: 6 }).notNull().default("0"),
    taxCodeId: uuid("tax_code_id"),
    netAmount: numeric("net_amount", { precision: 19, scale: 4 }).notNull(),
    taxAmount: numeric("tax_amount", { precision: 19, scale: 4 }).notNull().default("0"),
    priceSource: text("price_source").notNull().default("MANUAL"),
    requestLineId: uuid("request_line_id"),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("uq_purchase_order_lines_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_purchase_order_lines_order_line").on(table.tenantId, table.orderId, table.lineNo),
    index("ix_purchase_order_lines_tenant_item").on(table.tenantId, table.itemId),
  ],
);

/** Goods-in documents (POSTED receives stock + GRNI accrual; golden G-07). */
export const goodsReceipts = pgTable(
  "goods_receipts",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    branchId: uuid("branch_id").notNull(),
    supplierId: uuid("supplier_id").notNull(),
    poId: uuid("po_id"),
    warehouseId: uuid("warehouse_id").notNull(),
    receiptNo: text("receipt_no"),
    receiptDate: date("receipt_date").notNull(),
    status: text("status").notNull().default("DRAFT"),
    poLessReason: text("po_less_reason"),
    totalValue: numeric("total_value", { precision: 19, scale: 4 }).notNull().default("0"),
    note: text("note"),
    noteAr: text("note_ar"),
    postingDate: date("posting_date"),
    postedBy: uuid("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "string" }),
    postedJournalId: uuid("posted_journal_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    uniqueIndex("uq_goods_receipts_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_goods_receipts_tenant_no").on(table.tenantId, table.receiptNo),
    index("ix_goods_receipts_tenant_status").on(table.tenantId, table.status, table.receiptDate),
    index("ix_goods_receipts_tenant_supplier").on(table.tenantId, table.supplierId, table.receiptDate),
    index("ix_goods_receipts_tenant_po").on(table.tenantId, table.poId),
    index("ix_goods_receipts_tenant_wh").on(table.tenantId, table.warehouseId),
  ],
);

export const goodsReceiptLines = pgTable(
  "goods_receipt_lines",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull(),
    receiptId: uuid("receipt_id").notNull(),
    lineNo: integer("line_no").notNull(),
    poLineId: uuid("po_line_id"),
    itemId: uuid("item_id").notNull(),
    qty: numeric("qty", { precision: 19, scale: 6 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 19, scale: 6 }).notNull().default("0"),
    valueAmount: numeric("value_amount", { precision: 19, scale: 4 }).notNull(),
    accountId: uuid("account_id"),
    batchNo: text("batch_no"),
    batchExpiry: date("batch_expiry"),
    serialIds: jsonb("serial_ids"),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("uq_goods_receipt_lines_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_goods_receipt_lines_receipt_line").on(
      table.tenantId,
      table.receiptId,
      table.lineNo,
    ),
    index("ix_goods_receipt_lines_tenant_item").on(table.tenantId, table.itemId),
    index("ix_goods_receipt_lines_po_line").on(table.tenantId, table.poLineId),
  ],
);

/** AP invoices (G-08; match outcome recorded before approval — BR-009). */
export const supplierInvoices = pgTable(
  "supplier_invoices",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    branchId: uuid("branch_id").notNull(),
    supplierId: uuid("supplier_id").notNull(),
    invoiceNo: text("invoice_no").notNull(),
    internalNo: text("internal_no"),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 19, scale: 8 }),
    poId: uuid("po_id"),
    status: text("status").notNull().default("DRAFT"),
    matchStatus: text("match_status").notNull().default("PENDING"),
    matchResult: jsonb("match_result"),
    duplicateWarning: jsonb("duplicate_warning"),
    totalNet: numeric("total_net", { precision: 19, scale: 4 }).notNull().default("0"),
    totalTax: numeric("total_tax", { precision: 19, scale: 4 }).notNull().default("0"),
    totalGross: numeric("total_gross", { precision: 19, scale: 4 }).notNull().default("0"),
    taxSummary: jsonb("tax_summary"),
    note: text("note"),
    noteAr: text("note_ar"),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    submittedBy: uuid("submitted_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    approvedBy: uuid("approved_by"),
    postingDate: date("posting_date"),
    postedBy: uuid("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "string" }),
    postedJournalId: uuid("posted_journal_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    uniqueIndex("uq_supplier_invoices_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_supplier_invoices_tenant_internal").on(table.tenantId, table.internalNo),
    index("ix_supplier_invoices_tenant_status").on(table.tenantId, table.status, table.invoiceDate),
    index("ix_supplier_invoices_tenant_supplier_due").on(
      table.tenantId,
      table.supplierId,
      table.dueDate,
    ),
    index("ix_supplier_invoices_tenant_supplier_no").on(
      table.tenantId,
      table.supplierId,
      table.invoiceNo,
    ),
    index("ix_supplier_invoices_tenant_po").on(table.tenantId, table.poId),
  ],
);

export const supplierInvoiceLines = pgTable(
  "supplier_invoice_lines",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull(),
    invoiceId: uuid("invoice_id").notNull(),
    lineNo: integer("line_no").notNull(),
    grnLineId: uuid("grn_line_id"),
    poLineId: uuid("po_line_id"),
    itemId: uuid("item_id"),
    accountId: uuid("account_id"),
    description: text("description"),
    descriptionAr: text("description_ar"),
    qty: numeric("qty", { precision: 19, scale: 6 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 19, scale: 6 }).notNull().default("0"),
    taxCodeId: uuid("tax_code_id"),
    vatRecoverable: boolean("vat_recoverable").notNull().default(true),
    netAmount: numeric("net_amount", { precision: 19, scale: 4 }).notNull(),
    taxAmount: numeric("tax_amount", { precision: 19, scale: 4 }).notNull().default("0"),
    taxSnapshot: jsonb("tax_snapshot"),
    grniClearedValue: numeric("grni_cleared_value", { precision: 19, scale: 4 })
      .notNull()
      .default("0"),
    stockRevalueValue: numeric("stock_revalue_value", { precision: 19, scale: 4 })
      .notNull()
      .default("0"),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("uq_supplier_invoice_lines_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_supplier_invoice_lines_invoice_line").on(
      table.tenantId,
      table.invoiceId,
      table.lineNo,
    ),
    index("ix_supplier_invoice_lines_tenant_item").on(table.tenantId, table.itemId),
    index("ix_supplier_invoice_lines_grn_line").on(table.tenantId, table.grnLineId),
  ],
);

/** AP corrections mirroring supplier invoices (golden G-09). */
export const debitNotes = pgTable(
  "debit_notes",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    branchId: uuid("branch_id").notNull(),
    supplierId: uuid("supplier_id").notNull(),
    refInvoiceId: uuid("ref_invoice_id").notNull(),
    noteNo: text("note_no"),
    noteDate: date("note_date").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 19, scale: 8 }),
    status: text("status").notNull().default("DRAFT"),
    totalNet: numeric("total_net", { precision: 19, scale: 4 }).notNull().default("0"),
    totalTax: numeric("total_tax", { precision: 19, scale: 4 }).notNull().default("0"),
    totalGross: numeric("total_gross", { precision: 19, scale: 4 }).notNull().default("0"),
    taxSummary: jsonb("tax_summary"),
    note: text("note"),
    noteAr: text("note_ar"),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    submittedBy: uuid("submitted_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    approvedBy: uuid("approved_by"),
    postingDate: date("posting_date"),
    postedBy: uuid("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "string" }),
    postedJournalId: uuid("posted_journal_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    uniqueIndex("uq_debit_notes_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_debit_notes_tenant_no").on(table.tenantId, table.noteNo),
    index("ix_debit_notes_tenant_status").on(table.tenantId, table.status, table.noteDate),
    index("ix_debit_notes_tenant_supplier").on(table.tenantId, table.supplierId, table.noteDate),
    index("ix_debit_notes_ref_invoice").on(table.tenantId, table.refInvoiceId),
  ],
);

export const debitNoteLines = pgTable(
  "debit_note_lines",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull(),
    noteId: uuid("note_id").notNull(),
    lineNo: integer("line_no").notNull(),
    invoiceLineId: uuid("invoice_line_id"),
    itemId: uuid("item_id"),
    accountId: uuid("account_id"),
    description: text("description"),
    descriptionAr: text("description_ar"),
    qty: numeric("qty", { precision: 19, scale: 6 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 19, scale: 6 }).notNull().default("0"),
    taxCodeId: uuid("tax_code_id"),
    vatRecoverable: boolean("vat_recoverable").notNull().default(true),
    netAmount: numeric("net_amount", { precision: 19, scale: 4 }).notNull(),
    taxAmount: numeric("tax_amount", { precision: 19, scale: 4 }).notNull().default("0"),
    taxSnapshot: jsonb("tax_snapshot"),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("uq_debit_note_lines_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_debit_note_lines_note_line").on(table.tenantId, table.noteId, table.lineNo),
    index("ix_debit_note_lines_tenant_item").on(table.tenantId, table.itemId),
  ],
);

/** Landed costs (PHASE-011 baseline — allocation math + remaining-qty constraint). */
export const landedCosts = pgTable(
  "landed_costs",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    grnId: uuid("grn_id").notNull(),
    costNo: text("cost_no"),
    costType: text("cost_type").notNull(),
    vendorId: uuid("vendor_id"),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    allocationMethod: text("allocation_method").notNull().default("VALUE"),
    chargeAccountId: uuid("charge_account_id").notNull(),
    status: text("status").notNull().default("DRAFT"),
    allocatedToStock: numeric("allocated_to_stock", { precision: 19, scale: 4 })
      .notNull()
      .default("0"),
    allocatedToCogs: numeric("allocated_to_cogs", { precision: 19, scale: 4 })
      .notNull()
      .default("0"),
    note: text("note"),
    noteAr: text("note_ar"),
    postingDate: date("posting_date"),
    postedBy: uuid("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "string" }),
    postedJournalId: uuid("posted_journal_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    uniqueIndex("uq_landed_costs_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_landed_costs_tenant_no").on(table.tenantId, table.costNo),
    index("ix_landed_costs_tenant_grn").on(table.tenantId, table.grnId),
    index("ix_landed_costs_tenant_status").on(table.tenantId, table.status),
  ],
);

export const landedCostAllocations = pgTable(
  "landed_cost_allocations",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull(),
    landedCostId: uuid("landed_cost_id").notNull(),
    grnLineId: uuid("grn_line_id").notNull(),
    itemId: uuid("item_id").notNull(),
    warehouseId: uuid("warehouse_id").notNull(),
    qtyAtAllocation: numeric("qty_at_allocation", { precision: 19, scale: 6 }).notNull(),
    remainingQty: numeric("remaining_qty", { precision: 19, scale: 6 }).notNull(),
    allocatedAmount: numeric("allocated_amount", { precision: 19, scale: 4 }).notNull(),
    cogsAdjustmentAmount: numeric("cogs_adjustment_amount", { precision: 19, scale: 4 })
      .notNull()
      .default("0"),
    revalueAppliedAt: timestamp("revalue_applied_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    uniqueIndex("uq_landed_cost_allocations_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_landed_cost_allocations_cost_line").on(
      table.tenantId,
      table.landedCostId,
      table.grnLineId,
    ),
    index("ix_landed_cost_allocations_tenant_item").on(
      table.tenantId,
      table.itemId,
      table.warehouseId,
    ),
  ],
);

/** Audited AP re-allocation documents (post-allocation moves, BR-027/§3.3). */
export const purchaseReallocations = pgTable(
  "purchase_reallocations",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    docNo: text("doc_no"),
    paymentId: uuid("payment_id").notNull(),
    supplierId: uuid("supplier_id").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("POSTED"),
    totalAmount: numeric("total_amount", { precision: 19, scale: 4 }).notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_purchase_reallocations_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_purchase_reallocations_tenant_no").on(table.tenantId, table.docNo),
    index("ix_purchase_reallocations_tenant_payment").on(table.tenantId, table.paymentId),
    index("ix_purchase_reallocations_tenant_supplier").on(
      table.tenantId,
      table.supplierId,
      table.createdAt,
    ),
  ],
);

export const purchaseReallocationLines = pgTable(
  "purchase_reallocation_lines",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    tenantId: uuid("tenant_id").notNull(),
    reallocationId: uuid("reallocation_id").notNull(),
    lineNo: integer("line_no").notNull(),
    fromOpenItemId: uuid("from_open_item_id"),
    toOpenItemId: uuid("to_open_item_id"),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_purchase_reallocation_lines_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_purchase_reallocation_lines_doc_line").on(
      table.tenantId,
      table.reallocationId,
      table.lineNo,
    ),
    index("ix_purchase_reallocation_lines_tenant_doc").on(
      table.tenantId,
      table.reallocationId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// PHASE-012 sales cluster (migrations 0018_sales_core + 0019_sales_ar).
// Mirror rule: column-for-column with the SQL (sync docs rule); draft-
// lifecycle tables (SELECT/INSERT/UPDATE), posted rows immutable by service
// discipline + shape CHECKs; the re-allocation pair is INSERT-only.
// ---------------------------------------------------------------------------

/** Sales reps (§2.10 T12): attribution only — commissions are PHASE-017. */
export const salesReps = pgTable(
  "sales_reps",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by"),
    tenantId: uuid("tenant_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameAr: text("name_ar"),
    email: text("email"),
    phone: text("phone"),
    status: text("status").notNull().default("ACTIVE"),
    note: text("note"),
    noteAr: text("note_ar"),
  },
  (table) => [
    uniqueIndex("uq_sales_reps_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_sales_reps_tenant_code").on(table.tenantId, table.code),
    index("ix_sales_reps_tenant_status").on(table.tenantId, table.status, table.code),
  ],
);

/** Quotations (§2.1; BR-006 validity, no ledger effect). */
export const quotations = pgTable(
  "quotations",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by"),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    salesRepId: uuid("sales_rep_id"),
    quoteNo: text("quote_no"),
    quoteDate: date("quote_date").notNull(),
    validUntil: date("valid_until").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 19, scale: 8 }),
    status: text("status").notNull().default("DRAFT"),
    totalNet: numeric("total_net", { precision: 19, scale: 4 }).notNull().default("0"),
    totalTax: numeric("total_tax", { precision: 19, scale: 4 }).notNull().default("0"),
    totalGross: numeric("total_gross", { precision: 19, scale: 4 }).notNull().default("0"),
    note: text("note"),
    noteAr: text("note_ar"),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }),
    sentBy: uuid("sent_by"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "string" }),
    acceptedBy: uuid("accepted_by"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true, mode: "string" }),
    rejectedBy: uuid("rejected_by"),
    rejectionReason: text("rejection_reason"),
    convertedOrderId: uuid("converted_order_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    uniqueIndex("uq_quotations_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_quotations_tenant_no").on(table.tenantId, table.quoteNo),
    index("ix_quotations_tenant_status").on(table.tenantId, table.status, table.quoteDate),
    index("ix_quotations_tenant_customer").on(table.tenantId, table.customerId, table.quoteDate),
  ],
);

export const quotationLines = pgTable(
  "quotation_lines",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull(),
    quotationId: uuid("quotation_id").notNull(),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id").notNull(),
    description: text("description"),
    descriptionAr: text("description_ar"),
    qty: numeric("qty", { precision: 19, scale: 6 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 19, scale: 6 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 19, scale: 4 }).notNull().default("0"),
    taxCodeId: uuid("tax_code_id"),
    netAmount: numeric("net_amount", { precision: 19, scale: 4 }).notNull(),
    taxAmount: numeric("tax_amount", { precision: 19, scale: 4 }).notNull().default("0"),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("uq_quotation_lines_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_quotation_lines_quote_line").on(table.tenantId, table.quotationId, table.lineNo),
    index("ix_quotation_lines_tenant_quote").on(table.tenantId, table.quotationId),
  ],
);

/** Sales orders (§2.2): soft-reservation seam + BR-029 numbering at issue. */
export const salesOrders = pgTable(
  "sales_orders",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by"),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    salesRepId: uuid("sales_rep_id"),
    warehouseId: uuid("warehouse_id").notNull(),
    quotationId: uuid("quotation_id"),
    orderNo: text("order_no"),
    orderDate: date("order_date").notNull(),
    expectedDate: date("expected_date"),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 19, scale: 8 }),
    status: text("status").notNull().default("DRAFT"),
    totalNet: numeric("total_net", { precision: 19, scale: 4 }).notNull().default("0"),
    totalTax: numeric("total_tax", { precision: 19, scale: 4 }).notNull().default("0"),
    totalGross: numeric("total_gross", { precision: 19, scale: 4 }).notNull().default("0"),
    note: text("note"),
    noteAr: text("note_ar"),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    submittedBy: uuid("submitted_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    approvedBy: uuid("approved_by"),
    issuedAt: timestamp("issued_at", { withTimezone: true, mode: "string" }),
    issuedBy: uuid("issued_by"),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "string" }),
    closedBy: uuid("closed_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    uniqueIndex("uq_sales_orders_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_sales_orders_tenant_no").on(table.tenantId, table.orderNo),
    index("ix_sales_orders_tenant_status").on(table.tenantId, table.status, table.orderDate),
    index("ix_sales_orders_tenant_customer").on(table.tenantId, table.customerId, table.orderDate),
  ],
);

export const salesOrderLines = pgTable(
  "sales_order_lines",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull(),
    orderId: uuid("order_id").notNull(),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id").notNull(),
    description: text("description"),
    descriptionAr: text("description_ar"),
    qty: numeric("qty", { precision: 19, scale: 6 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 19, scale: 6 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 19, scale: 4 }).notNull().default("0"),
    taxCodeId: uuid("tax_code_id"),
    netAmount: numeric("net_amount", { precision: 19, scale: 4 }).notNull(),
    taxAmount: numeric("tax_amount", { precision: 19, scale: 4 }).notNull().default("0"),
    reservationId: uuid("reservation_id"),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("uq_sales_order_lines_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_sales_order_lines_order_line").on(table.tenantId, table.orderId, table.lineNo),
    index("ix_sales_order_lines_tenant_order").on(table.tenantId, table.orderId),
  ],
);

/** Delivery notes (§2.3; BR-007 flow A; golden G-03 COGS, no AR). */
export const deliveryNotes = pgTable(
  "delivery_notes",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by"),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    salesRepId: uuid("sales_rep_id"),
    orderId: uuid("order_id"),
    warehouseId: uuid("warehouse_id").notNull(),
    deliveryNo: text("delivery_no"),
    deliveryDate: date("delivery_date").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    status: text("status").notNull().default("DRAFT"),
    totalNet: numeric("total_net", { precision: 19, scale: 4 }).notNull().default("0"),
    totalTax: numeric("total_tax", { precision: 19, scale: 4 }).notNull().default("0"),
    totalGross: numeric("total_gross", { precision: 19, scale: 4 }).notNull().default("0"),
    cogsValue: numeric("cogs_value", { precision: 19, scale: 4 }).notNull().default("0"),
    note: text("note"),
    noteAr: text("note_ar"),
    postingDate: date("posting_date"),
    postedBy: uuid("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "string" }),
    postedJournalId: uuid("posted_journal_id"),
    convertedInvoiceId: uuid("converted_invoice_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    uniqueIndex("uq_delivery_notes_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_delivery_notes_tenant_no").on(table.tenantId, table.deliveryNo),
    index("ix_delivery_notes_tenant_status").on(table.tenantId, table.status, table.deliveryDate),
    index("ix_delivery_notes_tenant_customer").on(
      table.tenantId,
      table.customerId,
      table.deliveryDate,
    ),
  ],
);

export const deliveryNoteLines = pgTable(
  "delivery_note_lines",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull(),
    deliveryId: uuid("delivery_id").notNull(),
    lineNo: integer("line_no").notNull(),
    orderLineId: uuid("order_line_id"),
    itemId: uuid("item_id").notNull(),
    description: text("description"),
    descriptionAr: text("description_ar"),
    qty: numeric("qty", { precision: 19, scale: 6 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 19, scale: 6 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 19, scale: 4 }).notNull().default("0"),
    netAmount: numeric("net_amount", { precision: 19, scale: 4 }).notNull(),
    batchId: uuid("batch_id"),
    serialIds: jsonb("serial_ids"),
    issueUnitCost: numeric("issue_unit_cost", { precision: 19, scale: 6 }),
    issueValue: numeric("issue_value", { precision: 19, scale: 4 }),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("uq_delivery_note_lines_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_delivery_note_lines_delivery_line").on(
      table.tenantId,
      table.deliveryId,
      table.lineNo,
    ),
    index("ix_delivery_note_lines_tenant_delivery").on(table.tenantId, table.deliveryId),
  ],
);

/** Sales invoices (§2.4; goldens G-01/G-02/G-03; W-1). */
export const salesInvoices = pgTable(
  "sales_invoices",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by"),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    salesRepId: uuid("sales_rep_id"),
    kind: text("kind").notNull(),
    invoiceNo: text("invoice_no"),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 19, scale: 8 }),
    orderId: uuid("order_id"),
    deliveryId: uuid("delivery_id"),
    warehouseId: uuid("warehouse_id"),
    cashAccountId: uuid("cash_account_id"),
    status: text("status").notNull().default("DRAFT"),
    totalNet: numeric("total_net", { precision: 19, scale: 4 }).notNull().default("0"),
    totalTax: numeric("total_tax", { precision: 19, scale: 4 }).notNull().default("0"),
    totalGross: numeric("total_gross", { precision: 19, scale: 4 }).notNull().default("0"),
    cogsValue: numeric("cogs_value", { precision: 19, scale: 4 }).notNull().default("0"),
    taxSummary: jsonb("tax_summary"),
    creditCheck: jsonb("credit_check"),
    offlineReceiptNo: text("offline_receipt_no"),
    einvoiceStatus: text("einvoice_status"),
    note: text("note"),
    noteAr: text("note_ar"),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    submittedBy: uuid("submitted_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    approvedBy: uuid("approved_by"),
    postingDate: date("posting_date"),
    postedBy: uuid("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "string" }),
    postedJournalId: uuid("posted_journal_id"),
    postedCogsJournalId: uuid("posted_cogs_journal_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    uniqueIndex("uq_sales_invoices_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_sales_invoices_tenant_no").on(table.tenantId, table.invoiceNo),
    index("ix_sales_invoices_tenant_customer_due").on(
      table.tenantId,
      table.customerId,
      table.dueDate,
    ),
    index("ix_sales_invoices_tenant_status").on(table.tenantId, table.status, table.invoiceDate),
    index("ix_sales_invoices_tenant_order").on(table.tenantId, table.orderId),
    index("ix_sales_invoices_tenant_delivery").on(table.tenantId, table.deliveryId),
  ],
);

export const salesInvoiceLines = pgTable(
  "sales_invoice_lines",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull(),
    invoiceId: uuid("invoice_id").notNull(),
    lineNo: integer("line_no").notNull(),
    itemId: uuid("item_id"),
    accountId: uuid("account_id"),
    deliveryLineId: uuid("delivery_line_id"),
    description: text("description"),
    descriptionAr: text("description_ar"),
    qty: numeric("qty", { precision: 19, scale: 6 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 19, scale: 6 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 19, scale: 4 }).notNull().default("0"),
    taxCodeId: uuid("tax_code_id"),
    netAmount: numeric("net_amount", { precision: 19, scale: 4 }).notNull(),
    taxAmount: numeric("tax_amount", { precision: 19, scale: 4 }).notNull().default("0"),
    taxSnapshot: jsonb("tax_snapshot"),
    batchId: uuid("batch_id"),
    serialIds: jsonb("serial_ids"),
    issueUnitCost: numeric("issue_unit_cost", { precision: 19, scale: 6 }),
    issueValue: numeric("issue_value", { precision: 19, scale: 4 }),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("uq_sales_invoice_lines_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_sales_invoice_lines_invoice_line").on(
      table.tenantId,
      table.invoiceId,
      table.lineNo,
    ),
    index("ix_sales_invoice_lines_tenant_invoice").on(table.tenantId, table.invoiceId),
    index("ix_sales_invoice_lines_tenant_delivery_line").on(
      table.tenantId,
      table.deliveryLineId,
    ),
  ],
);

/** Credit notes (§2.5; BR-004; golden G-04/W-3). */
export const creditNotes = pgTable(
  "credit_notes",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by"),
    tenantId: uuid("tenant_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    salesRepId: uuid("sales_rep_id"),
    invoiceId: uuid("invoice_id").notNull(),
    noteNo: text("note_no"),
    noteDate: date("note_date").notNull(),
    currencyCode: varchar("currency_code", { length: 3 }).notNull(),
    exchangeRate: numeric("exchange_rate", { precision: 19, scale: 8 }),
    status: text("status").notNull().default("DRAFT"),
    totalNet: numeric("total_net", { precision: 19, scale: 4 }).notNull().default("0"),
    totalTax: numeric("total_tax", { precision: 19, scale: 4 }).notNull().default("0"),
    totalGross: numeric("total_gross", { precision: 19, scale: 4 }).notNull().default("0"),
    reentryValue: numeric("reentry_value", { precision: 19, scale: 4 }).notNull().default("0"),
    taxSummary: jsonb("tax_summary"),
    note: text("note"),
    noteAr: text("note_ar"),
    submittedAt: timestamp("submitted_at", { withTimezone: true, mode: "string" }),
    submittedBy: uuid("submitted_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true, mode: "string" }),
    approvedBy: uuid("approved_by"),
    postingDate: date("posting_date"),
    postedBy: uuid("posted_by"),
    postedAt: timestamp("posted_at", { withTimezone: true, mode: "string" }),
    postedJournalId: uuid("posted_journal_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "string" }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    uniqueIndex("uq_credit_notes_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_credit_notes_tenant_no").on(table.tenantId, table.noteNo),
    index("ix_credit_notes_tenant_status").on(table.tenantId, table.status, table.noteDate),
    index("ix_credit_notes_tenant_invoice").on(table.tenantId, table.invoiceId),
  ],
);

export const creditNoteLines = pgTable(
  "credit_note_lines",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
    tenantId: uuid("tenant_id").notNull(),
    noteId: uuid("note_id").notNull(),
    lineNo: integer("line_no").notNull(),
    invoiceLineId: uuid("invoice_line_id").notNull(),
    itemId: uuid("item_id"),
    description: text("description"),
    descriptionAr: text("description_ar"),
    qty: numeric("qty", { precision: 19, scale: 6 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 19, scale: 6 }).notNull().default("0"),
    discountAmount: numeric("discount_amount", { precision: 19, scale: 4 }).notNull().default("0"),
    taxCodeId: uuid("tax_code_id"),
    netAmount: numeric("net_amount", { precision: 19, scale: 4 }).notNull(),
    taxAmount: numeric("tax_amount", { precision: 19, scale: 4 }).notNull().default("0"),
    taxSnapshot: jsonb("tax_snapshot"),
    returnToStock: boolean("return_to_stock").notNull().default(false),
    batchId: uuid("batch_id"),
    serialIds: jsonb("serial_ids"),
    reentryUnitCost: numeric("reentry_unit_cost", { precision: 19, scale: 6 }),
    reentryValue: numeric("reentry_value", { precision: 19, scale: 4 }),
    note: text("note"),
  },
  (table) => [
    uniqueIndex("uq_credit_note_lines_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_credit_note_lines_note_line").on(table.tenantId, table.noteId, table.lineNo),
    index("ix_credit_note_lines_tenant_note").on(table.tenantId, table.noteId),
  ],
);

/** Audited AR re-allocation documents (post-allocation moves, BR-027/§3.3). */
export const salesReallocations = pgTable(
  "sales_reallocations",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    tenantId: uuid("tenant_id").notNull(),
    createdBy: uuid("created_by"),
    docNo: text("doc_no"),
    receiptId: uuid("receipt_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("POSTED"),
    totalAmount: numeric("total_amount", { precision: 19, scale: 4 }).notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_sales_reallocations_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_sales_reallocations_tenant_no").on(table.tenantId, table.docNo),
    index("ix_sales_reallocations_tenant_receipt").on(table.tenantId, table.receiptId),
    index("ix_sales_reallocations_tenant_customer").on(
      table.tenantId,
      table.customerId,
      table.createdAt,
    ),
  ],
);

export const salesReallocationLines = pgTable(
  "sales_reallocation_lines",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    tenantId: uuid("tenant_id").notNull(),
    reallocationId: uuid("reallocation_id").notNull(),
    lineNo: integer("line_no").notNull(),
    fromOpenItemId: uuid("from_open_item_id"),
    toOpenItemId: uuid("to_open_item_id"),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_sales_reallocation_lines_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_sales_reallocation_lines_doc_line").on(
      table.tenantId,
      table.reallocationId,
      table.lineNo,
    ),
    index("ix_sales_reallocation_lines_tenant_doc").on(table.tenantId, table.reallocationId),
  ],
);

// ---------------------------------------------------------------------------
// PHASE-013 · reporting (migration 0020_reporting_core.sql)
//
// The reporting module owns exactly these two tables (ADR-0011;
// MODULE_BOUNDARIES §"reporting"): run orchestration + the print-template
// registry. All business truth stays in the owning modules — reports read
// through module-owned authorized query services only (RISK-016).
// ---------------------------------------------------------------------------

export const reportRuns = pgTable(
  "report_runs",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    tenantId: uuid("tenant_id").notNull(),
    reportKey: text("report_key").notNull(),
    contractVersion: integer("contract_version").notNull(),
    params: jsonb("params").notNull(),
    paramsHash: text("params_hash").notNull(),
    executionClass: text("execution_class").notNull(),
    status: text("status").notNull().default("QUEUED"),
    stage: text("stage"),
    requestedBy: uuid("requested_by"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "string" }),
    durationMs: integer("duration_ms"),
    errorCode: text("error_code"),
    errorDetail: jsonb("error_detail"),
    assertionStatus: text("assertion_status"),
    result: jsonb("result"),
    assertions: jsonb("assertions"),
    artifacts: jsonb("artifacts"),
    correlationId: text("correlation_id"),
  },
  (table) => [
    uniqueIndex("uq_report_runs_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_report_runs_tenant_key_params").on(
      table.tenantId,
      table.reportKey,
      table.paramsHash,
    ),
    index("ix_report_runs_tenant_created").on(table.tenantId, table.createdAt),
    index("ix_report_runs_tenant_requested_by").on(
      table.tenantId,
      table.requestedBy,
      table.createdAt,
    ),
  ],
);

export const printTemplates = pgTable(
  "print_templates",
  {
    id: uuid("id").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    tenantId: uuid("tenant_id").notNull(),
    key: text("key").notNull(),
    version: integer("version").notNull(),
    localeVariants: jsonb("locale_variants").notNull(),
    metadata: jsonb("metadata"),
  },
  (table) => [
    uniqueIndex("uq_print_templates_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_print_templates_tenant_key").on(table.tenantId, table.key),
  ],
);

// ---------------------------------------------------------------------------
// PHASE-014 · subscription billing, usage counters, notifications
// (migration 0021_billing_notifications.sql; SUBSCRIPTION_AND_ENTITLEMENTS
// §6–§10). All tenant-scoped via the macro RLS policy; registered in the
// isolation A-test registry.
// ---------------------------------------------------------------------------

/** Subscription invoices — sandbox checkout AND manual fallback land here identically (A-009). */
export const subscriptionInvoices = pgTable(
  "subscription_invoices",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    number: text("number").notNull(),
    amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
    currencyCode: char("currency_code", { length: 3 }).notNull(),
    status: text("status").notNull().default("OPEN"),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    dueDate: date("due_date").notNull(),
    providerRef: text("provider_ref"),
    paidVia: text("paid_via"),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "string" }),
    createdBy: uuid("created_by"),
    paidBy: uuid("paid_by"),
  },
  (table) => [
    uniqueIndex("uq_subscription_invoices_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_subscription_invoices_tenant_number").on(table.tenantId, table.number),
    index("ix_subscription_invoices_tenant_status").on(table.tenantId, table.status, table.dueDate),
  ],
);

/** Append-only billing event log; provider_event_id unique = webhook replay protection. */
export const billingEvents = pgTable(
  "billing_events",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    eventType: text("event_type").notNull(),
    subscriptionId: uuid("subscription_id"),
    invoiceId: uuid("invoice_id"),
    providerEventId: text("provider_event_id"),
    payload: jsonb("payload").notNull().default({}),
    actorId: uuid("actor_id"),
    viaPlatformAdmin: boolean("via_platform_admin").notNull().default(false),
  },
  (table) => [
    uniqueIndex("uq_billing_events_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_billing_events_provider_event").on(table.tenantId, table.providerEventId),
    index("ix_billing_events_tenant_created").on(table.tenantId, table.createdAt),
    index("ix_billing_events_tenant_subscription").on(table.tenantId, table.subscriptionId, table.createdAt),
  ],
);

/** §6 limit-counter read-model — never gates posting (INV-022). */
export const usageCounters = pgTable(
  "usage_counters",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    counterKey: text("counter_key").notNull(),
    period: date("period").notNull(),
    value: bigint("value", { mode: "number" }).notNull().default(0),
  },
  (table) => [
    uniqueIndex("uq_usage_counters_id_tenant").on(table.id, table.tenantId),
    uniqueIndex("uq_usage_counters_tenant_key_period").on(table.tenantId, table.counterKey, table.period),
    index("ix_usage_counters_tenant_key").on(table.tenantId, table.counterKey, table.period),
  ],
);

/** In-app notification inbox (billing-critical subset, PHASE-014). */
export const notifications = pgTable(
  "notifications",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id"),
    type: text("type").notNull(),
    title: jsonb("title").notNull(),
    body: jsonb("body").notNull(),
    link: text("link"),
    readAt: timestamp("read_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    uniqueIndex("uq_notifications_id_tenant").on(table.id, table.tenantId),
    index("ix_notifications_tenant_created").on(table.tenantId, table.createdAt),
  ],
);

/** Notification channel preferences (tenant-wide row = user_id NULL). */
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    ...standardColumns,
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id"),
    eventType: text("event_type").notNull(),
    inApp: boolean("in_app").notNull().default(true),
    email: boolean("email").notNull().default(false),
  },
  (table) => [uniqueIndex("uq_notification_preferences_id_tenant").on(table.id, table.tenantId)],
);
