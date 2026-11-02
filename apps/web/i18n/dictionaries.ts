/**
 * Typed AR/EN dictionaries (PHASE-003 identity/sessions/admin screens + the
 * PHASE-004 tenancy/platform screens, task P4-T12a). 100% key parity between
 * locales is enforced twice:
 *
 *   1. Statically — both literals are assigned to `Record<Locale, Dictionary>`
 *      so TypeScript rejects a missing or extra key on either side.
 *   2. At runtime — `assertDictionaryParity()` below executes at module load
 *      (every layout render imports this module), satisfying the "parity
 *      check script green" acceptance without a separate test runner.
 *
 * Arabic is the default locale (Arabic-first, docs/ui/RTL_DESIGN_RULES.md).
 */
export const locales = ["ar", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ar";

export interface Dictionary {
  appTitle: string;
  switchLabel: string;
  signOut: string;
  loading: string;
  phaseNote: string;

  navHome: string;
  navUsers: string;
  navSessions: string;
  navMfa: string;
  navRoles: string;
  navPassword: string;

  loginTitle: string;
  loginSubtitle: string;
  loginEmailLabel: string;
  loginPasswordLabel: string;
  loginMfaLabel: string;
  loginMfaHint: string;
  loginMfaShow: string;
  loginMfaHide: string;
  loginSubmit: string;
  loginForgotLink: string;
  loginErrorInvalidCredentials: string;
  loginErrorMfaRequired: string;
  loginErrorRateLimited: string;
  loginErrorAccountLocked: string;
  loginErrorGeneric: string;

  forgotTitle: string;
  forgotDescription: string;
  forgotEmailLabel: string;
  forgotSubmit: string;
  forgotSuccess: string;
  forgotBack: string;

  acceptTitle: string;
  acceptTenantLabel: string;
  acceptRoleLabel: string;
  acceptEmailLabel: string;
  acceptFullNameLabel: string;
  acceptPasswordLabel: string;
  acceptPasswordHint: string;
  acceptSubmit: string;
  acceptErrorExpired: string;
  acceptErrorRevoked: string;
  acceptErrorAccepted: string;
  acceptErrorNotFound: string;
  acceptErrorGeneric: string;

  homeWelcome: string;
  homeTenantLabel: string;
  homeSwitchTenant: string;
  homeRoleLabel: string;
  homePermissionsLabel: string;
  homeScreens: string;

  usersTitle: string;
  usersNoPermission: string;
  usersColEmail: string;
  usersColName: string;
  usersColRole: string;
  usersColStatus: string;
  usersColLastLogin: string;
  usersNever: string;
  usersEmpty: string;
  usersInviteTitle: string;
  usersInviteEmailLabel: string;
  usersInviteRoleLabel: string;
  usersInviteSubmit: string;
  usersInviteLinkTitle: string;
  usersInviteExpiresLabel: string;
  usersInvitationsTitle: string;
  usersColExpires: string;
  usersColActions: string;
  usersRevoke: string;
  usersNoRoles: string;
  usersEmptyInvitations: string;

  statusActive: string;
  statusPending: string;
  statusRevoked: string;
  statusExpired: string;
  statusAccepted: string;
  statusSuspended: string;

  sessionsTitle: string;
  sessionsHint: string;
  sessionsColUser: string;
  sessionsColCreated: string;
  sessionsColExpires: string;
  sessionsColLastSeen: string;
  sessionsColIp: string;
  sessionsRevoke: string;
  sessionsEmpty: string;

  mfaTitle: string;
  mfaDescription: string;
  mfaEnrollTitle: string;
  mfaEnrollButton: string;
  mfaSecretLabel: string;
  mfaOtpauthLabel: string;
  mfaEnrollHint: string;
  mfaVerifyTitle: string;
  mfaVerifyCodeLabel: string;
  mfaVerifySubmit: string;
  mfaVerified: string;
  mfaRecoveryTitle: string;
  mfaRecoveryDescription: string;
  mfaRecoveryGenerate: string;
  mfaRecoveryRegenerate: string;
  mfaInvalidCode: string;
  mfaNeedConfirmed: string;

  rolesTitle: string;
  rolesDescription: string;
  rolesTenantTitle: string;
  rolesTemplatesTitle: string;
  rolesColKey: string;
  rolesColName: string;
  rolesColSystem: string;
  rolesColActions: string;
  rolesClone: string;
  rolesCloned: string;
  rolesYes: string;
  rolesNo: string;

  passwordTitle: string;
  passwordDescription: string;
  passwordCurrentLabel: string;
  passwordNextLabel: string;
  passwordNextHint: string;
  passwordSubmit: string;
  passwordSuccess: string;
  passwordErrorCurrent: string;

  errorsForbidden: string;
  errorsUnauthorized: string;
  errorsValidation: string;
  errorsNotFound: string;
  errorsNetwork: string;
  errorsGeneric: string;
  errorsRateLimited: string;

  // -- P4-T12a (PHASE-004): navigation ---------------------------------------
  navOnboarding: string;

  journeyTitle: string;
  journeyStepProfile: string;
  journeyStepCustomer: string;
  journeyStepInvoice: string;
  journeyStepPrint: string;
  journeyDone: string;
  journeyTodo: string;

  // -- PHASE-014: subscription, billing, notifications, pricing, dashboard --
  navNotifications: string;
  navBilling: string;
  pricingTitle: string;
  pricingSubtitle: string;
  pricingPerMonth: string;
  pricingFeatures: string;
  pricingChoose: string;
  pricingCurrentPlan: string;
  pricingLoadError: string;
  pricingConfigNote: string;
  billingTitle: string;
  billingPlanLabel: string;
  billingStatusLabel: string;
  billingPeriodLabel: string;
  billingTrialEndsLabel: string;
  billingGraceEndsLabel: string;
  billingReadOnlyBanner: string;
  billingNoSubscription: string;
  billingUsageTitle: string;
  billingCurrent: string;
  billingLimit: string;
  billingUnlimited: string;
  billingHistoryTitle: string;
  billingInvoices: string;
  billingEvents: string;
  billingNumber: string;
  billingAmount: string;
  billingDue: string;
  billingPaidVia: string;
  billingCheckout: string;
  billingChangePlan: string;
  billingCheckoutError: string;
  billingOpenInvoicesNote: string;
  notifTitle: string;
  notifUnread: string;
  notifEmpty: string;
  notifPreferences: string;
  notifInApp: string;
  notifEmail: string;
  notifMarkRead: string;
  notifLoadError: string;
  dashWidgetsTitle: string;
  dashSalesToday: string;
  dashCashToday: string;
  dashArOverdue: string;
  dashStockLow: string;
  dashOpenReport: string;
  dashWidgetError: string;
  platformManualPaymentTitle: string;
  platformRecordPayment: string;
  platformPaymentReason: string;
  platformPaymentSuccess: string;
  platformPaymentError: string;
  platformNoOpenInvoices: string;
  statusTRIAL: string;
  statusACTIVE: string;
  statusGRACE: string;
  statusSUSPENDED: string;
  statusPAST_DUE: string;
  statusOPEN: string;
  statusPAID: string;
  statusVOID: string;
  navBranches: string;
  navSettings: string;
  navSupport: string;
  navPlatformSection: string;
  navPlatformConsole: string;
  navPlatformAudit: string;

  // -- PHASE-015 T11: industry templates UI -----------------------------------
  navTemplates: string;
  templatesPageTitle: string;
  templatesPageDescription: string;
  templatesCurrent: string;
  templatesNone: string;
  templatesApply: string;
  templatesSwitch: string;
  templatesPreview: string;
  templatesApplied: string;
  templatesSwitched: string;
  templatesApplyConfirm: string;
  templatesSwitchNote: string;
  templatesVersion: string;
  templatesStatusActive: string;
  templatesStatusInactive: string;
  onboardingIndustryTitle: string;
  onboardingIndustryDescription: string;
  onboardingIndustrySelect: string;
  onboardingIndustrySkip: string;
  onboardingIndustryApplied: string;

  // -- PHASE-016 POS UI ---------------------------------------------------------
  navPosCounter: string;
  navPosTerminals: string;
  posTerminalsTitle: string;
  posTerminalsDescription: string;
  posTerminalCode: string;
  posTerminalName: string;
  posTerminalBranch: string;
  posTerminalCashAccount: string;
  posTerminalReceiptSize: string;
  posTerminalStatus: string;
  posTerminalRegister: string;
  posTerminalActivate: string;
  posTerminalDeactivate: string;
  posTerminalNone: string;
  posCounterTitle: string;
  posCounterScanPlaceholder: string;
  posCounterCart: string;
  posCounterTotal: string;
  posCounterPay: string;
  posCounterClear: string;
  posCounterSalePosted: string;
  posCounterSaleFailed: string;
  posCounterOfflineBanner: string;
  posCounterQueued: string;
  posCounterEmpty: string;

  // -- P4-T12a: shared labels -------------------------------------------------
  statusInactive: string;
  statusClosed: string;
  statusIssued: string;
  statusRejected: string;
  statusConverted: string;
  statusTerminated: string;
  taxStatusLabel: string;
  taxStatusRegistered: string;
  taxStatusNotRegistered: string;
  taxStatusDeregistered: string;
  taxNumberLabel: string;
  fiscalStartMonthLabel: string;
  numberingAssignAtLabel: string;
  numberingAssignAtPosting: string;
  numberingAssignAtApproval: string;
  localeArabic: string;
  localeEnglish: string;

  // -- P4-T12a: register (public) ----------------------------------------------
  registerTitle: string;
  registerSubtitle: string;
  registerBusinessNameLabel: string;
  registerBusinessNameArLabel: string;
  registerCountryLabel: string;
  registerCurrencyLabel: string;
  registerTemplateLabel: string;
  registerTaxNumberHint: string;
  registerOwnerSection: string;
  registerOwnerEmailLabel: string;
  registerOwnerNameLabel: string;
  registerSubmit: string;
  registerSuccessTitle: string;
  registerSuccessBody: string;
  registerGoLogin: string;
  registerLoginPrompt: string;
  registerErrorEmailTaken: string;
  registerErrorOptions: string;

  // -- P4-T12a: onboarding ------------------------------------------------------
  onboardingTitle: string;
  onboardingSubtitle: string;
  onboardingProvisionButton: string;
  onboardingResultTitle: string;
  onboardingRolesLabel: string;
  onboardingAccountsLabel: string;
  onboardingPurposesLabel: string;
  onboardingSettingsLabel: string;
  onboardingCreatedCount: string;
  onboardingZeroDuplicatesHint: string;
  onboardingGoHome: string;
  onboardingGoBranches: string;

  // -- P4-T12a: branches --------------------------------------------------------
  branchesTitle: string;
  branchesEmpty: string;
  branchesColCode: string;
  branchesColName: string;
  branchesColNameAr: string;
  branchesCreateTitle: string;
  branchesCodeLabel: string;
  branchesNameLabel: string;
  branchesNameArLabel: string;
  branchesCreateSubmit: string;
  branchesActivate: string;
  branchesDeactivate: string;
  branchesErrorCodeTaken: string;

  // -- P4-T12a: tenant settings --------------------------------------------------
  settingsTitle: string;
  settingsProfileTitle: string;
  settingsNameLabel: string;
  settingsNameArLabel: string;
  settingsTimezoneLabel: string;
  settingsProfileSubmit: string;
  settingsProfileSaved: string;
  settingsGeneralTitle: string;
  settingsDefaultLocaleLabel: string;
  settingsNumeralSystemLabel: string;
  settingsNumeralLatn: string;
  settingsNumeralArab: string;
  settingsHijriLabel: string;
  settingsHijriHint: string;
  settingsFiscalNumberingTitle: string;
  settingsSupportTitle: string;
  settingsSupportOptInLabel: string;
  settingsSupportOptInWarning: string;
  settingsTaxTitle: string;
  settingsTaxPairHint: string;
  settingsSave: string;
  settingsSaved: string;
  settingsErrorInvalidValue: string;

  // -- P4-T12a: support sessions (tenant plane) ----------------------------------
  supportSessionsTitle: string;
  supportSessionsHint: string;
  supportColReason: string;
  supportColTicket: string;
  supportColOpened: string;
  supportColClosed: string;
  supportColOptIn: string;
  supportEmpty: string;
  supportTerminate: string;
  supportErrorAccessDenied: string;
  supportErrorExpired: string;
  supportErrorNotActive: string;

  // -- P4-T12a: tenancy error strings --------------------------------------------
  tenancyErrorFeatureNotEntitled: string;
  tenancyErrorDependenciesMissing: string;

  // -- P4-T12a: platform console -------------------------------------------------
  platformConsoleTitle: string;
  platformNoAccess: string;
  platformTenantBadge: string;
  platformSearchLabel: string;
  platformSearchSubmit: string;
  platformColTenant: string;
  platformColCountry: string;
  platformColPlan: string;
  platformColCreated: string;
  platformEmpty: string;
  platformProfileTitle: string;
  platformPlanTitle: string;
  platformPlanCurrentLabel: string;
  platformPlanNone: string;
  platformPlanAssignTitle: string;
  platformPlanLabel: string;
  platformTrialDaysLabel: string;
  platformPlanSubmit: string;
  platformPlanAssigned: string;
  platformEntitlementsTitle: string;
  platformColFeatureKey: string;
  platformColSource: string;
  platformEntitlementsEmpty: string;
  platformGrantTitle: string;
  platformGrantFeatureLabel: string;
  platformGrantSourceLabel: string;
  platformGrantExpiresLabel: string;
  platformGrantExpiresHint: string;
  platformGrantReasonLabel: string;
  platformGrantSubmit: string;
  platformGrantDone: string;
  platformRevoke: string;
  platformRevokeReasonLabel: string;
  platformGrantExpiryRequired: string;
  platformGrantUnknownKey: string;
  platformMembershipsTitle: string;
  platformBranchesTitle: string;
  platformLifecycleTitle: string;
  platformReasonLabel: string;
  platformSuspendButton: string;
  platformRestoreButton: string;
  platformSuspendDone: string;
  platformRestoreDone: string;
  platformSupportTitle: string;
  platformSupportOpenTitle: string;
  platformSupportReasonLabel: string;
  platformSupportTicketLabel: string;
  platformSupportHoursLabel: string;
  platformSupportOpenSubmit: string;
  platformSupportClose: string;
  platformSupportCloseReasonLabel: string;
  platformSupportSessionLabel: string;
  platformReadDataTitle: string;
  platformReadResourceLabel: string;
  platformReadSubmit: string;
  platformNoActiveSession: string;
  resourceUsers: string;
  resourceMemberships: string;
  resourceRoles: string;
  resourceBranches: string;
  resourceSettings: string;
  resourceEntitlements: string;
  resourceSubscription: string;
  resourceAccounts: string;
  resourceAuditEvents: string;

  // -- P4-T12a: platform audit viewer ----------------------------------------------
  platformAuditTitle: string;
  platformAuditPlatformOnly: string;
  platformAuditTenantFilter: string;
  platformAuditActionFilter: string;
  platformAuditApply: string;
  platformAuditColAt: string;
  platformAuditColAction: string;
  platformAuditColActor: string;
  platformAuditViaPlatform: string;
  platformAuditNextPage: string;
  platformAuditEmpty: string;
  platformErrorInvalidTransition: string;
  platformErrorPlanNotFound: string;

  // -- P5-T12 (PHASE-005): design-system shell + status/stepper labels --------
  shellSkipToContent: string;
  shellCommandSearch: string;
  shellShortcutsTitle: string;
  shellClose: string;
  shellMore: string;
  statusOffboarded: string;
  wizardStepOf: string;
  platformBackToConsole: string;
  rolesEmpty: string;
  retryLabel: string;

  // -- P6-T11a (PHASE-006 master data): shared labels --------------------------
  commonSave: string;
  commonCreate: string;
  commonCancel: string;
  commonOpen: string;
  commonClear: string;
  commonConfirm: string;
  commonUnsavedChanges: string;
  commonVersionConflict: string;
  statusDraft: string;
  statusArchived: string;
  kindLabel: string;
  kindFilterAll: string;
  colStatus: string;
  colName: string;
  listNextPage: string;
  listPrevPage: string;
  listSearchLabel: string;
  namePreviewLabel: string;

  // -- P6-T11a: navigation + breadcrumbs for the master-data groups ------------
  navPartners: string;
  navPartnersDirectory: string;
  navPartnersNew: string;
  navOpeningBalances: string;
  navInventory: string;
  navItems: string;
  navItemsNew: string;
  navPriceLists: string;
  navImport: string;

  // -- PHASE-007: accounting navigation + screens --------------------------------
  navAccountingCoa: string;
  navAccountingJournals: string;
  navAccountingGl: string;
  navAccountingPeriods: string;
  navAccountingApprovals: string;
  navAccountingRates: string;
  accountingTitle: string;
  accountingJournalsTitle: string;
  accountingJournalsNew: string;
  accountingJournalsEmpty: string;
  accountingColEntryNo: string;
  accountingColEntryDate: string;
  accountingColCurrency: string;
  accountingColTotal: string;
  accountingColStatus: string;
  accountingColCode: string;
  accountingColName: string;
  accountingColType: string;
  accountingColPostable: string;
  accountingColDebit: string;
  accountingColCredit: string;
  accountingColBalance: string;
  accountingSubmit: string;
  accountingApprove: string;
  accountingPost: string;
  accountingReverse: string;
  accountingCancel: string;
  accountingSaveDraft: string;
  accountingAddLine: string;
  accountingRemoveLine: string;
  accountingDuplicateLine: string;
  accountingPartnerRequired: string;
  accountingBalanced: string;
  accountingUnbalanced: string;
  accountingDifference: string;
  accountingLineTotal: string;
  accountingMemo: string;
  accountingCostCenter: string;
  accountingPartner: string;
  accountingTaxCode: string;
  accountingAccount: string;
  accountingDescription: string;
  accountingCoaTitle: string;
  accountingCoaEmpty: string;
  accountingPurposesTitle: string;
  accountingPurposesEmpty: string;
  accountingGlTitle: string;
  accountingGlEmpty: string;
  accountingGlDrill: string;
  accountingPeriodsTitle: string;
  accountingPeriodsEmpty: string;
  accountingYearsTitle: string;
  accountingCreateYear: string;
  accountingYearName: string;
  accountingYearStart: string;
  accountingYearEnd: string;
  accountingSoftClose: string;
  accountingLock: string;
  accountingReopen: string;
  accountingReopenReason: string;
  accountingReopenPrompt: string;
  accountingChecklist: string;
  accountingChecklistOk: string;
  accountingChecklistBroken: string;
  accountingChecklistNotRun: string;
  accountingChecklistNotApplicable: string;
  accountingApprovalsTitle: string;
  accountingApprovalsEmpty: string;
  accountingApprovalsSelfHint: string;
  accountingApprovalsSubmittedBy: string;
  accountingApprovalsTotalBase: string;
  accountingApprovalsPreview: string;
  accountingReject: string;
  accountingRatesTitle: string;
  accountingRatesEmpty: string;
  accountingRatesCurrency: string;
  accountingRatesDate: string;
  accountingRatesRate: string;
  accountingRatesSave: string;
  accountingPostedAt: string;
  accountingSource: string;
  accountingPreviewTitle: string;
  statusPendingApproval: string;
  statusApproved: string;
  statusPosted: string;
  statusReversed: string;
  statusCancelled: string;
  accountingStatusOpen: string;
  accountingStatusSoftClosed: string;
  accountingStatusLocked: string;
  accountingKindRegular: string;
  accountingKindOpening: string;
  accountingKindClosing: string;
  accountingSearchPlaceholder: string;
  accountingNewAccount: string;
  accountingAccountParent: string;
  accountingAccountCurrency: string;
  accountingIsGroup: string;
  accountingMapPurpose: string;
  accountingPurposeKey: string;
  accountingPurposeAccount: string;
  accountingActiveFrom: string;
  accountingLines: string;
  accountingColAmount: string;
  accountingColBase: string;
  accountingColDirection: string;
  accountingColPeriod: string;
  accountingReference: string;
  accountingExchangeRate: string;
  accountingRecurringTitle: string;
  accountingRecurringNew: string;
  accountingRecurringEmpty: string;
  accountingRecurringSchedule: string;
  accountingRecurringNextRun: string;
  accountingRecurringAmountPolicy: string;
  accountingRecurringFixed: string;
  accountingRecurringReenter: string;
  accountingRecurringPause: string;
  accountingRecurringActivate: string;
  accountingRecurringGenerateDue: string;
  accountingPoliciesTitle: string;
  accountingPoliciesEmpty: string;
  accountingPolicyMode: string;
  accountingPolicyThreshold: string;
  accountingRunAr: string;
  accountingRunAp: string;
  accountingReconStatusOk: string;
  accountingReconStatusBroken: string;
  accountingPostOpening: string;
  accountingPostOpeningConfirm: string;
  obPostReadyNote: string;
  accountingYearEndExecute: string;
  accountingYearEndReverse: string;
  accountingYearEndConfirm: string;
  accountingMovementsTitle: string;
  accountingRegisterTitle: string;
  accountingSelectAccount: string;
  accountingFromDate: string;
  accountingToDate: string;
  accountingReversalDate: string;
  accountingReversalReason: string;
  accountingSoftClosePrompt: string;
  accountingRateHint: string;
  accountingErrEntryNotBalanced: string;
  accountingErrPeriodLocked: string;
  accountingErrAccountNotPostable: string;
  accountingErrPurposeNotMapped: string;
  accountingErrMissingPartner: string;
  accountingErrMissingFxRate: string;
  accountingErrAlreadyPosted: string;
  accountingErrAlreadyReversed: string;
  accountingErrApprovalLimit: string;
  accountingErrSelfApproval: string;
  accountingErrImmutable: string;
  accountingErrState: string;
  accountTypeAsset: string;
  accountTypeLiability: string;
  accountTypeEquity: string;
  accountTypeRevenue: string;
  accountTypeExpense: string;
  accountingPostableYes: string;
  accountingPostableNo: string;
  accountingPurposesHint: string;

  // -- T14-UI: PHASE-008 treasury navigation + screens ---------------------------
  navTreasury: string;
  navTreasuryAccounts: string;
  navTreasuryReceipts: string;
  navTreasuryPayments: string;
  navTreasuryExpenses: string;
  navTreasuryTransfers: string;
  navTreasuryShifts: string;
  navTreasuryBankRec: string;
  treasuryAccountsTitle: string;
  treasuryAccountsEmpty: string;
  treasuryAccountOpenTitle: string;
  treasuryAccountName: string;
  treasuryAccountNameAr: string;
  treasuryAccountType: string;
  treasuryAccountTypeCash: string;
  treasuryAccountTypeBank: string;
  treasuryAccountTypePetty: string;
  treasuryAccountGlAccount: string;
  treasuryAccountCurrency: string;
  treasuryAccountBranch: string;
  treasuryColGlCode: string;
  treasuryAccountBalance: string;
  treasuryColMovements: string;
  treasuryAccountCreatedToast: string;
  treasuryAccountCloseBtn: string;
  treasuryAccountCloseReason: string;
  treasuryAccountClosedToast: string;
  treasuryAccountOpenedAt: string;
  treasuryAccountClosedAt: string;
  treasuryAccountMovementsTitle: string;
  treasuryAccountMovementsEmpty: string;
  treasuryColDirectionIn: string;
  treasuryColDirectionOut: string;
  treasuryColBaseAmount: string;
  treasuryColValueDate: string;
  treasuryColRate: string;
  treasuryColSource: string;
  treasuryColMemo: string;
  treasuryMethodCash: string;
  treasuryMethodBank: string;
  treasuryMethodCheque: string;
  treasuryMethodCard: string;
  treasuryMethodTransfer: string;
  treasuryReceiptsTitle: string;
  treasuryReceiptsEmpty: string;
  treasuryReceiptsNew: string;
  treasuryPaymentsTitle: string;
  treasuryPaymentsEmpty: string;
  treasuryPaymentsNew: string;
  treasuryColDocNo: string;
  treasuryColPartner: string;
  treasuryColMethod: string;
  treasuryColAmount: string;
  treasuryColAllocated: string;
  treasuryColFx: string;
  treasuryColPayer: string;
  treasuryColPayee: string;
  treasuryDocCashAccount: string;
  treasuryDocPartner: string;
  treasuryDocMethod: string;
  treasuryDocCurrency: string;
  treasuryDocAmount: string;
  treasuryDocRate: string;
  treasuryDocRateHint: string;
  treasuryDocValueDate: string;
  treasuryDocReference: string;
  treasuryDocDescription: string;
  treasuryDocDescriptionAr: string;
  treasuryDocCreatedToast: string;
  treasuryDocDetailTitle: string;
  treasuryDocPostedToast: string;
  treasuryDocReverseToast: string;
  treasuryDocReverseDate: string;
  treasuryDocReverseReason: string;
  treasuryDocCancelToast: string;
  treasuryDocOnAccount: string;
  treasuryDocJournalNo: string;
  treasuryDocSideHint: string;
  treasuryCancelReason: string;
  treasuryOpenItemsTitle: string;
  treasuryAllocationsTitle: string;
  treasuryAllocationsEmpty: string;
  treasuryAllocationsHint: string;
  treasuryAllocationSuggestBtn: string;
  treasuryAllocationSuggestToast: string;
  treasuryAllocationColOutstanding: string;
  treasuryAllocationTotals: string;
  treasuryAllocationTotalAllocated: string;
  treasuryAllocationRemainder: string;
  treasuryAllocationOnAccountHint: string;
  treasuryAllocationOverError: string;
  treasuryAllocationSaveBtn: string;
  treasuryAllocationSavedToast: string;
  treasuryAllocationReloadBtn: string;
  treasuryExpensesTitle: string;
  treasuryExpensesEmpty: string;
  treasuryExpenseClaimNew: string;
  treasuryExpenseCategoriesTitle: string;
  treasuryExpenseCategoriesEmpty: string;
  treasuryExpenseCategoryNew: string;
  treasuryExpenseCategoryCode: string;
  treasuryExpenseCategoryAccount: string;
  treasuryExpenseCategoryApproval: string;
  treasuryExpenseApprovalNone: string;
  treasuryExpenseApprovalSingle: string;
  treasuryExpenseCategoryCreatedToast: string;
  treasuryExpenseCreatedToast: string;
  treasuryExpenseReceiptNote: string;
  treasuryExpenseReceiptFileId: string;
  treasuryExpenseColNo: string;
  treasuryExpenseColPayee: string;
  treasuryExpenseColCategory: string;
  treasuryTransfersTitle: string;
  treasuryTransfersEmpty: string;
  treasuryTransferNew: string;
  treasuryTransferFrom: string;
  treasuryTransferTo: string;
  treasuryTransferCreatedToast: string;
  treasuryTransferPostedToast: string;
  treasuryTransferCancelledToast: string;
  treasuryTransferSameAccountError: string;
  treasuryColFrom: string;
  treasuryColTo: string;
  treasuryColNo: string;
  treasuryColFee: string;
  treasuryShiftsTitle: string;
  treasuryShiftsEmpty: string;
  treasuryShiftOpenTitle: string;
  treasuryShiftOpenBtn: string;
  treasuryShiftOpeningAmount: string;
  treasuryShiftCreatedToast: string;
  treasuryShiftStatusOpen: string;
  treasuryShiftStatusClosed: string;
  treasuryShiftStatusCancelled: string;
  treasuryShiftColShiftNo: string;
  treasuryShiftColOpenedAt: string;
  treasuryShiftColClosedAt: string;
  treasuryShiftColCapturedIn: string;
  treasuryShiftColCapturedOut: string;
  treasuryShiftExpected: string;
  treasuryShiftCounted: string;
  treasuryShiftDifference: string;
  treasuryShiftVarianceJournal: string;
  treasuryShiftSupervisor: string;
  treasuryShiftSupervisorPin: string;
  treasuryShiftSupervisorHint: string;
  treasuryShiftReason: string;
  treasuryShiftCloseToast: string;
  treasuryShiftCancelBtn: string;
  treasuryShiftCancelledToast: string;
  treasuryShiftPanelTitle: string;
  treasuryShiftCaptureTitle: string;
  treasuryShiftCaptureHint: string;
  treasuryShiftCaptureBtn: string;
  treasuryShiftCloseTitle: string;
  treasuryShiftCloseBtn: string;
  treasuryShiftBalanced: string;
  treasuryShiftVarianceNote: string;
  treasuryShiftClosedNote: string;
  treasuryBankRecTitle: string;
  treasuryBankRecEmpty: string;
  treasuryBankRecImportTitle: string;
  treasuryBankRecAdapter: string;
  treasuryBankRecFile: string;
  treasuryBankRecFileHint: string;
  treasuryBankRecPeriodStart: string;
  treasuryBankRecPeriodEnd: string;
  treasuryBankRecMappingHint: string;
  treasuryBankRecMappingDate: string;
  treasuryBankRecMappingAmount: string;
  treasuryBankRecMappingReference: string;
  treasuryBankRecMappingDescription: string;
  treasuryBankRecImportBtn: string;
  treasuryBankRecImportedToast: string;
  treasuryBankRecStatementsTitle: string;
  treasuryBankRecColFile: string;
  treasuryBankRecColPeriod: string;
  treasuryBankRecColLines: string;
  treasuryBankRecColImportedAt: string;
  treasuryBankRecStatusImported: string;
  treasuryBankRecStatusReconciled: string;
  treasuryBankRecOpeningBalance: string;
  treasuryBankRecClosingBalance: string;
  treasuryBankRecSelectStatement: string;
  treasuryBankRecLinesTitle: string;
  treasuryBankRecColLineNo: string;
  treasuryBankRecColMatchState: string;
  treasuryBankRecMatched: string;
  treasuryBankRecUnmatched: string;
  treasuryBankRecMatchAuto: string;
  treasuryBankRecMatchManual: string;
  treasuryBankRecAutoMatchBtn: string;
  treasuryBankRecAutoMatchToast: string;
  treasuryBankRecManualMatch: string;
  treasuryBankRecMatchMovement: string;
  treasuryBankRecUnmatchBtn: string;
  treasuryBankRecMatchedToast: string;
  treasuryBankRecReconcileBtn: string;
  treasuryBankRecReconcileHint: string;
  treasuryBankRecReconciledToast: string;
  treasuryBankRecAgingTitle: string;
  treasuryBankRecAgingAsOf: string;
  treasuryBankRecUnmatchedLinesTitle: string;
  treasuryBankRecUnmatchedMovementsTitle: string;
  treasuryBankRecColAgeDays: string;
  treasuryBankRecLoadAgingBtn: string;
  treasuryBankRecCashCheckTitle: string;
  treasuryBankRecCashCheckAsOf: string;
  treasuryBankRecCashCheckBtn: string;
  treasuryBankRecCashCheckOk: string;
  treasuryBankRecCashCheckBroken: string;
  treasuryBankRecColControlBalance: string;
  treasuryBankRecColSubledgerBalance: string;
  treasuryBankRecColDiffCount: string;
  treasuryBankRecFilterAccount: string;
  treasuryErrAccountExists: string;
  treasuryErrAccountClosed: string;
  treasuryErrAccountNotCloseable: string;
  treasuryErrCurrencyMismatch: string;
  treasuryErrTypeInvalid: string;
  treasuryErrInvalidAmount: string;
  treasuryErrDocState: string;
  treasuryErrMissingFxRate: string;
  treasuryErrAllocationExceedsDoc: string;
  treasuryErrAllocationExceedsItem: string;
  treasuryErrOpenItemCurrency: string;
  treasuryErrOpenItemPartner: string;
  treasuryErrOpenItemSide: string;
  treasuryErrPettyLimit: string;
  treasuryErrCategoryTaken: string;
  treasuryErrReceiptRequired: string;
  treasuryErrApprovalRequired: string;
  treasuryErrShiftAlreadyOpen: string;
  treasuryErrSupervisorRequired: string;
  treasuryErrSupervisorPin: string;
  treasuryErrShiftReason: string;
  treasuryErrStatementTooLarge: string;
  treasuryErrStatementFormat: string;
  treasuryErrStatementReconciled: string;
  treasuryErrPeriodLocked: string;
  treasuryErrMovementMatched: string;

  // -- P6-T11a: partner directory ------------------------------------------------
  partnersSearchPlaceholder: string;
  partnersKindLabel: string;
  kindCustomer: string;
  kindSupplier: string;
  kindBoth: string;
  partnersColCode: string;
  partnersColCreditLimit: string;
  partnersEmpty: string;
  partnersNewButton: string;
  partnerFormTitleCreate: string;
  partnerCodeLabel: string;
  partnerCodeHint: string;
  partnerNameLabel: string;
  partnerNameArLabel: string;
  partnerTaxNumberLabel: string;
  partnerCreditTermsLabel: string;
  partnerPriceListLabel: string;
  partnerStatusLabel: string;
  partnerCreatedToast: string;
  partnerSavedToast: string;
  partnerCodeTaken: string;
  partnerArchivedError: string;
  partnerKindChangeLabel: string;
  partnerKindChangedToast: string;
  partnerKindImmutable: string;
  partnerArchiveButton: string;
  partnerArchiveConfirmTitle: string;
  partnerArchiveConfirmBody: string;
  partnerArchivedToast: string;
  partnerTabOverview: string;
  partnerContactsTitle: string;
  partnerContactNameLabel: string;
  partnerContactPhoneLabel: string;
  partnerContactEmailLabel: string;
  partnerContactRoleLabel: string;
  partnerContactPrimaryLabel: string;
  partnerContactAdd: string;
  partnerContactsEmpty: string;
  partnerAddressesTitle: string;
  addressTypeLabel: string;
  addressTypeBilling: string;
  addressTypeShipping: string;
  addressTypeOther: string;
  partnerAddressLine1Label: string;
  partnerAddressLine2Label: string;
  partnerAddressCityLabel: string;
  partnerAddressCountryLabel: string;
  partnerAddressAdd: string;
  partnerAddressesEmpty: string;
  partnerBalanceTitle: string;
  partnerBalanceOpenAmount: string;
  partnerBalanceDraftLabel: string;
  partnerBalanceOverdueLabel: string;
  partnerBalanceDraftBadge: string;
  partnerBalanceDraftNote: string;

  // -- P6-T11a: item master --------------------------------------------------------
  itemsSearchPlaceholder: string;
  itemsFilterCategoryLabel: string;
  categoryLabel: string;
  itemsColSku: string;
  itemsColBasePrice: string;
  itemsEmpty: string;
  itemsNewButton: string;
  itemFormTitleCreate: string;
  itemFormTitleEdit: string;
  itemSkuLabel: string;
  itemNameLabel: string;
  itemNameArLabel: string;
  itemKindLabel: string;
  kindStock: string;
  kindService: string;
  kindComposite: string;
  itemUomLabel: string;
  itemCostingLabel: string;
  costingWac: string;
  costingFifo: string;
  itemTrackingLabel: string;
  itemTrackBatch: string;
  itemTrackSerial: string;
  itemTrackImei: string;
  itemHasExpiry: string;
  itemExpiryRequiresBatch: string;
  itemReorderLevelLabel: string;
  itemReorderQtyLabel: string;
  itemBasePriceLabel: string;
  itemCreatedToast: string;
  itemSavedToast: string;
  itemSkuTaken: string;
  itemArchivedError: string;
  itemArchiveButton: string;
  itemArchiveConfirmTitle: string;
  itemArchiveConfirmBody: string;
  itemArchivedToast: string;
  barcodesTitle: string;
  barcodeCodeLabel: string;
  barcodeAdd: string;
  barcodesEmpty: string;
  barcodeTaken: string;

  // -- P6-T11a: price lists ---------------------------------------------------------
  priceListCreateTitle: string;
  priceListsListTitle: string;
  priceListNameLabel: string;
  priceListNameArLabel: string;
  priceListKindLabel: string;
  priceListKindSale: string;
  priceListKindPurchase: string;
  priceListCurrencyLabel: string;
  priceListValidFromLabel: string;
  priceListValidToLabel: string;
  priceListCreateSubmit: string;
  priceListSelectHint: string;
  priceListRowsTitle: string;
  priceListRowItemLabel: string;
  priceListRowUomLabel: string;
  priceListRowPriceLabel: string;
  priceListRowMinQtyLabel: string;
  priceListRowAdd: string;
  priceListRowAddedToast: string;
  priceListRowsEmpty: string;
  priceListsEmpty: string;
  priceListColValidLabel: string;
  priceListCreatedToast: string;
  priceListCurrencySar: string;

  // -- P6-T11a: import & export wizard -----------------------------------------------
  importStep1Title: string;
  importDataKindLabel: string;
  importKindPartners: string;
  importKindItems: string;
  importKindOpeningBalances: string;
  importFormatLabel: string;
  importCarrierLabel: string;
  importCarrierHint: string;
  importFileLabel: string;
  importFileHint: string;
  importSubmitPreview: string;
  importStep2Title: string;
  importColTotal: string;
  importColValid: string;
  importColInvalid: string;
  importColDuplicates: string;
  importCommit: string;
  importCommitToast: string;
  importCommitFailed: string;
  importStep3Title: string;
  importCommittedRows: string;
  importColRow: string;
  importColPreview: string;
  importColErrors: string;
  importColWarnings: string;
  importRowValid: string;
  importRowError: string;
  importRowDuplicate: string;
  importRowWarning: string;
  importPreviewEmpty: string;
  importNewJob: string;
  importCarrierRequired: string;
  importFileRequired: string;
  importFileTooLarge: string;
  importFileTypeInvalid: string;
  importUploadFailed: string;
  importFormatCsv: string;
  importFormatXlsx: string;
  importJobsColCreated: string;
  importJobsTitle: string;
  importJobsEmpty: string;
  importJobColRows: string;
  importStatusPreviewing: string;
  importStatusPreviewReady: string;
  importStatusCommitting: string;
  importStatusCommitted: string;
  importStatusFailed: string;
  importErrorFileInvalid: string;
  exportTitle: string;
  exportHint: string;
  exportSubmit: string;
  exportDone: string;
  exportRows: string;
  exportDownloadLabel: string;
  exportExpiresNote: string;

  // -- P6-T11a: opening balances (DRAFT-only) -----------------------------------------
  obTabPartner: string;
  obTabAccount: string;
  obTabStock: string;
  obCreateTitle: string;
  obAmountLabel: string;
  obNoteLabel: string;
  obQtyLabel: string;
  obUnitCostLabel: string;
  obAccountLabel: string;
  obAccountHint: string;
  obCreateSubmit: string;
  obEmpty: string;
  obListTitle: string;
  obDraftOnlyNote: string;
  obCreatedToast: string;
  obColTarget: string;
  obColAmount: string;
  obColQty: string;
  obColNote: string;
  obQtyAtCostLabel: string;
  obTargetUnknown: string;
  obDuplicateError: string;

  // -- P6-T11a: attachments (partners + items) -----------------------------------------
  attachmentsTitle: string;
  attachmentIssueFormTitle: string;
  attachmentFilenameLabel: string;
  attachmentContentTypeLabel: string;
  attachmentSizeLabel: string;
  attachmentTypePdf: string;
  attachmentTypePng: string;
  attachmentTypeJpeg: string;
  attachmentTypeWebp: string;
  attachmentTypeCsv: string;
  attachmentIssueButton: string;
  attachmentIssuedTitle: string;
  attachmentIssuedHint: string;
  attachmentIssuedToast: string;
  attachmentUrlLabel: string;
  attachmentKeyLabel: string;
  attachmentExpiresLabel: string;
  attachmentsEmpty: string;
  attachmentDownloadLabel: string;
  attachmentIssueFailed: string;

  // -- P6-T11a: pickers + command-menu remote groups -------------------------------------
  partnerPickerPlaceholder: string;
  itemPickerPlaceholder: string;
  pickerEmptyText: string;
  commandGroupPartners: string;
  commandGroupItems: string;

  // -- T15-UI: PHASE-009 tax screens ------------------------------------------------------
  // tax codes manager (+ the deterministic resolve preview)
  taxCodesTitle: string;
  taxCodesEmpty: string;
  taxCodesCode: string;
  taxCodesName: string;
  taxCodesNameAr: string;
  taxCodesCountry: string;
  taxCodesTreatment: string;
  taxCodesUsage: string;
  taxCodesCreateTitle: string;
  taxCodesCreatedToast: string;
  taxCodesArchive: string;
  taxCodesArchiveConfirm: string;
  taxCodesArchiveBlocked: string;
  taxCodesArchivedToast: string;
  taxTreatmentStandardRated: string;
  taxTreatmentZeroRated: string;
  taxTreatmentExempt: string;
  taxTreatmentOutOfScope: string;
  taxTreatmentReverseCharge: string;
  taxTreatmentNotSubject: string;
  taxResolveTitle: string;
  taxResolveDate: string;
  taxResolveAmount: string;
  taxResolveCode: string;
  taxResolveAction: string;
  taxResolveTreatment: string;
  taxResolveRate: string;
  taxResolveBase: string;
  taxResolveTax: string;
  taxResolveGross: string;
  taxResolveNotSubject: string;
  taxResolveBoundaryWarning: string;
  // tax registrations (per-jurisdiction status, upserted)
  taxRegistrationsTitle: string;
  taxRegistrationsEmpty: string;
  taxRegistrationsStatus: string;
  taxRegistrationsNumber: string;
  taxRegistrationsEffectiveFrom: string;
  taxRegistrationsEffectiveTo: string;
  taxRegistrationsRegistered: string;
  taxRegistrationsNotRegistered: string;
  taxRegistrationsDeregistered: string;
  taxRegistrationsCreateTitle: string;
  taxRegistrationsSavedToast: string;
  // jurisdiction packs (registry + version viewer + staged apply)
  taxPacksTitle: string;
  taxPacksEmpty: string;
  taxPacksCountry: string;
  taxPacksVatStatus: string;
  taxPacksVatInForce: string;
  taxPacksVatPlanned: string;
  taxPacksVatNoVat: string;
  taxPacksVersion: string;
  taxPacksVerification: string;
  taxPacksVerified: string;
  taxPacksRequiresVerification: string;
  taxPacksRate: string;
  taxPacksEffectiveFrom: string;
  taxPacksEffectiveTo: string;
  taxPacksSource: string;
  taxPacksWindowsTitle: string;
  taxPacksNoRates: string;
  taxPacksApply: string;
  taxPacksApplied: string;
  taxPacksBinding: string;
  taxPacksBindingNone: string;
  taxPacksPreviewNote: string;
  // VAT return workspace (summary + INV-012 cross-check + filing + export)
  vatReturnTitle: string;
  vatReturnEmpty: string;
  vatReturnCountry: string;
  vatReturnPeriod: string;
  vatReturnPeriodStart: string;
  vatReturnPeriodEnd: string;
  vatReturnStatus: string;
  vatReturnDraft: string;
  vatReturnReady: string;
  vatReturnFiled: string;
  vatReturnCreateTitle: string;
  vatReturnCreatedToast: string;
  vatReturnPrepare: string;
  vatReturnPreparedToast: string;
  vatReturnMarkFiled: string;
  vatReturnFiledToast: string;
  vatReturnFilingReference: string;
  vatReturnFilingNote: string;
  vatReturnExport: string;
  vatReturnExportCsv: string;
  vatReturnExportXlsx: string;
  vatReturnSummaryTitle: string;
  vatReturnDirection: string;
  vatReturnDirectionOutput: string;
  vatReturnDirectionInput: string;
  vatReturnTaxableBase: string;
  vatReturnTaxAmount: string;
  vatReturnCrossCheck: string;
  vatReturnDocumentSide: string;
  vatReturnGlSide: string;
  vatReturnOutputTax: string;
  vatReturnInputTax: string;
  vatReturnInputTaxExpensed: string;
  vatReturnMismatch: string;
  vatReturnReadyNote: string;
  // tax error mapping (stable ERROR_MODEL codes → localized messages)
  taxErrCodeTaken: string;
  taxErrCodeInUse: string;
  taxErrCodeArchived: string;
  taxErrRegistrationNumber: string;
  taxErrJurisdiction: string;
  taxErrNoRateForDate: string;
  taxErrWindowTaken: string;
  taxErrCrossCheck: string;
  taxErrState: string;
  taxErrAlreadyFiled: string;
  taxErrPackBinding: string;

  // -- T14-UI (PHASE-010): inventory & warehousing ---------------------------------
  // navigation
  navInventoryWarehouses: string;
  navInventoryStock: string;
  navInventoryMoves: string;
  navInventoryTransfers: string;
  navInventoryCounts: string;
  // warehouses (list + create + deactivate/reactivate)
  warehousesTitle: string;
  warehousesEmpty: string;
  warehousesCreateTitle: string;
  warehousesCodeLabel: string;
  warehousesNameLabel: string;
  warehousesNameArLabel: string;
  warehousesBranchLabel: string;
  warehousesGlAccountLabel: string;
  warehousesNoteLabel: string;
  warehousesCreatedToast: string;
  warehousesDeactivate: string;
  warehousesDeactivateTitle: string;
  warehousesDeactivateConfirm: string;
  warehousesDeactivatedToast: string;
  warehousesReactivate: string;
  warehousesReactivatedToast: string;
  warehousesColCode: string;
  warehousesColBranch: string;
  warehousesColGlAccount: string;
  // stock on hand
  stockTitle: string;
  stockEmpty: string;
  stockFilterWarehouse: string;
  stockColItem: string;
  stockColWarehouse: string;
  stockColQty: string;
  stockColAvgCost: string;
  stockNegativeBadge: string;
  // stock movements ledger
  movesTitle: string;
  movesEmpty: string;
  movesFilterDirection: string;
  movesFilterKind: string;
  movesColDate: string;
  movesColDirection: string;
  movesColKind: string;
  movesColUnitCost: string;
  movesColValue: string;
  movesColReason: string;
  movesColBatch: string;
  movesColSerial: string;
  movesColSource: string;
  movesDirectionIn: string;
  movesDirectionOut: string;
  movesKindReceipt: string;
  movesKindIssue: string;
  movesKindTransferIn: string;
  movesKindTransferOut: string;
  movesKindAdjust: string;
  movesReasonDamage: string;
  movesReasonExpired: string;
  movesReasonCountLoss: string;
  movesReasonCountGain: string;
  movesReasonCustomerReturn: string;
  movesReasonOther: string;
  // warehouse-to-warehouse transfers
  transfersTitle: string;
  transfersEmpty: string;
  transfersColNo: string;
  transfersColFrom: string;
  transfersColTo: string;
  transfersColLines: string;
  transfersColDispatchDate: string;
  transfersColReceiveDate: string;
  transfersStatusInTransit: string;
  transfersNewTitle: string;
  transfersFromLabel: string;
  transfersToLabel: string;
  transfersNoteLabel: string;
  transfersLinesTitle: string;
  transfersLineItemLabel: string;
  transfersLineQtyLabel: string;
  transfersAddLine: string;
  transfersRemoveLine: string;
  transfersSameWarehouseError: string;
  transfersLineMissingError: string;
  transfersCreatedToast: string;
  transfersDispatch: string;
  transfersDispatchedToast: string;
  transfersReceive: string;
  transfersReceivedToast: string;
  transfersCancel: string;
  transfersCancelledToast: string;
  // stock counting workspace
  countingTitle: string;
  countingEmpty: string;
  countingNewTitle: string;
  countingWarehouseLabel: string;
  countingBlindLabel: string;
  countingPickItemsTitle: string;
  countingPickSearchPlaceholder: string;
  countingPickEmpty: string;
  countingSelectedCount: string;
  countingCreate: string;
  countingCreatedToast: string;
  countingColNo: string;
  countingColBlind: string;
  countingBlindYes: string;
  countingBlindNo: string;
  countingColVariance: string;
  countingOpenSession: string;
  countingCloseSession: string;
  countingSnapshotAt: string;
  countingSessionLinesTitle: string;
  countingColLineNo: string;
  countingColSystemQty: string;
  countingColCountedQty: string;
  countingColDiff: string;
  countingColValueImpact: string;
  countingSaveEntries: string;
  countingEntriesSavedToast: string;
  countingSubmit: string;
  countingSubmittedToast: string;
  countingReviewTitle: string;
  countingReviewHint: string;
  countingApprove: string;
  countingApproveSupervisor: string;
  countingApprovedToast: string;
  countingCancel: string;
  countingCancelledToast: string;
  countingRecountTitle: string;
  countingRecountLineLabel: string;
  countingRecountNoteLabel: string;
  countingRecountedToast: string;
  countingStatusCounted: string;
  countingStatusVarianceReview: string;
  // inventory error mapping (stable ERROR_MODEL codes → localized messages)
  inventoryErrWarehouseCodeTaken: string;
  inventoryErrWarehouseInactive: string;
  inventoryErrWarehouseNotDeactivatable: string;
  inventoryErrItemNotStocked: string;
  inventoryErrInsufficientStock: string;
  inventoryErrBatchInsufficient: string;
  inventoryErrBatchRequired: string;
  inventoryErrBatchTaken: string;
  inventoryErrSerialRequired: string;
  inventoryErrSerialNotInStock: string;
  inventoryErrSerialTaken: string;
  inventoryErrSerialReturnBinding: string;
  inventoryErrState: string;
  inventoryErrTransferEmpty: string;
  inventoryErrTransferSameWarehouse: string;
  inventoryErrCountTolerance: string;
  inventoryErrMethodSwitchInFlight: string;
  inventoryErrMethodSwitchInvalid: string;
  inventoryErrMethodSwitchSame: string;
  // PHASE-011 purchasing (T13-UI).
  purchasingEmpty: string;
  purchasingNoticeCreated: string;
  purchasingNoticeUpdated: string;
  purchasingNoticePosted: string;
  expensesColAccount: string;
  navPurchasingOrders: string;
  navPurchasingReceipts: string;
  navPurchasingInvoices: string;
  navPurchasingDebitNotes: string;
  navPurchasingAp: string;
  purchasingOrdersTitle: string;
  purchasingReceiptsTitle: string;
  purchasingInvoicesTitle: string;
  purchasingDebitNotesTitle: string;
  purchasingApTitle: string;
  purchasingRequestsSection: string;
  purchasingOrdersSection: string;
  purchasingNewRequest: string;
  purchasingNewOrder: string;
  purchasingRequestNo: string;
  purchasingNeededBy: string;
  purchasingSubmit: string;
  purchasingApprove: string;
  purchasingReject: string;
  purchasingIssue: string;
  purchasingClose: string;
  purchasingCancel: string;
  purchasingOrderNo: string;
  purchasingOrderDate: string;
  purchasingExpectedDate: string;
  purchasingSupplier: string;
  purchasingLines: string;
  purchasingAddLine: string;
  purchasingRemoveLine: string;
  purchasingItem: string;
  purchasingQty: string;
  purchasingUnitPrice: string;
  purchasingTaxCode: string;
  purchasingUnitCost: string;
  purchasingTotalNet: string;
  purchasingTotalTax: string;
  purchasingTotalGross: string;
  purchasingStatus: string;
  purchasingNewReceipt: string;
  purchasingReceiptNo: string;
  purchasingReceiptDate: string;
  purchasingWarehouse: string;
  purchasingPo: string;
  purchasingPoLessReason: string;
  purchasingPost: string;
  purchasingBatchNo: string;
  purchasingBatchExpiry: string;
  purchasingNewInvoice: string;
  purchasingInvoiceNo: string;
  purchasingInvoiceDate: string;
  purchasingDueDate: string;
  purchasingInternalNo: string;
  purchasingMatchStatus: string;
  purchasingMatchPreview: string;
  purchasingRecordMatch: string;
  purchasingDisposition: string;
  purchasingDispositionReason: string;
  purchasingDispositionAccept: string;
  purchasingMatchOutcomeMatched: string;
  purchasingMatchOutcomeException: string;
  purchasingMatchOutcomeDispositioned: string;
  purchasingMatchOutcomePending: string;
  purchasingQtyVariance: string;
  purchasingPriceVariance: string;
  purchasingNewDebitNote: string;
  purchasingNoteNo: string;
  purchasingNoteDate: string;
  purchasingRefInvoice: string;
  purchasingApAging: string;
  purchasingApStatement: string;
  purchasingGrniRegister: string;
  purchasingAgingNotDue: string;
  purchasingAging1_30: string;
  purchasingAging31_60: string;
  purchasingAging61_90: string;
  purchasingAging90Plus: string;
  purchasingAgingTotal: string;
  purchasingAsOf: string;
  purchasingOpeningBalance: string;
  purchasingClosingBalance: string;
  purchasingDebit: string;
  purchasingCredit: string;
  purchasingBalance: string;
  purchasingOutstanding: string;
  purchasingReceivedValue: string;
  purchasingInvoicedValue: string;
  purchasingGrniRemaining: string;
  purchasingSelectSupplier: string;
  purchasingSelectWarehouse: string;
  purchasingSelectPo: string;
  purchasingNoPo: string;
  purchasingErrState: string;
  purchasingErrDuplicate: string;
  purchasingErrMatchMissing: string;
  purchasingErrMatchException: string;
  purchasingErrPoLess: string;
  purchasingErrPoLessReason: string;
  purchasingErrOverReceipt: string;
  purchasingErrOverInvoice: string;
  purchasingErrNotSupplier: string;
  purchasingErrGrnSupplier: string;
  purchasingErrSelfApproval: string;
  purchasingErrReallocation: string;
  // PHASE-012 sales (T13-UI).
  salesEmpty: string;
  salesNoticeCreated: string;
  salesNoticeUpdated: string;
  salesNoticePosted: string;
  navSalesQuotes: string;
  navSalesOrders: string;
  navSalesDeliveries: string;
  navSalesInvoices: string;
  navSalesCreditNotes: string;
  navSalesAr: string;
  salesQuotesTitle: string;
  salesOrdersTitle: string;
  salesDeliveriesTitle: string;
  salesInvoicesTitle: string;
  salesCreditNotesTitle: string;
  salesArTitle: string;
  salesQuotesSection: string;
  salesOrdersSection: string;
  salesStatus: string;
  salesStatusSent: string;
  salesNewQuote: string;
  salesNewOrder: string;
  salesQuoteNo: string;
  salesQuoteDate: string;
  salesValidUntil: string;
  salesOrderNo: string;
  salesOrderDate: string;
  salesExpectedDate: string;
  salesSalesOrder: string;
  salesNoOrder: string;
  salesCustomer: string;
  salesSelectCustomer: string;
  salesBranch: string;
  salesSelectBranch: string;
  salesWarehouse: string;
  salesSelectWarehouse: string;
  salesCurrency: string;
  salesExchangeRate: string;
  salesItem: string;
  salesQty: string;
  salesUnitPrice: string;
  salesDiscount: string;
  salesTaxCode: string;
  salesAccount: string;
  salesLines: string;
  salesAddLine: string;
  salesRemoveLine: string;
  salesTotalNet: string;
  salesTotalTax: string;
  salesTotalGross: string;
  salesSend: string;
  salesAccept: string;
  salesReject: string;
  salesSubmit: string;
  salesApprove: string;
  salesIssue: string;
  salesClose: string;
  salesPost: string;
  salesCancel: string;
  salesCancelReason: string;
  salesReserve: string;
  salesAcceptWarehouse: string;
  salesNewDelivery: string;
  salesDeliveryNo: string;
  salesDeliveryDate: string;
  salesDelivery: string;
  salesCogsValue: string;
  salesNewInvoice: string;
  salesInvoiceNo: string;
  salesInvoiceDate: string;
  salesDueDate: string;
  salesKind: string;
  salesKindCash: string;
  salesKindCredit: string;
  salesCashAccount: string;
  salesSelectCashAccount: string;
  salesOverrideCredit: string;
  salesCreditCheck: string;
  salesCreditAllow: string;
  salesCreditWarn: string;
  salesCreditBlock: string;
  salesNewCreditNote: string;
  salesNoteNo: string;
  salesNoteDate: string;
  salesRefInvoice: string;
  salesInvoiceLineId: string;
  salesReturnToStock: string;
  salesArAging: string;
  salesArStatement: string;
  salesArOpenItems: string;
  salesOpenItemsHint: string;
  salesAgingNotDue: string;
  salesAging1_30: string;
  salesAging31_60: string;
  salesAging61_90: string;
  salesAging90Plus: string;
  salesAgingTotal: string;
  salesAsOf: string;
  salesOpeningBalance: string;
  salesClosingBalance: string;
  salesDebit: string;
  salesCredit: string;
  salesBalance: string;
  salesOutstanding: string;
  salesBaseBalance: string;
  salesSubledgerTie: string;
  salesTieOk: string;
  salesTieBroken: string;
  salesSource: string;
  salesAmount: string;
  salesRunOverdueScan: string;
  salesOverdueScanDone: string;
  salesPrint: string;
  salesPrintDisabled: string;
  salesErrState: string;
  salesErrQuotationExpired: string;
  salesErrCreditLimit: string;
  salesErrReturnWindow: string;
  salesErrPriceChanged: string;
  salesErrItemInactive: string;
  salesErrDeliveryInvoiced: string;
  salesErrCreditNoteExceeds: string;
  salesErrReallocation: string;

  // -- T-WEB (PHASE-013): the report workspace (report archetype §7) --------
  navReports: string;
  reportsNavWorkspace: string;
  reportWorkspaceTitle: string;
  reportWorkspaceCatalog: string;
  reportWorkspaceNoReport: string;
  reportWorkspaceDateFrom: string;
  reportWorkspaceDateTo: string;
  reportWorkspaceAsOfLabel: string;
  reportWorkspaceLocale: string;
  reportWorkspaceRun: string;
  reportWorkspaceQueued: string;
  reportWorkspaceRunning: string;
  reportWorkspaceStage: string;
  reportWorkspaceStatus: string;
  reportWorkspaceStatusSucceeded: string;
  reportWorkspaceStatusFailed: string;
  reportWorkspaceDuration: string;
  reportWorkspaceTotals: string;
  reportWorkspaceAssertions: string;
  reportWorkspaceAssertionFailed: string;
  reportWorkspaceAsOf: string;
  reportWorkspaceComputedAt: string;
  reportWorkspaceEmpty: string;
  reportWorkspaceSavedViews: string;
  reportWorkspaceSaveView: string;
  reportWorkspaceViewNameAr: string;
  reportWorkspaceViewNameEn: string;
  reportWorkspaceApply: string;
  reportWorkspaceDeleteView: string;
  reportWorkspaceRunHistory: string;
  reportWorkspaceRefresh: string;
  reportWorkspaceBack: string;
  reportWorkspaceExportPdf: string;
  reportWorkspaceExportXlsx: string;
  reportWorkspaceExportCsv: string;
  reportWorkspacePrintPreview: string;
  reportWorkspaceExportBlocked: string;
  reportWorkspaceViewSaved: string;
  reportWorkspaceColReport: string;
  reportWorkspaceNoRuns: string;
}

const ar: Dictionary = {
  appTitle: "منصة الأعمال الشاملة",
  switchLabel: "English",
  signOut: "تسجيل الخروج",
  loading: "جارٍ التحميل...",
  phaseNote: "واجهة المرحلة 003 (PHASE-003) — الدخول والجلسات والشاشات الإدارية عبر وسيط الويب الآمن (BFF).",

  navHome: "الرئيسية",
  navUsers: "المستخدمون والدعوات",
  navSessions: "الجلسات",
  navMfa: "التحقق بخطوتين",
  navRoles: "الأدوار",
  navPassword: "كلمة المرور",

  loginTitle: "تسجيل الدخول",
  loginSubtitle: "أدخل بيانات حسابك للوصول إلى المنصة.",
  loginEmailLabel: "البريد الإلكتروني",
  loginPasswordLabel: "كلمة المرور",
  loginMfaLabel: "رمز التحقق (MFA)",
  loginMfaHint: "ستة أرقام من تطبيق المصادقة.",
  loginMfaShow: "إظهار حقل رمز التحقق",
  loginMfaHide: "إخفاء حقل رمز التحقق",
  loginSubmit: "دخول",
  loginForgotLink: "نسيت كلمة المرور؟",
  loginErrorInvalidCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  loginErrorMfaRequired: "هذا الحساب محمي بالتحقق بخطوتين — أدخل رمز التحقق.",
  loginErrorRateLimited: "محاولات كثيرة — أعد المحاولة بعد {seconds} ثانية.",
  loginErrorAccountLocked: "الحساب مقفل مؤقتًا — أعد المحاولة بعد {seconds} ثانية.",
  loginErrorGeneric: "تعذّر تسجيل الدخول — حاول مرة أخرى.",

  forgotTitle: "استعادة كلمة المرور",
  forgotDescription: "أدخل بريدك الإلكتروني، وستصلك رسالة برابط إعادة التعيين إذا كان الحساب مسجلًا.",
  forgotEmailLabel: "البريد الإلكتروني",
  forgotSubmit: "إرسال رابط الاستعادة",
  forgotSuccess: "إذا كان هذا البريد مسجلًا لدينا فستصله رسالة تحتوي رابط إعادة التعيين.",
  forgotBack: "العودة إلى تسجيل الدخول",

  acceptTitle: "قبول الدعوة",
  acceptTenantLabel: "المنشأة",
  acceptRoleLabel: "الدور",
  acceptEmailLabel: "البريد الإلكتروني المدعو",
  acceptFullNameLabel: "الاسم الكامل",
  acceptPasswordLabel: "كلمة مرور جديدة",
  acceptPasswordHint: "10 أحرف على الأقل.",
  acceptSubmit: "إنشاء الحساب والدخول",
  acceptErrorExpired: "انتهت صلاحية هذه الدعوة.",
  acceptErrorRevoked: "تم إلغاء هذه الدعوة.",
  acceptErrorAccepted: "تم استخدام هذه الدعوة مسبقًا.",
  acceptErrorNotFound: "رابط الدعوة غير صالح.",
  acceptErrorGeneric: "تعذّر قبول الدعوة.",

  homeWelcome: "مرحبًا، {name}",
  homeTenantLabel: "المنشأة النشطة",
  homeSwitchTenant: "تبديل المنشأة",
  homeRoleLabel: "دورك الحالي",
  homePermissionsLabel: "عدد الصلاحيات الممنوحة: {count}",
  homeScreens: "الشاشات الإدارية",

  usersTitle: "المستخدمون والدعوات",
  usersNoPermission: "ليست لديك صلاحية عرض هذه الشاشة.",
  usersColEmail: "البريد الإلكتروني",
  usersColName: "الاسم",
  usersColRole: "الدور",
  usersColStatus: "الحالة",
  usersColLastLogin: "آخر دخول",
  usersNever: "لم يسجل الدخول بعد",
  usersEmpty: "لا يوجد مستخدمون في هذه المنشأة بعد.",
  usersInviteTitle: "دعوة مستخدم",
  usersInviteEmailLabel: "بريد المدعو",
  usersInviteRoleLabel: "الدور عند الانضمام",
  usersInviteSubmit: "إرسال دعوة",
  usersInviteLinkTitle: "رابط القبول (بيئة التطوير — لا يوجد إرسال بريد فعلي):",
  usersInviteExpiresLabel: "تنتهي في:",
  usersInvitationsTitle: "الدعوات",
  usersColExpires: "تنتهي في",
  usersColActions: "إجراءات",
  usersRevoke: "إلغاء",
  usersNoRoles: "لا توجد أدوار متاحة للإسناد.",
  usersEmptyInvitations: "لا توجد دعوات.",

  statusActive: "نشط",
  statusPending: "معلّق",
  statusRevoked: "ملغى",
  statusExpired: "منتهي",
  statusAccepted: "مقبول",
  statusSuspended: "موقوف",

  sessionsTitle: "الجلسات النشطة",
  sessionsHint: "إلغاء أي جلسة يخرج صاحبها فورًا؛ ولإخراج نفسك من كل الأجهزة ألغِ جلساتك واحدة تلو الأخرى.",
  sessionsColUser: "المستخدم",
  sessionsColCreated: "بدأت في",
  sessionsColExpires: "تنتهي في",
  sessionsColLastSeen: "آخر نشاط",
  sessionsColIp: "عنوان IP",
  sessionsRevoke: "إلغاء الجلسة",
  sessionsEmpty: "لا توجد جلسات نشطة.",

  mfaTitle: "التحقق بخطوتين (TOTP)",
  mfaDescription: "اربط تطبيق مصادقة بحسابك، وأكّد الرمز، ثم أنشئ رموز الاستعادة.",
  mfaEnrollTitle: "1) بدء التسجيل",
  mfaEnrollButton: "بدء التسجيل",
  mfaSecretLabel: "المفتاح السري (أدخله يدويًا في تطبيق المصادقة):",
  mfaOtpauthLabel: "بيانات الربط otpauth (محتوى رمز QR):",
  mfaEnrollHint: "أدخل الرمز الحالي من تطبيق المصادقة لتأكيد التسجيل.",
  mfaVerifyTitle: "2) تأكيد الرمز",
  mfaVerifyCodeLabel: "رمز التحقق",
  mfaVerifySubmit: "تأكيد",
  mfaVerified: "تم تفعيل التحقق بخطوتين بنجاح.",
  mfaRecoveryTitle: "3) رموز الاستعادة",
  mfaRecoveryDescription: "تُعرض رموز الاستعادة مرة واحدة فقط — احفظها الآن في مكان آمن.",
  mfaRecoveryGenerate: "إنشاء رموز الاستعادة",
  mfaRecoveryRegenerate: "إعادة إنشاء الرموز",
  mfaInvalidCode: "رمز التحقق غير صحيح.",
  mfaNeedConfirmed: "أكّد التسجيل أولًا ثم أنشئ رموز الاستعادة.",

  rolesTitle: "الأدوار",
  rolesDescription: "استنسخ قالبًا معياريًا لإنشاء دور خاص بمنشأتك.",
  rolesTenantTitle: "أدوار المنشأة",
  rolesTemplatesTitle: "القوالب المعيارية (النظام)",
  rolesColKey: "المفتاح",
  rolesColName: "الاسم",
  rolesColSystem: "دور نظام؟",
  rolesColActions: "إجراءات",
  rolesClone: "استنساخ",
  rolesCloned: "تم إنشاء الدور {name}.",
  rolesYes: "نعم",
  rolesNo: "لا",

  passwordTitle: "تغيير كلمة المرور",
  passwordDescription: "بعد التغيير تُلغى جلساتك الأخرى ويبقى هذا المتصفح مسجلًا.",
  passwordCurrentLabel: "كلمة المرور الحالية",
  passwordNextLabel: "كلمة المرور الجديدة",
  passwordNextHint: "10 أحرف على الأقل.",
  passwordSubmit: "تغيير كلمة المرور",
  passwordSuccess: "تم تغيير كلمة المرور.",
  passwordErrorCurrent: "كلمة المرور الحالية غير صحيحة.",

  errorsForbidden: "ليست لديك صلاحية تنفيذ هذا الإجراء.",
  errorsUnauthorized: "انتهت الجلسة — سجّل الدخول من جديد.",
  errorsValidation: "بيانات غير صالحة — راجع الحقول.",
  errorsNotFound: "العنصر غير موجود.",
  errorsNetwork: "تعذّر الاتصال بالخادم.",
  errorsGeneric: "حدث خطأ غير متوقع.",
  errorsRateLimited: "محاولات كثيرة — أعد المحاولة بعد {seconds} ثانية.",

  navOnboarding: "تهيئة",

  journeyTitle: "مسار أول فاتورة (Journey A)",
  journeyStepProfile: "إكمال ملف المنشأة والتهيئة",
  journeyStepCustomer: "إضافة أول عميل",
  journeyStepInvoice: "إصدار أول فاتورة بيع",
  journeyStepPrint: "طباعة/تصدير الفاتورة",
  journeyDone: "مكتمل",
  journeyTodo: "قيد الانتظار",

  navNotifications: "الإشعارات",
  navBilling: "الاشتراك والفوترة",
  pricingTitle: "الأسعار والخطط",
  pricingSubtitle: "اختر الخطة المناسبة لنشاطك — كل الأسعار والحدود من إعدادات المنصة.",
  pricingPerMonth: "شهرياً",
  pricingFeatures: "المزايا",
  pricingChoose: "اختر هذه الخطة",
  pricingCurrentPlan: "خطتك الحالية",
  pricingLoadError: "تعذّر تحميل الخطط حالياً.",
  pricingConfigNote: "الأسعار معرّفة من الإعدادات (قيم مؤقتة — OQ-002).",
  billingTitle: "الاشتراك والفوترة",
  billingPlanLabel: "الخطة",
  billingStatusLabel: "الحالة",
  billingPeriodLabel: "فترة الاستحقاق",
  billingTrialEndsLabel: "انتهاء فترة التجربة",
  billingGraceEndsLabel: "انتهاء فترة السماح",
  billingReadOnlyBanner: "الحساب للقراءة فقط — سدد المستحقات لاستعادة الكتابة.",
  billingNoSubscription: "لا يوجد اشتراك نشط.",
  billingUsageTitle: "الاستخدام في الفترة الحالية",
  billingCurrent: "الحالي",
  billingLimit: "الحد",
  billingUnlimited: "غير محدود",
  billingHistoryTitle: "سجل الفوترة",
  billingInvoices: "الفواتير",
  billingEvents: "أحداث الفوترة",
  billingNumber: "الرقم",
  billingAmount: "المبلغ",
  billingDue: "تاريخ الاستحقاق",
  billingPaidVia: "طريقة السداد",
  billingCheckout: "متابعة الدفع",
  billingChangePlan: "تغيير الخطة",
  billingCheckoutError: "تعذّر بدء جلسة الدفع.",
  billingOpenInvoicesNote: "اختر خطة لفتح فاتورة وسدادها.",
  notifTitle: "مركز الإشعارات",
  notifUnread: "غير مقروء",
  notifEmpty: "لا توجد إشعارات بعد.",
  notifPreferences: "تفضيلات الإشعارات",
  notifInApp: "داخل التطبيق",
  notifEmail: "البريد الإلكتروني",
  notifMarkRead: "تحديد كمقروء",
  notifLoadError: "تعذّر تحميل الإشعارات.",
  dashWidgetsTitle: "مؤشرات اليوم",
  dashSalesToday: "مبيعات اليوم",
  dashCashToday: "الوضع النقدي",
  dashArOverdue: "ذمم متأخرة",
  dashStockLow: "أصناف منخفضة عن حد الطلب",
  dashOpenReport: "فتح التقرير",
  dashWidgetError: "تعذّر تحميل المؤشر",
  platformManualPaymentTitle: "تسجيل دفع يدوي (A-009)",
  platformRecordPayment: "تسجيل الدفع",
  platformPaymentReason: "سبب التسجيل اليدوي",
  platformPaymentSuccess: "تم تسجيل الدفع وتفعيل الاشتراك.",
  platformPaymentError: "تعذّر تسجيل الدفع.",
  platformNoOpenInvoices: "لا توجد فواتير مستحقة لهذا المستأجر.",
  statusTRIAL: "تجربة",
  statusACTIVE: "نشط",
  statusGRACE: "سماح — قراءة فقط",
  statusSUSPENDED: "موقوف",
  statusPAST_DUE: "متأخر السداد",
  statusOPEN: "مستحقة",
  statusPAID: "مدفوعة",
  statusVOID: "ملغاة",
  navBranches: "الفروع",
  navSettings: "الإعدادات",
  navSupport: "جلسات الدعم",
  navPlatformSection: "إدارة المنصة",
  navPlatformConsole: "المنصة",
  navPlatformAudit: "سجل المنصة",

  // -- PHASE-015 T11: industry templates UI -----------------------------------
  navTemplates: "قوالب الصناعة",
  templatesPageTitle: "قوالب الصناعة",
  templatesPageDescription: "اختر قالب الصناعة للمنشأتك وطبقه أو التبديل بينها بشكل إضافي",
  templatesCurrent: "القالب المطبق حاليًا",
  templatesNone: "لا يوجد قالب مطبق",
  templatesApply: "تطبيق",
  templatesSwitch: "تبديل",
  templatesPreview: "معاينة",
  templatesApplied: "تم تطبيق القالب",
  templatesSwitched: "تم التبديل إلى القالب",
  templatesApplyConfirm: "تطكيد تطبيق القالب؟",
  templatesSwitchNote: "التبديل إضافي فقط؟ لا يمكن إزالة الإعدادات",
  templatesVersion: "الإصدار",
  templatesStatusActive: "متوفر",
  templatesStatusInactive: "غير متوفر",
  onboardingIndustryTitle: "اختر صناعتك",
  onboardingIndustryDescription: "اختر قالب صناعة يناسبك للمنشأة ليتم تعديل الإعدادات",
  onboardingIndustrySelect: "اختر قالبًا",
  onboardingIndustrySkip: "تخطَ",
  onboardingIndustryApplied: "تم تطبيق قالب الصناعة",

  // -- PHASE-016 POS UI ---------------------------------------------------------
  navPosCounter: "نقطة البيع",
  navPosTerminals: "أجهزة نقاط البيع",
  posTerminalsTitle: "أجهزة نقاط البيع",
  posTerminalsDescription: "سجّل الأجهزة ربطه بالفرع والصندوق وحجم الإيصال",
  posTerminalCode: "كود الجهاز",
  posTerminalName: "الاسم",
  posTerminalBranch: "الفرع",
  posTerminalCashAccount: "الصندوق",
  posTerminalReceiptSize: "حجم الإيصال (mm)",
  posTerminalStatus: "الحالة",
  posTerminalRegister: "تسجيل جهاز",
  posTerminalActivate: "تفعيل",
  posTerminalDeactivate: "إيقاف",
  posTerminalNone: "لا توجد أجهزة مسجلة",
  posCounterTitle: "شاشة البيع",
  posCounterScanPlaceholder: "امسح الباركود أو اسم الصنف",
  posCounterCart: "السلة",
  posCounterTotal: "الإجمالي",
  posCounterPay: "دفع",
  posCounterClear: "إلغاء",
  posCounterSalePosted: "تمت البيع ورقم الفاتورة",
  posCounterSaleFailed: "فشل البيع",
  posCounterOfflineBanner: "غير متصل — المبيعات تُحفظ محليًا وتُزنمل بع2f الاتصال",
  posCounterQueued: "عدد المبيعات المؤجلة",
  posCounterEmpty: "السلة فارغة",

  statusInactive: "غير نشط",
  statusClosed: "مغلقة",
  statusIssued: "مُصدر",
  statusRejected: "مرفوض",
  statusConverted: "محوّل",
  statusTerminated: "موقوفة بالإنهاء",
  taxStatusLabel: "حالة التسجيل الضريبي",
  taxStatusRegistered: "مسجّل",
  taxStatusNotRegistered: "غير مسجّل",
  taxStatusDeregistered: "ملغى التسجيل",
  taxNumberLabel: "الرقم الضريبي",
  fiscalStartMonthLabel: "شهر بداية السنة المالية",
  numberingAssignAtLabel: "إسناد أرقام المستندات",
  numberingAssignAtPosting: "عند الترحيل",
  numberingAssignAtApproval: "عند الاعتماد",
  localeArabic: "العربية",
  localeEnglish: "English",

  registerTitle: "إنشاء منشأة جديدة",
  registerSubtitle: "أنشئ حساب مالك ومنشأة جديدة في خطوة واحدة، ثم ابدأ فترة تجريبية.",
  registerBusinessNameLabel: "اسم المنشأة (بالإنجليزية)",
  registerBusinessNameArLabel: "اسم المنشأة (بالعربية، اختياري)",
  registerCountryLabel: "الدولة",
  registerCurrencyLabel: "العملة الأساس (تُشتق من الدولة)",
  registerTemplateLabel: "قالب النشاط",
  registerTaxNumberHint: "مطلوب عند اختيار «مسجّل».",
  registerOwnerSection: "حساب المالك",
  registerOwnerEmailLabel: "بريد المالك الإلكتروني",
  registerOwnerNameLabel: "الاسم الكامل للمالك",
  registerSubmit: "إنشاء المنشأة",
  registerSuccessTitle: "تم إنشاء المنشأة بنجاح",
  registerSuccessBody: "راجع بريدك الإلكتروني ({email}) ثم سجّل الدخول. تنتهي الفترة التجريبية في {date}.",
  registerGoLogin: "سجّل الدخول",
  registerLoginPrompt: "لديك حساب بالفعل؟",
  registerErrorEmailTaken: "هذا البريد الإلكتروني مسجّل مسبقًا — سجّل الدخول بدلًا من إنشاء حساب جديد.",
  registerErrorOptions: "تعذّر تحميل خيارات التسجيل (الدول والقوالب) — أعد تحميل الصفحة.",

  onboardingTitle: "تهيئة مساحة العمل",
  onboardingSubtitle:
    "تُنشئ التهيئة أدوار المنشأة ودليل الحسابات وسياسات الترقيم الافتراضية. العملية آمنة للتكرار: إعادة تشغيلها لا تُنشئ نسخًا مكررة.",
  onboardingProvisionButton: "إعداد مساحة العمل",
  onboardingResultTitle: "نتيجة التهيئة",
  onboardingRolesLabel: "الأدوار",
  onboardingAccountsLabel: "الحسابات",
  onboardingPurposesLabel: "أغراض الحسابات",
  onboardingSettingsLabel: "الإعدادات",
  onboardingCreatedCount: "جديد: {created} — موجود مسبقًا: {existing}",
  onboardingZeroDuplicatesHint:
    "لم يُنشأ أي عنصر جديد — مساحة العمل مهيأة مسبقًا، وهذا يؤكد أن إعادة التشغيل لا تُنتج تكرارات.",
  onboardingGoHome: "الذهاب إلى الرئيسية",
  onboardingGoBranches: "إدارة الفروع",

  branchesTitle: "الفروع",
  branchesEmpty: "لا توجد فروع بعد.",
  branchesColCode: "الرمز",
  branchesColName: "الاسم",
  branchesColNameAr: "الاسم العربي",
  branchesCreateTitle: "إنشاء فرع",
  branchesCodeLabel: "رمز الفرع",
  branchesNameLabel: "اسم الفرع",
  branchesNameArLabel: "الاسم العربي (اختياري)",
  branchesCreateSubmit: "إضافة الفرع",
  branchesActivate: "تنشيط",
  branchesDeactivate: "تعطيل",
  branchesErrorCodeTaken: "رمز الفرع مستخدم مسبقًا في هذه المنشأة.",

  settingsTitle: "إعدادات المنشأة",
  settingsProfileTitle: "الملف التعريفي",
  settingsNameLabel: "الاسم (بالإنجليزية)",
  settingsNameArLabel: "الاسم العربي",
  settingsTimezoneLabel: "المنطقة الزمنية",
  settingsProfileSubmit: "حفظ الملف",
  settingsProfileSaved: "تم حفظ الملف التعريفي.",
  settingsGeneralTitle: "الإعدادات العامة",
  settingsDefaultLocaleLabel: "اللغة الافتراضية",
  settingsNumeralSystemLabel: "نظام الأرقام",
  settingsNumeralLatn: "أرقام غربية (123)",
  settingsNumeralArab: "أرقام عربية (١٢٣)",
  settingsHijriLabel: "عرض التاريخ الهجري",
  settingsHijriHint: "تراكب عرض فقط — السنوات المالية تبقى ميلادية.",
  settingsFiscalNumberingTitle: "التقويم المالي والترقيم",
  settingsSupportTitle: "الدعم",
  settingsSupportOptInLabel: "السماح بجلسات الدعم",
  settingsSupportOptInWarning:
    "تنبيه: تمكين هذا الخيار يسمح لفريق المنصة بفتح جلسات دعم محدودة الوقت ومُدقّقة لقراءة بيانات منشأتك.",
  settingsTaxTitle: "التسجيل الضريبي",
  settingsTaxPairHint:
    "يُتحقق من الحالة والرقم معًا: الرقم مطلوب أثناء «مسجّل» وممنوع في غير ذلك.",
  settingsSave: "حفظ",
  settingsSaved: "تم الحفظ.",
  settingsErrorInvalidValue: "قيمة غير صالحة لهذا الإعداد.",

  supportSessionsTitle: "جلسات الدعم",
  supportSessionsHint:
    "هذه الجلسات التي يفتحها فريق المنصة عند طلبك أو بموافقتك؛ يمكنك إنهاء أي جلسة نشطة قائمة على الموافقة في أي وقت.",
  supportColReason: "السبب",
  supportColTicket: "مرجع التذكرة",
  supportColOpened: "بدأت",
  supportColClosed: "أُغلقت",
  supportColOptIn: "بالموافقة؟",
  supportEmpty: "لا توجد جلسات دعم.",
  supportTerminate: "إنهاء الجلسة",
  supportErrorAccessDenied: "فتح جلسة الدعم يتطلب موافقة المنشأة أو مرجع تذكرة حادثة معلنًا.",
  supportErrorExpired: "انتهت صلاحية جلسة الدعم.",
  supportErrorNotActive: "هذه الجلسة ليست نشطة.",

  tenancyErrorFeatureNotEntitled: "هذه الميزة غير مفعّلة لمنشأتك.",
  tenancyErrorDependenciesMissing: "تفعيل الميزة يتطلب مفاتيح تابعة غير ممنوحة بعد: {keys}",

  platformConsoleTitle: "لوحة إدارة المنصة",
  platformNoAccess: "هذه منطقة إدارة المنصة — متاحة فقط لفريق عمليات المنصة.",
  platformTenantBadge: "منصة",
  platformSearchLabel: "البحث عن منشأة",
  platformSearchSubmit: "بحث",
  platformColTenant: "المنشأة",
  platformColCountry: "الدولة",
  platformColPlan: "الخطة",
  platformColCreated: "أُنشئت",
  platformEmpty: "لا توجد منشآت مطابقة.",
  platformProfileTitle: "الملف",
  platformPlanTitle: "الخطة والاشتراك",
  platformPlanCurrentLabel: "الخطة الحالية",
  platformPlanNone: "لا يوجد اشتراك نشط.",
  platformPlanAssignTitle: "تعيين خطة",
  platformPlanLabel: "الخطة",
  platformTrialDaysLabel: "أيام التجربة (اختياري)",
  platformPlanSubmit: "تعيين الخطة",
  platformPlanAssigned: "تم تعيين الخطة «{plan}» — المفاتيح الممنوحة: {count}.",
  platformEntitlementsTitle: "الميزات الممنوحة",
  platformColFeatureKey: "المفتاح",
  platformColSource: "المصدر",
  platformEntitlementsEmpty: "لا توجد ميزات ممنوحة.",
  platformGrantTitle: "منح ميزة",
  platformGrantFeatureLabel: "مفتاح الميزة",
  platformGrantSourceLabel: "المصدر",
  platformGrantExpiresLabel: "تاريخ الانتهاء",
  platformGrantExpiresHint: "مطلوب للمنح اليدوي (MANUAL).",
  platformGrantReasonLabel: "السبب",
  platformGrantSubmit: "منح",
  platformGrantDone: "تم منح الميزة.",
  platformRevoke: "سحب",
  platformRevokeReasonLabel: "سبب السحب",
  platformGrantExpiryRequired: "المنح اليدوي يتطلب تاريخ انتهاء صريحًا.",
  platformGrantUnknownKey: "مفتاح ميزة غير معروف.",
  platformMembershipsTitle: "الأعضاء",
  platformBranchesTitle: "فروع المنشأة",
  platformLifecycleTitle: "إيقاف واستعادة",
  platformReasonLabel: "السبب (مطلوب)",
  platformSuspendButton: "إيقاف المنشأة",
  platformRestoreButton: "استعادة المنشأة",
  platformSuspendDone: "تم إيقاف المنشأة — أُنهيت {count} جلسة مستخدم.",
  platformRestoreDone: "تمت استعادة المنشأة إلى الحالة النشطة.",
  platformSupportTitle: "جلسات الدعم",
  platformSupportOpenTitle: "فتح جلسة دعم",
  platformSupportReasonLabel: "السبب",
  platformSupportTicketLabel: "مرجع التذكرة (اختياري)",
  platformSupportHoursLabel: "المدة بالساعات (1-4)",
  platformSupportOpenSubmit: "فتح الجلسة",
  platformSupportClose: "إغلاق",
  platformSupportCloseReasonLabel: "سبب الإغلاق",
  platformSupportSessionLabel: "الجلسة النشطة",
  platformReadDataTitle: "قراءة بيانات المنشأة",
  platformReadResourceLabel: "المورد",
  platformReadSubmit: "قراءة",
  platformNoActiveSession: "لا توجد جلسة دعم نشطة — افتح جلسة أولًا.",
  resourceUsers: "المستخدمون",
  resourceMemberships: "العضويات",
  resourceRoles: "الأدوار",
  resourceBranches: "الفروع",
  resourceSettings: "الإعدادات",
  resourceEntitlements: "الميزات",
  resourceSubscription: "الاشتراك",
  resourceAccounts: "الحسابات",
  resourceAuditEvents: "أحداث التدقيق",

  platformAuditTitle: "سجل تدقيق المنصة",
  platformAuditPlatformOnly: "أحداث المنصة فقط",
  platformAuditTenantFilter: "معرّف المنشأة (اختياري)",
  platformAuditActionFilter: "الإجراء (اختياري)",
  platformAuditApply: "تصفية",
  platformAuditColAt: "الوقت",
  platformAuditColAction: "الإجراء",
  platformAuditColActor: "الفاعل",
  platformAuditViaPlatform: "عبر مشرف المنصة",
  platformAuditNextPage: "الصفحة التالية",
  platformAuditEmpty: "لا توجد أحداث.",
  platformErrorInvalidTransition: "حالة المنشأة لا تسمح بهذا الانتقال.",
  platformErrorPlanNotFound: "خطة غير معروفة.",

  shellSkipToContent: "تخطَّ إلى المحتوى",
  shellCommandSearch: "ابحث أو انتقل إلى…",
  shellShortcutsTitle: "اختصارات لوحة المفاتيح",
  shellClose: "إغلاق",
  shellMore: "المزيد",
  statusOffboarded: "تم إنهاء الخدمة",
  wizardStepOf: "الخطوة {current} من {total}",
  platformBackToConsole: "العودة إلى لوحة المنصة",
  rolesEmpty: "لا توجد أدوار بعد.",
  retryLabel: "إعادة المحاولة",

  // -- P6-T11a: shared labels -------------------------------------------------
  commonSave: "حفظ",
  commonCreate: "إنشاء",
  commonCancel: "إلغاء",
  commonOpen: "فتح",
  commonClear: "مسح",
  commonConfirm: "تأكيد",
  commonUnsavedChanges: "توجد تغييرات غير محفوظة — هل تريد المتابعة؟",
  commonVersionConflict: "تم تعديل السجل من مستخدم آخر — أعد التحميل وحاول مجددًا.",
  statusDraft: "مسودة",
  statusArchived: "مؤرشف",
  kindLabel: "النوع",
  kindFilterAll: "الكل",
  colStatus: "الحالة",
  colName: "الاسم",
  listNextPage: "الصفحة التالية",
  listPrevPage: "الصفحة السابقة",
  listSearchLabel: "بحث",
  namePreviewLabel: "معاينة الاسم",

  // -- P6-T11a: navigation + breadcrumbs ----------------------------------------
  navPartners: "الجهات",
  navPartnersDirectory: "دليل الجهات",
  navPartnersNew: "جهة جديدة",
  navOpeningBalances: "الأرصدة الافتتاحية",
  navInventory: "المخزون",
  navItems: "الأصناف",
  navItemsNew: "صنف جديد",
  navPriceLists: "قوائم الأسعار",
  navImport: "استيراد وتصدير",

  // -- PHASE-007: accounting -----------------------------------------------------
  navAccountingCoa: "دليل الحسابات",
  navAccountingJournals: "قيود اليومية",
  navAccountingGl: "دفتر الأستاذ العام",
  navAccountingPeriods: "الفترات المالية",
  navAccountingApprovals: "الاعتمادات",
  navAccountingRates: "أسعار الصرف",
  accountingTitle: "المحاسبة",
  accountingJournalsTitle: "قيود اليومية",
  accountingJournalsNew: "قيد جديد",
  accountingJournalsEmpty: "لا قيود بعد",
  accountingColEntryNo: "رقم القيد",
  accountingColEntryDate: "التاريخ",
  accountingColCurrency: "العملة",
  accountingColTotal: "الإجمالي",
  accountingColStatus: "الحالة",
  accountingColCode: "الرمز",
  accountingColName: "الاسم",
  accountingColType: "النوع",
  accountingColPostable: "قابل للترحيل",
  accountingColDebit: "مدين",
  accountingColCredit: "دائن",
  accountingColBalance: "الرصيد",
  accountingSubmit: "إرسال",
  accountingApprove: "اعتماد",
  accountingPost: "ترحيل",
  accountingReverse: "عكس",
  accountingCancel: "إلغاء",
  accountingSaveDraft: "حفظ المسودة",
  accountingAddLine: "إضافة سطر",
  accountingRemoveLine: "حذف السطر",
  accountingDuplicateLine: "تكرار السطر",
  accountingPartnerRequired: "مطلوب تحديد الجهة لهذا الحساب",
  accountingBalanced: "متوازن",
  accountingUnbalanced: "القيد غير متوازن",
  accountingDifference: "الفرق",
  accountingLineTotal: "السطر",
  accountingMemo: "البيان",
  accountingCostCenter: "مركز التكلفة",
  accountingPartner: "الجهة",
  accountingTaxCode: "الرمز الضريبي",
  accountingAccount: "الحساب",
  accountingDescription: "الوصف",
  accountingCoaTitle: "دليل الحسابات",
  accountingCoaEmpty: "لا حسابات",
  accountingPurposesTitle: "أغراض الحسابات",
  accountingPurposesEmpty: "لا ارتباطات أغراض",
  accountingGlTitle: "دفتر الأستاذ العام",
  accountingGlEmpty: "لا حركات",
  accountingGlDrill: "فتح القيد",
  accountingPeriodsTitle: "الفترات المالية",
  accountingPeriodsEmpty: "لا فترات",
  accountingYearsTitle: "السنوات المالية",
  accountingCreateYear: "إنشاء سنة مالية",
  accountingYearName: "اسم السنة",
  accountingYearStart: "تاريخ البداية",
  accountingYearEnd: "تاريخ النهاية",
  accountingSoftClose: "إغلاق مؤقت",
  accountingLock: "إقفال",
  accountingReopen: "إعادة فتح",
  accountingReopenReason: "سبب إعادة الفتح",
  accountingReopenPrompt: "أدخل سبب إعادة الفتح (إلزامي)",
  accountingChecklist: "قائمة فحص الإغلاق",
  accountingChecklistOk: "سليم",
  accountingChecklistBroken: "مخالف",
  accountingChecklistNotRun: "لم يُفحص",
  accountingChecklistNotApplicable: "غير منطبق بعد",
  accountingApprovalsTitle: "بانتظار الموافقة",
  accountingApprovalsEmpty: "لا عناصر بانتظار الموافقة",
  accountingApprovalsSelfHint: "لا يمكنك اعتماد قيدك الخاص",
  accountingApprovalsSubmittedBy: "مقدم بواسطة",
  accountingApprovalsTotalBase: "الإجمالي (بالعملة الأساسية)",
  accountingApprovalsPreview: "معاينة",
  accountingReject: "رفض",
  accountingRatesTitle: "أسعار الصرف",
  accountingRatesEmpty: "لا أسعار",
  accountingRatesCurrency: "العملة",
  accountingRatesDate: "التاريخ",
  accountingRatesRate: "السعر",
  accountingRatesSave: "حفظ السعر",
  accountingPostedAt: "تاريخ الترحيل",
  accountingSource: "المصدر",
  accountingPreviewTitle: "معاينة القيد",
  statusPendingApproval: "بانتظار الاعتماد",
  statusApproved: "معتمد",
  statusPosted: "مرحّل",
  statusReversed: "معكوس",
  statusCancelled: "ملغى",
  accountingStatusOpen: "مفتوحة",
  accountingStatusSoftClosed: "مغلقة مؤقتاً",
  accountingStatusLocked: "مقفلة",
  accountingKindRegular: "عادية",
  accountingKindOpening: "افتتاحية",
  accountingKindClosing: "ختامية",
  accountingSearchPlaceholder: "ابحث بالرمز أو الاسم…",
  accountingNewAccount: "حساب جديد",
  accountingAccountParent: "الحساب الأب",
  accountingAccountCurrency: "عملة الحساب (اختياري)",
  accountingIsGroup: "حساب تجميعي (غير قابل للترحيل)",
  accountingMapPurpose: "ربط غرض بحساب",
  accountingPurposeKey: "الغرض",
  accountingPurposeAccount: "الحساب",
  accountingActiveFrom: "ساري من",
  accountingLines: "سطور القيد",
  accountingColAmount: "المبلغ",
  accountingColBase: "المبلغ بالعملة الأساسية",
  accountingColDirection: "الاتجاه",
  accountingColPeriod: "الفترة",
  accountingReference: "المرجع",
  accountingExchangeRate: "سعر الصرف",
  accountingRecurringTitle: "القيود الدورية",
  accountingRecurringNew: "قيد دوري جديد",
  accountingRecurringEmpty: "لا قيود دورية",
  accountingRecurringSchedule: "التكرار",
  accountingRecurringNextRun: "التشغيل القادم",
  accountingRecurringAmountPolicy: "سياسة المبلغ",
  accountingRecurringFixed: "ثابت",
  accountingRecurringReenter: "إعادة إدخال",
  accountingRecurringPause: "إيقاف مؤقت",
  accountingRecurringActivate: "تنشيط",
  accountingRecurringGenerateDue: "توليد القيود المستحقة",
  accountingPoliciesTitle: "سياسات الاعتماد",
  accountingPoliciesEmpty: "لا سياسات معرّفة",
  accountingPolicyMode: "النمط",
  accountingPolicyThreshold: "الحد (بالعملة الأساسية)",
  accountingRunAr: "تشغيل مطابقة العملاء",
  accountingRunAp: "تشغيل مطابقة الموردين",
  accountingReconStatusOk: "مطابقة سليمة",
  accountingReconStatusBroken: "مطابقة مخالفة",
  accountingPostOpening: "ترحيل الأرصدة الافتتاحية",
  accountingPostOpeningConfirm: "سيتم ترحيل الأرصدة الافتتاحية مرة واحدة عبر الفترة الافتتاحية. هل تريد المتابعة؟",
  obPostReadyNote: "المسودات جاهزة — الترحيل يتم مرة واحدة عبر الفترة الافتتاحية للسنة المالية المحددة.",
  accountingYearEndExecute: "تنفيذ إقفال السنة",
  accountingYearEndReverse: "عكس إقفال السنة",
  accountingYearEndConfirm: "سيتم إنشاء قيد الإقفال النظامي للسنة. هل تريد المتابعة؟",
  accountingMovementsTitle: "حركات الحساب",
  accountingRegisterTitle: "سجل اليومية",
  accountingSelectAccount: "اختر حساباً",
  accountingFromDate: "من تاريخ",
  accountingToDate: "إلى تاريخ",
  accountingReversalDate: "تاريخ القيد العكسي",
  accountingReversalReason: "سبب العكس",
  accountingSoftClosePrompt: "سبب الترحيل في فترة مغلقة مؤقتاً (اختياري)",
  accountingRateHint: "السعر = وحدات العملة الأساسية مقابل 1 من العملة الأجنبية",
  accountingErrEntryNotBalanced: "القيد غير متوازن — مجموع المدين يجب أن يساوي مجموع الدائن.",
  accountingErrPeriodLocked: "الفترة المالية مقفلة — لا يمكن الترحيل فيها.",
  accountingErrAccountNotPostable: "الحساب غير قابل للترحيل (أرشيف أو تجميعي).",
  accountingErrPurposeNotMapped: "الغرض غير مربوط بأي حساب نشط — لا ترحيل احتياطي إطلاقاً.",
  accountingErrMissingPartner: "سطور حسابات العملاء/الموردين تتطلب تحديد الجهة.",
  accountingErrMissingFxRate: "لا يوجد سعر صرف للتاريخ المحدد.",
  accountingErrAlreadyPosted: "تم ترحيل هذا المستند مسبقاً.",
  accountingErrAlreadyReversed: "تم عكس هذا القيد مسبقاً.",
  accountingErrApprovalLimit: "المبلغ يتجاوز حد الاعتماد المسموح.",
  accountingErrSelfApproval: "لا يمكنك اعتماد مستند أنشأته بنفسك.",
  accountingErrImmutable: "القيود المرحّلة غير قابلة للتعديل — التصحيح بالعكس فقط.",
  accountingErrState: "حالة المستند لا تسمح بهذه العملية.",
  accountTypeAsset: "أصول",
  accountTypeLiability: "التزامات",
  accountTypeEquity: "حقوق ملكية",
  accountTypeRevenue: "إيرادات",
  accountTypeExpense: "مصروفات",
  accountingPostableYes: "قابل للترحيل",
  accountingPostableNo: "تجميعي",
  accountingPurposesHint: "غرض واحد نشط لكل مفتاح — المحرك يفشل مغلقاً عند أي غرض غير مربوط (لا ترحيل احتياطي).",

  // -- T14-UI: PHASE-008 treasury --------------------------------------------------
  navTreasury: "الخزينة",
  navTreasuryAccounts: "الحسابات النقدية",
  navTreasuryReceipts: "سندات القبض",
  navTreasuryPayments: "سندات الصرف",
  navTreasuryExpenses: "المصروفات",
  navTreasuryTransfers: "التحويلات النقدية",
  navTreasuryShifts: "ورديات الصندوق",
  navTreasuryBankRec: "التسوية البنكية",
  treasuryAccountsTitle: "الحسابات النقدية",
  treasuryAccountsEmpty: "لا حسابات نقدية بعد — افتح أول حساب.",
  treasuryAccountOpenTitle: "فتح حساب نقدي",
  treasuryAccountName: "الاسم (إنجليزي)",
  treasuryAccountNameAr: "الاسم (عربي)",
  treasuryAccountType: "نوع الحساب",
  treasuryAccountTypeCash: "نقدي",
  treasuryAccountTypeBank: "بنكي",
  treasuryAccountTypePetty: "الصندوق النقدي الصغير",
  treasuryAccountGlAccount: "الحساب المقابل في دليل الحسابات",
  treasuryAccountCurrency: "العملة",
  treasuryAccountBranch: "الفرع (اختياري)",
  treasuryColGlCode: "رمز الحساب المقابل",
  treasuryAccountBalance: "الرصيد",
  treasuryColMovements: "عدد الحركات",
  treasuryAccountCreatedToast: "تم فتح الحساب النقدي.",
  treasuryAccountCloseBtn: "إغلاق الحساب",
  treasuryAccountCloseReason: "سبب الإغلاق",
  treasuryAccountClosedToast: "تم إغلاق الحساب النقدي.",
  treasuryAccountOpenedAt: "تاريخ الفتح",
  treasuryAccountClosedAt: "تاريخ الإغلاق",
  treasuryAccountMovementsTitle: "حركات الحساب النقدي",
  treasuryAccountMovementsEmpty: "لا حركات بعد.",
  treasuryColDirectionIn: "قبض",
  treasuryColDirectionOut: "صرف",
  treasuryColBaseAmount: "المبلغ بالعملة الأساسية",
  treasuryColValueDate: "تاريخ القيمة",
  treasuryColRate: "سعر الصرف",
  treasuryColSource: "المصدر",
  treasuryColMemo: "البيان",
  treasuryMethodCash: "نقداً",
  treasuryMethodBank: "تحويل بنكي",
  treasuryMethodCheque: "شيك",
  treasuryMethodCard: "بطاقة",
  treasuryMethodTransfer: "حوالة",
  treasuryReceiptsTitle: "سندات القبض",
  treasuryReceiptsEmpty: "لا سندات قبض بعد.",
  treasuryReceiptsNew: "سند قبض جديد",
  treasuryPaymentsTitle: "سندات الصرف",
  treasuryPaymentsEmpty: "لا سندات صرف بعد.",
  treasuryPaymentsNew: "سند صرف جديد",
  treasuryColDocNo: "رقم السند",
  treasuryColPartner: "الجهة",
  treasuryColMethod: "طريقة الدفع",
  treasuryColAmount: "المبلغ",
  treasuryColAllocated: "المخصص",
  treasuryColFx: "فرق العملة",
  treasuryColPayer: "الدافع",
  treasuryColPayee: "المستفيد",
  treasuryDocCashAccount: "الحساب النقدي",
  treasuryDocPartner: "الجهة",
  treasuryDocMethod: "طريقة الدفع",
  treasuryDocCurrency: "العملة",
  treasuryDocAmount: "المبلغ",
  treasuryDocRate: "سعر الصرف (اختياري)",
  treasuryDocRateHint: "اتركه فارغاً لاستخدام سعر تاريخ القيمة",
  treasuryDocValueDate: "تاريخ القيمة",
  treasuryDocReference: "المرجع",
  treasuryDocDescription: "الوصف",
  treasuryDocDescriptionAr: "الوصف (عربي)",
  treasuryDocCreatedToast: "تم إنشاء السند.",
  treasuryDocDetailTitle: "تفاصيل السند",
  treasuryDocPostedToast: "تم ترحيل السند {no} — القيد {entry}.",
  treasuryDocReverseToast: "تم عكس السند.",
  treasuryDocReverseDate: "تاريخ القيد العكسي",
  treasuryDocReverseReason: "سبب العكس",
  treasuryDocCancelToast: "تم إلغاء السند.",
  treasuryDocOnAccount: "المتبقي على الحساب",
  treasuryDocJournalNo: "رقم القيد",
  treasuryDocSideHint: "سندات القبض تُخصص بنود العملاء (المدينين)، وسندات الصرف تُخصص بنود الموردين (الدائنين).",
  treasuryCancelReason: "سبب الإلغاء",
  treasuryOpenItemsTitle: "البنود المفتوحة",
  treasuryAllocationsTitle: "تخصيص السند",
  treasuryAllocationsEmpty: "لا بنود مفتوحة لهذه الجهة.",
  treasuryAllocationsHint: "خصّص المبلغ على البنود المفتوحة — المتبقي يُرحّل على الحساب.",
  treasuryAllocationSuggestBtn: "اقتراح تخصيص (الأقدم أولاً)",
  treasuryAllocationSuggestToast: "تم تطبيق الاقتراح على {count} بنداً.",
  treasuryAllocationColOutstanding: "المتبقي",
  treasuryAllocationTotals: "ملخص التخصيص",
  treasuryAllocationTotalAllocated: "إجمالي المخصص",
  treasuryAllocationRemainder: "غير المخصص",
  treasuryAllocationOnAccountHint: "المبلغ غير المخصص يُرحّل على حساب الجهة.",
  treasuryAllocationOverError: "مجموع التخصيص يتجاوز مبلغ السند.",
  treasuryAllocationSaveBtn: "حفظ التخصيص",
  treasuryAllocationSavedToast: "تم حفظ التخصيص.",
  treasuryAllocationReloadBtn: "تحديث البنود",
  treasuryExpensesTitle: "المصروفات",
  treasuryExpensesEmpty: "لا مصروفات بعد.",
  treasuryExpenseClaimNew: "تسجيل مصروف",
  treasuryExpenseCategoriesTitle: "فئات المصروفات",
  treasuryExpenseCategoriesEmpty: "لا فئات بعد — أنشئ أول فئة.",
  treasuryExpenseCategoryNew: "فئة جديدة",
  treasuryExpenseCategoryCode: "رمز الفئة",
  treasuryExpenseCategoryAccount: "حساب المصروف",
  treasuryExpenseCategoryApproval: "نمط الاعتماد",
  treasuryExpenseApprovalNone: "بدون اعتماد",
  treasuryExpenseApprovalSingle: "معتمد واحد",
  treasuryExpenseCategoryCreatedToast: "تم إنشاء الفئة.",
  treasuryExpenseCreatedToast: "تم تسجيل المصروف.",
  treasuryExpenseReceiptNote: "إرفاق ملفات الإيصالات يصل مع مساحة الملفات في مرحلة لاحقة — أدخل معرف ملف الإيصال مباشرة إن وُجد.",
  treasuryExpenseReceiptFileId: "معرف ملف الإيصال (اختياري)",
  treasuryExpenseColNo: "رقم المصروف",
  treasuryExpenseColPayee: "المستفيد",
  treasuryExpenseColCategory: "الفئة",
  treasuryTransfersTitle: "التحويلات النقدية",
  treasuryTransfersEmpty: "لا تحويلات بعد.",
  treasuryTransferNew: "تحويل جديد",
  treasuryTransferFrom: "من حساب",
  treasuryTransferTo: "إلى حساب",
  treasuryTransferCreatedToast: "تم إنشاء التحويل.",
  treasuryTransferPostedToast: "تم ترحيل التحويل.",
  treasuryTransferCancelledToast: "تم إلغاء التحويل.",
  treasuryTransferSameAccountError: "لا يمكن التحويل إلى الحساب نفسه.",
  treasuryColFrom: "من",
  treasuryColTo: "إلى",
  treasuryColNo: "الرقم",
  treasuryColFee: "الرسوم",
  treasuryShiftsTitle: "ورديات الصندوق",
  treasuryShiftsEmpty: "لا ورديات بعد.",
  treasuryShiftOpenTitle: "فتح وردية",
  treasuryShiftOpenBtn: "فتح الوردية",
  treasuryShiftOpeningAmount: "العهدة الافتتاحية",
  treasuryShiftCreatedToast: "تم فتح الوردية.",
  treasuryShiftStatusOpen: "مفتوحة",
  treasuryShiftStatusClosed: "مغلقة",
  treasuryShiftStatusCancelled: "ملغاة",
  treasuryShiftColShiftNo: "رقم الوردية",
  treasuryShiftColOpenedAt: "تاريخ الفتح",
  treasuryShiftColClosedAt: "تاريخ الإغلاق",
  treasuryShiftColCapturedIn: "القبض المُسجّل",
  treasuryShiftColCapturedOut: "الصرف المُسجّل",
  treasuryShiftExpected: "المتوقع",
  treasuryShiftCounted: "المعدود",
  treasuryShiftDifference: "الفرق",
  treasuryShiftVarianceJournal: "قيد فرق الوردية",
  treasuryShiftSupervisor: "المشرف",
  treasuryShiftSupervisorPin: "رمز المشرف",
  treasuryShiftSupervisorHint: "مطلوب عند تجاوز الفرق حد التسامح",
  treasuryShiftReason: "سبب الإغلاق",
  treasuryShiftCloseToast: "تم إغلاق الوردية.",
  treasuryShiftCancelBtn: "إلغاء الوردية",
  treasuryShiftCancelledToast: "تم إلغاء الوردية.",
  treasuryShiftPanelTitle: "وردية الصندوق",
  treasuryShiftCaptureTitle: "تسجيل حركة نقدية",
  treasuryShiftCaptureHint: "سجّل الإيداعات والمصروفات النقدية خلال الوردية.",
  treasuryShiftCaptureBtn: "تسجيل",
  treasuryShiftCloseTitle: "إغلاق الوردية",
  treasuryShiftCloseBtn: "إغلاق",
  treasuryShiftBalanced: "مطابق للعدّ",
  treasuryShiftVarianceNote: "الفرق لا يساوي صفراً — أدخل السبب، وبيانات المشرف عند تجاوز حد التسامح.",
  treasuryShiftClosedNote: "الوردية مغلقة — الملخص للعرض فقط.",
  treasuryBankRecTitle: "التسوية البنكية",
  treasuryBankRecEmpty: "لا كشوف بعد — استورد أول كشف.",
  treasuryBankRecImportTitle: "استيراد كشف حساب",
  treasuryBankRecAdapter: "محول الاستيراد",
  treasuryBankRecFile: "الملف",
  treasuryBankRecFileHint: "ملف CSV أو Excel",
  treasuryBankRecPeriodStart: "بداية الفترة",
  treasuryBankRecPeriodEnd: "نهاية الفترة",
  treasuryBankRecMappingHint: "تخطيط الأعمدة — اختياري مع المؤشر العام",
  treasuryBankRecMappingDate: "عمود التاريخ",
  treasuryBankRecMappingAmount: "عمود المبلغ",
  treasuryBankRecMappingReference: "عمود المرجع",
  treasuryBankRecMappingDescription: "عمود البيان",
  treasuryBankRecImportBtn: "استيراد الكشف",
  treasuryBankRecImportedToast: "تم استيراد الكشف.",
  treasuryBankRecStatementsTitle: "كشوف الحساب",
  treasuryBankRecColFile: "الملف",
  treasuryBankRecColPeriod: "الفترة",
  treasuryBankRecColLines: "عدد السطور",
  treasuryBankRecColImportedAt: "تاريخ الاستيراد",
  treasuryBankRecStatusImported: "مستورد",
  treasuryBankRecStatusReconciled: "مسوّى",
  treasuryBankRecOpeningBalance: "الرصيد الافتتاحي",
  treasuryBankRecClosingBalance: "الرصيد الختامي",
  treasuryBankRecSelectStatement: "اختر كشفاً من القائمة للعمل على سطوره.",
  treasuryBankRecLinesTitle: "سطور الكشف",
  treasuryBankRecColLineNo: "السطر",
  treasuryBankRecColMatchState: "حالة المطابقة",
  treasuryBankRecMatched: "مطابق",
  treasuryBankRecUnmatched: "غير مطابق",
  treasuryBankRecMatchAuto: "تلقائي",
  treasuryBankRecMatchManual: "يدوي",
  treasuryBankRecAutoMatchBtn: "مطابقة تلقائية",
  treasuryBankRecAutoMatchToast: "تمت مطابقة {count} سطراً.",
  treasuryBankRecManualMatch: "مطابقة يدوية",
  treasuryBankRecMatchMovement: "الحركة المطابقة",
  treasuryBankRecUnmatchBtn: "إزالة المطابقة",
  treasuryBankRecMatchedToast: "تم تحديث المطابقة.",
  treasuryBankRecReconcileBtn: "تسوية الكشف",
  treasuryBankRecReconcileHint: "التسوية تُقفل فترة الكشف لهذا الحساب.",
  treasuryBankRecReconciledToast: "تمت التسوية وقُفلت الفترة.",
  treasuryBankRecAgingTitle: "التقادم — العناصر غير المطابقة",
  treasuryBankRecAgingAsOf: "تاريخ احتساب التقادم",
  treasuryBankRecUnmatchedLinesTitle: "سطور كشف غير مطابقة",
  treasuryBankRecUnmatchedMovementsTitle: "حركات دفتر غير مطابقة",
  treasuryBankRecColAgeDays: "العمر (أيام)",
  treasuryBankRecLoadAgingBtn: "عرض التقادم",
  treasuryBankRecCashCheckTitle: "فحص مطابقة النقدية",
  treasuryBankRecCashCheckAsOf: "كما في تاريخ",
  treasuryBankRecCashCheckBtn: "تشغيل الفحص",
  treasuryBankRecCashCheckOk: "النقدية مطابقة — لا فرق.",
  treasuryBankRecCashCheckBroken: "فرق في مطابقة النقدية.",
  treasuryBankRecColControlBalance: "رصيد حساب الرقابة",
  treasuryBankRecColSubledgerBalance: "رصيد السجل المساعد",
  treasuryBankRecColDiffCount: "عدد الفروقات",
  treasuryBankRecFilterAccount: "تصفية بالحساب النقدي",
  treasuryErrAccountExists: "يوجد حساب نقدي بهذا الاسم مسبقاً.",
  treasuryErrAccountClosed: "الحساب النقدي مغلق — لا يستقبل مستندات جديدة.",
  treasuryErrAccountNotCloseable: "لا يمكن إغلاق هذا الحساب في وضعه الحالي.",
  treasuryErrCurrencyMismatch: "عملة الحساب النقدي لا تطابق عملة المستند.",
  treasuryErrTypeInvalid: "نوع الحساب النقدي غير صالح.",
  treasuryErrInvalidAmount: "المبلغ غير صالح — يجب أن يكون رقماً موجباً.",
  treasuryErrDocState: "حالة المستند لا تسمح بهذه العملية.",
  treasuryErrMissingFxRate: "لا يوجد سعر صرف للتاريخ المحدد.",
  treasuryErrAllocationExceedsDoc: "مجموع التخصيصات يتجاوز مبلغ السند.",
  treasuryErrAllocationExceedsItem: "التخصيص يتجاوز المتبقي من البند المفتوح.",
  treasuryErrOpenItemCurrency: "عملة البند المفتوح تختلف عن عملة السند.",
  treasuryErrOpenItemPartner: "البند المفتوح لا يخص هذه الجهة.",
  treasuryErrOpenItemSide: "نوع السند يخصص بنوداً من الجانب المقابل فقط (عملاء للقبض، موردون للصرف).",
  treasuryErrPettyLimit: "المبلغ يتجاوز حدود الصندوق النقدي الصغير — استخدم الترحيل البنكي أو قسّم المبلغ.",
  treasuryErrCategoryTaken: "رمز فئة المصروف مستخدم مسبقاً.",
  treasuryErrReceiptRequired: "إرفاق إيصال مطلوب لهذا المبلغ.",
  treasuryErrApprovalRequired: "يجب اعتماد المصروف قبل الترحيل.",
  treasuryErrShiftAlreadyOpen: "توجد وردية مفتوحة لهذا الحساب مسبقاً.",
  treasuryErrSupervisorRequired: "الفرق يتجاوز حد التسامح — مطلوب مشرف ورمز وسبب.",
  treasuryErrSupervisorPin: "رمز المشرف غير صحيح أو غير مضبوط.",
  treasuryErrShiftReason: "السبب مطلوب عند إغلاق وردية بفرق.",
  treasuryErrStatementTooLarge: "الكشف يتجاوز الحد الأقصى لعدد السطور.",
  treasuryErrStatementFormat: "تعذر تحليل ملف الكشف — تحقق من التنسيق أو محول الاستيراد.",
  treasuryErrStatementReconciled: "الكشف مسوّى مسبقاً — الفترة مقفلة.",
  treasuryErrPeriodLocked: "التاريخ يقع ضمن فترة مسوّاة لهذا الحساب.",
  treasuryErrMovementMatched: "الحركة مطابقة لسطر كشف آخر مسبقاً.",

  // -- P6-T11a: partner directory ------------------------------------------------
  partnersSearchPlaceholder: "ابحث بالاسم أو الرمز أو الرقم الضريبي…",
  partnersKindLabel: "نوع الجهة",
  kindCustomer: "عميل",
  kindSupplier: "مورّد",
  kindBoth: "عميل ومورّد",
  partnersColCode: "الرمز",
  partnersColCreditLimit: "حد الائتمان",
  partnersEmpty: "لا توجد جهات بعد — أنشئ أول جهة.",
  partnersNewButton: "جهة جديدة",
  partnerFormTitleCreate: "إضافة جهة جديدة",
  partnerCodeLabel: "رمز الجهة",
  partnerCodeHint: "اتركه فارغًا للترقيم التلقائي (P-000001).",
  partnerNameLabel: "الاسم (إنجليزي)",
  partnerNameArLabel: "الاسم (عربي)",
  partnerTaxNumberLabel: "الرقم الضريبي",
  partnerCreditTermsLabel: "شروط الدفع",
  partnerPriceListLabel: "قائمة الأسعار",
  partnerStatusLabel: "الحالة",
  partnerCreatedToast: "تم إنشاء الجهة.",
  partnerSavedToast: "تم حفظ التعديلات.",
  partnerCodeTaken: "رمز الجهة مستخدم مسبقًا.",
  partnerArchivedError: "الجهة مؤرشفة — لا يمكن تعديلها.",
  partnerKindChangeLabel: "تغيير نوع الجهة",
  partnerKindChangedToast: "تم تغيير نوع الجهة.",
  partnerKindImmutable: "لا يمكن تغيير النوع بعد وجود حركات مرحّلة.",
  partnerArchiveButton: "أرشفة الجهة",
  partnerArchiveConfirmTitle: "تأكيد أرشفة الجهة",
  partnerArchiveConfirmBody: "لن تظهر الجهة المؤرشفة في القوائم الجديدة. هل تريد المتابعة؟",
  partnerArchivedToast: "تمت أرشفة الجهة.",
  partnerTabOverview: "البيانات",
  partnerContactsTitle: "جهات الاتصال",
  partnerContactNameLabel: "الاسم",
  partnerContactPhoneLabel: "الهاتف",
  partnerContactEmailLabel: "البريد الإلكتروني",
  partnerContactRoleLabel: "الصفة",
  partnerContactPrimaryLabel: "أساسي",
  partnerContactAdd: "إضافة جهة اتصال",
  partnerContactsEmpty: "لا توجد جهات اتصال.",
  partnerAddressesTitle: "العناوين",
  addressTypeLabel: "نوع العنوان",
  addressTypeBilling: "فوترة",
  addressTypeShipping: "شحن",
  addressTypeOther: "أخرى",
  partnerAddressLine1Label: "العنوان (سطر 1)",
  partnerAddressLine2Label: "العنوان (سطر 2)",
  partnerAddressCityLabel: "المدينة",
  partnerAddressCountryLabel: "رمز الدولة (حرفان)",
  partnerAddressAdd: "إضافة عنوان",
  partnerAddressesEmpty: "لا توجد عناوين.",
  partnerBalanceTitle: "الرصيد",
  partnerBalanceOpenAmount: "الرصيد الافتتاحي (مسودة)",
  partnerBalanceDraftLabel: "رصيد المسودات",
  partnerBalanceOverdueLabel: "المتأخر",
  partnerBalanceDraftBadge: "مسودات فقط",
  partnerBalanceDraftNote: "تُحتسب الأرصدة في هذه المرحلة من مسودات الأرصدة الافتتاحية فقط — لا ترحيل بعد (الترحيل يصل مع المحاسبة).",

  // -- P6-T11a: item master ----------------------------------------------------------
  itemsSearchPlaceholder: "ابحث بالاسم أو SKU…",
  itemsFilterCategoryLabel: "التصنيف",
  categoryLabel: "التصنيف",
  itemsColSku: "رمز الصنف (SKU)",
  itemsColBasePrice: "السعر الأساسي",
  itemsEmpty: "لا توجد أصناف بعد — أنشئ أول صنف.",
  itemsNewButton: "صنف جديد",
  itemFormTitleCreate: "إضافة صنف جديد",
  itemFormTitleEdit: "بيانات الصنف",
  itemSkuLabel: "رمز الصنف (SKU)",
  itemNameLabel: "الاسم (إنجليزي)",
  itemNameArLabel: "الاسم (عربي)",
  itemKindLabel: "نوع الصنف",
  kindStock: "مخزني",
  kindService: "خدمي",
  kindComposite: "مركّب",
  itemUomLabel: "وحدة القياس",
  itemCostingLabel: "طريقة التكلفة",
  costingWac: "متوسط مرجّح (WAC)",
  costingFifo: "الوارد أولًا يصدر أولًا (FIFO)",
  itemTrackingLabel: "التتبع",
  itemTrackBatch: "تتبع الدفعات",
  itemTrackSerial: "أرقام تسلسلية",
  itemTrackImei: "IMEI",
  itemHasExpiry: "تاريخ انتهاء",
  itemExpiryRequiresBatch: "تاريخ الانتهاء يتطلب تتبع الدفعات — فُعِّل تتبع الدفعات تلقائيًا.",
  itemReorderLevelLabel: "حد إعادة الطلب",
  itemReorderQtyLabel: "كمية إعادة الطلب",
  itemBasePriceLabel: "السعر الأساسي",
  itemCreatedToast: "تم إنشاء الصنف.",
  itemSavedToast: "تم حفظ التعديلات.",
  itemSkuTaken: "رمز الصنف (SKU) مستخدم مسبقًا.",
  itemArchivedError: "الصنف مؤرشف — لا يمكن تعديله.",
  itemArchiveButton: "أرشفة الصنف",
  itemArchiveConfirmTitle: "تأكيد أرشفة الصنف",
  itemArchiveConfirmBody: "لن يظهر الصنف المؤرشف في المستندات الجديدة. هل تريد المتابعة؟",
  itemArchivedToast: "تمت أرشفة الصنف.",
  barcodesTitle: "الباركود",
  barcodeCodeLabel: "رقم الباركود",
  barcodeAdd: "إضافة باركود",
  barcodesEmpty: "لا توجد باركود.",
  barcodeTaken: "الباركود مستخدم مسبقًا (فريد على مستوى المنشأة).",

  // -- P6-T11a: price lists -----------------------------------------------------------
  priceListCreateTitle: "قائمة أسعار جديدة",
  priceListsListTitle: "القوائم",
  priceListNameLabel: "الاسم (إنجليزي)",
  priceListNameArLabel: "الاسم (عربي)",
  priceListKindLabel: "نوع القائمة",
  priceListKindSale: "بيع",
  priceListKindPurchase: "شراء",
  priceListCurrencyLabel: "العملة",
  priceListValidFromLabel: "سارٍ من (اختياري)",
  priceListValidToLabel: "سارٍ إلى (اختياري)",
  priceListCreateSubmit: "إنشاء القائمة",
  priceListSelectHint: "اختر قائمة من الجدول لتحرير صفوفها.",
  priceListRowsTitle: "صفوف القائمة",
  priceListRowItemLabel: "الصنف",
  priceListRowUomLabel: "وحدة القياس",
  priceListRowPriceLabel: "سعر الوحدة",
  priceListRowMinQtyLabel: "أقل كمية",
  priceListRowAdd: "إضافة صف",
  priceListRowAddedToast: "تمت إضافة الصف.",
  priceListRowsEmpty: "لا توجد صفوف بعد — أضف أول سعر.",
  priceListsEmpty: "لا توجد قوائم أسعار بعد.",
  priceListColValidLabel: "الفترة",
  priceListCreatedToast: "تم إنشاء قائمة الأسعار.",
  priceListCurrencySar: "ريال سعودي (SAR)",

  // -- P6-T11a: import & export wizard ---------------------------------------------------
  importStep1Title: "الملف والنوع",
  importDataKindLabel: "نوع البيانات",
  importKindPartners: "الجهات",
  importKindItems: "الأصناف",
  importKindOpeningBalances: "الأرصدة الافتتاحية",
  importFormatLabel: "الصيغة",
  importCarrierLabel: "جهة الرفع (الناقل)",
  importCarrierHint: "يُرفع ملف الاستيراد عبر خانة مرفقات الجهة المختارة — هذا هو نمط الرفع المباشر المتاح في هذه المرحلة.",
  importFileLabel: "الملف",
  importFileHint: "ملف CSV أو XLSX حتى 8 ميغابايت وبحد أقصى 5000 صف.",
  importSubmitPreview: "رفع ومعاينة",
  importStep2Title: "المعاينة",
  importColTotal: "إجمالي الصفوف",
  importColValid: "صالحة",
  importColInvalid: "غير صالحة",
  importColDuplicates: "مكررة",
  importCommit: "تطبيق الاستيراد",
  importCommitToast: "تم تطبيق الاستيراد.",
  importCommitFailed: "فشل تطبيق الاستيراد — راجع حالة المهمة.",
  importStep3Title: "تم التطبيق",
  importCommittedRows: "تم تطبيق {count} صف.",
  importColRow: "الصف",
  importColPreview: "المعاينة",
  importColErrors: "الأخطاء",
  importColWarnings: "تحذيرات",
  importRowValid: "صالح",
  importRowError: "خطأ",
  importRowDuplicate: "مكرر",
  importRowWarning: "تحذير",
  importPreviewEmpty: "لا توجد صفوف في الملف.",
  importNewJob: "استيراد جديد",
  importCarrierRequired: "اختر جهة الرفع أولًا.",
  importFileRequired: "اختر ملفًا أولًا.",
  importFileTooLarge: "حجم الملف يتجاوز 8 ميغابايت.",
  importFileTypeInvalid: "صيغة غير مدعومة — CSV أو XLSX فقط.",
  importUploadFailed: "تعذّر رفع الملف إلى التخزين.",
  importFormatCsv: "CSV",
  importFormatXlsx: "XLSX (Excel)",
  importJobsColCreated: "أُنشئت",
  importJobsTitle: "سجل الاستيراد",
  importJobsEmpty: "لا توجد مهام استيراد.",
  importJobColRows: "الصفوف",
  importStatusPreviewing: "قيد المعاينة",
  importStatusPreviewReady: "جاهزة للتطبيق",
  importStatusCommitting: "قيد التطبيق",
  importStatusCommitted: "مطبّقة",
  importStatusFailed: "فاشلة",
  importErrorFileInvalid: "ملف غير صالح — تأكد من الصيغة والحدود.",
  exportTitle: "تصدير",
  exportHint: "تصدير فوري بحد 10000 صف — يصدر رابط تنزيل مؤقت.",
  exportSubmit: "تصدير",
  exportDone: "تم التصدير — {rows} صف.",
  exportRows: "عدد الصفوف",
  exportDownloadLabel: "تنزيل الملف",
  exportExpiresNote: "الرابط صالح لمدة {seconds} ثانية.",

  // -- P6-T11a: opening balances (DRAFT only) ------------------------------------------
  obTabPartner: "جهة",
  obTabAccount: "حساب",
  obTabStock: "مخزون",
  obCreateTitle: "إنشاء رصيد افتتاحي (مسودة)",
  obAmountLabel: "المبلغ",
  obNoteLabel: "ملاحظة",
  obQtyLabel: "الكمية",
  obUnitCostLabel: "تكلفة الوحدة",
  obAccountLabel: "معرّف الحساب",
  obAccountHint: "شجرة الحسابات القانونية تصل مع المحاسبة (المرحلة 007) — أدخل معرّف الحساب الحالي.",
  obCreateSubmit: "إنشاء المسودة",
  obEmpty: "لا توجد مسودات بعد.",
  obListTitle: "المسودات الحالية",
  obDraftOnlyNote: "لا يوجد ترحيل في هذه المرحلة — كل رصيد افتتاحي يُنشأ كمسودة فقط.",
  obCreatedToast: "تم إنشاء المسودة.",
  obColTarget: "الهدف",
  obColAmount: "المبلغ",
  obColQty: "الكمية",
  obColNote: "ملاحظة",
  obQtyAtCostLabel: "{qty} × {cost}",
  obTargetUnknown: "هدف غير معروف",
  obDuplicateError: "توجد مسودة لهذا الهدف بالفعل — مسودة واحدة لكل هدف.",

  // -- P6-T11a: attachments --------------------------------------------------------------
  attachmentsTitle: "المرفقات",
  attachmentIssueFormTitle: "إصدار خانة رفع",
  attachmentFilenameLabel: "اسم الملف",
  attachmentContentTypeLabel: "نوع المحتوى",
  attachmentSizeLabel: "الحجم (بايت)",
  attachmentTypePdf: "PDF",
  attachmentTypePng: "PNG",
  attachmentTypeJpeg: "JPEG",
  attachmentTypeWebp: "WebP",
  attachmentTypeCsv: "CSV",
  attachmentIssueButton: "إصدار رابط رفع",
  attachmentIssuedTitle: "رابط الرفع الصادر",
  attachmentIssuedHint: "ارفع الملف إلى الرابط أعلاه بأمر PUT خلال {seconds} ثانية من الإصدار — الرفع المباشر من المتصفح يكتمل مع وحدة الملفات الكاملة.",
  attachmentIssuedToast: "تم إصدار رابط الرفع.",
  attachmentUrlLabel: "الرابط",
  attachmentKeyLabel: "مفتاح التخزين",
  attachmentExpiresLabel: "تنتهي الصلاحية خلال (ثوانٍ)",
  attachmentsEmpty: "لا توجد مرفقات.",
  attachmentDownloadLabel: "تنزيل",
  attachmentIssueFailed: "تعذّر إصدار رابط الرفع.",

  // -- P6-T11a: pickers + command-menu remote groups ---------------------------------------
  partnerPickerPlaceholder: "اختر جهة…",
  itemPickerPlaceholder: "اختر صنفًا…",
  pickerEmptyText: "لا نتائج",
  commandGroupPartners: "الجهات",
  commandGroupItems: "الأصناف",

  // -- T15-UI: PHASE-009 tax screens --------------------------------------------------------
  taxCodesTitle: "الرموز الضريبية",
  taxCodesEmpty: "لا توجد رموز ضريبية بعد — أنشئ أول رمز.",
  taxCodesCode: "الرمز",
  taxCodesName: "الاسم (إنجليزي)",
  taxCodesNameAr: "الاسم (عربي)",
  taxCodesCountry: "الدولة",
  taxCodesTreatment: "المعاملة الضريبية",
  taxCodesUsage: "الاستخدام",
  taxCodesCreateTitle: "إنشاء رمز ضريبي",
  taxCodesCreatedToast: "تم إنشاء الرمز الضريبي.",
  taxCodesArchive: "أرشفة الرمز",
  taxCodesArchiveConfirm: "سيختفي الرمز المؤرشف من المستندات الجديدة. هل تريد المتابعة؟",
  taxCodesArchiveBlocked: "لا يمكن أرشفة رمز مستخدم في أصناف أو فئات — أعد تعيينها أولًا.",
  taxCodesArchivedToast: "تمت أرشفة الرمز الضريبي.",
  taxTreatmentStandardRated: "خاضع للنسبة الأساسية",
  taxTreatmentZeroRated: "نسبة صفرية",
  taxTreatmentExempt: "معفى",
  taxTreatmentOutOfScope: "خارج نطاق الضريبة",
  taxTreatmentReverseCharge: "احتساب عكسي",
  taxTreatmentNotSubject: "غير خاضع",
  taxResolveTitle: "تجربة احتساب الضريبة",
  taxResolveDate: "تاريخ المستند",
  taxResolveAmount: "المبلغ",
  taxResolveCode: "الرمز الضريبي",
  taxResolveAction: "احتساب",
  taxResolveTreatment: "المعاملة",
  taxResolveRate: "النسبة",
  taxResolveBase: "الوعاء الضريبي",
  taxResolveTax: "الضريبة",
  taxResolveGross: "الإجمالي مع الضريبة",
  taxResolveNotSubject: "هذا السطر غير خاضع للضريبة — لا تُحتسب عليه ضريبة.",
  taxResolveBoundaryWarning:
    "تنبيه حدودي (BR-033): تسري نسبة {rate} اعتبارًا من {date} — المسودات الممتدة عبر هذا الحد تُنبَّه عند الفتح، واللقطات المرحّلة لا تتغير.",
  taxRegistrationsTitle: "التسجيلات الضريبية",
  taxRegistrationsEmpty: "لا توجد تسجيلات ضريبية بعد.",
  taxRegistrationsStatus: "حالة التسجيل",
  taxRegistrationsNumber: "رقم التسجيل الضريبي",
  taxRegistrationsEffectiveFrom: "ساري من",
  taxRegistrationsEffectiveTo: "ساري حتى",
  taxRegistrationsRegistered: "مسجل",
  taxRegistrationsNotRegistered: "غير مسجل",
  taxRegistrationsDeregistered: "مُلغى التسجيل",
  taxRegistrationsCreateTitle: "تحديث حالة التسجيل",
  taxRegistrationsSavedToast: "تم حفظ حالة التسجيل الضريبي.",
  taxPacksTitle: "حزم الولايات القضائية",
  taxPacksEmpty: "لا توجد حزم مزروعة.",
  taxPacksCountry: "الدولة",
  taxPacksVatStatus: "حالة ضريبة القيمة المضافة",
  taxPacksVatInForce: "سارية",
  taxPacksVatPlanned: "مخططة",
  taxPacksVatNoVat: "بدون ضريبة",
  taxPacksVersion: "إصدار الحزمة",
  taxPacksVerification: "حالة التحقق",
  taxPacksVerified: "مُتحقق",
  taxPacksRequiresVerification: "يتطلب تحققًا",
  taxPacksRate: "النسبة",
  taxPacksEffectiveFrom: "ساري من",
  taxPacksEffectiveTo: "ساري حتى",
  taxPacksSource: "المرجع",
  taxPacksWindowsTitle: "نوافذ النسب",
  taxPacksNoRates: "لا توجد نوافذ نسب لهذه الحزمة.",
  taxPacksApply: "تثبيت الإصدار",
  taxPacksApplied: "تم تثبيت إصدار الحزمة للمنشأة.",
  taxPacksBinding: "الإصدار المثبَّت للمنشأة",
  taxPacksBindingNone: "لا يوجد تثبيت — تُطبَّق النسخة المزروعة تلقائيًا.",
  taxPacksPreviewNote:
    "ترقية الحزمة لا تعيد كتابة اللقطات المرحّلة — النوافذ الجديدة تسري على المستندات الجديدة فقط (BR-033).",
  vatReturnTitle: "الإقرار الضريبي",
  vatReturnEmpty: "لا توجد إقرارات ضريبية بعد.",
  vatReturnCountry: "الدولة",
  vatReturnPeriod: "الفترة",
  vatReturnPeriodStart: "بداية الفترة",
  vatReturnPeriodEnd: "نهاية الفترة",
  vatReturnStatus: "الحالة",
  vatReturnDraft: "مسودة",
  vatReturnReady: "جاهز",
  vatReturnFiled: "مقدَّم",
  vatReturnCreateTitle: "إنشاء إقرار ضريبي",
  vatReturnCreatedToast: "تم إنشاء الإقرار الضريبي.",
  vatReturnPrepare: "إعداد الإقرار",
  vatReturnPreparedToast: "تم إعداد الإقرار الضريبي.",
  vatReturnMarkFiled: "تسجيل التقديم",
  vatReturnFiledToast: "تم تسجيل تقديم الإقرار الضريبي.",
  vatReturnFilingReference: "مرجع التقديم",
  vatReturnFilingNote: "ملاحظة التقديم",
  vatReturnExport: "تصدير",
  vatReturnExportCsv: "تصدير CSV",
  vatReturnExportXlsx: "تصدير XLSX",
  vatReturnSummaryTitle: "ملخص الفترة حسب المعاملة",
  vatReturnDirection: "الاتجاه",
  vatReturnDirectionOutput: "مخرجات",
  vatReturnDirectionInput: "مدخلات",
  vatReturnTaxableBase: "الوعاء الضريبي",
  vatReturnTaxAmount: "قيمة الضريبة",
  vatReturnCrossCheck: "المطابقة مع دفتر الأستاذ",
  vatReturnDocumentSide: "جانب المستندات",
  vatReturnGlSide: "جانب دفتر الأستاذ",
  vatReturnOutputTax: "ضريبة المخرجات",
  vatReturnInputTax: "ضريبة المدخلات القابلة للخصم",
  vatReturnInputTaxExpensed: "ضريبة مدخلات محمّلة على المصروف",
  vatReturnMismatch:
    "فشلت المطابقة (INV-012) — قيم المستندات تختلف عن دفتر الأستاذ؛ يُحظر تسجيل التقديم حتى التطابق.",
  vatReturnReadyNote: "الإقرار جاهز — التطابق مع الأستاذ سليم",
  taxErrCodeTaken: "هذا الرمز الضريبي مستخدم مسبقًا لهذه الدولة.",
  taxErrCodeInUse: "الرمز مستخدم في أصناف أو فئات — أعد تعيينها قبل الأرشفة.",
  taxErrCodeArchived: "الرمز الضريبي مؤرشف ولا يمكن استخدامه في مستندات جديدة.",
  taxErrRegistrationNumber: "رقم التسجيل الضريبي مطلوب عندما تكون الحالة «مسجل» (٣ إلى ٥٠ حرفًا) ولا يُقبل في غيرها.",
  taxErrJurisdiction: "لا توجد حزمة مزروعة لهذه الدولة.",
  taxErrNoRateForDate: "لا توجد نسبة مزروعة تغطي هذا التاريخ — الاحتساب يفشل بشكل آمن.",
  taxErrWindowTaken: "يوجد إقرار ضريبي لهذه الفترة مسبقًا.",
  taxErrCrossCheck: "فشلت المطابقة مع دفتر الأستاذ — راجع الفروقات ثم أعد الإعداد.",
  taxErrState: "حالة الإقرار الضريبي لا تسمح بهذا الإجراء.",
  taxErrAlreadyFiled: "الإقرار الضريبي مقدَّم ولا يمكن تعديله.",
  taxErrPackBinding: "إصدار الحزمة غير مزروع — تُطبَّق الترقيات عبر بذور الهجرات فقط.",

  // -- T14-UI (PHASE-010): inventory & warehousing (AR canonical per GLOSSARY) ----
  navInventoryWarehouses: "المستودعات",
  navInventoryStock: "الأرصدة المتوفرة",
  navInventoryMoves: "حركات المخزون",
  navInventoryTransfers: "تحويلات المخزون",
  navInventoryCounts: "جرد المخزون",
  warehousesTitle: "المستودعات",
  warehousesEmpty: "لا توجد مستودعات بعد.",
  warehousesCreateTitle: "إنشاء مستودع",
  warehousesCodeLabel: "رمز المستودع",
  warehousesNameLabel: "الاسم (إنجليزي)",
  warehousesNameArLabel: "الاسم (عربي)",
  warehousesBranchLabel: "الفرع",
  warehousesGlAccountLabel: "حساب المخزون في الأستاذ (اختياري)",
  warehousesNoteLabel: "ملاحظة",
  warehousesCreatedToast: "تم إنشاء المستودع.",
  warehousesDeactivate: "تعطيل",
  warehousesDeactivateTitle: "تعطيل المستودع",
  warehousesDeactivateConfirm: "تعطيل المستودع يمنع الحركات الجديدة عليه؛ تاريخ الحركات يبقى كما هو.",
  warehousesDeactivatedToast: "تم تعطيل المستودع.",
  warehousesReactivate: "إعادة التفعيل",
  warehousesReactivatedToast: "تمت إعادة تفعيل المستودع.",
  warehousesColCode: "الرمز",
  warehousesColBranch: "الفرع",
  warehousesColGlAccount: "حساب الأستاذ",
  stockTitle: "الأرصدة المتوفرة",
  stockEmpty: "لا توجد أرصدة مخزنية بعد.",
  stockFilterWarehouse: "المستودع",
  stockColItem: "الصنف",
  stockColWarehouse: "المستودع",
  stockColQty: "الكمية",
  stockColAvgCost: "متوسط التكلفة",
  stockNegativeBadge: "رصيد سالب",
  movesTitle: "حركات المخزون",
  movesEmpty: "لا توجد حركات مخزون بعد.",
  movesFilterDirection: "الاتجاه",
  movesFilterKind: "نوع الحركة",
  movesColDate: "التاريخ",
  movesColDirection: "الاتجاه",
  movesColKind: "النوع",
  movesColUnitCost: "تكلفة الوحدة",
  movesColValue: "القيمة",
  movesColReason: "السبب",
  movesColBatch: "الدفعة",
  movesColSerial: "الرقم التسلسلي",
  movesColSource: "المصدر",
  movesDirectionIn: "إدخال",
  movesDirectionOut: "إخراج",
  movesKindReceipt: "استلام",
  movesKindIssue: "صرف",
  movesKindTransferIn: "تحويل وارد",
  movesKindTransferOut: "تحويل صادر",
  movesKindAdjust: "تسوية",
  movesReasonDamage: "تلف",
  movesReasonExpired: "انتهاء صلاحية",
  movesReasonCountLoss: "عجز جرد",
  movesReasonCountGain: "زيادة جرد",
  movesReasonCustomerReturn: "مرتجع عميل",
  movesReasonOther: "أخرى",
  transfersTitle: "تحويلات المخزون",
  transfersEmpty: "لا توجد تحويلات بعد.",
  transfersColNo: "رقم التحويل",
  transfersColFrom: "من مستودع",
  transfersColTo: "إلى مستودع",
  transfersColLines: "البنود",
  transfersColDispatchDate: "تاريخ الإرسال",
  transfersColReceiveDate: "تاريخ الاستلام",
  transfersStatusInTransit: "في الطريق",
  transfersNewTitle: "تحويل جديد",
  transfersFromLabel: "من مستودع",
  transfersToLabel: "إلى مستودع",
  transfersNoteLabel: "ملاحظة",
  transfersLinesTitle: "بنود التحويل",
  transfersLineItemLabel: "الصنف",
  transfersLineQtyLabel: "الكمية",
  transfersAddLine: "إضافة بند",
  transfersRemoveLine: "حذف البند",
  transfersSameWarehouseError: "يجب أن يختلف مستودع الإرسال عن مستودع الاستلام.",
  transfersLineMissingError: "كل بند يحتاج صنفًا وكمية موجبة.",
  transfersCreatedToast: "تم إنشاء التحويل (مسودة).",
  transfersDispatch: "إرسال",
  transfersDispatchedToast: "تم إرسال التحويل — المخزون في الطريق (غير متاح للبيع).",
  transfersReceive: "استلام",
  transfersReceivedToast: "تم استلام التحويل في المستودع الوجهة.",
  transfersCancel: "إلغاء",
  transfersCancelledToast: "تم إلغاء التحويل.",
  countingTitle: "جرد المخزون",
  countingEmpty: "لا توجد جلسات جرد بعد.",
  countingNewTitle: "جلسة جرد جديدة",
  countingWarehouseLabel: "المستودع",
  countingBlindLabel: "جرد أعمى (إخفاء الكميات الدفترية)",
  countingPickItemsTitle: "اختيار الأصناف",
  countingPickSearchPlaceholder: "ابحث بالرمز أو الاسم…",
  countingPickEmpty: "لا توجد أصناف مطابقة.",
  countingSelectedCount: "الأصناف المختارة",
  countingCreate: "إنشاء الجلسة",
  countingCreatedToast: "تم إنشاء جلسة الجرد وتجميد لقطة الكميات.",
  countingColNo: "رقم الجرد",
  countingColBlind: "أعمى",
  countingBlindYes: "نعم",
  countingBlindNo: "لا",
  countingColVariance: "الفروقات",
  countingOpenSession: "فتح الجلسة",
  countingCloseSession: "إغلاق الجلسة",
  countingSnapshotAt: "تاريخ اللقطة",
  countingSessionLinesTitle: "بنود الجرد",
  countingColLineNo: "البند",
  countingColSystemQty: "الكمية الدفترية",
  countingColCountedQty: "الكمية المعدودة",
  countingColDiff: "الفرق",
  countingColValueImpact: "الأثر القيمي",
  countingSaveEntries: "حفظ العدّ",
  countingEntriesSavedToast: "تم حفظ كميات العدّ.",
  countingSubmit: "تقديم للمراجعة",
  countingSubmittedToast: "تم تقديم الجلسة لمراجعة الفروقات.",
  countingReviewTitle: "مراجعة الفروقات",
  countingReviewHint: "راجع الفروقات قبل الاعتماد — الاعتماد يرحّل تسوية الجرد (عجز/زيادة) عبر محرك الترحيل.",
  countingApprove: "اعتماد",
  countingApproveSupervisor: "اعتماد بموافقة مشرف",
  countingApprovedToast: "تم اعتماد الجرد وترحيل التسوية.",
  countingCancel: "إلغاء",
  countingCancelledToast: "تم إلغاء جلسة الجرد.",
  countingRecountTitle: "إعادة عدّ بند",
  countingRecountLineLabel: "رقم البند",
  countingRecountNoteLabel: "سبب إعادة العدّ",
  countingRecountedToast: "تم تسجيل إعادة العدّ بمراجعة.",
  countingStatusCounted: "معدود",
  countingStatusVarianceReview: "مراجعة الفروقات",
  inventoryErrWarehouseCodeTaken: "رمز المستودع مستخدم مسبقًا.",
  inventoryErrWarehouseInactive: "المستودع غير مفعّل.",
  inventoryErrWarehouseNotDeactivatable: "لا يمكن تعطيل المستودع (حركات أو جلسات جرد جارية).",
  inventoryErrItemNotStocked: "الصنف غير مُخزّن في هذا المستودع.",
  inventoryErrInsufficientStock: "الكمية المتوفرة لا تكفي (السماح بالسالب معطّل افتراضيًا).",
  inventoryErrBatchInsufficient: "كمية الدفعة لا تكفي.",
  inventoryErrBatchRequired: "الصنف يتتبع الدفعات — الدفعة مطلوبة.",
  inventoryErrBatchTaken: "رقم الدفعة مستخدم مسبقًا لهذا الصنف.",
  inventoryErrSerialRequired: "الصنف يتتبع الأرقام التسلسلية — حدد الوحدات.",
  inventoryErrSerialNotInStock: "الوحدة التسلسلية غير متوفرة في المخزون.",
  inventoryErrSerialTaken: "الرقم التسلسلي مستخدم مسبقًا.",
  inventoryErrSerialReturnBinding: "مرتجع الصنف التسلسلي يجب أن يشير إلى الوحدة المبيعة أصلًا.",
  inventoryErrState: "حالة المستند لا تسمح بهذا الإجراء.",
  inventoryErrTransferEmpty: "التحويل يحتاج بندًا واحدًا على الأقل.",
  inventoryErrTransferSameWarehouse: "يجب أن يختلف مستودعا الإرسال والاستلام.",
  inventoryErrCountTolerance: "الفروق يتجاوز الحد المسموح — يلزم اعتماد المشرف.",
  inventoryErrMethodSwitchInFlight: "لا يمكن تغيير طريقة التقييم مع حركات جارية.",
  inventoryErrMethodSwitchInvalid: "تغيير طريقة التقييم غير صالح (لا يوجد رصيد أو نفس الطريقة).",
  inventoryErrMethodSwitchSame: "الصنف يستخدم هذه الطريقة بالفعل.",
  // PHASE-011 purchasing (T13-UI).
  purchasingEmpty: "لا توجد مستندات بعد",
  purchasingNoticeCreated: "تم إنشاء المستند",
  purchasingNoticeUpdated: "تم التحديث",
  purchasingNoticePosted: "تم الترحيل",
  expensesColAccount: "الحساب",
  navPurchasingOrders: "أوامر الشراء",
  navPurchasingReceipts: "سندات الاستلام",
  navPurchasingInvoices: "فواتير الموردين",
  navPurchasingDebitNotes: "الإشعارات المدينة",
  navPurchasingAp: "حسابات الموردين",
  purchasingOrdersTitle: "المشتريات — أوامر الشراء",
  purchasingReceiptsTitle: "المشتريات — سندات الاستلام",
  purchasingInvoicesTitle: "المشتريات — فواتير الموردين",
  purchasingDebitNotesTitle: "المشتريات — الإشعارات المدينة",
  purchasingApTitle: "المشتريات — حسابات الموردين",
  purchasingRequestsSection: "طلبات الشراء",
  purchasingOrdersSection: "أوامر الشراء",
  purchasingNewRequest: "طلب شراء جديد",
  purchasingNewOrder: "أمر شراء جديد",
  purchasingRequestNo: "رقم الطلب",
  purchasingNeededBy: "مطلوب بحلول",
  purchasingSubmit: "إرسال",
  purchasingApprove: "اعتماد",
  purchasingReject: "رفض",
  purchasingIssue: "إصدار",
  purchasingClose: "إغلاق",
  purchasingCancel: "إلغاء",
  purchasingOrderNo: "رقم الأمر",
  purchasingOrderDate: "تاريخ الأمر",
  purchasingExpectedDate: "تاريخ التسليم المتوقع",
  purchasingSupplier: "المورد",
  purchasingLines: "البنود",
  purchasingAddLine: "إضافة بند",
  purchasingRemoveLine: "حذف البند",
  purchasingItem: "الصنف",
  purchasingQty: "الكمية",
  purchasingUnitPrice: "سعر الوحدة",
  purchasingTaxCode: "رمز الضريبة",
  purchasingUnitCost: "تكلفة الوحدة",
  purchasingTotalNet: "الصافي",
  purchasingTotalTax: "الضريبة",
  purchasingTotalGross: "الإجمالي",
  purchasingStatus: "الحالة",
  purchasingNewReceipt: "سند استلام جديد",
  purchasingReceiptNo: "رقم السند",
  purchasingReceiptDate: "تاريخ الاستلام",
  purchasingWarehouse: "المستودع",
  purchasingPo: "أمر الشراء",
  purchasingPoLessReason: "سبب الشراء المباشر (بدون أمر)",
  purchasingPost: "ترحيل",
  purchasingBatchNo: "رقم التشغيلة",
  purchasingBatchExpiry: "تاريخ الانتهاء",
  purchasingNewInvoice: "فاتورة مورد جديدة",
  purchasingInvoiceNo: "رقم فاتورة المورد",
  purchasingInvoiceDate: "تاريخ الفاتورة",
  purchasingDueDate: "تاريخ الاستحقاق",
  purchasingInternalNo: "الرقم الداخلي",
  purchasingMatchStatus: "حالة المطابقة",
  purchasingMatchPreview: "معاينة المطابقة الثلاثية",
  purchasingRecordMatch: "تسجيل المطابقة",
  purchasingDisposition: "المعالجة",
  purchasingDispositionReason: "سبب المعالجة",
  purchasingDispositionAccept: "قبول مع السبب",
  purchasingMatchOutcomeMatched: "مطابقة",
  purchasingMatchOutcomeException: "استثناء",
  purchasingMatchOutcomeDispositioned: "معالَج",
  purchasingMatchOutcomePending: "قيد المطابقة",
  purchasingQtyVariance: "فرق الكمية %",
  purchasingPriceVariance: "فرق السعر %",
  purchasingNewDebitNote: "إشعار مدين جديد",
  purchasingNoteNo: "رقم الإشعار",
  purchasingNoteDate: "تاريخ الإشعار",
  purchasingRefInvoice: "الفاتورة المرجعية",
  purchasingApAging: "أعمار الديون",
  purchasingApStatement: "كشف حساب المورد",
  purchasingGrniRegister: "سجل البضاعة غير المفوترة",
  purchasingAgingNotDue: "غير مستحق",
  purchasingAging1_30: "١-٣٠ يوم",
  purchasingAging31_60: "٣١-٦٠ يوم",
  purchasingAging61_90: "٦١-٩٠ يوم",
  purchasingAging90Plus: "أكثر من ٩٠",
  purchasingAgingTotal: "الإجمالي",
  purchasingAsOf: "كما في",
  purchasingOpeningBalance: "الرصيد الافتتاحي",
  purchasingClosingBalance: "الرصيد الختامي",
  purchasingDebit: "مدين",
  purchasingCredit: "دائن",
  purchasingBalance: "الرصيد",
  purchasingOutstanding: "المتبقي",
  purchasingReceivedValue: "القيمة المستلمة",
  purchasingInvoicedValue: "القيمة المفوترة",
  purchasingGrniRemaining: "غير مفوتر",
  purchasingSelectSupplier: "اختر المورد",
  purchasingSelectWarehouse: "اختر المستودع",
  purchasingSelectPo: "اختر أمر الشراء",
  purchasingNoPo: "بدون أمر شراء",
  purchasingErrState: "حالة المستند لا تسمح بهذه العملية",
  purchasingErrDuplicate: "فاتورة مكررة للمورد (الرقم والمبلغ)",
  purchasingErrMatchMissing: "سجّل نتيجة المطابقة الثلاثية أولاً",
  purchasingErrMatchException: "استثناءات مطابقة بلا معالجة — عالجها أولاً",
  purchasingErrPoLess: "السياسة تمنع الاستلام بدون أمر شراء",
  purchasingErrPoLessReason: "سبب الشراء المباشر مطلوب",
  purchasingErrOverReceipt: "الكمية المستلمة تتجاوز بند أمر الشراء",
  purchasingErrOverInvoice: "الكمية المفوترة تتجاوز الكمية المستلمة",
  purchasingErrNotSupplier: "الجهة ليست موردًا",
  purchasingErrGrnSupplier: "بند الاستلام يخص موردًا آخر",
  purchasingErrSelfApproval: "لا يمكن لمنشئ المستند اعتماده",
  purchasingErrReallocation: "إعادة التخصيص تتجاوز الحدود المسموحة",
  // PHASE-012 sales (T13-UI).
  salesEmpty: "لا توجد مستندات بعد",
  salesNoticeCreated: "تم إنشاء المستند",
  salesNoticeUpdated: "تم التحديث",
  salesNoticePosted: "تم الترحيل",
  navSalesQuotes: "عروض الأسعار",
  navSalesOrders: "أوامر البيع",
  navSalesDeliveries: "سندات التسليم",
  navSalesInvoices: "فواتير البيع",
  navSalesCreditNotes: "الإشعارات الدائنة",
  navSalesAr: "حسابات العملاء",
  salesQuotesTitle: "المبيعات — عروض الأسعار وأوامر البيع",
  salesOrdersTitle: "المبيعات — أوامر البيع",
  salesDeliveriesTitle: "المبيعات — سندات التسليم",
  salesInvoicesTitle: "المبيعات — فواتير البيع",
  salesCreditNotesTitle: "المبيعات — الإشعارات الدائنة",
  salesArTitle: "المبيعات — حسابات العملاء",
  salesQuotesSection: "عروض الأسعار",
  salesOrdersSection: "أوامر البيع",
  salesStatus: "الحالة",
  salesStatusSent: "مُرسل",
  salesNewQuote: "عرض سعر جديد",
  salesNewOrder: "أمر بيع جديد",
  salesQuoteNo: "رقم العرض",
  salesQuoteDate: "تاريخ العرض",
  salesValidUntil: "صالح حتى",
  salesOrderNo: "رقم الأمر",
  salesOrderDate: "تاريخ الأمر",
  salesExpectedDate: "تاريخ التسليم المتوقع",
  salesSalesOrder: "أمر البيع",
  salesNoOrder: "بدون أمر بيع",
  salesCustomer: "العميل",
  salesSelectCustomer: "اختر العميل",
  salesBranch: "الفرع",
  salesSelectBranch: "اختر الفرع",
  salesWarehouse: "المستودع",
  salesSelectWarehouse: "اختر المستودع",
  salesCurrency: "العملة",
  salesExchangeRate: "سعر الصرف",
  salesItem: "الصنف",
  salesQty: "الكمية",
  salesUnitPrice: "سعر الوحدة",
  salesDiscount: "الخصم",
  salesTaxCode: "رمز الضريبة",
  salesAccount: "الحساب",
  salesLines: "البنود",
  salesAddLine: "إضافة بند",
  salesRemoveLine: "حذف البند",
  salesTotalNet: "الصافي",
  salesTotalTax: "الضريبة",
  salesTotalGross: "الإجمالي",
  salesSend: "إرسال",
  salesAccept: "قبول وتحويل",
  salesReject: "رفض",
  salesSubmit: "إرسال للاعتماد",
  salesApprove: "اعتماد",
  salesIssue: "إصدار",
  salesClose: "إغلاق",
  salesPost: "ترحيل",
  salesCancel: "إلغاء",
  salesCancelReason: "سبب الإلغاء",
  salesReserve: "حجز المخزون",
  salesAcceptWarehouse: "مستودع التحويل",
  salesNewDelivery: "سند تسليم جديد",
  salesDeliveryNo: "رقم السند",
  salesDeliveryDate: "تاريخ التسليم",
  salesDelivery: "سند التسليم",
  salesCogsValue: "تكلفة البضاعة المباعة",
  salesNewInvoice: "فاتورة بيع جديدة",
  salesInvoiceNo: "رقم الفاتورة",
  salesInvoiceDate: "تاريخ الفاتورة",
  salesDueDate: "تاريخ الاستحقاق",
  salesKind: "نوع الفاتورة",
  salesKindCash: "نقدية",
  salesKindCredit: "آجلة",
  salesCashAccount: "الحساب النقدي",
  salesSelectCashAccount: "اختر الحساب النقدي",
  salesOverrideCredit: "تجاوز حد الائتمان",
  salesCreditCheck: "فحص الائتمان",
  salesCreditAllow: "مسموح",
  salesCreditWarn: "تحذير",
  salesCreditBlock: "ممنوع",
  salesNewCreditNote: "إشعار دائن جديد",
  salesNoteNo: "رقم الإشعار",
  salesNoteDate: "تاريخ الإشعار",
  salesRefInvoice: "الفاتورة المرجعية",
  salesInvoiceLineId: "معرّف بند الفاتورة",
  salesReturnToStock: "إرجاع إلى المخزون",
  salesArAging: "أعمار الديون",
  salesArStatement: "كشف حساب العميل",
  salesArOpenItems: "البنود المفتوحة",
  salesOpenItemsHint: "هذه البنود هي سطح التخصيص الذي تستهلكه سندات القبض (FIFO / جزئي / دفعة مقدمة)",
  salesAgingNotDue: "غير مستحق",
  salesAging1_30: "١-٣٠ يوم",
  salesAging31_60: "٣١-٦٠ يوم",
  salesAging61_90: "٦١-٩٠ يوم",
  salesAging90Plus: "أكثر من ٩٠",
  salesAgingTotal: "الإجمالي",
  salesAsOf: "كما في",
  salesOpeningBalance: "الرصيد الافتتاحي",
  salesClosingBalance: "الرصيد الختامي",
  salesDebit: "مدين",
  salesCredit: "دائن",
  salesBalance: "الرصيد",
  salesOutstanding: "المتبقي",
  salesBaseBalance: "الرصيد بالعملة الأساسية",
  salesSubledgerTie: "ربط دفتر العملاء المساعد",
  salesTieOk: "متطابق",
  salesTieBroken: "غير متطابق",
  salesSource: "المصدر",
  salesAmount: "المبلغ",
  salesRunOverdueScan: "فحص الفواتير المتأخرة",
  salesOverdueScanDone: "اكتمل الفحص: {overdue} فاتورة متأخرة، {alerted} تنبيه",
  salesPrint: "طباعة",
  salesPrintDisabled: "الطباعة متاحة عند إصدار التقارير (PHASE-013)",
  salesErrState: "حالة المستند لا تسمح بهذه العملية",
  salesErrQuotationExpired: "انتهت صلاحية عرض السعر — أصدر عرضًا جديدًا",
  salesErrCreditLimit: "تجاوز حد الائتمان (المنع أو التحذير وفق السياسة)",
  salesErrReturnWindow: "مرتجع خارج فترة الإرجاع المسموحة",
  salesErrPriceChanged: "تغيّر السعر — أعد فتح المستند لإعادة الاحتساب",
  salesErrItemInactive: "الصنف غير مفعّل ولا يقبل مستندات البيع",
  salesErrDeliveryInvoiced: "الكمية المفوترة تتجاوز الكمية المسلّمة",
  salesErrCreditNoteExceeds: "الإشعار الدائن يتجاوز المتبقي على الفاتورة",
  salesErrReallocation: "إعادة التخصيص تتجاوز الحدود المسموحة",

  // -- T-WEB (PHASE-013): مساحة التقارير (النموذج §7) -----------------------
  navReports: "التقارير",
  reportsNavWorkspace: "تقارير المنشأة",
  reportWorkspaceTitle: "تقارير المنشأة",
  reportWorkspaceCatalog: "كتالوج التقارير",
  reportWorkspaceNoReport: "لم يتم اختيار تقرير بعد — اختر تقريرًا من الكتالوج",
  reportWorkspaceDateFrom: "من تاريخ",
  reportWorkspaceDateTo: "إلى تاريخ",
  reportWorkspaceAsOfLabel: "تاريخ اللقطة",
  reportWorkspaceLocale: "لغة التقرير",
  reportWorkspaceRun: "تشغيل التقرير",
  reportWorkspaceQueued: "في قائمة الانتظار",
  reportWorkspaceRunning: "قيد التنفيذ",
  reportWorkspaceStage: "المرحلة",
  reportWorkspaceStatus: "الحالة",
  reportWorkspaceStatusSucceeded: "مكتملة",
  reportWorkspaceStatusFailed: "فاشلة",
  reportWorkspaceDuration: "المدة",
  reportWorkspaceTotals: "الإجماليات",
  reportWorkspaceAssertions: "تأكيدات المطابقة",
  reportWorkspaceAssertionFailed: "فشل تأكيد المطابقة — التصدير معطّل",
  reportWorkspaceAsOf: "كما في {date}",
  reportWorkspaceComputedAt: "وقت الاحتساب {datetime}",
  reportWorkspaceEmpty: "لا توجد صفوف في هذه النتيجة",
  reportWorkspaceSavedViews: "المشاهدات المحفوظة",
  reportWorkspaceSaveView: "حفظ المشهد الحالي",
  reportWorkspaceViewNameAr: "اسم المشهد (عربي)",
  reportWorkspaceViewNameEn: "اسم المشهد (إنجليزي)",
  reportWorkspaceApply: "تطبيق",
  reportWorkspaceDeleteView: "حذف",
  reportWorkspaceRunHistory: "سجل التشغيلات",
  reportWorkspaceRefresh: "تحديث",
  reportWorkspaceBack: "العودة إلى الكتالوج",
  reportWorkspaceExportPdf: "تصدير PDF",
  reportWorkspaceExportXlsx: "تصدير XLSX",
  reportWorkspaceExportCsv: "تصدير CSV",
  reportWorkspacePrintPreview: "معاينة الطباعة",
  reportWorkspaceExportBlocked: "التصدير محجوب: فشل فحص المطابقة لهذه النتيجة",
  reportWorkspaceViewSaved: "تم حفظ المشهد",
  reportWorkspaceColReport: "التقرير",
  reportWorkspaceNoRuns: "لا توجد تشغيلات سابقة",
};

const en: Dictionary = {
  appTitle: "Universal Business ERP",
  switchLabel: "العربية",
  signOut: "Sign out",
  loading: "Loading...",
  phaseNote: "PHASE-003 UI — sign-in, sessions and admin screens via the secure web BFF.",

  navHome: "Home",
  navUsers: "Users & invitations",
  navSessions: "Sessions",
  navMfa: "Two-factor (TOTP)",
  navRoles: "Roles",
  navPassword: "Password",

  loginTitle: "Sign in",
  loginSubtitle: "Use your work account to access the platform.",
  loginEmailLabel: "Email",
  loginPasswordLabel: "Password",
  loginMfaLabel: "MFA code",
  loginMfaHint: "Six digits from your authenticator app.",
  loginMfaShow: "Enter an MFA code",
  loginMfaHide: "Hide the MFA code",
  loginSubmit: "Sign in",
  loginForgotLink: "Forgot your password?",
  loginErrorInvalidCredentials: "Email or password is incorrect.",
  loginErrorMfaRequired: "This account is protected with two-factor authentication — enter your MFA code.",
  loginErrorRateLimited: "Too many attempts — try again in {seconds} seconds.",
  loginErrorAccountLocked: "This account is temporarily locked — try again in {seconds} seconds.",
  loginErrorGeneric: "Could not sign you in — please try again.",

  forgotTitle: "Reset your password",
  forgotDescription: "Enter your email; if the account exists, a reset link will be sent to it.",
  forgotEmailLabel: "Email",
  forgotSubmit: "Send reset link",
  forgotSuccess: "If that email is registered, a password reset message is on its way.",
  forgotBack: "Back to sign in",

  acceptTitle: "Accept your invitation",
  acceptTenantLabel: "Organization",
  acceptRoleLabel: "Role",
  acceptEmailLabel: "Invited email",
  acceptFullNameLabel: "Full name",
  acceptPasswordLabel: "New password",
  acceptPasswordHint: "At least 10 characters.",
  acceptSubmit: "Create account and sign in",
  acceptErrorExpired: "This invitation has expired.",
  acceptErrorRevoked: "This invitation was revoked.",
  acceptErrorAccepted: "This invitation has already been used.",
  acceptErrorNotFound: "This invitation link is not valid.",
  acceptErrorGeneric: "Could not accept this invitation.",

  homeWelcome: "Welcome, {name}",
  homeTenantLabel: "Active organization",
  homeSwitchTenant: "Switch organization",
  homeRoleLabel: "Your role",
  homePermissionsLabel: "Granted permissions: {count}",
  homeScreens: "Admin screens",

  usersTitle: "Users & invitations",
  usersNoPermission: "You do not have permission to view this screen.",
  usersColEmail: "Email",
  usersColName: "Name",
  usersColRole: "Role",
  usersColStatus: "Status",
  usersColLastLogin: "Last sign-in",
  usersNever: "Never signed in",
  usersEmpty: "No users in this organization yet.",
  usersInviteTitle: "Invite a user",
  usersInviteEmailLabel: "Invitee email",
  usersInviteRoleLabel: "Role on joining",
  usersInviteSubmit: "Send invitation",
  usersInviteLinkTitle: "Accept link (dev environment — no real mail delivery):",
  usersInviteExpiresLabel: "Expires:",
  usersInvitationsTitle: "Invitations",
  usersColExpires: "Expires",
  usersColActions: "Actions",
  usersRevoke: "Revoke",
  usersNoRoles: "No roles are available to assign.",
  usersEmptyInvitations: "No invitations.",

  statusActive: "Active",
  statusPending: "Pending",
  statusRevoked: "Revoked",
  statusExpired: "Expired",
  statusAccepted: "Accepted",
  statusSuspended: "Suspended",

  sessionsTitle: "Active sessions",
  sessionsHint:
    "Revoking a session signs that device out immediately; to sign yourself out everywhere, revoke your sessions one by one.",
  sessionsColUser: "User",
  sessionsColCreated: "Started",
  sessionsColExpires: "Expires",
  sessionsColLastSeen: "Last seen",
  sessionsColIp: "IP address",
  sessionsRevoke: "Revoke session",
  sessionsEmpty: "No active sessions.",

  mfaTitle: "Two-factor authentication (TOTP)",
  mfaDescription: "Enroll an authenticator app, confirm with a code, then generate recovery codes.",
  mfaEnrollTitle: "Step 1 — Start enrollment",
  mfaEnrollButton: "Start enrollment",
  mfaSecretLabel: "Secret (enter it manually in your authenticator app):",
  mfaOtpauthLabel: "otpauth data (QR payload):",
  mfaEnrollHint: "Enter the current code from your authenticator app to confirm enrollment.",
  mfaVerifyTitle: "Step 2 — Confirm the code",
  mfaVerifyCodeLabel: "MFA code",
  mfaVerifySubmit: "Confirm",
  mfaVerified: "Two-factor authentication is now active.",
  mfaRecoveryTitle: "Step 3 — Recovery codes",
  mfaRecoveryDescription: "Recovery codes are shown once — store them somewhere safe now.",
  mfaRecoveryGenerate: "Generate recovery codes",
  mfaRecoveryRegenerate: "Regenerate codes",
  mfaInvalidCode: "That code is not valid.",
  mfaNeedConfirmed: "Confirm enrollment first, then generate recovery codes.",

  rolesTitle: "Roles",
  rolesDescription: "Clone a system template to create a role for your organization.",
  rolesTenantTitle: "Organization roles",
  rolesTemplatesTitle: "System templates",
  rolesColKey: "Key",
  rolesColName: "Name",
  rolesColSystem: "System?",
  rolesColActions: "Actions",
  rolesClone: "Clone",
  rolesCloned: "Role {name} created.",
  rolesYes: "Yes",
  rolesNo: "No",

  passwordTitle: "Change password",
  passwordDescription: "After the change your other sessions are revoked; this browser stays signed in.",
  passwordCurrentLabel: "Current password",
  passwordNextLabel: "New password",
  passwordNextHint: "At least 10 characters.",
  passwordSubmit: "Change password",
  passwordSuccess: "Your password has been changed.",
  passwordErrorCurrent: "Your current password is not correct.",

  errorsForbidden: "You do not have permission to do that.",
  errorsUnauthorized: "Your session has expired — sign in again.",
  errorsValidation: "Invalid input — please check the fields.",
  errorsNotFound: "Not found.",
  errorsNetwork: "Could not reach the server.",
  errorsGeneric: "Something went wrong.",
  errorsRateLimited: "Too many attempts — try again in {seconds} seconds.",

  navOnboarding: "Onboarding",

  journeyTitle: "First-invoice journey (Journey A)",
  journeyStepProfile: "Complete the workspace profile & setup",
  journeyStepCustomer: "Add your first customer",
  journeyStepInvoice: "Issue the first sales invoice",
  journeyStepPrint: "Print / export the invoice",
  journeyDone: "Done",
  journeyTodo: "Pending",

  navNotifications: "Notifications",
  navBilling: "Subscription & billing",
  pricingTitle: "Pricing & plans",
  pricingSubtitle: "Pick the plan that fits your business — all prices and limits come from platform configuration.",
  pricingPerMonth: "per month",
  pricingFeatures: "Features",
  pricingChoose: "Choose this plan",
  pricingCurrentPlan: "Your current plan",
  pricingLoadError: "Plans could not be loaded right now.",
  pricingConfigNote: "Prices are configuration-driven (placeholder values — OQ-002).",
  billingTitle: "Subscription & billing",
  billingPlanLabel: "Plan",
  billingStatusLabel: "Status",
  billingPeriodLabel: "Billing period",
  billingTrialEndsLabel: "Trial ends",
  billingGraceEndsLabel: "Grace ends",
  billingReadOnlyBanner: "The workspace is read-only — pay the outstanding amount to restore write access.",
  billingNoSubscription: "No active subscription.",
  billingUsageTitle: "Usage this period",
  billingCurrent: "Current",
  billingLimit: "Limit",
  billingUnlimited: "Unlimited",
  billingHistoryTitle: "Billing history",
  billingInvoices: "Invoices",
  billingEvents: "Billing events",
  billingNumber: "Number",
  billingAmount: "Amount",
  billingDue: "Due date",
  billingPaidVia: "Paid via",
  billingCheckout: "Continue to payment",
  billingChangePlan: "Change plan",
  billingCheckoutError: "Could not start the checkout session.",
  billingOpenInvoicesNote: "Choose a plan to open an invoice and pay it.",
  notifTitle: "Notifications center",
  notifUnread: "unread",
  notifEmpty: "No notifications yet.",
  notifPreferences: "Notification preferences",
  notifInApp: "In-app",
  notifEmail: "Email",
  notifMarkRead: "Mark as read",
  notifLoadError: "Notifications could not be loaded.",
  dashWidgetsTitle: "Today's KPIs",
  dashSalesToday: "Sales today",
  dashCashToday: "Cash position",
  dashArOverdue: "Overdue receivables",
  dashStockLow: "Items below reorder point",
  dashOpenReport: "Open report",
  dashWidgetError: "Widget could not load",
  platformManualPaymentTitle: "Record manual payment (A-009)",
  platformRecordPayment: "Record payment",
  platformPaymentReason: "Manual recording reason",
  platformPaymentSuccess: "Payment recorded and the subscription activated.",
  platformPaymentError: "Could not record the payment.",
  platformNoOpenInvoices: "No open invoices for this tenant.",
  statusTRIAL: "Trial",
  statusACTIVE: "Active",
  statusGRACE: "Grace — read-only",
  statusSUSPENDED: "Suspended",
  statusPAST_DUE: "Past due",
  statusOPEN: "Open",
  statusPAID: "Paid",
  statusVOID: "Voided",
  navBranches: "Branches",
  navSettings: "Settings",
  navSupport: "Support sessions",
  navPlatformSection: "Platform administration",
  navPlatformConsole: "Platform",
  navPlatformAudit: "Platform audit",

  // -- PHASE-015 T11: industry templates UI -----------------------------------
  navTemplates: "Industry templates",
  templatesPageTitle: "Industry templates",
  templatesPageDescription: "Pick the template matching your business and apply or switch between templates additively",
  templatesCurrent: "Current template",
  templatesNone: "No template applied",
  templatesApply: "Apply",
  templatesSwitch: "Switch",
  templatesPreview: "Preview",
  templatesApplied: "Template applied",
  templatesSwitched: "Switched to template",
  templatesApplyConfirm: "Apply this template?",
  templatesSwitchNote: "Switching is additive only — settings are never removed",
  templatesVersion: "Version",
  templatesStatusActive: "Available",
  templatesStatusInactive: "Unavailable",
  onboardingIndustryTitle: "Choose your industry",
  onboardingIndustryDescription: "Pick an industry template suited to your business — it tunes the workspace settings",
  onboardingIndustrySelect: "Choose a template",
  onboardingIndustrySkip: "Skip",
  onboardingIndustryApplied: "Industry template applied",

  // -- PHASE-016 POS UI ---------------------------------------------------------
  navPosCounter: "POS counter",
  navPosTerminals: "POS terminals",
  posTerminalsTitle: "POS terminals",
  posTerminalsDescription: "Register terminals bound to a branch, till cash account and receipt size",
  posTerminalCode: "Terminal code",
  posTerminalName: "Name",
  posTerminalBranch: "Branch",
  posTerminalCashAccount: "Till",
  posTerminalReceiptSize: "Receipt size (mm)",
  posTerminalStatus: "Status",
  posTerminalRegister: "Register terminal",
  posTerminalActivate: "Activate",
  posTerminalDeactivate: "Deactivate",
  posTerminalNone: "No terminals registered",
  posCounterTitle: "Counter sale",
  posCounterScanPlaceholder: "Scan barcode or type item name",
  posCounterCart: "Cart",
  posCounterTotal: "Total",
  posCounterPay: "Pay",
  posCounterClear: "Clear",
  posCounterSalePosted: "Sale posted, invoice",
  posCounterSaleFailed: "Sale failed",
  posCounterOfflineBanner: "Offline — sales are saved locally and sync when reconnected",
  posCounterQueued: "Queued sales",
  posCounterEmpty: "Cart is empty",

  statusInactive: "Inactive",
  statusClosed: "Closed",
  statusIssued: "Issued",
  statusRejected: "Rejected",
  statusConverted: "Converted",
  statusTerminated: "Terminated",
  taxStatusLabel: "Tax registration status",
  taxStatusRegistered: "Registered",
  taxStatusNotRegistered: "Not registered",
  taxStatusDeregistered: "Deregistered",
  taxNumberLabel: "Tax registration number",
  fiscalStartMonthLabel: "Fiscal year start month",
  numberingAssignAtLabel: "Document number assignment",
  numberingAssignAtPosting: "At posting",
  numberingAssignAtApproval: "At approval",
  localeArabic: "العربية",
  localeEnglish: "English",

  registerTitle: "Create a new organization",
  registerSubtitle: "Create an owner account and a new organization in one step, then start a trial.",
  registerBusinessNameLabel: "Business name (English)",
  registerBusinessNameArLabel: "Business name (Arabic, optional)",
  registerCountryLabel: "Country",
  registerCurrencyLabel: "Base currency (derived from the country)",
  registerTemplateLabel: "Industry template",
  registerTaxNumberHint: "Required when the status is “Registered”.",
  registerOwnerSection: "Owner account",
  registerOwnerEmailLabel: "Owner email",
  registerOwnerNameLabel: "Owner full name",
  registerSubmit: "Create organization",
  registerSuccessTitle: "Your organization has been created",
  registerSuccessBody: "Check your email ({email}) then sign in. The trial period ends on {date}.",
  registerGoLogin: "Sign in",
  registerLoginPrompt: "Already have an account?",
  registerErrorEmailTaken: "This email is already registered — sign in instead of creating a new account.",
  registerErrorOptions: "Could not load the registration options (countries/templates) — reload the page.",

  onboardingTitle: "Workspace onboarding",
  onboardingSubtitle:
    "Provisioning creates your organization roles, the chart of accounts and the default numbering policies. It is safe to re-run: a second run creates no duplicates.",
  onboardingProvisionButton: "Provision workspace",
  onboardingResultTitle: "Provisioning result",
  onboardingRolesLabel: "Roles",
  onboardingAccountsLabel: "Accounts",
  onboardingPurposesLabel: "Account purposes",
  onboardingSettingsLabel: "Settings",
  onboardingCreatedCount: "Created: {created} — already existing: {existing}",
  onboardingZeroDuplicatesHint:
    "Nothing new was created — the workspace is already provisioned, which confirms that re-runs produce zero duplicates.",
  onboardingGoHome: "Go to home",
  onboardingGoBranches: "Manage branches",

  branchesTitle: "Branches",
  branchesEmpty: "No branches yet.",
  branchesColCode: "Code",
  branchesColName: "Name",
  branchesColNameAr: "Arabic name",
  branchesCreateTitle: "Create a branch",
  branchesCodeLabel: "Branch code",
  branchesNameLabel: "Branch name",
  branchesNameArLabel: "Arabic name (optional)",
  branchesCreateSubmit: "Add branch",
  branchesActivate: "Activate",
  branchesDeactivate: "Deactivate",
  branchesErrorCodeTaken: "This branch code is already used in this organization.",

  settingsTitle: "Organization settings",
  settingsProfileTitle: "Profile",
  settingsNameLabel: "Name (English)",
  settingsNameArLabel: "Arabic name",
  settingsTimezoneLabel: "Timezone",
  settingsProfileSubmit: "Save profile",
  settingsProfileSaved: "The profile has been saved.",
  settingsGeneralTitle: "General settings",
  settingsDefaultLocaleLabel: "Default locale",
  settingsNumeralSystemLabel: "Numeral system",
  settingsNumeralLatn: "Western digits (123)",
  settingsNumeralArab: "Arabic-Indic digits (١٢٣)",
  settingsHijriLabel: "Hijri date display",
  settingsHijriHint: "Display-only overlay — fiscal years stay Gregorian.",
  settingsFiscalNumberingTitle: "Fiscal calendar & numbering",
  settingsSupportTitle: "Support",
  settingsSupportOptInLabel: "Allow support sessions",
  settingsSupportOptInWarning:
    "Warning: enabling this allows the platform team to open time-boxed, audited support sessions that read your organization's data.",
  settingsTaxTitle: "Tax registration",
  settingsTaxPairHint:
    "The status and number are validated as a pair: the number is required while “Registered” and rejected otherwise.",
  settingsSave: "Save",
  settingsSaved: "Saved.",
  settingsErrorInvalidValue: "Invalid value for this setting.",

  supportSessionsTitle: "Support sessions",
  supportSessionsHint:
    "These are sessions the platform team opens on your request or with your consent; you can terminate any active opt-in session at any time.",
  supportColReason: "Reason",
  supportColTicket: "Ticket ref",
  supportColOpened: "Opened",
  supportColClosed: "Closed",
  supportColOptIn: "Opt-in?",
  supportEmpty: "No support sessions.",
  supportTerminate: "Terminate session",
  supportErrorAccessDenied:
    "Opening a support session requires the organization's opt-in or a declared incident ticket reference.",
  supportErrorExpired: "The support session has expired.",
  supportErrorNotActive: "This session is not active.",

  tenancyErrorFeatureNotEntitled: "This feature is not enabled for your organization.",
  tenancyErrorDependenciesMissing: "Activating the feature requires dependency keys that are not granted yet: {keys}",

  platformConsoleTitle: "Platform administration console",
  platformNoAccess: "This is the platform administration area — available to platform operations staff only.",
  platformTenantBadge: "Platform",
  platformSearchLabel: "Search organizations",
  platformSearchSubmit: "Search",
  platformColTenant: "Organization",
  platformColCountry: "Country",
  platformColPlan: "Plan",
  platformColCreated: "Created",
  platformEmpty: "No matching organizations.",
  platformProfileTitle: "Profile",
  platformPlanTitle: "Plan & subscription",
  platformPlanCurrentLabel: "Current plan",
  platformPlanNone: "No active subscription.",
  platformPlanAssignTitle: "Assign a plan",
  platformPlanLabel: "Plan",
  platformTrialDaysLabel: "Trial days (optional)",
  platformPlanSubmit: "Assign plan",
  platformPlanAssigned: "Plan “{plan}” assigned — granted keys: {count}.",
  platformEntitlementsTitle: "Entitlements",
  platformColFeatureKey: "Feature key",
  platformColSource: "Source",
  platformEntitlementsEmpty: "No entitlements granted.",
  platformGrantTitle: "Grant a feature",
  platformGrantFeatureLabel: "Feature key",
  platformGrantSourceLabel: "Source",
  platformGrantExpiresLabel: "Expires at",
  platformGrantExpiresHint: "Required for MANUAL grants.",
  platformGrantReasonLabel: "Reason",
  platformGrantSubmit: "Grant",
  platformGrantDone: "The feature has been granted.",
  platformRevoke: "Revoke",
  platformRevokeReasonLabel: "Revocation reason",
  platformGrantExpiryRequired: "Manual grants must carry an explicit expiry.",
  platformGrantUnknownKey: "Unknown feature key.",
  platformMembershipsTitle: "Memberships",
  platformBranchesTitle: "Organization branches",
  platformLifecycleTitle: "Suspend & restore",
  platformReasonLabel: "Reason (required)",
  platformSuspendButton: "Suspend organization",
  platformRestoreButton: "Restore organization",
  platformSuspendDone: "Organization suspended — {count} user session(s) killed.",
  platformRestoreDone: "Organization restored to active.",
  platformSupportTitle: "Support sessions",
  platformSupportOpenTitle: "Open a support session",
  platformSupportReasonLabel: "Reason",
  platformSupportTicketLabel: "Ticket reference (optional)",
  platformSupportHoursLabel: "Duration in hours (1-4)",
  platformSupportOpenSubmit: "Open session",
  platformSupportClose: "Close",
  platformSupportCloseReasonLabel: "Close reason",
  platformSupportSessionLabel: "Active session",
  platformReadDataTitle: "Read organization data",
  platformReadResourceLabel: "Resource",
  platformReadSubmit: "Read",
  platformNoActiveSession: "No active support session — open one first.",
  resourceUsers: "Users",
  resourceMemberships: "Memberships",
  resourceRoles: "Roles",
  resourceBranches: "Branches",
  resourceSettings: "Settings",
  resourceEntitlements: "Entitlements",
  resourceSubscription: "Subscription",
  resourceAccounts: "Accounts",
  resourceAuditEvents: "Audit events",

  platformAuditTitle: "Platform audit log",
  platformAuditPlatformOnly: "Platform events only",
  platformAuditTenantFilter: "Tenant id (optional)",
  platformAuditActionFilter: "Action (optional)",
  platformAuditApply: "Apply filters",
  platformAuditColAt: "When",
  platformAuditColAction: "Action",
  platformAuditColActor: "Actor",
  platformAuditViaPlatform: "Via platform admin",
  platformAuditNextPage: "Next page",
  platformAuditEmpty: "No events.",
  platformErrorInvalidTransition: "The organization's state does not allow this transition.",
  platformErrorPlanNotFound: "Unknown plan.",

  shellSkipToContent: "Skip to content",
  shellCommandSearch: "Search or jump to…",
  shellShortcutsTitle: "Keyboard shortcuts",
  shellClose: "Close",
  shellMore: "More",
  statusOffboarded: "Offboarded",
  wizardStepOf: "Step {current} of {total}",
  platformBackToConsole: "Back to the platform console",
  rolesEmpty: "No roles yet.",
  retryLabel: "Try again",

  // -- P6-T11a: shared labels -------------------------------------------------
  commonSave: "Save",
  commonCreate: "Create",
  commonCancel: "Cancel",
  commonOpen: "Open",
  commonClear: "Clear",
  commonConfirm: "Confirm",
  commonUnsavedChanges: "There are unsaved changes — continue anyway?",
  commonVersionConflict: "The record changed elsewhere — reload and retry.",
  statusDraft: "Draft",
  statusArchived: "Archived",
  kindLabel: "Kind",
  kindFilterAll: "All",
  colStatus: "Status",
  colName: "Name",
  listNextPage: "Next page",
  listPrevPage: "Previous page",
  listSearchLabel: "Search",
  namePreviewLabel: "Name preview",

  // -- P6-T11a: navigation + breadcrumbs ----------------------------------------
  navPartners: "Partners",
  navPartnersDirectory: "Partner directory",
  navPartnersNew: "New partner",
  navOpeningBalances: "Opening balances",
  navInventory: "Inventory",
  navItems: "Items",
  navItemsNew: "New item",
  navPriceLists: "Price lists",
  navImport: "Import & export",

  // -- PHASE-007: accounting -----------------------------------------------------
  navAccountingCoa: "Chart of accounts",
  navAccountingJournals: "Journal entries",
  navAccountingGl: "General ledger",
  navAccountingPeriods: "Fiscal calendar",
  navAccountingApprovals: "Approvals",
  navAccountingRates: "Exchange rates",
  accountingTitle: "Accounting",
  accountingJournalsTitle: "Journal entries",
  accountingJournalsNew: "New journal",
  accountingJournalsEmpty: "No journal entries yet",
  accountingColEntryNo: "Entry no.",
  accountingColEntryDate: "Date",
  accountingColCurrency: "Currency",
  accountingColTotal: "Total",
  accountingColStatus: "Status",
  accountingColCode: "Code",
  accountingColName: "Name",
  accountingColType: "Type",
  accountingColPostable: "Postable",
  accountingColDebit: "Debit",
  accountingColCredit: "Credit",
  accountingColBalance: "Balance",
  accountingSubmit: "Submit",
  accountingApprove: "Approve",
  accountingPost: "Post",
  accountingReverse: "Reverse",
  accountingCancel: "Cancel",
  accountingSaveDraft: "Save draft",
  accountingAddLine: "Add line",
  accountingRemoveLine: "Remove line",
  accountingDuplicateLine: "Duplicate line",
  accountingPartnerRequired: "Partner is required on this account",
  accountingBalanced: "Balanced",
  accountingUnbalanced: "Entry unbalanced",
  accountingDifference: "Δ",
  accountingLineTotal: "Line",
  accountingMemo: "Description",
  accountingCostCenter: "Cost center",
  accountingPartner: "Partner",
  accountingTaxCode: "Tax code",
  accountingAccount: "Account",
  accountingDescription: "Description",
  accountingCoaTitle: "Chart of accounts",
  accountingCoaEmpty: "No accounts",
  accountingPurposesTitle: "Account purposes",
  accountingPurposesEmpty: "No purpose mappings",
  accountingGlTitle: "General ledger",
  accountingGlEmpty: "No movements",
  accountingGlDrill: "Open entry",
  accountingPeriodsTitle: "Fiscal periods",
  accountingPeriodsEmpty: "No periods",
  accountingYearsTitle: "Fiscal years",
  accountingCreateYear: "Create fiscal year",
  accountingYearName: "Year name",
  accountingYearStart: "Start date",
  accountingYearEnd: "End date",
  accountingSoftClose: "Soft-close",
  accountingLock: "Lock",
  accountingReopen: "Reopen",
  accountingReopenReason: "Reopen reason",
  accountingReopenPrompt: "Enter the reopen reason (required)",
  accountingChecklist: "Close checklist",
  accountingChecklistOk: "OK",
  accountingChecklistBroken: "Broken",
  accountingChecklistNotRun: "Not run",
  accountingChecklistNotApplicable: "Not yet applicable",
  accountingApprovalsTitle: "Pending approvals",
  accountingApprovalsEmpty: "Nothing awaiting approval",
  accountingApprovalsSelfHint: "You cannot approve your own document",
  accountingApprovalsSubmittedBy: "Submitted by",
  accountingApprovalsTotalBase: "Total (base)",
  accountingApprovalsPreview: "Preview",
  accountingReject: "Reject",
  accountingRatesTitle: "Exchange rates",
  accountingRatesEmpty: "No rates",
  accountingRatesCurrency: "Currency",
  accountingRatesDate: "Date",
  accountingRatesRate: "Rate",
  accountingRatesSave: "Save rate",
  accountingPostedAt: "Posted at",
  accountingSource: "Source",
  accountingPreviewTitle: "Journal preview",
  statusPendingApproval: "Pending approval",
  statusApproved: "Approved",
  statusPosted: "Posted",
  statusReversed: "Reversed",
  statusCancelled: "Cancelled",
  accountingStatusOpen: "Open",
  accountingStatusSoftClosed: "Soft-closed",
  accountingStatusLocked: "Locked",
  accountingKindRegular: "Regular",
  accountingKindOpening: "Opening",
  accountingKindClosing: "Closing",
  accountingSearchPlaceholder: "Search by code or name…",
  accountingNewAccount: "New account",
  accountingAccountParent: "Parent account",
  accountingAccountCurrency: "Account currency (optional)",
  accountingIsGroup: "Group account (not postable)",
  accountingMapPurpose: "Map purpose to account",
  accountingPurposeKey: "Purpose",
  accountingPurposeAccount: "Account",
  accountingActiveFrom: "Active from",
  accountingLines: "Entry lines",
  accountingColAmount: "Amount",
  accountingColBase: "Base amount",
  accountingColDirection: "Direction",
  accountingColPeriod: "Period",
  accountingReference: "Reference",
  accountingExchangeRate: "Exchange rate",
  accountingRecurringTitle: "Recurring journals",
  accountingRecurringNew: "New recurring journal",
  accountingRecurringEmpty: "No recurring journals",
  accountingRecurringSchedule: "Schedule",
  accountingRecurringNextRun: "Next run",
  accountingRecurringAmountPolicy: "Amount policy",
  accountingRecurringFixed: "Fixed",
  accountingRecurringReenter: "Re-enter",
  accountingRecurringPause: "Pause",
  accountingRecurringActivate: "Activate",
  accountingRecurringGenerateDue: "Generate due entries",
  accountingPoliciesTitle: "Approval policies",
  accountingPoliciesEmpty: "No policies defined",
  accountingPolicyMode: "Mode",
  accountingPolicyThreshold: "Threshold (base currency)",
  accountingRunAr: "Run AR reconciliation",
  accountingRunAp: "Run AP reconciliation",
  accountingReconStatusOk: "Reconciled",
  accountingReconStatusBroken: "Broken",
  accountingPostOpening: "Post opening balances",
  accountingPostOpeningConfirm: "Opening balances post once through the OPENING period of the selected fiscal year. Continue?",
  obPostReadyNote: "Drafts are ready — posting runs once through the OPENING period of the selected fiscal year.",
  accountingYearEndExecute: "Execute year-end close",
  accountingYearEndReverse: "Reverse year-end close",
  accountingYearEndConfirm: "The system closing entry for the year will be generated. Continue?",
  accountingMovementsTitle: "Account movements",
  accountingRegisterTitle: "Journal register",
  accountingSelectAccount: "Select an account",
  accountingFromDate: "From date",
  accountingToDate: "To date",
  accountingReversalDate: "Reversal entry date",
  accountingReversalReason: "Reversal reason",
  accountingSoftClosePrompt: "Reason for posting into a soft-closed period (optional)",
  accountingRateHint: "Rate = base-currency units per 1 foreign unit",
  accountingErrEntryNotBalanced: "Entry unbalanced — total debits must equal total credits.",
  accountingErrPeriodLocked: "The fiscal period is locked — posting is not allowed.",
  accountingErrAccountNotPostable: "Account is not postable (archived or group).",
  accountingErrPurposeNotMapped: "Purpose is not mapped to an active account — no fallback posting, ever.",
  accountingErrMissingPartner: "AR/AP control lines require a partner.",
  accountingErrMissingFxRate: "No exchange rate for the given date.",
  accountingErrAlreadyPosted: "This document is already posted.",
  accountingErrAlreadyReversed: "This entry is already reversed.",
  accountingErrApprovalLimit: "Amount exceeds the approval threshold.",
  accountingErrSelfApproval: "You cannot approve a document you created.",
  accountingErrImmutable: "Posted entries are immutable — correction is reversal-only.",
  accountingErrState: "Document state does not allow this action.",
  accountTypeAsset: "Asset",
  accountTypeLiability: "Liability",
  accountTypeEquity: "Equity",
  accountTypeRevenue: "Revenue",
  accountTypeExpense: "Expense",
  accountingPostableYes: "Postable",
  accountingPostableNo: "Group",
  accountingPurposesHint: "One active mapping per purpose — the engine fails closed on any unmapped purpose (no fallback posting).",

  // -- T14-UI: PHASE-008 treasury --------------------------------------------------
  navTreasury: "Treasury",
  navTreasuryAccounts: "Cash accounts",
  navTreasuryReceipts: "Receipts",
  navTreasuryPayments: "Payments",
  navTreasuryExpenses: "Expenses",
  navTreasuryTransfers: "Cash transfers",
  navTreasuryShifts: "Cashier shifts",
  navTreasuryBankRec: "Bank reconciliation",
  treasuryAccountsTitle: "Cash accounts",
  treasuryAccountsEmpty: "No cash accounts yet — open the first one.",
  treasuryAccountOpenTitle: "Open cash account",
  treasuryAccountName: "Name (English)",
  treasuryAccountNameAr: "Name (Arabic)",
  treasuryAccountType: "Account type",
  treasuryAccountTypeCash: "Cash",
  treasuryAccountTypeBank: "Bank",
  treasuryAccountTypePetty: "Petty cash",
  treasuryAccountGlAccount: "GL control account",
  treasuryAccountCurrency: "Currency",
  treasuryAccountBranch: "Branch (optional)",
  treasuryColGlCode: "GL code",
  treasuryAccountBalance: "Balance",
  treasuryColMovements: "Movements",
  treasuryAccountCreatedToast: "Cash account opened.",
  treasuryAccountCloseBtn: "Close account",
  treasuryAccountCloseReason: "Close reason",
  treasuryAccountClosedToast: "Cash account closed.",
  treasuryAccountOpenedAt: "Opened at",
  treasuryAccountClosedAt: "Closed at",
  treasuryAccountMovementsTitle: "Account movements",
  treasuryAccountMovementsEmpty: "No movements yet.",
  treasuryColDirectionIn: "In",
  treasuryColDirectionOut: "Out",
  treasuryColBaseAmount: "Base amount",
  treasuryColValueDate: "Value date",
  treasuryColRate: "Rate",
  treasuryColSource: "Source",
  treasuryColMemo: "Memo",
  treasuryMethodCash: "Cash",
  treasuryMethodBank: "Bank transfer",
  treasuryMethodCheque: "Cheque",
  treasuryMethodCard: "Card",
  treasuryMethodTransfer: "Wire transfer",
  treasuryReceiptsTitle: "Receipts",
  treasuryReceiptsEmpty: "No receipts yet.",
  treasuryReceiptsNew: "New receipt",
  treasuryPaymentsTitle: "Payments",
  treasuryPaymentsEmpty: "No payments yet.",
  treasuryPaymentsNew: "New payment",
  treasuryColDocNo: "Doc no.",
  treasuryColPartner: "Partner",
  treasuryColMethod: "Method",
  treasuryColAmount: "Amount",
  treasuryColAllocated: "Allocated",
  treasuryColFx: "FX gain/loss",
  treasuryColPayer: "Payer",
  treasuryColPayee: "Payee",
  treasuryDocCashAccount: "Cash account",
  treasuryDocPartner: "Partner",
  treasuryDocMethod: "Method",
  treasuryDocCurrency: "Currency",
  treasuryDocAmount: "Amount",
  treasuryDocRate: "Exchange rate (optional)",
  treasuryDocRateHint: "Leave empty to use the value-date rate",
  treasuryDocValueDate: "Value date",
  treasuryDocReference: "Reference",
  treasuryDocDescription: "Description",
  treasuryDocDescriptionAr: "Description (Arabic)",
  treasuryDocCreatedToast: "Document created.",
  treasuryDocDetailTitle: "Document detail",
  treasuryDocPostedToast: "Posted {no} — journal {entry}.",
  treasuryDocReverseToast: "Document reversed.",
  treasuryDocReverseDate: "Reversal date",
  treasuryDocReverseReason: "Reversal reason",
  treasuryDocCancelToast: "Document cancelled.",
  treasuryDocOnAccount: "On account",
  treasuryDocJournalNo: "Journal no.",
  treasuryDocSideHint: "Receipts allocate AR (customer) open items; payments allocate AP (supplier) open items.",
  treasuryCancelReason: "Cancellation reason",
  treasuryOpenItemsTitle: "Open items",
  treasuryAllocationsTitle: "Document allocation",
  treasuryAllocationsEmpty: "No open items for this partner.",
  treasuryAllocationsHint: "Allocate the amount across open items — the remainder posts on account.",
  treasuryAllocationSuggestBtn: "Suggest FIFO allocation",
  treasuryAllocationSuggestToast: "Suggestion applied to {count} item(s).",
  treasuryAllocationColOutstanding: "Outstanding",
  treasuryAllocationTotals: "Allocation summary",
  treasuryAllocationTotalAllocated: "Total allocated",
  treasuryAllocationRemainder: "Unallocated",
  treasuryAllocationOnAccountHint: "The unallocated remainder posts to the partner's on-account balance.",
  treasuryAllocationOverError: "Allocations exceed the document amount.",
  treasuryAllocationSaveBtn: "Save allocation",
  treasuryAllocationSavedToast: "Allocation saved.",
  treasuryAllocationReloadBtn: "Reload items",
  treasuryExpensesTitle: "Expenses",
  treasuryExpensesEmpty: "No expense claims yet.",
  treasuryExpenseClaimNew: "Record expense",
  treasuryExpenseCategoriesTitle: "Expense categories",
  treasuryExpenseCategoriesEmpty: "No categories yet — create the first one.",
  treasuryExpenseCategoryNew: "New category",
  treasuryExpenseCategoryCode: "Category code",
  treasuryExpenseCategoryAccount: "Expense account",
  treasuryExpenseCategoryApproval: "Approval mode",
  treasuryExpenseApprovalNone: "No approval",
  treasuryExpenseApprovalSingle: "Single approver",
  treasuryExpenseCategoryCreatedToast: "Category created.",
  treasuryExpenseCreatedToast: "Expense recorded.",
  treasuryExpenseReceiptNote: "Receipt file uploads arrive with the files workspace — paste an existing receipt file id if you have one.",
  treasuryExpenseReceiptFileId: "Receipt file id (optional)",
  treasuryExpenseColNo: "Expense no.",
  treasuryExpenseColPayee: "Payee",
  treasuryExpenseColCategory: "Category",
  treasuryTransfersTitle: "Cash transfers",
  treasuryTransfersEmpty: "No transfers yet.",
  treasuryTransferNew: "New transfer",
  treasuryTransferFrom: "From account",
  treasuryTransferTo: "To account",
  treasuryTransferCreatedToast: "Transfer created.",
  treasuryTransferPostedToast: "Transfer posted.",
  treasuryTransferCancelledToast: "Transfer cancelled.",
  treasuryTransferSameAccountError: "Source and destination accounts must differ.",
  treasuryColFrom: "From",
  treasuryColTo: "To",
  treasuryColNo: "No.",
  treasuryColFee: "Fee",
  treasuryShiftsTitle: "Cashier shifts",
  treasuryShiftsEmpty: "No shifts yet.",
  treasuryShiftOpenTitle: "Open shift",
  treasuryShiftOpenBtn: "Open shift",
  treasuryShiftOpeningAmount: "Opening float",
  treasuryShiftCreatedToast: "Shift opened.",
  treasuryShiftStatusOpen: "Open",
  treasuryShiftStatusClosed: "Closed",
  treasuryShiftStatusCancelled: "Cancelled",
  treasuryShiftColShiftNo: "Shift no.",
  treasuryShiftColOpenedAt: "Opened at",
  treasuryShiftColClosedAt: "Closed at",
  treasuryShiftColCapturedIn: "Captured in",
  treasuryShiftColCapturedOut: "Captured out",
  treasuryShiftExpected: "Expected",
  treasuryShiftCounted: "Counted",
  treasuryShiftDifference: "Variance",
  treasuryShiftVarianceJournal: "Variance journal",
  treasuryShiftSupervisor: "Supervisor",
  treasuryShiftSupervisorPin: "Supervisor PIN",
  treasuryShiftSupervisorHint: "Required when the variance exceeds tolerance",
  treasuryShiftReason: "Close reason",
  treasuryShiftCloseToast: "Shift closed.",
  treasuryShiftCancelBtn: "Cancel shift",
  treasuryShiftCancelledToast: "Shift cancelled.",
  treasuryShiftPanelTitle: "Cashier shift",
  treasuryShiftCaptureTitle: "Capture movement",
  treasuryShiftCaptureHint: "Record cash in/out movements during the shift.",
  treasuryShiftCaptureBtn: "Capture",
  treasuryShiftCloseTitle: "Close shift",
  treasuryShiftCloseBtn: "Close",
  treasuryShiftBalanced: "Counts match",
  treasuryShiftVarianceNote: "Variance is non-zero — enter a reason and supervisor details when beyond tolerance.",
  treasuryShiftClosedNote: "Shift closed — read-only summary.",
  treasuryBankRecTitle: "Bank reconciliation",
  treasuryBankRecEmpty: "No statements yet — import the first one.",
  treasuryBankRecImportTitle: "Import statement",
  treasuryBankRecAdapter: "Import adapter",
  treasuryBankRecFile: "File",
  treasuryBankRecFileHint: "CSV or Excel file",
  treasuryBankRecPeriodStart: "Period start",
  treasuryBankRecPeriodEnd: "Period end",
  treasuryBankRecMappingHint: "Column mapping — optional with the generic adapters",
  treasuryBankRecMappingDate: "Date column",
  treasuryBankRecMappingAmount: "Amount column",
  treasuryBankRecMappingReference: "Reference column",
  treasuryBankRecMappingDescription: "Description column",
  treasuryBankRecImportBtn: "Import statement",
  treasuryBankRecImportedToast: "Statement imported.",
  treasuryBankRecStatementsTitle: "Bank statements",
  treasuryBankRecColFile: "File",
  treasuryBankRecColPeriod: "Period",
  treasuryBankRecColLines: "Lines",
  treasuryBankRecColImportedAt: "Imported at",
  treasuryBankRecStatusImported: "Imported",
  treasuryBankRecStatusReconciled: "Reconciled",
  treasuryBankRecOpeningBalance: "Opening balance",
  treasuryBankRecClosingBalance: "Closing balance",
  treasuryBankRecSelectStatement: "Select a statement to work on its lines.",
  treasuryBankRecLinesTitle: "Statement lines",
  treasuryBankRecColLineNo: "Line",
  treasuryBankRecColMatchState: "Match state",
  treasuryBankRecMatched: "Matched",
  treasuryBankRecUnmatched: "Unmatched",
  treasuryBankRecMatchAuto: "Auto",
  treasuryBankRecMatchManual: "Manual",
  treasuryBankRecAutoMatchBtn: "Auto-match",
  treasuryBankRecAutoMatchToast: "Matched {count} line(s).",
  treasuryBankRecManualMatch: "Manual match",
  treasuryBankRecMatchMovement: "Matched movement",
  treasuryBankRecUnmatchBtn: "Remove match",
  treasuryBankRecMatchedToast: "Match updated.",
  treasuryBankRecReconcileBtn: "Reconcile statement",
  treasuryBankRecReconcileHint: "Reconciling locks the statement period for this account.",
  treasuryBankRecReconciledToast: "Reconciled — period locked.",
  treasuryBankRecAgingTitle: "Aging — unmatched",
  treasuryBankRecAgingAsOf: "Aging as of",
  treasuryBankRecUnmatchedLinesTitle: "Unmatched statement lines",
  treasuryBankRecUnmatchedMovementsTitle: "Unmatched ledger movements",
  treasuryBankRecColAgeDays: "Age (days)",
  treasuryBankRecLoadAgingBtn: "Show aging",
  treasuryBankRecCashCheckTitle: "Cash reconciliation check",
  treasuryBankRecCashCheckAsOf: "As of",
  treasuryBankRecCashCheckBtn: "Run check",
  treasuryBankRecCashCheckOk: "Cash reconciles — no difference.",
  treasuryBankRecCashCheckBroken: "Cash reconciliation difference.",
  treasuryBankRecColControlBalance: "Control balance",
  treasuryBankRecColSubledgerBalance: "Subledger balance",
  treasuryBankRecColDiffCount: "Diffs",
  treasuryBankRecFilterAccount: "Filter by cash account",
  treasuryErrAccountExists: "A cash account with this name already exists.",
  treasuryErrAccountClosed: "The cash account is CLOSED — it cannot receive new documents.",
  treasuryErrAccountNotCloseable: "This account cannot be closed in its current state.",
  treasuryErrCurrencyMismatch: "The cash account currency does not match the document currency.",
  treasuryErrTypeInvalid: "Invalid cash-account type.",
  treasuryErrInvalidAmount: "Invalid amount — must be a positive decimal.",
  treasuryErrDocState: "The document state does not allow this action.",
  treasuryErrMissingFxRate: "No exchange rate for the given date.",
  treasuryErrAllocationExceedsDoc: "Allocations exceed the document amount.",
  treasuryErrAllocationExceedsItem: "Allocation exceeds the open item's outstanding amount.",
  treasuryErrOpenItemCurrency: "The open item currency differs from the document currency.",
  treasuryErrOpenItemPartner: "The open item belongs to a different partner.",
  treasuryErrOpenItemSide: "This document type allocates only the matching side (AR for receipts, AP for payments).",
  treasuryErrPettyLimit: "Amount exceeds the petty-cash limits — use the bank path or split the payment.",
  treasuryErrCategoryTaken: "Expense category code already in use.",
  treasuryErrReceiptRequired: "A receipt attachment is required at this amount.",
  treasuryErrApprovalRequired: "The expense must be approved before payout posting.",
  treasuryErrShiftAlreadyOpen: "This cash account already has an OPEN shift.",
  treasuryErrSupervisorRequired: "Variance exceeds tolerance — supervisor id + PIN + reason required.",
  treasuryErrSupervisorPin: "Supervisor PIN not set or incorrect.",
  treasuryErrShiftReason: "A reason is required to close a shift with a variance.",
  treasuryErrStatementTooLarge: "Statement exceeds the maximum line count.",
  treasuryErrStatementFormat: "Could not parse the statement file — check the format or adapter.",
  treasuryErrStatementReconciled: "Statement already reconciled — the period is locked.",
  treasuryErrPeriodLocked: "The date falls in a reconciled statement period for this account.",
  treasuryErrMovementMatched: "The cash movement is already matched to another statement line.",

  // -- P6-T11a: partner directory ------------------------------------------------
  partnersSearchPlaceholder: "Search by name, code, or tax number…",
  partnersKindLabel: "Partner kind",
  kindCustomer: "Customer",
  kindSupplier: "Supplier",
  kindBoth: "Customer & supplier",
  partnersColCode: "Code",
  partnersColCreditLimit: "Credit limit",
  partnersEmpty: "No partners yet — create the first one.",
  partnersNewButton: "New partner",
  partnerFormTitleCreate: "Create a partner",
  partnerCodeLabel: "Partner code",
  partnerCodeHint: "Leave empty for auto-numbering (P-000001).",
  partnerNameLabel: "Name (English)",
  partnerNameArLabel: "Name (Arabic)",
  partnerTaxNumberLabel: "Tax number",
  partnerCreditTermsLabel: "Credit terms",
  partnerPriceListLabel: "Price list",
  partnerStatusLabel: "Status",
  partnerCreatedToast: "Partner created.",
  partnerSavedToast: "Changes saved.",
  partnerCodeTaken: "Partner code is already in use.",
  partnerArchivedError: "The partner is archived — it cannot be edited.",
  partnerKindChangeLabel: "Change partner kind",
  partnerKindChangedToast: "Partner kind changed.",
  partnerKindImmutable: "The kind cannot change once posted entries exist.",
  partnerArchiveButton: "Archive partner",
  partnerArchiveConfirmTitle: "Confirm partner archive",
  partnerArchiveConfirmBody: "The archived partner disappears from new lists. Continue?",
  partnerArchivedToast: "Partner archived.",
  partnerTabOverview: "Overview",
  partnerContactsTitle: "Contacts",
  partnerContactNameLabel: "Name",
  partnerContactPhoneLabel: "Phone",
  partnerContactEmailLabel: "Email",
  partnerContactRoleLabel: "Role",
  partnerContactPrimaryLabel: "Primary",
  partnerContactAdd: "Add contact",
  partnerContactsEmpty: "No contacts.",
  partnerAddressesTitle: "Addresses",
  addressTypeLabel: "Address type",
  addressTypeBilling: "Billing",
  addressTypeShipping: "Shipping",
  addressTypeOther: "Other",
  partnerAddressLine1Label: "Address line 1",
  partnerAddressLine2Label: "Address line 2",
  partnerAddressCityLabel: "City",
  partnerAddressCountryLabel: "Country code (2 letters)",
  partnerAddressAdd: "Add address",
  partnerAddressesEmpty: "No addresses.",
  partnerBalanceTitle: "Balance",
  partnerBalanceOpenAmount: "Opening draft",
  partnerBalanceDraftLabel: "Draft balance",
  partnerBalanceOverdueLabel: "Overdue",
  partnerBalanceDraftBadge: "Drafts only",
  partnerBalanceDraftNote: "Balances at this phase derive from opening-balance DRAFTs only — nothing is posted yet (posting lands with accounting).",

  // -- P6-T11a: item master ----------------------------------------------------------
  itemsSearchPlaceholder: "Search by name or SKU…",
  itemsFilterCategoryLabel: "Category",
  categoryLabel: "Category",
  itemsColSku: "Item SKU",
  itemsColBasePrice: "Base price",
  itemsEmpty: "No items yet — create the first one.",
  itemsNewButton: "New item",
  itemFormTitleCreate: "Create an item",
  itemFormTitleEdit: "Item details",
  itemSkuLabel: "Item SKU",
  itemNameLabel: "Name (English)",
  itemNameArLabel: "Name (Arabic)",
  itemKindLabel: "Item kind",
  kindStock: "Stock",
  kindService: "Service",
  kindComposite: "Composite",
  itemUomLabel: "Unit of measure",
  itemCostingLabel: "Costing method",
  costingWac: "Weighted average (WAC)",
  costingFifo: "First-in first-out (FIFO)",
  itemTrackingLabel: "Tracking",
  itemTrackBatch: "Track batches",
  itemTrackSerial: "Serial numbers",
  itemTrackImei: "IMEI",
  itemHasExpiry: "Has expiry",
  itemExpiryRequiresBatch: "Expiry requires batch tracking — batch tracking was enabled automatically.",
  itemReorderLevelLabel: "Reorder level",
  itemReorderQtyLabel: "Reorder quantity",
  itemBasePriceLabel: "Base price",
  itemCreatedToast: "Item created.",
  itemSavedToast: "Changes saved.",
  itemSkuTaken: "Item SKU is already in use.",
  itemArchivedError: "The item is archived — it cannot be edited.",
  itemArchiveButton: "Archive item",
  itemArchiveConfirmTitle: "Confirm item archive",
  itemArchiveConfirmBody: "The archived item disappears from new documents. Continue?",
  itemArchivedToast: "Item archived.",
  barcodesTitle: "Barcodes",
  barcodeCodeLabel: "Barcode",
  barcodeAdd: "Add barcode",
  barcodesEmpty: "No barcodes.",
  barcodeTaken: "Barcode already in use (tenant-wide scan-unique).",

  // -- P6-T11a: price lists -----------------------------------------------------------
  priceListCreateTitle: "New price list",
  priceListsListTitle: "Lists",
  priceListNameLabel: "Name (English)",
  priceListNameArLabel: "Name (Arabic)",
  priceListKindLabel: "List kind",
  priceListKindSale: "Sale",
  priceListKindPurchase: "Purchase",
  priceListCurrencyLabel: "Currency",
  priceListValidFromLabel: "Valid from (optional)",
  priceListValidToLabel: "Valid to (optional)",
  priceListCreateSubmit: "Create list",
  priceListSelectHint: "Select a list in the table to edit its rows.",
  priceListRowsTitle: "List rows",
  priceListRowItemLabel: "Item",
  priceListRowUomLabel: "Unit of measure",
  priceListRowPriceLabel: "Unit price",
  priceListRowMinQtyLabel: "Minimum quantity",
  priceListRowAdd: "Add row",
  priceListRowAddedToast: "Row added.",
  priceListRowsEmpty: "No rows yet — add the first price.",
  priceListsEmpty: "No price lists yet.",
  priceListColValidLabel: "Period",
  priceListCreatedToast: "Price list created.",
  priceListCurrencySar: "Saudi riyal (SAR)",

  // -- P6-T11a: import & export wizard ---------------------------------------------------
  importStep1Title: "File & kind",
  importDataKindLabel: "Data kind",
  importKindPartners: "Partners",
  importKindItems: "Items",
  importKindOpeningBalances: "Opening balances",
  importFormatLabel: "Format",
  importCarrierLabel: "Upload carrier partner",
  importCarrierHint: "The import file is uploaded through the selected partner's attachment slot — this is this phase's direct-upload pattern.",
  importFileLabel: "File",
  importFileHint: "CSV or XLSX up to 8 MB and at most 5000 rows.",
  importSubmitPreview: "Upload & preview",
  importStep2Title: "Preview",
  importColTotal: "Total rows",
  importColValid: "Valid",
  importColInvalid: "Invalid",
  importColDuplicates: "Duplicates",
  importCommit: "Apply import",
  importCommitToast: "Import applied.",
  importCommitFailed: "Commit failed — check the job status.",
  importStep3Title: "Applied",
  importCommittedRows: "Applied {count} rows.",
  importColRow: "Row",
  importColPreview: "Preview",
  importColErrors: "Errors",
  importColWarnings: "Warnings",
  importRowValid: "Valid",
  importRowError: "Error",
  importRowDuplicate: "Duplicate",
  importRowWarning: "Warning",
  importPreviewEmpty: "The file has no rows.",
  importNewJob: "New import",
  importCarrierRequired: "Pick a carrier partner first.",
  importFileRequired: "Choose a file first.",
  importFileTooLarge: "The file exceeds the 8MB limit.",
  importFileTypeInvalid: "Unsupported type — CSV or XLSX only.",
  importUploadFailed: "Could not upload the file to storage.",
  importFormatCsv: "CSV",
  importFormatXlsx: "XLSX (Excel)",
  importJobsColCreated: "Created",
  importJobsTitle: "Import jobs",
  importJobsEmpty: "No import jobs.",
  importJobColRows: "Rows",
  importStatusPreviewing: "Previewing",
  importStatusPreviewReady: "Ready to apply",
  importStatusCommitting: "Committing",
  importStatusCommitted: "Committed",
  importStatusFailed: "Failed",
  importErrorFileInvalid: "Invalid file — check the format and the bounds.",
  exportTitle: "Export",
  exportHint: "Immediate export up to 10,000 rows — returns a temporary download link.",
  exportSubmit: "Export",
  exportDone: "Export ready — {rows} rows.",
  exportRows: "Row count",
  exportDownloadLabel: "Download the file",
  exportExpiresNote: "The link is valid for {seconds} seconds.",

  // -- P6-T11a: opening balances (DRAFT only) ------------------------------------------
  obTabPartner: "Partner",
  obTabAccount: "Account",
  obTabStock: "Stock",
  obCreateTitle: "Create opening balance (draft)",
  obAmountLabel: "Amount",
  obNoteLabel: "Note",
  obQtyLabel: "Quantity",
  obUnitCostLabel: "Unit cost",
  obAccountLabel: "Account id",
  obAccountHint: "The full account tree lands with accounting (PHASE-007) — enter the current account id.",
  obCreateSubmit: "Create draft",
  obEmpty: "No drafts yet.",
  obListTitle: "Current drafts",
  obDraftOnlyNote: "No posting at this phase — every opening balance is created as a DRAFT only.",
  obCreatedToast: "Draft created.",
  obColTarget: "Target",
  obColAmount: "Amount",
  obColQty: "Quantity",
  obColNote: "Note",
  obQtyAtCostLabel: "{qty} × {cost}",
  obTargetUnknown: "Unknown target",
  obDuplicateError: "A draft already exists for this target — one draft per target.",

  // -- P6-T11a: attachments --------------------------------------------------------------
  attachmentsTitle: "Attachments",
  attachmentIssueFormTitle: "Issue an upload slot",
  attachmentFilenameLabel: "Filename",
  attachmentContentTypeLabel: "Content type",
  attachmentSizeLabel: "Size (bytes)",
  attachmentTypePdf: "PDF",
  attachmentTypePng: "PNG",
  attachmentTypeJpeg: "JPEG",
  attachmentTypeWebp: "WebP",
  attachmentTypeCsv: "CSV",
  attachmentIssueButton: "Issue upload link",
  attachmentIssuedTitle: "Issued upload URL",
  attachmentIssuedHint: "PUT the file to the URL above within {seconds} seconds of issuance — direct browser upload completes with the full files module.",
  attachmentIssuedToast: "Upload link issued.",
  attachmentUrlLabel: "URL",
  attachmentKeyLabel: "Storage key",
  attachmentExpiresLabel: "Expires in (seconds)",
  attachmentsEmpty: "No attachments.",
  attachmentDownloadLabel: "Download",
  attachmentIssueFailed: "Could not issue the upload link.",

  // -- P6-T11a: pickers + command-menu remote groups ---------------------------------------
  partnerPickerPlaceholder: "Select a partner…",
  itemPickerPlaceholder: "Select an item…",
  pickerEmptyText: "No matches",
  commandGroupPartners: "Partners",
  commandGroupItems: "Items",

  // -- T15-UI: PHASE-009 tax screens --------------------------------------------------------
  taxCodesTitle: "Tax codes",
  taxCodesEmpty: "No tax codes yet — create the first one.",
  taxCodesCode: "Code",
  taxCodesName: "Name (English)",
  taxCodesNameAr: "Name (Arabic)",
  taxCodesCountry: "Country",
  taxCodesTreatment: "Tax treatment",
  taxCodesUsage: "Usage",
  taxCodesCreateTitle: "Create a tax code",
  taxCodesCreatedToast: "Tax code created.",
  taxCodesArchive: "Archive code",
  taxCodesArchiveConfirm: "The archived code disappears from new documents. Continue?",
  taxCodesArchiveBlocked: "Cannot archive a code referenced by items or categories — reassign them first.",
  taxCodesArchivedToast: "Tax code archived.",
  taxTreatmentStandardRated: "Standard rated",
  taxTreatmentZeroRated: "Zero rated",
  taxTreatmentExempt: "Exempt",
  taxTreatmentOutOfScope: "Out of scope",
  taxTreatmentReverseCharge: "Reverse charge",
  taxTreatmentNotSubject: "Not subject",
  taxResolveTitle: "Tax resolution preview",
  taxResolveDate: "Document date",
  taxResolveAmount: "Amount",
  taxResolveCode: "Tax code",
  taxResolveAction: "Resolve",
  taxResolveTreatment: "Treatment",
  taxResolveRate: "Rate",
  taxResolveBase: "Tax base",
  taxResolveTax: "Tax",
  taxResolveGross: "Gross (incl. tax)",
  taxResolveNotSubject: "This line is not subject to tax — no tax is computed.",
  taxResolveBoundaryWarning:
    "Boundary warning (BR-033): a rate of {rate} takes effect on {date} — drafts spanning the boundary are warned on open; posted snapshots never move.",
  taxRegistrationsTitle: "Tax registrations",
  taxRegistrationsEmpty: "No tax registrations yet.",
  taxRegistrationsStatus: "Registration status",
  taxRegistrationsNumber: "Tax registration number",
  taxRegistrationsEffectiveFrom: "Effective from",
  taxRegistrationsEffectiveTo: "Effective to",
  taxRegistrationsRegistered: "Registered",
  taxRegistrationsNotRegistered: "Not registered",
  taxRegistrationsDeregistered: "Deregistered",
  taxRegistrationsCreateTitle: "Update registration status",
  taxRegistrationsSavedToast: "Tax registration saved.",
  taxPacksTitle: "Jurisdiction packs",
  taxPacksEmpty: "No seeded packs.",
  taxPacksCountry: "Country",
  taxPacksVatStatus: "VAT status",
  taxPacksVatInForce: "In force",
  taxPacksVatPlanned: "Planned",
  taxPacksVatNoVat: "No VAT",
  taxPacksVersion: "Pack version",
  taxPacksVerification: "Verification",
  taxPacksVerified: "Verified",
  taxPacksRequiresVerification: "Requires verification",
  taxPacksRate: "Rate",
  taxPacksEffectiveFrom: "Effective from",
  taxPacksEffectiveTo: "Effective to",
  taxPacksSource: "Source ref",
  taxPacksWindowsTitle: "Rate windows",
  taxPacksNoRates: "No rate windows for this pack.",
  taxPacksApply: "Pin version",
  taxPacksApplied: "Pack version pinned for this workspace.",
  taxPacksBinding: "Pinned version (workspace)",
  taxPacksBindingNone: "No pin — the seeded version applies automatically.",
  taxPacksPreviewNote:
    "Upgrading a pack never rewrites posted snapshots — new windows apply to new documents only (BR-033).",
  vatReturnTitle: "VAT return",
  vatReturnEmpty: "No VAT returns yet.",
  vatReturnCountry: "Country",
  vatReturnPeriod: "Period",
  vatReturnPeriodStart: "Period start",
  vatReturnPeriodEnd: "Period end",
  vatReturnStatus: "Status",
  vatReturnDraft: "Draft",
  vatReturnReady: "Ready",
  vatReturnFiled: "Filed",
  vatReturnCreateTitle: "Create a VAT return",
  vatReturnCreatedToast: "VAT return created.",
  vatReturnPrepare: "Prepare return",
  vatReturnPreparedToast: "VAT return prepared.",
  vatReturnMarkFiled: "Mark as filed",
  vatReturnFiledToast: "VAT return marked as filed.",
  vatReturnFilingReference: "Filing reference",
  vatReturnFilingNote: "Filing note",
  vatReturnExport: "Export",
  vatReturnExportCsv: "Export CSV",
  vatReturnExportXlsx: "Export XLSX",
  vatReturnSummaryTitle: "Period summary by treatment",
  vatReturnDirection: "Direction",
  vatReturnDirectionOutput: "Output",
  vatReturnDirectionInput: "Input",
  vatReturnTaxableBase: "Taxable base",
  vatReturnTaxAmount: "Tax amount",
  vatReturnCrossCheck: "General-ledger cross-check",
  vatReturnDocumentSide: "Document side",
  vatReturnGlSide: "General ledger side",
  vatReturnOutputTax: "Output tax",
  vatReturnInputTax: "Input tax (recoverable)",
  vatReturnInputTaxExpensed: "Input tax (expensed)",
  vatReturnMismatch:
    "Cross-check failed (INV-012) — document totals differ from the general ledger; filing stays blocked until both sides agree.",
  vatReturnReadyNote: "Return is ready — the ledger cross-check agrees",
  taxErrCodeTaken: "This tax code already exists for this country.",
  taxErrCodeInUse: "The code is referenced by items or categories — reassign them first.",
  taxErrCodeArchived: "The tax code is archived and cannot be assigned to new documents.",
  taxErrRegistrationNumber:
    "A registration number (3–50 characters) is required while the status is “Registered” and rejected otherwise.",
  taxErrJurisdiction: "No seeded pack exists for this country.",
  taxErrNoRateForDate: "No seeded rate covers this date — resolution fails closed, never guessing.",
  taxErrWindowTaken: "A return for this period already exists.",
  taxErrCrossCheck: "The general-ledger cross-check failed — review the differences, then re-prepare.",
  taxErrState: "The VAT return's state does not allow this action.",
  taxErrAlreadyFiled: "The VAT return is filed and immutable.",
  taxErrPackBinding: "That pack version is not seeded — upgrades ship as seed migrations only.",

  // -- T14-UI (PHASE-010): inventory & warehousing --------------------------------
  navInventoryWarehouses: "Warehouses",
  navInventoryStock: "Stock on hand",
  navInventoryMoves: "Stock movements",
  navInventoryTransfers: "Stock transfers",
  navInventoryCounts: "Stock counting",
  warehousesTitle: "Warehouses",
  warehousesEmpty: "No warehouses yet.",
  warehousesCreateTitle: "Create warehouse",
  warehousesCodeLabel: "Warehouse code",
  warehousesNameLabel: "Name (English)",
  warehousesNameArLabel: "Name (Arabic)",
  warehousesBranchLabel: "Branch",
  warehousesGlAccountLabel: "GL inventory account (optional)",
  warehousesNoteLabel: "Note",
  warehousesCreatedToast: "Warehouse created.",
  warehousesDeactivate: "Deactivate",
  warehousesDeactivateTitle: "Deactivate warehouse",
  warehousesDeactivateConfirm:
    "Deactivating blocks new movements on this warehouse; movement history is preserved.",
  warehousesDeactivatedToast: "Warehouse deactivated.",
  warehousesReactivate: "Reactivate",
  warehousesReactivatedToast: "Warehouse reactivated.",
  warehousesColCode: "Code",
  warehousesColBranch: "Branch",
  warehousesColGlAccount: "GL account",
  stockTitle: "Stock on hand",
  stockEmpty: "No stock rows yet.",
  stockFilterWarehouse: "Warehouse",
  stockColItem: "Item",
  stockColWarehouse: "Warehouse",
  stockColQty: "Quantity",
  stockColAvgCost: "Average cost",
  stockNegativeBadge: "negative",
  movesTitle: "Stock movements",
  movesEmpty: "No stock movements yet.",
  movesFilterDirection: "Direction",
  movesFilterKind: "Move kind",
  movesColDate: "Date",
  movesColDirection: "Direction",
  movesColKind: "Kind",
  movesColUnitCost: "Unit cost",
  movesColValue: "Value",
  movesColReason: "Reason",
  movesColBatch: "Batch",
  movesColSerial: "Serial",
  movesColSource: "Source",
  movesDirectionIn: "IN",
  movesDirectionOut: "OUT",
  movesKindReceipt: "Receipt",
  movesKindIssue: "Issue",
  movesKindTransferIn: "Transfer in",
  movesKindTransferOut: "Transfer out",
  movesKindAdjust: "Adjustment",
  movesReasonDamage: "Damage",
  movesReasonExpired: "Expired",
  movesReasonCountLoss: "Count loss",
  movesReasonCountGain: "Count gain",
  movesReasonCustomerReturn: "Customer return",
  movesReasonOther: "Other",
  transfersTitle: "Stock transfers",
  transfersEmpty: "No transfers yet.",
  transfersColNo: "Transfer no.",
  transfersColFrom: "From warehouse",
  transfersColTo: "To warehouse",
  transfersColLines: "Lines",
  transfersColDispatchDate: "Dispatched",
  transfersColReceiveDate: "Received",
  transfersStatusInTransit: "In transit",
  transfersNewTitle: "New transfer",
  transfersFromLabel: "From warehouse",
  transfersToLabel: "To warehouse",
  transfersNoteLabel: "Note",
  transfersLinesTitle: "Transfer lines",
  transfersLineItemLabel: "Item",
  transfersLineQtyLabel: "Quantity",
  transfersAddLine: "Add line",
  transfersRemoveLine: "Remove line",
  transfersSameWarehouseError: "Source and destination warehouses must differ.",
  transfersLineMissingError: "Every line needs an item and a positive quantity.",
  transfersCreatedToast: "Transfer created (draft).",
  transfersDispatch: "Dispatch",
  transfersDispatchedToast: "Transfer dispatched — stock is in transit (not sellable).",
  transfersReceive: "Receive",
  transfersReceivedToast: "Transfer received at the destination warehouse.",
  transfersCancel: "Cancel",
  transfersCancelledToast: "Transfer cancelled.",
  countingTitle: "Stock counting",
  countingEmpty: "No count sessions yet.",
  countingNewTitle: "New count session",
  countingWarehouseLabel: "Warehouse",
  countingBlindLabel: "Blind count (hide book quantities)",
  countingPickItemsTitle: "Pick items",
  countingPickSearchPlaceholder: "Search by SKU or name…",
  countingPickEmpty: "No matching items.",
  countingSelectedCount: "Selected items",
  countingCreate: "Create session",
  countingCreatedToast: "Count session created — system-qty snapshot frozen.",
  countingColNo: "Count no.",
  countingColBlind: "Blind",
  countingBlindYes: "Yes",
  countingBlindNo: "No",
  countingColVariance: "Variance",
  countingOpenSession: "Open session",
  countingCloseSession: "Close session",
  countingSnapshotAt: "Snapshot at",
  countingSessionLinesTitle: "Count lines",
  countingColLineNo: "Line",
  countingColSystemQty: "System qty",
  countingColCountedQty: "Counted qty",
  countingColDiff: "Diff",
  countingColValueImpact: "Value impact",
  countingSaveEntries: "Save counts",
  countingEntriesSavedToast: "Counted quantities saved.",
  countingSubmit: "Submit for review",
  countingSubmittedToast: "Session submitted to variance review.",
  countingReviewTitle: "Variance review",
  countingReviewHint:
    "Review variances before approval — approval posts the count adjustment (loss/gain) through the posting engine.",
  countingApprove: "Approve",
  countingApproveSupervisor: "Approve with supervisor override",
  countingApprovedToast: "Count approved and the adjustment posted.",
  countingCancel: "Cancel",
  countingCancelledToast: "Count session cancelled.",
  countingRecountTitle: "Recount line",
  countingRecountLineLabel: "Line no.",
  countingRecountNoteLabel: "Recount reason",
  countingRecountedToast: "Recount recorded with audit.",
  countingStatusCounted: "Counted",
  countingStatusVarianceReview: "Variance review",
  inventoryErrWarehouseCodeTaken: "Warehouse code is already taken.",
  inventoryErrWarehouseInactive: "Warehouse is inactive.",
  inventoryErrWarehouseNotDeactivatable: "Warehouse cannot be deactivated (movements or count sessions in flight).",
  inventoryErrItemNotStocked: "Item is not stocked at this warehouse.",
  inventoryErrInsufficientStock: "Insufficient stock (negative stock is off by default).",
  inventoryErrBatchInsufficient: "Batch quantity is insufficient.",
  inventoryErrBatchRequired: "Item tracks batches — a batch is required.",
  inventoryErrBatchTaken: "Batch number is already taken for this item.",
  inventoryErrSerialRequired: "Item tracks serials — select the units.",
  inventoryErrSerialNotInStock: "Serial unit is not in stock.",
  inventoryErrSerialTaken: "Serial number is already taken.",
  inventoryErrSerialReturnBinding: "A serial return must reference the originally sold unit.",
  inventoryErrState: "Document state does not allow this action.",
  inventoryErrTransferEmpty: "A transfer needs at least one line.",
  inventoryErrTransferSameWarehouse: "Source and destination warehouses must differ.",
  inventoryErrCountTolerance: "Variance exceeds tolerance — supervisor approval required.",
  inventoryErrMethodSwitchInFlight: "Cannot switch method with in-flight movements.",
  inventoryErrMethodSwitchInvalid: "Method switch is not valid (no balance or same method).",
  inventoryErrMethodSwitchSame: "Item already uses this method.",
  // PHASE-011 purchasing (T13-UI).
  purchasingEmpty: "No documents yet",
  purchasingNoticeCreated: "Document created",
  purchasingNoticeUpdated: "Updated",
  purchasingNoticePosted: "Posted",
  expensesColAccount: "Account",
  navPurchasingOrders: "Purchase orders",
  navPurchasingReceipts: "Goods receipts",
  navPurchasingInvoices: "Supplier invoices",
  navPurchasingDebitNotes: "Debit notes",
  navPurchasingAp: "Payables",
  purchasingOrdersTitle: "Purchasing — Purchase orders",
  purchasingReceiptsTitle: "Purchasing — Goods receipts",
  purchasingInvoicesTitle: "Purchasing — Supplier invoices",
  purchasingDebitNotesTitle: "Purchasing — Debit notes",
  purchasingApTitle: "Purchasing — Payables",
  purchasingRequestsSection: "Purchase requests",
  purchasingOrdersSection: "Purchase orders",
  purchasingNewRequest: "New purchase request",
  purchasingNewOrder: "New purchase order",
  purchasingRequestNo: "Request no.",
  purchasingNeededBy: "Needed by",
  purchasingSubmit: "Submit",
  purchasingApprove: "Approve",
  purchasingReject: "Reject",
  purchasingIssue: "Issue",
  purchasingClose: "Close",
  purchasingCancel: "Cancel",
  purchasingOrderNo: "Order no.",
  purchasingOrderDate: "Order date",
  purchasingExpectedDate: "Expected date",
  purchasingSupplier: "Supplier",
  purchasingLines: "Lines",
  purchasingAddLine: "Add line",
  purchasingRemoveLine: "Remove line",
  purchasingItem: "Item",
  purchasingQty: "Qty",
  purchasingUnitPrice: "Unit price",
  purchasingTaxCode: "Tax code",
  purchasingUnitCost: "Unit cost",
  purchasingTotalNet: "Net",
  purchasingTotalTax: "Tax",
  purchasingTotalGross: "Gross",
  purchasingStatus: "Status",
  purchasingNewReceipt: "New goods receipt",
  purchasingReceiptNo: "Receipt no.",
  purchasingReceiptDate: "Receipt date",
  purchasingWarehouse: "Warehouse",
  purchasingPo: "Purchase order",
  purchasingPoLessReason: "PO-less reason (direct purchase)",
  purchasingPost: "Post",
  purchasingBatchNo: "Batch no.",
  purchasingBatchExpiry: "Expiry date",
  purchasingNewInvoice: "New supplier invoice",
  purchasingInvoiceNo: "Supplier invoice no.",
  purchasingInvoiceDate: "Invoice date",
  purchasingDueDate: "Due date",
  purchasingInternalNo: "Internal no.",
  purchasingMatchStatus: "Match status",
  purchasingMatchPreview: "Three-way match preview",
  purchasingRecordMatch: "Record match",
  purchasingDisposition: "Disposition",
  purchasingDispositionReason: "Disposition reason",
  purchasingDispositionAccept: "Accept with reason",
  purchasingMatchOutcomeMatched: "Matched",
  purchasingMatchOutcomeException: "Exception",
  purchasingMatchOutcomeDispositioned: "Disposed",
  purchasingMatchOutcomePending: "Pending",
  purchasingQtyVariance: "Qty variance %",
  purchasingPriceVariance: "Price variance %",
  purchasingNewDebitNote: "New debit note",
  purchasingNoteNo: "Note no.",
  purchasingNoteDate: "Note date",
  purchasingRefInvoice: "Referenced invoice",
  purchasingApAging: "AP aging",
  purchasingApStatement: "Supplier statement",
  purchasingGrniRegister: "GRNI register",
  purchasingAgingNotDue: "Not due",
  purchasingAging1_30: "1–30 days",
  purchasingAging31_60: "31–60 days",
  purchasingAging61_90: "61–90 days",
  purchasingAging90Plus: "90+ days",
  purchasingAgingTotal: "Total",
  purchasingAsOf: "As of",
  purchasingOpeningBalance: "Opening balance",
  purchasingClosingBalance: "Closing balance",
  purchasingDebit: "Debit",
  purchasingCredit: "Credit",
  purchasingBalance: "Balance",
  purchasingOutstanding: "Outstanding",
  purchasingReceivedValue: "Received value",
  purchasingInvoicedValue: "Invoiced value",
  purchasingGrniRemaining: "Not invoiced",
  purchasingSelectSupplier: "Select supplier",
  purchasingSelectWarehouse: "Select warehouse",
  purchasingSelectPo: "Select purchase order",
  purchasingNoPo: "No purchase order",
  purchasingErrState: "Document state does not allow this operation",
  purchasingErrDuplicate: "Duplicate supplier invoice (number + amount)",
  purchasingErrMatchMissing: "Record the three-way match outcome first",
  purchasingErrMatchException: "Undisposed match exceptions — dispose them first",
  purchasingErrPoLess: "Policy forbids receipts without a purchase order",
  purchasingErrPoLessReason: "A PO-less reason is required",
  purchasingErrOverReceipt: "Receipt exceeds the purchase order line",
  purchasingErrOverInvoice: "Invoiced quantity exceeds the received quantity",
  purchasingErrNotSupplier: "Partner is not a supplier",
  purchasingErrGrnSupplier: "GRN line belongs to a different supplier",
  purchasingErrSelfApproval: "The document creator cannot approve it",
  purchasingErrReallocation: "Re-allocation exceeds the allowed bounds",
  // PHASE-012 sales (T13-UI).
  salesEmpty: "No documents yet",
  salesNoticeCreated: "Document created",
  salesNoticeUpdated: "Updated",
  salesNoticePosted: "Posted",
  navSalesQuotes: "Quotations",
  navSalesOrders: "Sales orders",
  navSalesDeliveries: "Delivery notes",
  navSalesInvoices: "Sales invoices",
  navSalesCreditNotes: "Credit notes",
  navSalesAr: "Receivables",
  salesQuotesTitle: "Sales — Quotations & orders",
  salesOrdersTitle: "Sales — Sales orders",
  salesDeliveriesTitle: "Sales — Delivery notes",
  salesInvoicesTitle: "Sales — Invoices",
  salesCreditNotesTitle: "Sales — Credit notes",
  salesArTitle: "Sales — Receivables",
  salesQuotesSection: "Quotations",
  salesOrdersSection: "Sales orders",
  salesStatus: "Status",
  salesStatusSent: "Sent",
  salesNewQuote: "New quotation",
  salesNewOrder: "New sales order",
  salesQuoteNo: "Quote no.",
  salesQuoteDate: "Quote date",
  salesValidUntil: "Valid until",
  salesOrderNo: "Order no.",
  salesOrderDate: "Order date",
  salesExpectedDate: "Expected date",
  salesSalesOrder: "Sales order",
  salesNoOrder: "No sales order",
  salesCustomer: "Customer",
  salesSelectCustomer: "Select customer",
  salesBranch: "Branch",
  salesSelectBranch: "Select branch",
  salesWarehouse: "Warehouse",
  salesSelectWarehouse: "Select warehouse",
  salesCurrency: "Currency",
  salesExchangeRate: "Exchange rate",
  salesItem: "Item",
  salesQty: "Qty",
  salesUnitPrice: "Unit price",
  salesDiscount: "Discount",
  salesTaxCode: "Tax code",
  salesAccount: "Account",
  salesLines: "Lines",
  salesAddLine: "Add line",
  salesRemoveLine: "Remove line",
  salesTotalNet: "Net",
  salesTotalTax: "Tax",
  salesTotalGross: "Gross",
  salesSend: "Send",
  salesAccept: "Accept & convert",
  salesReject: "Reject",
  salesSubmit: "Submit",
  salesApprove: "Approve",
  salesIssue: "Issue",
  salesClose: "Close",
  salesPost: "Post",
  salesCancel: "Cancel",
  salesCancelReason: "Cancel reason",
  salesReserve: "Reserve stock",
  salesAcceptWarehouse: "Conversion warehouse",
  salesNewDelivery: "New delivery note",
  salesDeliveryNo: "Delivery no.",
  salesDeliveryDate: "Delivery date",
  salesDelivery: "Delivery note",
  salesCogsValue: "COGS value",
  salesNewInvoice: "New sales invoice",
  salesInvoiceNo: "Invoice no.",
  salesInvoiceDate: "Invoice date",
  salesDueDate: "Due date",
  salesKind: "Invoice kind",
  salesKindCash: "Cash",
  salesKindCredit: "Credit",
  salesCashAccount: "Cash account",
  salesSelectCashAccount: "Select cash account",
  salesOverrideCredit: "Override credit block",
  salesCreditCheck: "Credit check",
  salesCreditAllow: "Allow",
  salesCreditWarn: "Warn",
  salesCreditBlock: "Block",
  salesNewCreditNote: "New credit note",
  salesNoteNo: "Note no.",
  salesNoteDate: "Note date",
  salesRefInvoice: "Referenced invoice",
  salesInvoiceLineId: "Invoice line id",
  salesReturnToStock: "Return to stock",
  salesArAging: "AR aging",
  salesArStatement: "Customer statement",
  salesArOpenItems: "Open items",
  salesOpenItemsHint: "These open items are the allocation surface consumed by receipts (FIFO / partial / on-account)",
  salesAgingNotDue: "Not due",
  salesAging1_30: "1–30 days",
  salesAging31_60: "31–60 days",
  salesAging61_90: "61–90 days",
  salesAging90Plus: "90+ days",
  salesAgingTotal: "Total",
  salesAsOf: "As of",
  salesOpeningBalance: "Opening balance",
  salesClosingBalance: "Closing balance",
  salesDebit: "Debit",
  salesCredit: "Credit",
  salesBalance: "Balance",
  salesOutstanding: "Outstanding",
  salesBaseBalance: "Base-currency balance",
  salesSubledgerTie: "AR subledger tie",
  salesTieOk: "Tied",
  salesTieBroken: "Broken",
  salesSource: "Source",
  salesAmount: "Amount",
  salesRunOverdueScan: "Overdue scan",
  salesOverdueScanDone: "Scan complete: {overdue} overdue invoices, {alerted} alerts",
  salesPrint: "Print",
  salesPrintDisabled: "Printing arrives with the reporting release (PHASE-013)",
  salesErrState: "Document state does not allow this operation",
  salesErrQuotationExpired: "The quotation expired — issue a new one",
  salesErrCreditLimit: "Credit limit exceeded (block/warn per policy)",
  salesErrReturnWindow: "Return outside the allowed return window",
  salesErrPriceChanged: "Price changed — re-open the document to recompute",
  salesErrItemInactive: "Item is inactive and cannot receive sales documents",
  salesErrDeliveryInvoiced: "Invoiced quantity exceeds the delivered quantity",
  salesErrCreditNoteExceeds: "Credit note exceeds the invoice outstanding",
  salesErrReallocation: "Re-allocation exceeds the allowed bounds",

  // -- T-WEB (PHASE-013): the report workspace (report archetype §7) --------
  navReports: "Reports",
  reportsNavWorkspace: "Reports",
  reportWorkspaceTitle: "Reports workspace",
  reportWorkspaceCatalog: "Report catalog",
  reportWorkspaceNoReport: "No report selected yet — pick one from the catalog",
  reportWorkspaceDateFrom: "From date",
  reportWorkspaceDateTo: "To date",
  reportWorkspaceAsOfLabel: "As-of date",
  reportWorkspaceLocale: "Report language",
  reportWorkspaceRun: "Run report",
  reportWorkspaceQueued: "Queued",
  reportWorkspaceRunning: "Running",
  reportWorkspaceStage: "Stage",
  reportWorkspaceStatus: "Status",
  reportWorkspaceStatusSucceeded: "Succeeded",
  reportWorkspaceStatusFailed: "Failed",
  reportWorkspaceDuration: "Duration",
  reportWorkspaceTotals: "Totals",
  reportWorkspaceAssertions: "Reconciliation assertions",
  reportWorkspaceAssertionFailed: "Reconciliation assertion failed — export disabled",
  reportWorkspaceAsOf: "As of {date}",
  reportWorkspaceComputedAt: "Computed {datetime}",
  reportWorkspaceEmpty: "This result has no rows",
  reportWorkspaceSavedViews: "Saved views",
  reportWorkspaceSaveView: "Save current view",
  reportWorkspaceViewNameAr: "View name (Arabic)",
  reportWorkspaceViewNameEn: "View name (English)",
  reportWorkspaceApply: "Apply",
  reportWorkspaceDeleteView: "Delete",
  reportWorkspaceRunHistory: "Run history",
  reportWorkspaceRefresh: "Refresh",
  reportWorkspaceBack: "Back to catalog",
  reportWorkspaceExportPdf: "Export PDF",
  reportWorkspaceExportXlsx: "Export XLSX",
  reportWorkspaceExportCsv: "Export CSV",
  reportWorkspacePrintPreview: "Print preview",
  reportWorkspaceExportBlocked: "Export blocked: this result failed its reconciliation check",
  reportWorkspaceViewSaved: "View saved",
  reportWorkspaceColReport: "Report",
  reportWorkspaceNoRuns: "No previous runs",
};

const dictionaries: Record<Locale, Dictionary> = { ar, en };

/**
 * Gregorian month names (index 0 = January) for the fiscal-start-month
 * select (P4-T12a onboarding + settings screens). Fiscal years stay
 * Gregorian by design (A-004) — these are display labels only.
 */
export const monthNames: Record<Locale, readonly string[]> = {
  ar: [
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
  ],
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
};

/**
 * Key-parity assertion: `Object.keys(ar) === Object.keys(en)`. TypeScript
 * already guarantees this through the `Dictionary` interface; the runtime
 * check keeps the parity contract green even if the dictionaries are ever
 * assembled dynamically. Executed at module load on first import.
 */
export function assertDictionaryParity(): void {
  const arKeys = Object.keys(dictionaries.ar).sort().join(",");
  const enKeys = Object.keys(dictionaries.en).sort().join(",");
  if (arKeys !== enKeys) {
    throw new Error(`dictionary key parity violation between "ar" and "en"`);
  }
}

assertDictionaryParity();

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

/** The "other" locale — locale switching is a 1:1 link swap. */
export function otherLocale(locale: Locale): Locale {
  return locale === "ar" ? "en" : "ar";
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
