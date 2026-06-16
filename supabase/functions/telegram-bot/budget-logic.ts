// Self-contained TypeScript port of the Budget Planner's core money math.
//
// This module is a FAITHFUL, dependency-free port of:
//   - src/lib/calculators.ts  (Australian tax & benefit calculations)
//   - src/lib/income.ts       (income summarisation)
//   - src/lib/allocation.ts   (calculateAutoAllocation + helpers)
//
// It has NO external imports (no date-fns, no ../types) so it runs unchanged
// under both `npx tsx` (Node) and Deno (Supabase Edge Functions). It uses only
// plain Date and standard JS — no Node-only or Deno-only APIs.
//
// Keep every number/threshold identical to the originals: if the app's math
// changes, mirror it here and re-run scripts/verify-bot-logic.ts.

// ---------------------------------------------------------------------------
// Types (inlined from src/types.ts)
// ---------------------------------------------------------------------------

export interface BudgetElement {
  id: string;
  name: string;
  amount: number;
  frequency?: "weekly" | "monthly"; // expenses only; undefined = weekly
  totalBalance?: number;
  originalBalance?: number;
  category: string;
  color?: string;
  icon?: string;
  isLocked?: boolean;
  isManuallySet?: boolean; // true when user has manually edited this debt's $/wk
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  weeklyContribution: number;
  color?: string;
  isLocked?: boolean;
  splitWeight?: number; // Relative allocation weight; undefined = equal (treated as 1)
  isManuallyWeighted?: boolean; // true when user has set a custom split weight
  priorityTier?: 1 | 2 | 3; // 1=top (70% of pool), 2=secondary (100% after tier1 done), 3=general (equal split, default)
}

export interface Shift {
  day: string;
  hours: number;
  travelAllowance?: number;
  mealAllowance?: number;
  overtimeHours?: number;
  overtimeRate?: number;
}

export interface IncomeStream {
  id: string;
  name: string;
  type: "casual" | "fixed" | "payslip";
  hourlyRate?: number;
  hoursWorked?: number;
  amount?: number;
  isCash?: boolean;
  shifts?: Shift[];
  useShifts?: boolean;
  // Payslip actuals (type === "payslip"): figures taken straight off the slip,
  // so tax and super are known and never estimated.
  grossPay?: number;
  taxWithheld?: number;
  superAmount?: number;
  weekStarting?: string; // "yyyy-MM-dd" Monday — payslips count only for their own week
  // Captured when a payslip PDF is parsed (all ISO yyyy-MM-dd).
  paymentDate?: string;
  payPeriodStart?: string;
  payPeriodEnd?: string;
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

export interface BudgetState {
  incomes: IncomeStream[];
  hourlyRate?: number; // Legacy
  hoursWorked?: number; // Legacy
  weeklyGrossIncome?: number; // Legacy
  expenses: BudgetElement[];
  debts: BudgetElement[];
  savings: SavingsGoal[];
  cashBalance?: number;
  windfalls?: unknown[];
  centrelinkEnabled?: boolean; // undefined = true (legacy states)
  centrelinkMaxFortnightly?: number; // undefined = current JobSeeker single rate
  // How the weekly surplus is split across debts:
  //   "snowball"  → minimums on every debt, all extra to the smallest balance
  //                 first, rolling into the next as each one clears (default).
  //   "balanced"  → auto debts share the pool proportionally by balance, and
  //                 leftover surplus flows on to savings goals.
  debtStrategy?: "snowball" | "balanced"; // undefined = "snowball"
}

// ===========================================================================
// calculators.ts
// ===========================================================================

// Australian tax & benefit calculations.
// Figures verified June 2026 against ATO / Services Australia:
//  - Income tax: 2025-26 rates; from 1 July 2026 the 16% bracket drops to 15%
//    (legislated; drops again to 14% from 1 July 2027).
//  - Medicare levy: 2% with the low-income threshold/phase-in for singles
//    ($27,222 threshold, 10c/$ shade-in to $34,028 for 2025-26).
//  - HECS/HELP: from 2025-26 the old whole-of-income tiers were replaced by a
//    marginal system - 15c/$ above the minimum threshold, +17c/$ above the
//    second threshold, capped at 10% of repayment income. Thresholds are
//    CPI-indexed each year.
//  - Super guarantee: 12% from 1 July 2025 (final legislated rate).
//  - JobSeeker: income free area $150/fn, 50c/$ taper to $256/fn, 60c/$ above.

export type FinancialYear = "2025-26" | "2026-27";

interface TaxBracket {
  // Tax applies at `rate` to income above `from`, with `base` tax owed at `from`.
  from: number;
  rate: number;
  base: number;
}

interface FyConfig {
  taxBrackets: TaxBracket[]; // descending order of `from`
  medicare: {
    rate: number;
    lowIncomeThreshold: number; // no levy at or below this
    phaseInUpper: number; // 10c/$ shade-in up to here, then full rate
  };
  help: {
    minThreshold: number; // no repayment at or below this
    firstRate: number; // marginal rate above minThreshold
    secondThreshold: number; // extra marginal rate kicks in above this
    secondRate: number;
    incomeCap: number; // repayment never exceeds this share of income
  };
}

const FY_CONFIG: Record<FinancialYear, FyConfig> = {
  "2025-26": {
    taxBrackets: [
      { from: 190000, rate: 0.45, base: 51638 },
      { from: 135000, rate: 0.37, base: 31288 },
      { from: 45000, rate: 0.3, base: 4288 },
      { from: 18200, rate: 0.16, base: 0 },
    ],
    medicare: {
      rate: 0.02,
      lowIncomeThreshold: 27222,
      phaseInUpper: 34028,
    },
    help: {
      minThreshold: 67000,
      firstRate: 0.15,
      secondThreshold: 125000,
      secondRate: 0.17,
      incomeCap: 0.1,
    },
  },
  "2026-27": {
    taxBrackets: [
      { from: 190000, rate: 0.45, base: 51370 },
      { from: 135000, rate: 0.37, base: 31020 },
      { from: 45000, rate: 0.3, base: 4020 },
      { from: 18200, rate: 0.15, base: 0 },
    ],
    medicare: {
      // 2026-27 low-income thresholds aren't announced until the 2027 budget;
      // the 2025-26 thresholds are the best available estimate.
      rate: 0.02,
      lowIncomeThreshold: 27222,
      phaseInUpper: 34028,
    },
    help: {
      // CPI-indexed from the 2025-26 thresholds.
      minThreshold: 69528,
      firstRate: 0.15,
      secondThreshold: 129717,
      secondRate: 0.17,
      incomeCap: 0.1,
    },
  },
};

// Australian financial years run 1 July - 30 June.
export function getCurrentFinancialYear(date: Date = new Date()): FinancialYear {
  const fyStartYear =
    date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1;
  return fyStartYear >= 2026 ? "2026-27" : "2025-26";
}

function annualIncomeTax(annualGross: number, brackets: TaxBracket[]): number {
  for (const b of brackets) {
    if (annualGross > b.from) {
      return b.base + (annualGross - b.from) * b.rate;
    }
  }
  return 0;
}

function annualMedicareLevy(
  annualGross: number,
  cfg: FyConfig["medicare"],
): number {
  if (annualGross <= cfg.lowIncomeThreshold) return 0;
  if (annualGross <= cfg.phaseInUpper) {
    return (annualGross - cfg.lowIncomeThreshold) * 0.1;
  }
  return annualGross * cfg.rate;
}

function annualHelpRepayment(
  annualGross: number,
  cfg: FyConfig["help"],
): number {
  if (annualGross <= cfg.minThreshold) return 0;
  let repayment = (annualGross - cfg.minThreshold) * cfg.firstRate;
  if (annualGross > cfg.secondThreshold) {
    // firstRate applies up to secondThreshold; secondRate replaces it above.
    repayment =
      (cfg.secondThreshold - cfg.minThreshold) * cfg.firstRate +
      (annualGross - cfg.secondThreshold) * cfg.secondRate;
  }
  return Math.min(repayment, annualGross * cfg.incomeCap);
}

export function calculateWeeklyTax(
  grossWeekly: number,
  financialYear: FinancialYear = getCurrentFinancialYear(),
) {
  const cfg = FY_CONFIG[financialYear];
  const annualGross = grossWeekly * 52;

  const weeklyTax = annualIncomeTax(annualGross, cfg.taxBrackets) / 52;
  const weeklyMedicare = annualMedicareLevy(annualGross, cfg.medicare) / 52;
  const weeklyHecs = annualHelpRepayment(annualGross, cfg.help) / 52;

  return {
    weeklyTax,
    weeklyMedicare,
    weeklyHecs,
    totalDeductions: weeklyTax + weeklyMedicare + weeklyHecs,
    netWeekly: grossWeekly - (weeklyTax + weeklyMedicare + weeklyHecs),
  };
}

// JobSeeker single (no children) maximum, effective 20 March 2026.
// Indexed every 20 March / 20 September - adjustable in Settings.
export const DEFAULT_JOBSEEKER_MAX_FORTNIGHTLY = 808.7;

export function calculateCentrelink(
  taxableWeeklyIncome: number,
  maxFortnightlyPayment: number = DEFAULT_JOBSEEKER_MAX_FORTNIGHTLY,
) {
  // JobSeeker income test (fortnightly):
  //   first $150: no reduction
  //   $150-$256: 50c reduction per dollar
  //   over $256: 60c per dollar (plus the $53 from the middle band)
  const fortnightlyEarned = taxableWeeklyIncome * 2;

  let reduction = 0;
  if (fortnightlyEarned > 256) {
    reduction = (256 - 150) * 0.5 + (fortnightlyEarned - 256) * 0.6;
  } else if (fortnightlyEarned > 150) {
    reduction = (fortnightlyEarned - 150) * 0.5;
  }

  const fortnightlyPayment = Math.max(0, maxFortnightlyPayment - reduction);

  return {
    fortnightlyPayment,
    weeklyPayment: fortnightlyPayment / 2,
  };
}

// Super guarantee: 12% from 1 July 2025 (final legislated rate).
export const SUPER_GUARANTEE_RATE = 0.12;

export function calculateSuper(grossWeekly: number) {
  return grossWeekly * SUPER_GUARANTEE_RATE;
}

// ===========================================================================
// income.ts
// ===========================================================================

// The Monday (yyyy-MM-dd) of the week a given date falls in.
//
// PORT NOTE: the original uses date-fns
//   format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd")
// which operates in the *local* timezone. This inline helper replicates that
// exactly using local-time Date methods (getDay/getDate/getFullYear etc.), so
// it produces the same Monday string as the app — provided the runtime's local
// timezone matches. In a Supabase Edge Function the runtime is UTC; the app
// runs in the user's browser timezone. If a payslip's weekStarting was computed
// in a non-UTC browser near a week boundary, the two could disagree. Set the
// edge function's TZ to the user's timezone (e.g. Australia/Sydney) to match.
export function weekStartOf(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // getDay(): 0=Sun..6=Sat. We want Monday-start weeks (weekStartsOn: 1).
  // Days to subtract to land on Monday: Sun(0)->6, Mon(1)->0, ... Sat(6)->5.
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

// ===========================================================================
// allocation.ts
// ===========================================================================

// Distribute `pool` across `items` proportional to `weight(item)`,
// capping each item at `cap(item)`. When an item hits its cap, its
// unused share is redistributed among the rest. Returns leftover pool.
function splitProportional(
  items: BudgetElement[],
  pool: number,
  weight: (d: BudgetElement) => number,
  cap: (d: BudgetElement) => number,
  assign: (d: BudgetElement, amt: number) => void,
): number {
  let remaining = items.filter((d) => cap(d) > 0.01 && weight(d) > 0);
  while (remaining.length > 0 && pool > 0.01) {
    const totalWeight = remaining.reduce((s, d) => s + weight(d), 0);
    if (totalWeight <= 0) break;
    let spent = 0;
    const nextRemaining: BudgetElement[] = [];
    for (const d of remaining) {
      const share = (weight(d) / totalWeight) * pool;
      const actual = Math.min(share, cap(d));
      if (actual > 0.001) assign(d, actual);
      spent += actual;
      if (cap(d) > 0.01) nextRemaining.push(d);
    }
    pool -= spent;
    remaining = nextRemaining;
    if (spent < 0.001) break;
  }
  return Math.max(0, pool);
}

// Distribute `pool` across savings goals proportionally by their splitWeight
// (defaults to 1 = equal share), capping each at the gap to its target.
// Returns leftover pool.
function fillSavingsEqually(
  goals: SavingsGoal[],
  pool: number,
  gap: (s: SavingsGoal) => number,
  assign: (s: SavingsGoal, amt: number) => void,
): number {
  let open = goals.filter((s) => gap(s) > 0.01);
  while (open.length > 0 && pool > 0.01) {
    const totalWeight = open.reduce((sum, s) => sum + (s.splitWeight || 1), 0);
    let spent = 0;
    for (const s of open) {
      const share = ((s.splitWeight || 1) / totalWeight) * pool;
      const amt = Math.min(share, gap(s));
      if (amt > 0.001) assign(s, amt);
      spent += amt;
    }
    pool -= spent;
    open = open.filter((s) => gap(s) > 0.01);
    if (spent < 0.001) break;
  }
  return Math.max(0, pool);
}

// Tiered savings allocation:
//   Tier 1 goals active  → tier-1 gets 70% of pool; all others share 30%
//   No tier-1 remaining  → tier-2 goals get 100% (overflow then goes to tier-3)
//   No tier-1 or tier-2  → tier-3 goals share pool equally
// Within each tier, splitWeight is honoured (defaults to equal).
function allocateSavingsTiered(
  goals: SavingsGoal[],
  pool: number,
  gap: (s: SavingsGoal) => number,
  assign: (s: SavingsGoal, amt: number) => void,
): number {
  const tier = (s: SavingsGoal) => s.priorityTier ?? 3;
  const tier1 = goals.filter((s) => tier(s) === 1 && gap(s) > 0.01);
  const tier2 = goals.filter((s) => tier(s) === 2 && gap(s) > 0.01);
  const tier3 = goals.filter((s) => tier(s) === 3 && gap(s) > 0.01);

  if (tier1.length > 0) {
    const t1Pool = pool * 0.7;
    const restPool = pool * 0.3;
    const t1Leftover = fillSavingsEqually(tier1, t1Pool, gap, assign);
    return fillSavingsEqually(
      [...tier2, ...tier3],
      restPool + t1Leftover,
      gap,
      assign,
    );
  }
  if (tier2.length > 0) {
    const t2Leftover = fillSavingsEqually(tier2, pool, gap, assign);
    return fillSavingsEqually(tier3, t2Leftover, gap, assign);
  }
  return fillSavingsEqually(tier3, pool, gap, assign);
}

// Distributes the weekly surplus (net income minus expenses) across debt
// repayments and savings contributions. Debts the user manually edited
// keep their amounts; the rest share the pool proportional to their
// outstanding balances.
export function calculateAutoAllocation(prevState: BudgetState): BudgetState {
  const debts = prevState.debts.map((d) => ({ ...d }));
  const savings = prevState.savings.map((s) => ({ ...s }));

  const { totalNetIncome } = summarizeIncome(prevState);
  // Monthly expenses are converted to weekly (÷ 52/12 ≈ ÷ 4.333).
  const totalExpenses = prevState.expenses.reduce(
    (acc, el) =>
      acc + (el.frequency === "monthly" ? el.amount / (52 / 12) : el.amount),
    0,
  );
  let pool = Math.max(0, totalNetIncome - totalExpenses);

  // Manually-set debts and locked savings keep their amounts (capped by
  // the pool so we never allocate money that doesn't exist).
  for (const d of debts) {
    if (d.isManuallySet) {
      d.amount = Math.min(d.amount, Math.max(0, d.totalBalance ?? 0), pool);
      d.amount = Math.max(0, d.amount);
      pool -= d.amount;
    } else {
      d.amount = 0;
    }
  }
  for (const s of savings) {
    if (s.isLocked) {
      s.weeklyContribution = Math.min(pool, s.weeklyContribution || 0);
      pool -= s.weeklyContribution;
    } else {
      s.weeklyContribution = 0;
    }
  }

  // Remaining pool is split across debts according to the chosen strategy.
  // (Manual amounts above act as each debt's minimum payment either way.)
  if ((prevState.debtStrategy ?? "snowball") === "snowball") {
    // Debt snowball: every debt keeps getting a fair, even minimum, but the
    // bulk of the surplus is hurled at the SMALLEST balance so it clears
    // fastest — then rolls into the next once it's gone. Manual amounts above
    // already act as that debt's own minimum. (Mirrors src/lib/allocation.ts.)
    const SNOWBALL_RESERVE = 0.30;
    const room = (d: BudgetElement) =>
      Math.max(0, (d.totalBalance ?? 0) - d.amount);
    const ordered = debts
      .filter((d) => room(d) > 0.01)
      .sort((a, b) => (a.totalBalance ?? 0) - (b.totalBalance ?? 0));

    // 1) Reserve a slice and split it EVENLY across the non-focus AUTO debts
    //    (excluding the smallest and any with a user-set fixed amount) as
    //    minimum payments, capped at each one's balance. Unused reserve flows
    //    back to the focus debt.
    if (ordered.length > 1 && pool > 0.01) {
      let reserve = pool * SNOWBALL_RESERVE;
      let others = ordered
        .slice(1)
        .filter((d) => !d.isManuallySet && room(d) > 0.01);
      while (others.length > 0 && reserve > 0.01) {
        const share = reserve / others.length;
        let spent = 0;
        for (const d of others) {
          const add = Math.min(share, room(d));
          d.amount += add;
          spent += add;
        }
        reserve -= spent;
        pool -= spent;
        others = others.filter((d) => room(d) > 0.01);
        if (spent < 0.001) break;
      }
    }

    // 2) Everything left attacks the smallest balance first, rolling into the
    //    next once it's full.
    for (const d of ordered) {
      if (pool <= 0.01) break;
      const add = Math.min(room(d), pool);
      d.amount += add;
      pool -= add;
    }
  } else {
    // Balanced: auto debts share the pool proportionally by outstanding
    // balance, and any leftover flows on to savings goals below.
    pool = splitProportional(
      debts.filter((d) => !d.isManuallySet),
      pool,
      (d) => Math.max(0, d.totalBalance ?? 0),
      (d) => Math.max(0, (d.totalBalance ?? Infinity) - d.amount),
      (d, amt) => {
        d.amount += amt;
      },
    );
  }

  // Whatever is left flows to unlocked savings goals via tiered priority.
  allocateSavingsTiered(
    savings.filter((s) => !s.isLocked),
    pool,
    (s) =>
      s.targetAmount > 0
        ? Math.max(
            0,
            s.targetAmount - (s.currentAmount || 0) - s.weeklyContribution,
          )
        : Infinity,
    (s, amt) => {
      s.weeklyContribution += amt;
    },
  );

  return { ...prevState, debts, savings };
}
