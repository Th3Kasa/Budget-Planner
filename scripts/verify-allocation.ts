// Sanity checks for the allocation engine and tax calculators.
// Run: npx tsx scripts/verify-allocation.ts
import { calculateAutoAllocation, distributeWindfall, undoWindfall } from "../src/lib/allocation.ts";
import { summarizeIncome } from "../src/lib/income.ts";
import { calculateWeeklyTax, calculateCentrelink, getCurrentFinancialYear } from "../src/lib/calculators.ts";
import { BudgetState } from "../src/types.ts";

let failures = 0;
const check = (label: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
  if (!cond) failures++;
};
const approx = (a: number, b: number, eps = 0.05) => Math.abs(a - b) < eps;

const base: BudgetState = {
  incomes: [{ id: "j", name: "Job", type: "fixed", amount: 1000 }],
  expenses: [{ id: "e", name: "Rent", amount: 300, category: "Housing" }],
  debts: [
    { id: "car", name: "Car Loan", amount: 0, totalBalance: 5000, originalBalance: 6000, category: "Debt" },
    { id: "zip", name: "ZipPay", amount: 0, totalBalance: 40, originalBalance: 100, category: "Debt" },
  ],
  savings: [
    { id: "biz", name: "Start a Business", targetAmount: 10000, currentAmount: 0, weeklyContribution: 0 },
    { id: "em", name: "Emergency Fund", targetAmount: 5000, currentAmount: 0, weeklyContribution: 0 },
  ],
  centrelinkEnabled: false,
};

// --- Test 1: weekly allocation conserves money ---
{
  const out = calculateAutoAllocation(base);
  const { totalNetIncome } = summarizeIncome(base);
  const pool = totalNetIncome - 300;
  const allocated =
    out.debts.reduce((a, d) => a + d.amount, 0) +
    out.savings.reduce((a, s) => a + s.weeklyContribution, 0);
  check("weekly allocation never exceeds pool", allocated <= pool + 0.01, `allocated=${allocated.toFixed(2)} pool=${pool.toFixed(2)}`);
  const zip = out.debts.find((d) => d.id === "zip")!;
  check("ZipPay capped at its balance", zip.amount <= 40.01, `zip=${zip.amount.toFixed(2)}`);
}

// --- Test 2: the old "money creation" scenario — all goals already full ---
{
  const full: BudgetState = {
    ...base,
    debts: [],
    savings: [
      { id: "biz", name: "Start a Business", targetAmount: 100, currentAmount: 100, weeklyContribution: 0 },
      { id: "em", name: "Emergency Fund", targetAmount: 100, currentAmount: 100, weeklyContribution: 0 },
    ],
  };
  const out = calculateAutoAllocation(full);
  const allocated = out.savings.reduce((a, s) => a + s.weeklyContribution, 0);
  check("full goals receive nothing (no phantom money)", approx(allocated, 0), `allocated=${allocated.toFixed(2)}`);
}

// --- Test 3: windfall conserves money: distributions + vault == source ---
{
  const out = distributeWindfall(base, "Sold Bike", 6000);
  const wf = out.windfalls![0];
  const distributed = wf.distributions.reduce((a, d) => a + d.amount, 0);
  check("windfall distributions + vault == source", approx(distributed + wf.unallocatedCash, 6000), `dist=${distributed.toFixed(2)} vault=${wf.unallocatedCash.toFixed(2)}`);
  const car = out.debts.find((d) => d.id === "car")!;
  const zip = out.debts.find((d) => d.id === "zip")!;
  check("car loan paid first", approx(car.totalBalance!, 0), `car=${car.totalBalance!.toFixed(2)}`);
  check("zip paid next", approx(zip.totalBalance!, 0), `zip=${zip.totalBalance!.toFixed(2)}`);
}

// --- Test 4: windfall works with ONLY an emergency goal (old code skipped it) ---
{
  const onlyEmergency: BudgetState = {
    ...base,
    debts: [],
    savings: [{ id: "em", name: "Emergency Fund", targetAmount: 5000, currentAmount: 0, weeklyContribution: 0 }],
  };
  const out = distributeWindfall(onlyEmergency, "Tax Return", 1000);
  const em = out.savings[0];
  check("solo emergency goal still receives windfall", em.currentAmount! >= 999.9, `current=${em.currentAmount!.toFixed(2)}`);
}

// --- Test 5: undo restores balances exactly ---
{
  const after = distributeWindfall(base, "Sold Bike", 6000);
  const undone = undoWindfall(after, after.windfalls![0].id);
  const car = undone.debts.find((d) => d.id === "car")!;
  const zip = undone.debts.find((d) => d.id === "zip")!;
  check("undo restores car balance", approx(car.totalBalance!, 5000), `car=${car.totalBalance!.toFixed(2)}`);
  check("undo restores zip balance", approx(zip.totalBalance!, 40), `zip=${zip.totalBalance!.toFixed(2)}`);
  check("undo restores vault", approx(undone.cashBalance || 0, 0), `vault=${(undone.cashBalance || 0).toFixed(2)}`);
  check("undo restores savings", approx(undone.savings.reduce((a, s) => a + (s.currentAmount || 0), 0), 0));
}

// --- Test 6: locked items respected ---
{
  const locked: BudgetState = {
    ...base,
    debts: [{ id: "car", name: "Car Loan", amount: 200, totalBalance: 5000, originalBalance: 6000, category: "Debt", isLocked: true }],
  };
  const out = calculateAutoAllocation(locked);
  check("locked debt keeps manual amount", approx(out.debts[0].amount, 200), `amount=${out.debts[0].amount.toFixed(2)}`);
}

// --- Calculator checks (annual figures verified against ATO 2025-26 / 2026-27) ---
const annual = (gross: number, fy: "2025-26" | "2026-27") => {
  const r = calculateWeeklyTax(gross / 52, fy);
  return {
    tax: r.weeklyTax * 52,
    medicare: r.weeklyMedicare * 52,
    hecs: r.weeklyHecs * 52,
  };
};

{
  // FY selection: Australian FY rolls over 1 July.
  check("FY for 10 Jun 2026 is 2025-26", getCurrentFinancialYear(new Date(2026, 5, 10)) === "2025-26");
  check("FY for 1 Jul 2026 is 2026-27", getCurrentFinancialYear(new Date(2026, 6, 1)) === "2026-27");

  // Income tax
  const a = annual(80000, "2025-26");
  check("2025-26 tax @ $80k = $14,788", approx(a.tax, 14788), `got ${a.tax.toFixed(2)}`);
  const b = annual(80000, "2026-27");
  check("2026-27 tax @ $80k = $14,520 (15% bracket)", approx(b.tax, 14520), `got ${b.tax.toFixed(2)}`);
  const c = annual(45000, "2025-26");
  check("2025-26 tax @ $45k = $4,288", approx(c.tax, 4288), `got ${c.tax.toFixed(2)}`);
  const d = annual(200000, "2025-26");
  check("2025-26 tax @ $200k = $56,138", approx(d.tax, 56138), `got ${d.tax.toFixed(2)}`);

  // Medicare levy: exempt below threshold, 10c/$ phase-in, then full 2%
  check("Medicare @ $27k = $0 (below threshold)", approx(annual(27000, "2025-26").medicare, 0));
  check("Medicare @ $30k = $277.80 (phase-in)", approx(annual(30000, "2025-26").medicare, 277.8), `got ${annual(30000, "2025-26").medicare.toFixed(2)}`);
  check("Medicare @ $80k = $1,600 (full 2%)", approx(annual(80000, "2025-26").medicare, 1600));

  // HECS/HELP marginal system
  check("HECS @ $60k = $0 (below $67k threshold)", approx(annual(60000, "2025-26").hecs, 0));
  check("HECS 2025-26 @ $80k = $1,950 (15% over $67k)", approx(annual(80000, "2025-26").hecs, 1950), `got ${annual(80000, "2025-26").hecs.toFixed(2)}`);
  check("HECS 2026-27 @ $80k = $1,570.80 (indexed $69,528)", approx(annual(80000, "2026-27").hecs, 1570.8), `got ${annual(80000, "2026-27").hecs.toFixed(2)}`);
  check("HECS 2025-26 @ $200k capped at 10% = $20,000", approx(annual(200000, "2025-26").hecs, 20000), `got ${annual(200000, "2025-26").hecs.toFixed(2)}`);

  // JobSeeker income test ($808.70/fn max from 20 Mar 2026)
  check("JobSeeker: $75/wk earned = full $808.70/fn", approx(calculateCentrelink(75).fortnightlyPayment, 808.7));
  check("JobSeeker: $200/wk earned = $669.30/fn", approx(calculateCentrelink(200).fortnightlyPayment, 669.3), `got ${calculateCentrelink(200).fortnightlyPayment.toFixed(2)}`);
  check("JobSeeker: high income = $0", approx(calculateCentrelink(800).fortnightlyPayment, 0));
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
