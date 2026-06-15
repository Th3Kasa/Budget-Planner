import { format, startOfWeek } from "date-fns";
import { BudgetState, IncomeStream } from "../types";
import {
  calculateWeeklyTax,
  calculateCentrelink,
  calculateSuper,
  getCurrentFinancialYear,
  DEFAULT_JOBSEEKER_MAX_FORTNIGHTLY,
  FinancialYear,
} from "./calculators";

// The Monday (yyyy-MM-dd) of the week a given date falls in.
export function weekStartOf(date: Date = new Date()): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

// Payslips are one-off logs: they only count toward the budget for their own
// week. Every other stream type is an ongoing weekly plan and always counts.
export function isIncomeActive(
  inc: IncomeStream,
  weekStart: string = weekStartOf(),
): boolean {
  if (inc.type !== "payslip") return true;
  // A payslip must be anchored to a specific week. An unanchored one (missing
  // weekStarting) is treated as inactive rather than counting every week.
  if (!inc.weekStarting) return false;
  return inc.weekStarting === weekStart;
}

// Single source of truth for an income stream's gross weekly amount.
export function calculateIncomeAmount(inc: IncomeStream): number {
  if (inc.type === "payslip") return inc.grossPay || 0;
  if (inc.type === "casual") {
    if (inc.useShifts && inc.shifts) {
      return inc.shifts.reduce((sum, shift) => {
        const basePay = (shift.hours || 0) * (inc.hourlyRate || 0);
        const otPay = (shift.overtimeHours || 0) * (shift.overtimeRate || 0);
        return (
          sum +
          basePay +
          otPay +
          (shift.travelAllowance || 0) +
          (shift.mealAllowance || 0)
        );
      }, 0);
    }
    return (inc.hourlyRate || 0) * (inc.hoursWorked || 0);
  }
  return inc.amount || 0;
}

export interface IncomeSummary {
  taxableWeeklyIncome: number;
  untaxedWeeklyIncome: number;
  weeklyGrossIncome: number;
  netWeekly: number;
  totalDeductions: number;
  weeklyTax: number;
  weeklyMedicare: number;
  weeklyHecs: number;
  centrelinkWeekly: number;
  superContribution: number;
  totalNetIncome: number;
  financialYear: FinancialYear;
}

// Full weekly income picture: gross, tax/Medicare/HECS deductions,
// Centrelink top-up (if enabled) and untaxed cash income.
//
// Two kinds of taxable income are combined:
//   - Estimated streams (casual/fixed): run through the ATO tax estimator.
//   - Payslip streams: gross, tax and super are taken straight off the slip,
//     so they bypass the estimator entirely. Payslips only count for their
//     own week (one-off logs), so stale ones are filtered out here.
export function summarizeIncome(state: BudgetState): IncomeSummary {
  const weekStart = weekStartOf();
  const active = state.incomes.filter((i) => isIncomeActive(i, weekStart));

  // Estimated-tax streams: casual/fixed, non-cash.
  const estimatedTaxable = active
    .filter((i) => i.type !== "payslip" && !i.isCash)
    .reduce((acc, inc) => acc + calculateIncomeAmount(inc), 0);

  // Untaxed cash (casual/fixed marked as cash).
  const untaxedWeeklyIncome = active
    .filter((i) => i.type !== "payslip" && i.isCash)
    .reduce((acc, inc) => acc + calculateIncomeAmount(inc), 0);

  // Payslip actuals — tax and super already withheld, so use them as-is.
  const payslips = active.filter((i) => i.type === "payslip");
  const payslipGross = payslips.reduce((a, i) => a + (i.grossPay || 0), 0);
  const payslipTax = payslips.reduce((a, i) => a + (i.taxWithheld || 0), 0);
  const payslipSuper = payslips.reduce((a, i) => a + (i.superAmount || 0), 0);

  const financialYear = getCurrentFinancialYear();
  const est = calculateWeeklyTax(estimatedTaxable, financialYear);

  // Centrelink income test assesses gross earnings from work (estimated + payslip).
  const centrelinkWeekly =
    state.centrelinkEnabled === false
      ? 0
      : calculateCentrelink(
          estimatedTaxable + payslipGross,
          state.centrelinkMaxFortnightly ?? DEFAULT_JOBSEEKER_MAX_FORTNIGHTLY,
        ).weeklyPayment;

  const taxableWeeklyIncome = estimatedTaxable + payslipGross;
  // Payslip withholding is a single lump (tax + Medicare + HECS); fold it into
  // the headline tax figure so the deductions total stays correct.
  const weeklyTax = est.weeklyTax + payslipTax;
  const totalDeductions = est.totalDeductions + payslipTax;
  const netWeekly = est.netWeekly + (payslipGross - payslipTax);

  return {
    taxableWeeklyIncome,
    untaxedWeeklyIncome,
    weeklyGrossIncome: taxableWeeklyIncome + untaxedWeeklyIncome,
    netWeekly,
    totalDeductions,
    weeklyTax,
    weeklyMedicare: est.weeklyMedicare,
    weeklyHecs: est.weeklyHecs,
    centrelinkWeekly,
    superContribution: calculateSuper(estimatedTaxable) + payslipSuper,
    totalNetIncome: netWeekly + centrelinkWeekly + untaxedWeeklyIncome,
    financialYear,
  };
}
