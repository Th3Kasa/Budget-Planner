// Parity test: proves the self-contained edge-function port
// (supabase/functions/telegram-bot/budget-logic.ts) produces byte-identical
// budget math to the app's originals (src/lib/income.ts, src/lib/allocation.ts).
//
// Run: npx tsx scripts/verify-bot-logic.ts
// Exits non-zero if any case mismatches.

import {
  summarizeIncome as portSummarize,
  calculateAutoAllocation as portAllocate,
  type BudgetState,
} from "../supabase/functions/telegram-bot/budget-logic.ts";

import { summarizeIncome as origSummarize } from "../src/lib/income";
import { calculateAutoAllocation as origAllocate } from "../src/lib/allocation";
import type { BudgetState as OrigBudgetState } from "../src/types";

const EPS = 1e-9;

type Failure = string;

function approxEqual(a: number, b: number): boolean {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= EPS + EPS * Math.max(Math.abs(a), Math.abs(b));
}

function compareSummary(label: string, state: BudgetState): Failure[] {
  const fails: Failure[] = [];
  const p = portSummarize(state);
  const o = origSummarize(state as unknown as OrigBudgetState);
  const numericKeys: (keyof typeof p)[] = [
    "taxableWeeklyIncome",
    "untaxedWeeklyIncome",
    "weeklyGrossIncome",
    "netWeekly",
    "totalDeductions",
    "weeklyTax",
    "weeklyMedicare",
    "weeklyHecs",
    "centrelinkWeekly",
    "superContribution",
    "totalNetIncome",
  ];
  for (const k of numericKeys) {
    if (!approxEqual(p[k] as number, o[k] as number)) {
      fails.push(`${label} summary.${String(k)}: port=${p[k]} orig=${o[k]}`);
    }
  }
  if (p.financialYear !== o.financialYear) {
    fails.push(
      `${label} summary.financialYear: port=${p.financialYear} orig=${o.financialYear}`,
    );
  }
  return fails;
}

function compareAllocation(label: string, state: BudgetState): Failure[] {
  const fails: Failure[] = [];
  const p = portAllocate(state);
  const o = origAllocate(state as unknown as OrigBudgetState);

  if (p.debts.length !== o.debts.length) {
    fails.push(`${label} debts length: port=${p.debts.length} orig=${o.debts.length}`);
  } else {
    for (let i = 0; i < p.debts.length; i++) {
      if (p.debts[i].id !== o.debts[i].id) {
        fails.push(`${label} debt[${i}].id mismatch: port=${p.debts[i].id} orig=${o.debts[i].id}`);
      }
      if (!approxEqual(p.debts[i].amount, o.debts[i].amount)) {
        fails.push(
          `${label} debt[${i}](${p.debts[i].id}).amount: port=${p.debts[i].amount} orig=${o.debts[i].amount}`,
        );
      }
    }
  }

  if (p.savings.length !== o.savings.length) {
    fails.push(`${label} savings length: port=${p.savings.length} orig=${o.savings.length}`);
  } else {
    for (let i = 0; i < p.savings.length; i++) {
      if (p.savings[i].id !== o.savings[i].id) {
        fails.push(`${label} savings[${i}].id mismatch: port=${p.savings[i].id} orig=${o.savings[i].id}`);
      }
      if (!approxEqual(p.savings[i].weeklyContribution, o.savings[i].weeklyContribution)) {
        fails.push(
          `${label} savings[${i}](${p.savings[i].id}).weeklyContribution: port=${p.savings[i].weeklyContribution} orig=${o.savings[i].weeklyContribution}`,
        );
      }
    }
  }
  return fails;
}

// ---------------------------------------------------------------------------
// Sample states
// ---------------------------------------------------------------------------

const thisWeek = (() => {
  const d = new Date();
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
})();

const cases: { label: string; state: BudgetState }[] = [
  {
    label: "1: casual+fixed+payslip, centrelink on, snowball, auto debts, tiered savings",
    state: {
      incomes: [
        { id: "i1", name: "Cafe", type: "casual", hourlyRate: 28, hoursWorked: 20 },
        { id: "i2", name: "Stipend", type: "fixed", amount: 200 },
        { id: "i3", name: "Payslip A", type: "payslip", grossPay: 900, taxWithheld: 150, superAmount: 108, weekStarting: thisWeek },
        { id: "i4", name: "Old Payslip", type: "payslip", grossPay: 500, taxWithheld: 80, superAmount: 60, weekStarting: "2020-01-06" },
        { id: "i5", name: "Unanchored payslip", type: "payslip", grossPay: 400, taxWithheld: 50 },
      ],
      expenses: [
        { id: "e1", name: "Rent", amount: 300, category: "housing", frequency: "weekly" },
        { id: "e2", name: "Phone", amount: 60, category: "utilities", frequency: "monthly" },
      ],
      debts: [
        { id: "d1", name: "Card", amount: 0, totalBalance: 2000, category: "debt" },
        { id: "d2", name: "Car", amount: 0, totalBalance: 8000, category: "debt" },
      ],
      savings: [
        { id: "s1", name: "Emergency", targetAmount: 5000, currentAmount: 100, weeklyContribution: 0, priorityTier: 1 },
        { id: "s2", name: "Holiday", targetAmount: 3000, currentAmount: 0, weeklyContribution: 0, priorityTier: 2 },
        { id: "s3", name: "Misc", targetAmount: 1000, currentAmount: 0, weeklyContribution: 0, priorityTier: 3 },
      ],
      centrelinkEnabled: true,
      debtStrategy: "snowball",
    },
  },
  {
    label: "2: cash income + casual shifts, centrelink off, balanced, auto debts",
    state: {
      incomes: [
        { id: "i1", name: "Cash gig", type: "casual", isCash: true, hourlyRate: 30, hoursWorked: 10 },
        {
          id: "i2",
          name: "Shift work",
          type: "casual",
          useShifts: true,
          hourlyRate: 25,
          shifts: [
            { day: "Mon", hours: 8, travelAllowance: 10, mealAllowance: 5, overtimeHours: 2, overtimeRate: 40 },
            { day: "Tue", hours: 6 },
          ],
        },
        { id: "i3", name: "Salary", type: "fixed", amount: 1100 },
      ],
      expenses: [
        { id: "e1", name: "Living", amount: 450, category: "living" },
      ],
      debts: [
        { id: "d1", name: "Loan A", amount: 0, totalBalance: 3000, category: "debt" },
        { id: "d2", name: "Loan B", amount: 0, totalBalance: 1000, category: "debt" },
      ],
      savings: [
        { id: "s1", name: "Fund", targetAmount: 10000, currentAmount: 200, weeklyContribution: 0, splitWeight: 2 },
        { id: "s2", name: "Other", targetAmount: 4000, currentAmount: 0, weeklyContribution: 0, splitWeight: 1 },
      ],
      centrelinkEnabled: false,
      debtStrategy: "balanced",
    },
  },
  {
    label: "3: manual debts + locked savings, snowball, high income (HECS)",
    state: {
      incomes: [
        { id: "i1", name: "Big job", type: "fixed", amount: 2600 },
      ],
      expenses: [
        { id: "e1", name: "Mortgage", amount: 700, category: "housing" },
        { id: "e2", name: "Insurance", amount: 400, category: "insurance", frequency: "monthly" },
      ],
      debts: [
        { id: "d1", name: "Manual card", amount: 100, totalBalance: 5000, category: "debt", isManuallySet: true },
        { id: "d2", name: "Auto loan", amount: 0, totalBalance: 12000, category: "debt" },
      ],
      savings: [
        { id: "s1", name: "Locked", targetAmount: 8000, currentAmount: 1000, weeklyContribution: 75, isLocked: true },
        { id: "s2", name: "Open", targetAmount: 6000, currentAmount: 0, weeklyContribution: 0 },
      ],
      centrelinkEnabled: true,
      debtStrategy: "snowball",
    },
  },
  {
    label: "4: empty debts, all-full savings (no gap), balanced",
    state: {
      incomes: [
        { id: "i1", name: "Wage", type: "casual", hourlyRate: 35, hoursWorked: 38 },
      ],
      expenses: [
        { id: "e1", name: "Rent", amount: 280, category: "housing" },
      ],
      debts: [],
      savings: [
        { id: "s1", name: "Done1", targetAmount: 1000, currentAmount: 1000, weeklyContribution: 0 },
        { id: "s2", name: "Done2", targetAmount: 500, currentAmount: 600, weeklyContribution: 0 },
      ],
      centrelinkEnabled: true,
      debtStrategy: "balanced",
    },
  },
  {
    label: "5: centrelink default (undefined), no surplus (expenses exceed income), defaults",
    state: {
      incomes: [
        { id: "i1", name: "Part-time", type: "fixed", amount: 250 },
      ],
      expenses: [
        { id: "e1", name: "Rent", amount: 400, category: "housing" },
        { id: "e2", name: "Food", amount: 150, category: "food" },
      ],
      debts: [
        { id: "d1", name: "Debt", amount: 0, totalBalance: 1500, category: "debt" },
      ],
      savings: [
        { id: "s1", name: "Goal", targetAmount: 2000, currentAmount: 0, weeklyContribution: 0 },
      ],
      // centrelinkEnabled undefined -> treated as enabled
      // debtStrategy undefined -> snowball
    },
  },
  {
    label: "6: custom centrelinkMax, tier1+tier3 mix, infinite-target savings, manual+auto debts, balanced",
    state: {
      incomes: [
        { id: "i1", name: "Casual", type: "casual", hourlyRate: 32, hoursWorked: 25 },
        { id: "i2", name: "Cash side", type: "fixed", amount: 120, isCash: true },
        { id: "i3", name: "Payslip", type: "payslip", grossPay: 700, taxWithheld: 90, superAmount: 84, weekStarting: thisWeek },
      ],
      expenses: [
        { id: "e1", name: "Bills", amount: 220, category: "utilities" },
        { id: "e2", name: "Subscriptions", amount: 90, category: "misc", frequency: "monthly" },
      ],
      debts: [
        { id: "d1", name: "Manual", amount: 50, totalBalance: 4000, category: "debt", isManuallySet: true },
        { id: "d2", name: "Auto1", amount: 0, totalBalance: 6000, category: "debt" },
        { id: "d3", name: "Auto2", amount: 0, totalBalance: 2000, category: "debt" },
      ],
      savings: [
        { id: "s1", name: "Top", targetAmount: 0, currentAmount: 0, weeklyContribution: 0, priorityTier: 1 },
        { id: "s2", name: "General A", targetAmount: 3000, currentAmount: 500, weeklyContribution: 0, priorityTier: 3, splitWeight: 3 },
        { id: "s3", name: "General B", targetAmount: 3000, currentAmount: 0, weeklyContribution: 0, priorityTier: 3, splitWeight: 1 },
      ],
      centrelinkEnabled: true,
      centrelinkMaxFortnightly: 950,
      debtStrategy: "balanced",
    },
  },
  {
    label: "7: tier2-only savings, snowball with one cleared debt",
    state: {
      incomes: [
        { id: "i1", name: "Job", type: "fixed", amount: 1400 },
      ],
      expenses: [
        { id: "e1", name: "Rent", amount: 350, category: "housing" },
      ],
      debts: [
        { id: "d1", name: "Tiny", amount: 0, totalBalance: 50, category: "debt" },
        { id: "d2", name: "Big", amount: 0, totalBalance: 9000, category: "debt" },
      ],
      savings: [
        { id: "s1", name: "T2a", targetAmount: 4000, currentAmount: 0, weeklyContribution: 0, priorityTier: 2 },
        { id: "s2", name: "T3", targetAmount: 2000, currentAmount: 0, weeklyContribution: 0, priorityTier: 3 },
      ],
      centrelinkEnabled: false,
      debtStrategy: "snowball",
    },
  },
];

let allFails: Failure[] = [];
for (const c of cases) {
  const fails = [
    ...compareSummary(c.label, c.state),
    ...compareAllocation(c.label, c.state),
  ];
  if (fails.length === 0) {
    console.log(`PASS  ${c.label}`);
  } else {
    console.log(`FAIL  ${c.label}`);
    for (const f of fails) console.log(`        - ${f}`);
    allFails = allFails.concat(fails);
  }
}

console.log("");
if (allFails.length === 0) {
  console.log(`All ${cases.length} cases passed. Port matches originals.`);
  process.exit(0);
} else {
  console.log(`${allFails.length} mismatch(es) across cases.`);
  process.exit(1);
}
