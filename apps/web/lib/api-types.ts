/**
 * Wire types shared across the web app (BFF route handlers, server pages,
 * client forms). Mirrors the PHASE-003 identity + PHASE-004 tenancy/platform
 * API envelopes (docs/api/API_CONVENTIONS.md, docs/api/ERROR_MODEL.md):
 *
 *   success: `{ data, meta: { requestId } }`
 *   error:   `{ error: { code, message, details?, traceId? } }`
 *
 * Hand-written on purpose (ADR-0003): the web side adds no schema library —
 * manual narrowing helpers live next to the types they narrow.
 */

export const SESSION_COOKIE = "erp_session";
export const CSRF_COOKIE = "erp_csrf";

/** Methods that must not be CSRF-checked nor carry Idempotency-Key. */
export const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

export interface ApiMeta {
  requestId: string;
}

/**
 * Cursor-pagination meta (API_CONVENTIONS §4). Present on the PHASE-004
 * list endpoints (platform tenants + platform audit events) — surfaced by
 * the fetch wrappers as `ApiResult.meta` for next-page links (P4-T12a).
 */
export interface PaginatedMeta {
  requestId: string;
  count: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
  traceId?: string;
  retryable?: boolean;
}

/** Discriminated view of an envelope: either data (+ optional meta), or status+error. */
export type ApiResult<T> =
  | { ok: true; data: T; meta?: PaginatedMeta }
  | { ok: false; status: number; error: ApiErrorBody; retryAfterSeconds?: number };

// -- identity payloads (API surface §1–16) ---------------------------------

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  locale: string;
}

export interface LoginMembership {
  tenantId: string;
  tenantName: string;
  tenantNameAr: string | null;
  roleKey: string;
  roleName: string;
  roleNameAr: string | null;
  active: boolean;
}

/** POST /identity/sessions → data (token is stripped by the BFF before the browser sees it). */
export interface LoginResult {
  token: string;
  sessionId: string;
  expiresAt: string;
  user: SessionUser;
  memberships: LoginMembership[];
}

export interface CurrentMembership {
  tenantId: string;
  tenantName: string;
  tenantNameAr: string | null;
  roleKey: string;
  membershipStatus: string;
  tenantStatus: string;
}

/** GET /identity/sessions/current → data. */
export interface CurrentSession {
  user: SessionUser;
  activeTenantId: string | null;
  memberships: CurrentMembership[];
  permissions: string[];
}

/** POST /identity/sessions/switch-tenant → data (token stripped by the BFF). */
export interface SwitchTenantResult {
  token: string;
  sessionId: string;
  activeTenantId: string;
}

/** POST /identity/invitations/accept → data (token stripped by the BFF). */
export interface AcceptInvitationResult {
  userId: string;
  token: string;
  sessionId: string;
  expiresAt: string;
}

export interface InvitationView {
  invitationId: string;
  tenantId: string;
  tenantName: string;
  tenantNameAr: string | null;
  tenantStatus: string;
  email: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  roleNameAr: string | null;
  status: string;
  expiresAt: string;
}

/** POST /identity/invitations → data. */
export interface IssuedInvitation {
  invitationId: string;
  expiresAt: string;
  acceptPath: string;
}

export interface TenantUserRow {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string;
  status: string;
  locale: string;
  lastLoginAt: string | null;
  roleId: string;
  roleKey: string;
  roleName: string;
  roleNameAr: string | null;
  membershipStatus: string;
}

export interface RoleRow {
  id: string;
  tenantId: string | null;
  key: string;
  name: string;
  nameAr: string | null;
  isSystem: boolean;
}

/** GET /identity/roles → data. */
export interface RolesData {
  tenantRoles: RoleRow[];
  systemTemplates: RoleRow[];
}

/** GET /identity/sessions/tenant → rows (tokenHash is never rendered). */
export interface TenantSessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  activeTenantId: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  ip: string | null;
  lastSeenAt: string;
}

/** POST /identity/mfa/totp/enroll → data. */
export interface MfaEnrollResult {
  factorId: string;
  secret: string;
  otpauth: string;
}

export interface RevokedResult {
  revoked: boolean;
}

export interface AcceptedResult {
  accepted: boolean;
}

export interface ChangedResult {
  changed: boolean;
}

export interface ConfirmedResult {
  confirmed: boolean;
}

export interface RecoveryCodesResult {
  codes: string[];
}

// -- PHASE-004 tenancy + platform payloads (P4-T12a) ---------------------------

/** GET /platform/register/options → data (public; seeded reference data). */
export interface RegistrationCountry {
  code: string;
  name: string;
  nameAr: string | null;
  currencyCode: string;
  defaultLocale: string;
}

export interface RegistrationCurrency {
  code: string;
  name: string;
  nameAr: string | null;
  minorUnits: number;
}

export interface IndustryTemplateOption {
  key: string;
  name: string;
  nameAr: string | null;
  version: number;
}

export interface RegistrationOptions {
  countries: RegistrationCountry[];
  currencies: RegistrationCurrency[];
  industryTemplates: IndustryTemplateOption[];
}

/** POST /platform/register → data (no session is issued — owner signs in). */
export interface RegisterResult {
  tenantId: string;
  ownerEmail: string;
  trialExpiresAt: string;
  next: string;
}

/** GET /tenancy/profile → data (own-tenant profile row). */
export interface TenantProfile {
  id: string;
  name: string;
  nameAr: string | null;
  status: string;
  baseCurrency: string;
  countryCode: string;
  timezone: string;
  industryTemplateKey: string | null;
  createdAt: string;
}

/** GET /tenancy/settings → effective-config snapshot (registry defaults ∪ stored rows). */
export type TenantSettingsMap = Record<string, unknown>;

/** Branch wire row (GET /tenancy/branches, POST /tenancy/branches). */
export interface BranchRow {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  nameAr: string | null;
  isActive: boolean;
  createdAt: string;
}

/** POST /tenancy/onboarding/provision → data (idempotent provision diff). */
export interface ProvisionDiff {
  tenantId: string;
  roles: { created: string[]; existing: string[] };
  accounts: { created: number; existing: number };
  purposes: { created: number; existing: number };
  settings: { created: string[]; existing: string[] };
}

/** GET /tenancy/entitlements → data (BR-039 derived payload, every member). */
export interface DerivedEntitlements {
  featureKeys: string[];
  sources: Array<{ featureKey: string; source: string; expiresAt: string | null }>;
}

/** Support-session wire row (tenant + platform planes). */
export interface SupportSessionRow {
  id: string;
  tenantId: string;
  platformUserId: string;
  optIn: boolean;
  ticketRef: string | null;
  reason: string;
  openedAt: string;
  expiresAt: string;
  closedAt: string | null;
  closedBy: string | null;
  status: string;
}

/** GET /platform/tenants → rows (cursor-paginated; the UI requests limit=200). */
export interface ConsoleTenantSummary {
  id: string;
  name: string;
  nameAr: string | null;
  status: string;
  countryCode: string;
  baseCurrency: string;
  industryTemplateKey: string | null;
  createdAt: string;
  isPlatformTenant: boolean;
}

export interface ConsoleEntitlement {
  id: string;
  tenantId: string;
  featureKey: string;
  source: string;
  expiresAt: string | null;
}

export interface ConsoleSubscription {
  id: string;
  tenantId: string;
  planId: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  providerRef: string | null;
}

export interface ConsoleMembership {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string;
  roleKey: string;
  membershipStatus: string;
}

/** GET /platform/tenants/:id → data. */
export interface ConsoleTenantDetail extends ConsoleTenantSummary {
  subscription: ConsoleSubscription | null;
  invoices: ConsoleInvoiceRow[];
  plan: { key: string; name: string; nameAr: string } | null;
  entitlements: ConsoleEntitlement[];
  branches: BranchRow[];
  memberships: ConsoleMembership[];
}

/** POST /platform/tenants/:id/plan → data. */
export interface PlanAssignResult {
  planKey: string;
  grantedKeys: number;
}

/** POST /platform/tenants/:id/suspend → data. */
export interface SuspendResult {
  tenantId: string;
  status: string;
  killedSessions: number;
}

/** POST /platform/tenants/:id/restore → data. */
export interface RestoreResult {
  tenantId: string;
  status: string;
}

/** Audit event wire row (GET /platform/audit/events). tenantId is null on platform-scope rows. */
export interface PlatformAuditEvent {
  id: string;
  tenantId: string | null;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  at: string;
  viaPlatformAdmin: boolean;
}

// -- PHASE-006 master-data payloads (P6-T11a; hand-written per ADR-0003) -------

export type PartnerKind = "CUSTOMER" | "SUPPLIER" | "BOTH";

/** GET/POST /partners/partners rows — money values are canonical decimal STRINGS. */
export interface PartnerRow {
  id: string;
  tenantId: string;
  kind: PartnerKind;
  code: string;
  name: string;
  nameAr: string | null;
  taxNumber: string | null;
  creditLimit: string | null;
  creditTermsId: string | null;
  priceListId: string | null;
  status: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreditTermsRow {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  days: number;
  description: string | null;
  isSystem: boolean;
}

export interface PartnerContactRow {
  id: string;
  partnerId: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: string | null;
  isPrimary: boolean;
}

export interface PartnerAddressRow {
  id: string;
  partnerId: string;
  type: "BILLING" | "SHIPPING" | "OTHER";
  line1: string;
  line2: string | null;
  city: string | null;
  countryCode: string | null;
}

/** GET /partners/partners/:id/balance → data. `basis` is DRAFTS_ONLY at this phase. */
export interface PartnerBalanceRow {
  partnerId: string;
  openBalance: string;
  draftBalance: string;
  overdueAmount: string;
}

export type OpeningBalanceKind = "PARTNER" | "ACCOUNT" | "STOCK";

/** Opening-balance DRAFT rows (status is DRAFT-only at PHASE-006 — no posting). */
export interface OpeningBalanceDocRow {
  id: string;
  kind: OpeningBalanceKind;
  partnerId: string | null;
  accountId: string | null;
  itemId: string | null;
  qty: string | null;
  unitCost: string | null;
  amount: string | null;
  currencyCode: string;
  note: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type ItemKind = "STOCK" | "SERVICE" | "COMPOSITE";
export type CostingMethod = "WAC" | "FIFO";

export interface ItemRow {
  id: string;
  sku: string;
  name: string;
  nameAr: string | null;
  kind: ItemKind;
  uomId: string;
  categoryId: string | null;
  taxCodeId: string | null;
  costingMethod: CostingMethod;
  trackBatch: boolean;
  trackSerial: boolean;
  trackImei: boolean;
  hasExpiry: boolean;
  reorderLevel: string | null;
  reorderQty: string | null;
  basePrice: string | null;
  status: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface UomRow {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  isSystem: boolean;
  isActive: boolean;
}

export interface ItemCategoryRow {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  parentId: string | null;
  status: string;
}

export interface BarcodeRow {
  id: string;
  itemId: string;
  uomId: string;
  code: string;
}

export interface PriceListRow {
  id: string;
  name: string;
  nameAr: string | null;
  kind: "SALE" | "PURCHASE";
  currencyCode: string;
  validFrom: string | null;
  validTo: string | null;
  status: string;
}

export interface PriceListItemRow {
  id: string;
  priceListId: string;
  itemId: string;
  uomId: string;
  unitPrice: string;
  minQty: string;
}

export type ImportJobKind = "PARTNERS" | "ITEMS" | "OPENING_BALANCES";
export type ImportJobFormat = "CSV" | "XLSX";
export type ImportJobStatus =
  | "PREVIEWING"
  | "PREVIEW_READY"
  | "COMMITTING"
  | "COMMITTED"
  | "FAILED";

export interface ImportJobRow {
  id: string;
  kind: ImportJobKind;
  format: ImportJobFormat;
  uploadToken: string;
  fileKey: string;
  fileName: string | null;
  status: ImportJobStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  committedRows: number;
  report: unknown;
  error: string | null;
  committedAt: string | null;
  createdBy: string | null;
}

/** POST /items/export-jobs → data (signed download URL + row count). */
export interface ExportJobResult {
  downloadUrl: string;
  expiresInSeconds: number;
  rowCount: number;
  kind: string;
  format: string;
}

/** POST partners|items attachment issuance → data (direct-upload slot). */
export interface AttachmentIssuedUpload {
  attachmentId: string;
  key: string;
  uploadUrl: string;
  expiresInSeconds: number;
}

/** GET attachments list rows (signed download URL is minted per request). */
export interface AttachmentView {
  id: string;
  ownerType: string;
  ownerId: string;
  storageKey: string;
  name: string;
  sizeBytes: number;
  contentType: string;
  createdAt: string;
  downloadUrl: string;
}

// -- PHASE-007: accounting ----------------------------------------------------

/** GET /accounting/accounts → rows (mirrors the CoA store row). */
export interface AccountRow {
  id: string;
  code: string;
  name: string;
  nameAr: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  parentId: string | null;
  isPostable: boolean;
  currencyCode: string | null;
  status: string;
}

/** GET /accounting/purposes → rows (active + superseded mappings). */
export interface PurposeRow {
  id: string;
  purposeKey: string;
  accountId: string;
  accountCode?: string;
  activeFrom: string;
  activeTo: string | null;
}

/** GET /accounting/fiscal-years → rows. */
export interface FiscalYearRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
}

export type FiscalPeriodKind = "REGULAR" | "OPENING" | "CLOSING";
export type FiscalPeriodStatus = "OPEN" | "SOFT_CLOSED" | "LOCKED";

/** GET /accounting/fiscal-years/:id/periods → rows. */
export interface FiscalPeriodRow {
  id: string;
  fiscalYearId: string;
  name: string;
  kind: FiscalPeriodKind;
  startDate: string;
  endDate: string;
  status: FiscalPeriodStatus;
  closedAt: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
}

/** GET /accounting/exchange-rates → rows (base per 1 foreign, §5). */
export interface ExchangeRateRow {
  id: string;
  currencyCode: string;
  rateDate: string;
  rate: string;
  source: "MANUAL" | "IMPORTED";
}

/** GET /accounting/cost-centers → rows. */
export interface CostCenterRow {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  parentId: string | null;
  isActive: boolean;
}

/** GET /accounting/journal-entries → rows (manual-journal documents). */
export interface ManualJournalRow {
  id: string;
  status:
    | "DRAFT"
    | "PENDING_APPROVAL"
    | "APPROVED"
    | "POSTED"
    | "REVERSED"
    | "CANCELLED";
  entryDate: string;
  currencyCode: string;
  exchangeRate: string | null;
  rateSource: string;
  description: string | null;
  descriptionAr: string | null;
  reference: string | null;
  recurrenceId: string | null;
  templateId: string | null;
  postedJournalId: string | null;
  approvalStep: number;
  createdBy: string | null;
  approvedBy: string | null;
  cancelledReason: string | null;
}

/** GET /accounting/recurring-journals → rows. */
export interface RecurringJournalRow {
  id: string;
  name: string;
  template: unknown;
  schedule: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  startDate: string;
  endDate: string | null;
  nextRunDate: string;
  lastRunAt: string | null;
  status: "ACTIVE" | "PAUSED";
}

/** GET /accounting/approval-policies → rows. */
export interface ApprovalPolicyRow {
  id: string;
  docType: string;
  policy: {
    mode: "none" | "single-approver" | "two-step" | "amount-threshold";
    threshold?: string | null;
    allowSelfApproval?: boolean;
  };
  appliesFrom: string;
  isActive: boolean;
}

/** GET /accounting/gl/accounts → rows (trial-balance shape, base currency). */
export interface AccountBalanceRow {
  accountId: string;
  code: string;
  name: string;
  nameAr: string;
  type: string;
  debit: string;
  credit: string;
  balance: string;
}

/** GET /accounting/gl/accounts/:id/movements → data.movements rows. */
export interface GlMovementRow {
  journalEntryId: string;
  entryNo: string | null;
  entryDate: string;
  lineNo: number;
  direction: "DEBIT" | "CREDIT";
  amount: string;
  baseAmount: string;
  memo: string | null;
  partnerId: string | null;
  itemId: string | null;
  costCenterId: string | null;
  balanceAfter?: string;
}

/** GET /accounting/gl/journal-register → rows. */
export interface JournalRegisterRow {
  id: string;
  entryNo: string | null;
  entryDate: string;
  description: string | null;
  sourceType: string;
  status: string;
  currencyCode: string;
  totalDebit: string;
  totalCredit: string;
}

/** GET /accounting/gl/entries/:id → data.entry (append-only ledger row). */
export interface JournalEntryRow {
  id: string;
  entryNo: string | null;
  entryDate: string;
  fiscalPeriodId: string;
  currencyCode: string;
  exchangeRate: string;
  status: string;
  sourceType: string;
  sourceId: string | null;
  operation: string;
  reversalOfId: string | null;
  reversedById: string | null;
  description: string | null;
  descriptionAr: string | null;
  postReason: string | null;
  postedAt: string;
  postedBy: string | null;
}

/** GET /accounting/gl/entries/:id → data.lines rows. */
export interface JournalLineRow {
  id: string;
  journalEntryId: string;
  lineNo: number;
  accountId: string;
  accountCode?: string;
  direction: "DEBIT" | "CREDIT";
  amount: string;
  baseAmount: string;
  partnerId: string | null;
  itemId: string | null;
  costCenterId: string | null;
  taxCodeId: string | null;
  memo: string | null;
  memoAr: string | null;
}

/** GET /accounting/reconciliation/runs → rows. */
export interface ReconciliationRunRow {
  id: string;
  kind: string;
  asOf: string;
  status: "OK" | "BROKEN";
  controlBalance: string;
  subledgerBalance: string;
  diffCount: number;
  diff: unknown;
  runMode: string;
}

/** POST /accounting/periods/:id/checklist → data (close checklist, PERIOD_CLOSING §2). */
export interface CloseChecklistResult {
  period: FiscalPeriodRow;
  items: Array<{
    key: string;
    label: { en: string; ar: string };
    state: "OK" | "BROKEN" | "NOT_RUN" | "NOT_APPLICABLE";
    detail: string | null;
  }>;
  allSatisfied: boolean;
}

// -- PHASE-008: treasury ------------------------------------------------------

/** GET /treasury/cash-accounts → rows. Money values are canonical decimal strings. */
export interface CashAccountRow {
  id: string;
  name: string;
  nameAr: string | null;
  type: "CASH" | "BANK" | "PETTY";
  accountId: string;
  accountCode: string;
  branchId: string | null;
  currencyCode: string;
  status: "ACTIVE" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
  closeReason: string | null;
  balance: string;
  movementCount: number;
}

/** GET /treasury/cash-accounts/:id/movements → rows (append-only ledger). */
export interface CashMovementRow {
  id: string;
  cashAccountId: string;
  direction: "IN" | "OUT";
  amount: string;
  currencyCode: string;
  exchangeRate: string;
  baseAmount: string;
  sourceType: string;
  sourceId: string;
  valueDate: string;
  memo: string | null;
  memoAr: string | null;
}

/** GET /treasury/receipts|payments → rows (money-in / money-out documents). */
export interface TreasuryDocRow {
  id: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "POSTED" | "CANCELLED";
  docNo: string | null;
  cashAccountId: string;
  partnerId: string;
  method: string;
  counterpartyName: string | null;
  currencyCode: string;
  amount: string;
  exchangeRate: string | null;
  valueDate: string;
  reference: string | null;
  description: string | null;
  descriptionAr: string | null;
  allocatedAmount: string;
  fxGainLoss: string;
  postedJournalId: string | null;
  createdAt: string;
}

/** GET/PUT /treasury/receipts|payments/:id/allocations → rows. */
export interface AllocationRow {
  id: string;
  receiptId: string | null;
  paymentId: string | null;
  openItemId: string;
  amount: string;
}

/** GET /treasury/open-items → rows (AR/AP subledger open items). */
export interface OpenItemRow {
  id: string;
  partnerId: string;
  entryDate: string;
  direction: string;
  amount: string;
  baseAmount: string;
  currencyCode: string;
  exchangeRate: string;
  controlAccountId: string;
  sourceType: string;
  sourceId: string | null;
  memo: string | null;
  settledAmount: string;
  outstanding: string;
}

/** GET /treasury/expense-categories → rows. */
export interface ExpenseCategoryRow {
  id: string;
  code: string;
  name: string;
  nameAr: string;
  accountId: string;
  accountCode: string;
  approvalMode: "none" | "single-approver";
  isActive: boolean;
}

/** GET /treasury/expenses → rows. */
export interface ExpenseRow {
  id: string;
  status: string;
  expenseNo: string | null;
  categoryId: string;
  categoryCode: string;
  cashAccountId: string;
  payeeName: string;
  currencyCode: string;
  amount: string;
  exchangeRate: string | null;
  taxCodeId: string | null;
  receiptFileId: string | null;
  valueDate: string;
  description: string | null;
  descriptionAr: string | null;
  postedJournalId: string | null;
  createdBy: string | null;
}

/** GET /treasury/cash-transfers → rows. */
export interface TransferRow {
  id: string;
  status: string;
  transferNo: string | null;
  fromAccountId: string;
  toAccountId: string;
  currencyCode: string;
  amount: string;
  feeAmount: string;
  exchangeRate: string | null;
  valueDate: string;
  reference: string | null;
  description: string | null;
  descriptionAr: string | null;
  postedJournalId: string | null;
}

/** GET /treasury/shifts → rows. */
export interface ShiftRow {
  id: string;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  shiftNo: string | null;
  cashAccountId: string;
  currencyCode: string;
  exchangeRate: string | null;
  openingAmount: string;
  capturedIn: string;
  capturedOut: string;
  expectedAmount: string | null;
  countedAmount: string | null;
  difference: string | null;
  variancePostedJournalId: string | null;
  supervisorId: string | null;
  closeReason: string | null;
  openedAt: string;
  closedAt: string | null;
}

/** GET /treasury/bank-statements → rows. */
export interface StatementRow {
  id: string;
  status: "IMPORTED" | "RECONCILED";
  cashAccountId: string;
  periodStart: string;
  periodEnd: string;
  fileName: string;
  fileHash: string;
  adapterId: string;
  openingBalance: string | null;
  closingBalance: string | null;
  lineCount: number;
  importedAt: string;
  reconciledAt: string | null;
}

/** GET /treasury/bank-statements/:id/lines → rows. */
export interface StatementLineRow {
  id: string;
  bankStatementId: string;
  lineNo: number;
  lineDate: string;
  amount: string;
  reference: string | null;
  description: string | null;
  matchedMovementId: string | null;
  matchedAt: string | null;
  matchMode: string | null;
  ageDays: number | null;
}

/** POST /treasury/receipts|payments/:id/post → data (settlement result). */
export interface SettlementPostResult {
  docNo: string;
  journalEntryId: string;
  journalEntryNo: string | null;
  idempotentReplay: boolean;
  allocatedAmount: string;
  fxGainLoss: string;
}

/** GET /treasury/import-adapters → rows (statement import adapters). */
export interface ImportAdapterRow {
  id: string;
  label: { en: string; ar: string };
  extensions: string[];
}

/** GET /treasury/allocations/suggest → rows (FIFO suggestion). */
export interface AllocationSuggestionRow {
  openItemId: string;
  amount: string;
  entryDate: string;
  memo: string | null;
}

/** GET /treasury/unmatched-aging → data (BR-022 aging snapshot). */
export interface UnmatchedAgingData {
  unmatchedLines: StatementLineRow[];
  unmatchedMovements: CashMovementRow[];
}

/** POST /treasury/bank-statements/import → data. */
export interface StatementImportResult {
  statement: StatementRow;
  idempotentReplay: boolean;
}

/** Cash-movement rows on the aging panel carry ageDays (store shape + aging). */
export type AgedCashMovementRow = CashMovementRow & { ageDays?: number | null };

/** POST /treasury/reconciliation/cash-check → data (reconciliation run). */
export interface TreasuryCashCheckResult {
  id: string;
  kind: string;
  status: "OK" | "BROKEN";
  controlBalance: string;
  subledgerBalance: string;
  diffCount: number;
  diff: unknown;
}

// -- T15-UI: PHASE-009 tax engine ------------------------------------------------

/** GET /tax/tax-codes → rows (usageCount = live reference count). */
export interface TaxCodeRow {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  countryCode: string;
  defaultTreatment: string;
  snapshotPolicy: string;
  status: "ACTIVE" | "ARCHIVED";
  usageCount: number;
}

/** GET /tax/tax-registrations → rows (one per jurisdiction, upserted). */
export interface TaxRegistrationRow {
  id: string;
  countryCode: string;
  status: "REGISTERED" | "NOT_REGISTERED" | "DEREGISTERED";
  registrationNumber: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  deregisteredAt: string | null;
  note: string | null;
}

/** Rate-window rows nested in each jurisdiction pack. */
export interface JurisdictionRateRow {
  id: string;
  treatment: string;
  rate: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceRef: string;
  verifiedAt: string | null;
}

/** GET /tax/packs → rows (the seeded jurisdiction registry with rate windows). */
export interface JurisdictionPackRow {
  id: string;
  countryCode: string;
  countryName: string;
  countryNameAr: string;
  currencyCode: string;
  minorUnits: number;
  vatStatus: "VAT_IN_FORCE" | "VAT_PLANNED" | "NO_VAT";
  packVersion: string;
  descriptor: Record<string, unknown>;
  verificationStatus: "REQUIRES_VERIFICATION" | "VERIFIED";
  sourceRef: string;
  verifiedAt: string | null;
  rates: readonly JurisdictionRateRow[];
}

/** GET /tax/packs/:country/versions → data (seeded version + tenant binding). */
export interface PackVersionsRow {
  countryCode: string;
  packVersion: string;
  verificationStatus: "REQUIRES_VERIFICATION" | "VERIFIED";
  tenantBinding: {
    id: string;
    countryCode: string;
    packVersion: string;
    appliedAt: string;
    appliedBy: string | null;
  } | null;
  windows: Array<{
    treatment: string;
    rate: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    sourceRef: string;
    verifiedAt: string | null;
  }>;
}

/** GET /tax/vat-returns → rows (summary/crossCheck are the prepared JSON). */
export interface VatReturnRow {
  id: string;
  countryCode: string;
  periodStart: string;
  periodEnd: string;
  status: "DRAFT" | "READY" | "FILED";
  summary: Record<string, unknown>;
  crossCheck: Record<string, unknown>;
  crossCheckOk: boolean;
  preparedAt: string | null;
  preparedBy: string | null;
  filedAt: string | null;
  filedBy: string | null;
  filingReference: string | null;
  filingNote: string | null;
}

/** POST /tax/resolve-lines → per-line resolution rows (snapshot pinned). */
export interface ResolvedTaxLineRow {
  taxCodeId: string;
  code: string;
  treatment: string;
  rate: string;
  taxBase: string;
  taxAmount: string;
  gross: string;
  snapshot: Record<string, unknown>;
  notSubject: boolean;
}

/** POST /tax/resolve-lines → data (deterministic, side-effect-free). */
export interface ResolveLinesResultRow {
  lines: readonly ResolvedTaxLineRow[];
  notSubject: boolean;
  boundaryWarning: {
    countryCode: string;
    treatment: string;
    effectiveFrom: string;
    rate: string;
  } | null;
  pricingMode: "EXCLUSIVE" | "INCLUSIVE";
}

/** POST /tax/vat-returns/:id/export → data (signed download URL). */
export interface VatReturnExportResult {
  downloadUrl: string;
  rowCount: number;
  format: "CSV" | "XLSX";
  expiresInSeconds: number;
}

// -- T14-UI (PHASE-010): inventory & warehousing --------------------------------
// Row shapes mirror apps/api/src/modules/inventory/infrastructure/inventory.store.ts
// (camelCase wire fields, canonical decimal strings per ADR-0009). The store's
// TransferRow/TransferLineRow/AdjustmentRow are renamed Stock* here to avoid
// colliding with the PHASE-008 treasury TransferRow above.

/** GET /inventory/warehouses → rows. */
export interface WarehouseRow {
  id: string;
  branchId: string;
  branchCode: string | null;
  branchName: string | null;
  code: string;
  name: string;
  nameAr: string | null;
  inventoryAccountId: string | null;
  inventoryAccountCode: string | null;
  isActive: boolean;
  note: string | null;
}

/** GET /inventory/stock → rows (the transactionally-maintained item_stock read model). */
export interface StockOnHandRow {
  itemId: string;
  sku: string;
  itemName: string;
  itemNameAr: string | null;
  warehouseId: string;
  warehouseCode: string;
  qty: string;
  avgCost: string;
  negative: boolean;
}

/** GET /inventory/moves → rows (the append-only stock_moves ledger; movedAt is a date). */
export interface StockMoveRow {
  id: string;
  itemId: string;
  sku: string;
  itemName: string;
  warehouseId: string;
  warehouseCode: string;
  direction: "IN" | "OUT";
  moveKind: string;
  qty: string;
  unitCost: string;
  valueAmount: string;
  batchId: string | null;
  batchNo: string | null;
  serialId: string | null;
  serialNo: string | null;
  sourceType: string;
  sourceId: string;
  movedAt: string;
  reason: string | null;
  memo: string | null;
  memoAr: string | null;
  postedJournalId: string | null;
  createdAt: string;
}

/** GET /inventory/transfers → rows (stock_transfers; two-leg G-15 documents). */
export interface StockTransferRow {
  id: string;
  transferNo: string | null;
  fromWarehouseId: string;
  fromWarehouseCode: string;
  toWarehouseId: string;
  toWarehouseCode: string;
  status: "DRAFT" | "IN_TRANSIT" | "POSTED" | "CANCELLED";
  dispatchDate: string | null;
  receiveDate: string | null;
  postedJournalId: string | null;
  note: string | null;
  noteAr: string | null;
  lineCount: number;
}

/** GET /inventory/transfers/:id/lines → rows. */
export interface StockTransferLineRow {
  id: string;
  lineNo: number;
  itemId: string;
  sku: string;
  itemName: string;
  qty: string;
}

/** GET /inventory/adjustments → rows (DRAFT → POSTED/CANCELLED; G-13/G-14). */
export interface StockAdjustmentRow {
  id: string;
  adjustmentNo: string | null;
  warehouseId: string;
  warehouseCode: string;
  itemId: string;
  sku: string;
  itemName: string;
  reason: string;
  deltaQty: string;
  unitCost: string | null;
  counterAccountId: string | null;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  postingDate: string | null;
  postedJournalId: string | null;
  note: string | null;
  noteAr: string | null;
}

/** GET /inventory/batches → rows (batch registry; BR-017 FEFO). */
export interface BatchRow {
  id: string;
  itemId: string;
  sku: string;
  batchNo: string;
  expiryDate: string | null;
  sourceRef: string | null;
  status: string;
}

/** GET /inventory/serials → rows (BR-018 unit tracking). */
export interface SerialRow {
  id: string;
  itemId: string;
  sku: string;
  serialNo: string;
  imei: string | null;
  status: "in_stock" | "sold" | "returned";
  currentOwner: string | null;
  soldAt: string | null;
  returnedAt: string | null;
}

/** GET /inventory/reservations → rows (§2.13 hold seam). */
export interface ReservationRow {
  id: string;
  itemId: string;
  warehouseId: string;
  qty: string;
  status: string;
  holderType: string;
  holderId: string | null;
  expiresAt: string | null;
  note: string | null;
  createdAt: string;
}

/** GET /inventory/counts → rows (DRAFT → COUNTED → VARIANCE_REVIEW → POSTED). */
export interface CountRow {
  id: string;
  countNo: string | null;
  warehouseId: string;
  warehouseCode: string;
  status: "DRAFT" | "COUNTED" | "VARIANCE_REVIEW" | "POSTED" | "CANCELLED";
  blind: boolean;
  snapshotAt: string;
  countedBy: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  supervisorOverride: boolean;
  postingDate: string | null;
  postedJournalId: string | null;
  variance: CountVariance | null;
  note: string | null;
  noteAr: string | null;
  lineCount: number;
}

/** Session-level variance summary (JSONB on stock_counts). */
export interface CountVariance {
  lossLines: number;
  gainLines: number;
  lossValue: string;
  gainValue: string;
}

/** GET /inventory/counts/:id/lines → rows (frozen snapshot + counted reality). */
export interface CountLineRow {
  id: string;
  lineNo: number;
  itemId: string;
  sku: string;
  itemName: string;
  batchId: string | null;
  batchNo: string | null;
  systemQty: string;
  countedQty: string | null;
  recounted: boolean;
  recountNote: string | null;
  valueImpact: string | null;
}

/** GET /inventory/availability → data (BR-016 netting view of one item-warehouse pair). */
export interface StockAvailabilityRow {
  itemId: string;
  warehouseId: string;
  onHandQty: string;
  avgCost: string;
  reservedQty: string;
  inTransitQty: string;
  availableQty: string;
}

// -- envelope narrowing ------------------------------------------------------

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isSuccessEnvelope(value: unknown): value is { data: unknown } {
  return isRecord(value) && "data" in value;
}

export function isErrorEnvelope(value: unknown): value is { error: ApiErrorBody } {
  if (!isRecord(value) || !("error" in value)) {
    return false;
  }
  const error = value.error;
  return isRecord(error) && typeof error.code === "string" && typeof error.message === "string";
}

/** Best-effort error body from an arbitrary upstream JSON value. */
export function errorBodyOf(value: unknown): ApiErrorBody {
  if (isErrorEnvelope(value)) {
    return value.error;
  }
  return { code: "INTERNAL", message: "unexpected upstream response" };
}

/** Narrows an envelope's `meta` into a PaginatedMeta when present (P4-T12a). */
export function paginatedMetaOf(value: unknown): PaginatedMeta | undefined {
  if (!isRecord(value) || !("meta" in value) || !isRecord(value.meta)) {
    return undefined;
  }
  const meta = value.meta;
  const requestId = typeof meta.requestId === "string" ? meta.requestId : "";
  const count = typeof meta.count === "number" ? meta.count : 0;
  const hasMore = typeof meta.hasMore === "boolean" ? meta.hasMore : false;
  if (typeof meta.nextCursor === "string" && meta.nextCursor !== "") {
    return { requestId, count, hasMore, nextCursor: meta.nextCursor };
  }
  return { requestId, count, hasMore };
}

/** A success payload that carries a bearer token (login/switch/accept). */
export function hasToken(value: unknown): value is { token: string } & Record<string, unknown> {
  return isRecord(value) && typeof value.token === "string" && value.token !== "";
}

export function parseJsonOrUndefined(text: string): unknown {
  if (text === "") {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** `details.retryAfterSeconds` (account-lockout / rate-limit payloads). */
export function retrySecondsFrom(details: unknown): number | undefined {
  if (isRecord(details) && typeof details.retryAfterSeconds === "number") {
    return details.retryAfterSeconds;
  }
  return undefined;
}

export function retrySecondsFromHeader(header: string | null): number | undefined {
  if (header === null) {
    return undefined;
  }
  const seconds = Number.parseInt(header, 10);
  return Number.isNaN(seconds) ? undefined : seconds;
}

// ---------------------------------------------------------------------------
// PHASE-011 purchasing rows (GET /purchasing/** → module documents + AP views).

/** Purchase requests (approval routing → PO). */
export interface PurchaseRequestRow {
  id: string;
  branchId: string;
  requestNo: string | null;
  neededBy: string | null;
  status: string;
  note: string | null;
  noteAr: string | null;
  createdBy: string | null;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  convertedOrderId: string | null;
  cancelReason: string | null;
}

/** Purchase orders (DRAFT → ISSUED → CLOSED; linked revisions). */
export interface PurchaseOrderRow {
  id: string;
  branchId: string;
  supplierId: string;
  orderNo: string | null;
  orderDate: string;
  expectedDate: string | null;
  currencyCode: string;
  revisionOfId: string | null;
  revisionNo: number;
  status: string;
  totalNet: string;
  totalTax: string;
  totalGross: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  issuedAt: string | null;
}

/** Goods receipts (G-07: stock + GRNI accrual). */
export interface GoodsReceiptRow {
  id: string;
  branchId: string;
  supplierId: string;
  poId: string | null;
  warehouseId: string;
  receiptNo: string | null;
  receiptDate: string;
  status: string;
  poLessReason: string | null;
  totalValue: string;
  note: string | null;
  createdAt: string;
  postedJournalId: string | null;
}

/** Supplier invoices (G-08; match outcome recorded pre-approval). */
export interface SupplierInvoiceRow {
  id: string;
  branchId: string;
  supplierId: string;
  invoiceNo: string;
  internalNo: string | null;
  invoiceDate: string;
  dueDate: string;
  currencyCode: string;
  poId: string | null;
  status: string;
  matchStatus: string;
  totalNet: string;
  totalTax: string;
  totalGross: string;
  duplicateWarning: { kind: string; existingId: string; existingAmount: string } | null;
  note: string | null;
  createdAt: string;
  postedJournalId: string | null;
}

/** Debit notes (G-09 AP corrections). */
export interface DebitNoteRow {
  id: string;
  branchId: string;
  supplierId: string;
  refInvoiceId: string;
  noteNo: string | null;
  noteDate: string;
  currencyCode: string;
  status: string;
  totalNet: string;
  totalTax: string;
  totalGross: string;
  note: string | null;
  createdAt: string;
  postedJournalId: string | null;
}

/** AP aging row (deterministic as-of recomputation). */
export interface ApAgingRow {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  supplierNameAr: string | null;
  currencyCode: string;
  notDue: string;
  b1_30: string;
  b31_60: string;
  b61_90: string;
  b90Plus: string;
  total: string;
  baseTotal: string;
  itemCount: number;
}

/** Supplier statement (running balance + aging column). */
export interface SupplierStatementRow {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  supplierNameAr: string | null;
  asOf: string;
  currencyCode: string;
  closingBalance: string;
  closingBalanceBase: string;
  entries: readonly {
    entryDate: string;
    docRef: string | null;
    sourceType: string;
    memo: string | null;
    currencyCode: string;
    debit: string;
    credit: string;
    balance: string;
    baseBalance: string;
    outstanding: string;
  }[];
  aging: {
    not_due: string;
    "1_30": string;
    "31_60": string;
    "61_90": string;
    "90_plus": string;
  };
}

/** GRNI register row (received − invoiced per GRN line). */
export interface GrniRegisterRow {
  grnId: string;
  receiptNo: string | null;
  receiptDate: string;
  supplierId: string;
  grnLineId: string;
  itemId: string;
  receivedQty: string;
  receivedValue: string;
  invoicedQty: string;
  invoicedValue: string;
}

/** Three-way match result (preview + recorded). */
export interface MatchResultRow {
  matchedAt: string;
  tolerances: { qtyPct: string; pricePct: string };
  lines: readonly {
    invoiceLineNo: number;
    grnLineId: string | null;
    poQty: string | null;
    poUnitPrice: string | null;
    grnQty: string | null;
    grnUnitCost: string | null;
    invoiceQty: string;
    invoiceUnitPrice: string;
    qtyVariancePct: string | null;
    priceVariancePct: string | null;
    outcome: string;
    disposition: { type: string; reason: string } | null;
  }[];
  summary: { outcome: string; exceptions: number; undisposed: number };
}

/** Landed-cost row (the PHASE-011 baseline). */
export interface LandedCostRow {
  id: string;
  grnId: string;
  costNo: string | null;
  costType: string;
  vendorId: string | null;
  amount: string;
  allocationMethod: string;
  chargeAccountId: string;
  status: string;
  allocatedToStock: string;
  allocatedToCogs: string;
  note: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// PHASE-012 sales rows (GET /sales/** → module documents + AR views).

/** Sales representatives (attribution on sales documents; T12). */
export interface SalesRepRow {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  note: string | null;
  noteAr: string | null;
}

/** Quotations (DRAFT → SENT → ACCEPTED/REJECTED/EXPIRED; BR-006, no ledger). */
export interface QuotationRow {
  id: string;
  branchId: string;
  customerId: string;
  salesRepId: string | null;
  quoteNo: string | null;
  quoteDate: string;
  validUntil: string;
  currencyCode: string;
  exchangeRate: string | null;
  status: string;
  totalNet: string;
  totalTax: string;
  totalGross: string;
  note: string | null;
  noteAr: string | null;
  createdBy: string | null;
  convertedOrderId: string | null;
}

/** Sales orders (DRAFT → PENDING_APPROVAL → APPROVED → ISSUED → CLOSED). */
export interface SalesOrderRow {
  id: string;
  branchId: string;
  customerId: string;
  salesRepId: string | null;
  warehouseId: string;
  quotationId: string | null;
  orderNo: string | null;
  orderDate: string;
  expectedDate: string | null;
  currencyCode: string;
  exchangeRate: string | null;
  status: string;
  totalNet: string;
  totalTax: string;
  totalGross: string;
  note: string | null;
  noteAr: string | null;
  createdBy: string | null;
}

/** Delivery notes (DRAFT → POSTED; G-03 COGS without AR). */
export interface DeliveryNoteRow {
  id: string;
  branchId: string;
  customerId: string;
  salesRepId: string | null;
  orderId: string | null;
  warehouseId: string;
  deliveryNo: string | null;
  deliveryDate: string;
  currencyCode: string;
  status: string;
  totalNet: string;
  totalTax: string;
  totalGross: string;
  cogsValue: string;
  note: string | null;
  noteAr: string | null;
  createdBy: string | null;
  postedJournalId: string | null;
  convertedInvoiceId: string | null;
}

/**
 * Sales invoices (CASH/CREDIT; G-01/G-02). `creditCheck` is the BR-001
 * decision recorded on the document at approval (ALLOW/WARN/BLOCK + math).
 */
export interface SalesInvoiceRow {
  id: string;
  branchId: string;
  customerId: string;
  salesRepId: string | null;
  kind: string;
  invoiceNo: string | null;
  invoiceDate: string;
  dueDate: string;
  currencyCode: string;
  exchangeRate: string | null;
  orderId: string | null;
  deliveryId: string | null;
  warehouseId: string | null;
  cashAccountId: string | null;
  status: string;
  totalNet: string;
  totalTax: string;
  totalGross: string;
  cogsValue: string;
  taxSummary: Record<string, unknown> | null;
  creditCheck: { decision?: string; math?: string } | null;
  note: string | null;
  noteAr: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  postedJournalId: string | null;
  postedCogsJournalId: string | null;
}

/** Credit notes (BR-004 returns/corrections; G-04 + W-3 re-entry). */
export interface CreditNoteRow {
  id: string;
  branchId: string;
  customerId: string;
  salesRepId: string | null;
  invoiceId: string;
  noteNo: string | null;
  noteDate: string;
  currencyCode: string;
  exchangeRate: string | null;
  status: string;
  totalNet: string;
  totalTax: string;
  totalGross: string;
  reentryValue: string;
  taxSummary: Record<string, unknown> | null;
  note: string | null;
  noteAr: string | null;
  createdBy: string | null;
  postedJournalId: string | null;
}

/** AR aging row (RC-10 deterministic as-of; bucketed per customer). */
export interface ArAgingRow {
  customerId: string;
  customerCode: string;
  customerName: string;
  customerNameAr: string | null;
  currencyCode: string;
  notDue: string;
  b1_30: string;
  b31_60: string;
  b61_90: string;
  b90Plus: string;
  total: string;
  baseTotal: string;
  itemCount: number;
}

/** AR statement entry (running balance over the AR subledger). */
export interface ArStatementEntry {
  entryDate: string;
  docRef: string | null;
  sourceType: string;
  memo: string | null;
  currencyCode: string;
  debit: string;
  credit: string;
  balance: string;
  baseBalance: string;
  outstanding: string;
}

/** Customer statement (BR-028) with the INV-009 subledger tie footer. */
export interface ArStatement {
  customerId: string;
  customerCode: string;
  customerName: string;
  customerNameAr: string | null;
  asOf: string;
  currencyCode: string;
  openingBalance: string;
  entries: readonly ArStatementEntry[];
  closingBalance: string;
  closingBalanceBase: string;
  aging: {
    not_due: string;
    "1_30": string;
    "31_60": string;
    "61_90": string;
    "90_plus": string;
  };
  subledgerTie: { ok: boolean; statementBalance: string; subledgerBalance: string };
}

/** Open AR item (the receipts allocation surface; INV-016). */
export interface ArOpenItemRow {
  id: string;
  partnerId: string;
  entryDate: string;
  direction: "DEBIT" | "CREDIT";
  amount: string;
  baseAmount: string;
  currencyCode: string;
  exchangeRate: string;
  sourceType: string;
  sourceId: string | null;
  memo: string | null;
  settledAmount: string;
  outstanding: string;
  dueDate: string | null;
}

/** POST /sales/jobs/invoice-overdue/run-scan → data (§2.9 job result). */
export interface OverdueScanResult {
  overdue: number;
  alerted: number;
  recipient: string | null;
}

// ---------------------------------------------------------------------------
// PHASE-013 reporting wire types (GET/POST /reporting/** — the report
// workspace surface; mirrors the module's contract.ts shapes).

/** Registry snapshot row (GET /reporting/reports → data; §2 navigation). */
export interface ReportRegistryItem {
  id: string;
  title: { ar: string; en: string };
  category: string;
  requiredPermission: string;
  version: number;
  executionClass: "inline" | "job";
  exportFormats: string[];
  semantics: "as-of" | "current";
}

/** Bilingual label pair as carried inside result envelopes. */
export interface ReportBilingual {
  ar: string;
  en: string;
}

/** Result column (REPORT_CONTRACT §2). */
export interface ReportResultColumn {
  id: string;
  label: ReportBilingual;
  type: "text" | "money" | "qty" | "date" | "status" | "link";
  numeric?: boolean;
}

/** Result group (section header between rows). */
export interface ReportResultGroup {
  key: string;
  label: ReportBilingual;
}

/** Drill-down hop generated per row (route is locale-substituted). */
export interface ReportDrillLink {
  label: ReportBilingual;
  route: string;
}

/** Result row (values keyed by column id). */
export interface ReportResultRow {
  key: string;
  values: Record<string, string | number | null>;
  groupKey?: string;
  drillLinks?: readonly ReportDrillLink[];
}

/** Totals row (kind 'check' = the locked balance-check glyph). */
export interface ReportResultTotal {
  id: string;
  label: ReportBilingual;
  amount: string;
  kind: "sum" | "check";
}

/** Executable reconciliation assertion result (§1). */
export interface ReportAssertion {
  id: string;
  status: "PASS" | "FAIL";
  detail?: ReportBilingual;
  compared?: { left: string; right: string };
}

/** The stored result envelope (GET /reporting/report-runs/:id/result → data). */
export interface ReportResultEnvelope {
  reportId: string;
  contractVersion: number;
  runId: string;
  paramsEcho: Record<string, unknown>;
  columns: readonly ReportResultColumn[];
  groups: readonly ReportResultGroup[];
  rows: readonly ReportResultRow[];
  totals: readonly ReportResultTotal[];
  assertions: readonly ReportAssertion[];
  freshness: {
    computedAt: string;
    asOf?: string | null;
    cacheState: "fresh" | "stale" | "recomputed";
  };
  formatting: {
    baseCurrency: string;
    numerals: "western";
    locale: "ar" | "en";
  };
  notes?: readonly ReportBilingual[];
}

/** POST /reporting/report-runs → data (inline envelope or a queued job). */
export interface ReportRunOutcome {
  runId: string;
  /** Present for completed inline runs (and cached job results). */
  result?: ReportResultEnvelope;
  /** Present when the run was enqueued (job path) — the client polls. */
  queued?: boolean;
  status: "SUCCEEDED" | "QUEUED" | "FAILED";
}

/** Run history row (GET /reporting/report-runs?limit → data). */
export interface ReportRunSummary {
  runId: string;
  reportKey: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  stage: string | null;
  assertionStatus: "PASS" | "FAIL" | null;
  executionClass: "inline" | "job";
  durationMs: number | null;
  createdAt: string;
}

/** Run status row (GET /reporting/report-runs/:id → data; polling). */
export interface ReportRunStatus {
  runId: string;
  reportKey: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  stage: string | null;
  assertionStatus: "PASS" | "FAIL" | null;
  errorCode: string | null;
  durationMs: number | null;
}

/** POST /reporting/report-runs/:id/exports → data (signed download URL). */
export interface ReportExportResult {
  url: string;
  expiresInSeconds: number;
  sha256: string;
  bytes: number;
}

/** GET /reporting/print-preview/:id → data (null when no stored result). */
export interface ReportPrintPreview {
  html: string;
  footerTemplate: string;
}

// -- PHASE-014: subscription, billing, usage, notifications, public plans ----

/** GET /public/plans → data.plans[] (marketing pricing — config-driven only). */
export interface PublicPlan {
  key: string;
  name: string;
  nameAr: string;
  priceAmount: string;
  currencyCode: string;
  billingPeriod: string;
  limits: Record<string, unknown>;
  featureKeys: string[];
  isActive: boolean;
}

export interface PublicPlansResponse {
  plans: PublicPlan[];
}

/** GET /tenancy/subscription → data. */
export interface TenantSubscriptionRow {
  id: string;
  tenantId: string;
  planId: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  providerRef: string | null;
  trialEndsAt: string | null;
  graceEndsAt: string | null;
  dunningStep: number;
}

export interface TenantPlanView {
  key: string;
  name: string;
  nameAr: string;
  limits: Record<string, unknown>;
  billingPeriod: string;
}

export interface UsageEntry {
  counterKey: string;
  limit: number | null;
  current: number;
  percent: number | null;
  warn80: boolean;
  warn100: boolean;
  hardBlock: boolean;
}

export interface UsageSnapshot {
  period: string;
  entries: UsageEntry[];
}

export interface SubscriptionView {
  subscription: TenantSubscriptionRow | null;
  plan: TenantPlanView | null;
  readOnly: boolean;
  usage: UsageSnapshot;
}

export interface BillingInvoiceRow {
  id: string;
  number: string;
  amount: string;
  currencyCode: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  providerRef: string | null;
  paidVia: string | null;
  paidAt: string | null;
}

export interface BillingEventRow {
  id: string;
  eventType: string;
  invoiceId: string | null;
  providerEventId: string | null;
  payload: Record<string, unknown>;
  viaPlatformAdmin: boolean;
  createdAt: string;
}

export interface BillingHistory {
  invoices: BillingInvoiceRow[];
  events: BillingEventRow[];
}

/** POST /tenancy/subscriptions/checkout → data. */
export interface CheckoutSessionResult {
  sessionId: string;
  providerRef: string;
  checkoutUrl: string;
  planKey: string;
  amount: string;
  currencyCode: string;
}

/** Notification inbox row (GET /notifications → data[]). */
export interface NotificationRow {
  id: string;
  userId: string | null;
  type: string;
  title: { ar: string; en: string };
  body: { ar: string; en: string };
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface UnreadCount {
  count: number;
}

export interface NotificationPreferenceRow {
  id: string;
  userId: string | null;
  eventType: string;
  inApp: boolean;
  email: boolean;
}

/** Platform console tenant detail gains open invoices (manual-payment UI). */
export interface ConsoleInvoiceRow {
  id: string;
  number: string;
  amount: string;
  currencyCode: string;
  status: string;
  dueDate: string;
  paidVia: string | null;
  paidAt: string | null;
}

/** PHASE-015 — industry template registry + applied state (configuration module). */
export interface IndustryTemplateRow {
  key: string;
  name: string;
  nameAr: string | null;
  version: string;
  isActive: boolean;
}

export interface IndustryTemplatesResponse {
  templates: IndustryTemplateRow[];
}

export interface AppliedTemplateView {
  applied: {
    key: string;
    version: string;
    terminologyKeys: string[];
    navigationGroups: string[];
    reportPins: string[];
    onboardingSteps: number;
  } | null;
}

export interface TemplatePreviewView {
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

export interface TemplateApplyView {
  applied: boolean;
  alreadyApplied: boolean;
  templateKey: string;
  version: string;
  manifestHash: string;
}
