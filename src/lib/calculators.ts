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
