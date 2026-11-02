import type { ReportContract } from "../application/contract";
import {
  faAssetRegisterContract,
  faDepreciationScheduleContract,
  faMovementsContract,
} from "./fixed-assets/contracts";
import {
  notesMaturityCalendarContract,
  notesAgingContract,
  notesDishonoredContract,
  installmentsScheduleContract,
  installmentsAgingContract,
} from "./notes-installments/contracts";
import {
  budgetVsActualContract,
  varianceAnalysisContract,
} from "./budgeting/contracts";
import {
  payrollRegisterContract,
  payrollCostSummaryContract,
  payrollEosProvisionContract,
} from "./payroll/contracts";


/**
 * PHASE-013 · the report-contract registry (REPORTING_ARCHITECTURE §2):
 * every code-defined contract, assembled. The module's boot hook
 * (ReportingModule.onModuleInit) validates the full set — a malformed
 * contract fails startup; the meta-tests assert the failure modes.
 * Registered rows are the PHASE-013 set of REPORT_CATALOG §1–§7 whose
 * data phases (003–012) are delivered (§13 readiness matrix).
 */

import {
  trialBalanceContract,
  generalLedgerContract,
  incomeStatementContract,
  balanceSheetContract,
  cashFlowContract,
  journalRegisterContract,
  costCentersContract,
} from "./financial/statements";
import { fiscalClosePackContract } from "./financial/close-pack";
import {
  arAgingContract,
  apAgingContract,
  partnerStatementContract,
  supplierStatementContract,
  arAllocationsContract,
  partnerBalancesContract,
} from "./operational/ar-ap";
import {
  salesByItemContract,
  salesByCustomerContract,
  salesByRepContract,
  salesByPaymentMethodContract,
  salesByBranchContract,
  salesDocumentFlowContract,
  salesProfitabilityContract,
} from "./operational/sales";
import {
  purchasingBySupplierContract,
  purchasingByItemContract,
  purchasingGrniContract,
  purchasingPoStatusContract,
  purchasingMatchingExceptionsContract,
} from "./operational/purchasing";
import {
  inventoryStockOnHandContract,
  inventoryMovementContract,
  inventoryValuationContract,
  inventoryExpiryContract,
  inventoryCountVarianceContract,
  inventoryTransferLogContract,
  inventorySerialTrackingContract,
  inventorySlowMovingContract,
} from "./operational/inventory";
import {
  posSalesByTerminalContract,
  posSalesByHourContract,
  treasuryShiftCashReconciliationContract,
} from "./operational/pos";
import {
  inventoryExpiryListContract,
  groceryExpiryWriteoffContract,
  retailImeiRegisterContract,
} from "./operational/industry";
import {
  manufacturingProductionCostContract,
  manufacturingBatchGenealogyContract,
  manufacturingQcInspectionLogContract,
} from "./operational/industry-018";
import {
  servicesContractRevenueScheduleContract,
  servicesTimeBillingSummaryContract,
} from "./operational/industry-019";
import {
  automotiveJobCardProfitabilityContract,
  automotiveVehicleServiceHistoryContract,
  distributionRepSettlementContract,
  distributionRouteVisitComplianceContract,
  distributionVanStockBalancesContract,
  salesCommissionsDueContract,
  salesDiscountEffectivenessContract,
} from "./operational/industry-017";
import {
  treasuryDailyCashContract,
  treasuryReceiptsRegisterContract,
  treasuryPaymentsRegisterContract,
  treasuryPettyCashContract,
  treasuryExpensesContract,
  treasuryShiftsContract,
  treasuryBankReconContract,
  treasuryFxDifferencesContract,
  taxVatReturnContract,
  taxSummaryByTreatmentContract,
  platformAuditTrailContract,
  platformUserActivityContract,
  platformReportRunsContract,
  platformSubscriptionUsageContract,
} from "./operational/treasury-tax-platform";

export const REPORT_CONTRACTS: readonly ReportContract[] = Object.freeze([
  // §1 financial statements
  trialBalanceContract,
  generalLedgerContract,
  incomeStatementContract,
  balanceSheetContract,
  cashFlowContract,
  fiscalClosePackContract,
  journalRegisterContract,
  costCentersContract,
  // §2 AR/AP
  arAgingContract,
  apAgingContract,
  partnerStatementContract,
  supplierStatementContract,
  arAllocationsContract,
  partnerBalancesContract,
  // §3 sales & purchasing
  salesByItemContract,
  salesByCustomerContract,
  salesByRepContract,
  salesByPaymentMethodContract,
  salesByBranchContract,
  salesDocumentFlowContract,
  salesProfitabilityContract,
  purchasingBySupplierContract,
  purchasingByItemContract,
  purchasingGrniContract,
  purchasingPoStatusContract,
  purchasingMatchingExceptionsContract,
  // §4 inventory
  inventoryStockOnHandContract,
  inventoryMovementContract,
  inventoryValuationContract,
  inventoryExpiryContract,
  inventoryCountVarianceContract,
  inventoryTransferLogContract,
  inventorySerialTrackingContract,
  inventorySlowMovingContract,
  // PHASE-015 T10 industry pins
  inventoryExpiryListContract,
  groceryExpiryWriteoffContract,
  retailImeiRegisterContract,
  // PHASE-017 T13 industry reports
  automotiveJobCardProfitabilityContract,
  automotiveVehicleServiceHistoryContract,
  distributionRepSettlementContract,
  distributionRouteVisitComplianceContract,
  distributionVanStockBalancesContract,
  salesCommissionsDueContract,
  salesDiscountEffectivenessContract,
  // PHASE-018 manufacturing reports
  manufacturingProductionCostContract,
  manufacturingBatchGenealogyContract,
  manufacturingQcInspectionLogContract,
  // PHASE-019 services reports
  servicesContractRevenueScheduleContract,
  servicesTimeBillingSummaryContract,
  // PHASE-016 T12 POS end-of-day reports
  posSalesByTerminalContract,
  posSalesByHourContract,
  treasuryShiftCashReconciliationContract,
  // §5 treasury
  treasuryDailyCashContract,
  treasuryReceiptsRegisterContract,
  treasuryPaymentsRegisterContract,
  treasuryPettyCashContract,
  treasuryExpensesContract,
  treasuryShiftsContract,
  treasuryBankReconContract,
  treasuryFxDifferencesContract,
  // §6 tax
  taxVatReturnContract,
  taxSummaryByTreatmentContract,
  // §7 platform
  platformAuditTrailContract,
  platformUserActivityContract,
  platformReportRunsContract,
  platformSubscriptionUsageContract,
  // PHASE-026 §J fixed-assets reports
  faAssetRegisterContract,
  faDepreciationScheduleContract,
  faMovementsContract,
  // PHASE-027 notes + installments reports
  notesMaturityCalendarContract,
  notesAgingContract,
  notesDishonoredContract,
  installmentsScheduleContract,
  installmentsAgingContract,
  // PHASE-028 budgeting variance reports
  budgetVsActualContract,
  varianceAnalysisContract,
  // PHASE-029 payroll reports
  payrollRegisterContract,
  payrollCostSummaryContract,
  payrollEosProvisionContract,
]);

export { validateRegistry, registrySnapshot } from "./runtime";
