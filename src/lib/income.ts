import { BudgetState, IncomeStream } from "../types";
import {
  calculateWeeklyTax,
  calculateCentrelink,
  calculateSuper,
  getCurrentFinancialYear,
  DEFAULT_JOBSEEKER_MAX_FORTNIGHTLY,
  FinancialYear,
} from "./calculators";

// Single source of truth for how much an income stream earns per week.
export function calculateIncomeAmount(inc: IncomeStream): number {
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
export function summarizeIncome(state: BudgetState): IncomeSummary {
  const taxableWeeklyIncome = state.incomes
    .filter((i) => !i.isCash)
    .reduce((acc, inc) => acc + calculateIncomeAmount(inc), 0);

  const untaxedWeeklyIncome = state.incomes
    .filter((i) => i.isCash)
    .reduce((acc, inc) => acc + calculateIncomeAmount(inc), 0);

  const financialYear = getCurrentFinancialYear();
  const { netWeekly, totalDeductions, weeklyTax, weeklyMedicare, weeklyHecs } =
    calculateWeeklyTax(taxableWeeklyIncome, financialYear);

  const centrelinkWeekly =
    state.centrelinkEnabled === false
      ? 0
      : calculateCentrelink(
          taxableWeeklyIncome,
          state.centrelinkMaxFortnightly ?? DEFAULT_JOBSEEKER_MAX_FORTNIGHTLY,
        ).weeklyPayment;

  return {
    taxableWeeklyIncome,
    untaxedWeeklyIncome,
    weeklyGrossIncome: taxableWeeklyIncome + untaxedWeeklyIncome,
    netWeekly,
    totalDeductions,
    weeklyTax,
    weeklyMedicare,
    weeklyHecs,
    centrelinkWeekly,
    superContribution: calculateSuper(taxableWeeklyIncome),
    totalNetIncome: netWeekly + centrelinkWeekly + untaxedWeeklyIncome,
    financialYear,
  };
}
