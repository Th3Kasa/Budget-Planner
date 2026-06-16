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

// --- Test 3 (updated): windfall fills debts proportionally by balance ---
// base has car $5000 and zip $40 balance; windfall of $2520 splits proportionally:
// car gets 5000/5040 * 2520 = 2500, zip gets 40/5040 * 2520 ≈ 20.
// Neither cap is hit (car<5000, zip<40), so pure proportional split applies.
{
  const out = distributeWindfall(base, "Sold Bike", 2520);
  const wf = out.windfalls![0];
  const car = out.debts.find((d) => d.id === "car")!;
  const zip = out.debts.find((d) => d.id === "zip")!;
  const carPaid = 5000 - car.totalBalance!;
  const zipPaid = 40 - zip.totalBalance!;
  check("windfall conserves money", approx(carPaid + zipPaid + wf.unallocatedCash, 2520), `carPaid=${carPaid.toFixed(2)} zipPaid=${zipPaid.toFixed(2)} vault=${wf.unallocatedCash.toFixed(2)}`);
  // With $2520 windfall, proportional split: car=2500, zip=20 (zip's share < its $40 cap)
  check("car gets proportional share (5000/5040 * 2520 ≈ 2500)", approx(carPaid, 2500, 1), `carPaid=${carPaid.toFixed(2)}`);
  check("zip gets proportional share (40/5040 * 2520 ≈ 20)", approx(zipPaid, 20, 1), `zipPaid=${zipPaid.toFixed(2)}`);
}

// Additional conservation check: $6000 windfall fully pays both debts ($5040), rest goes to savings/vault
{
  const out = distributeWindfall(base, "Sold Bike", 6000);
  const wf = out.windfalls![0];
  const distributed = wf.distributions.reduce((a, d) => a + d.amount, 0);
  check("windfall distributions + vault == source", approx(distributed + wf.unallocatedCash, 6000), `dist=${distributed.toFixed(2)} vault=${wf.unallocatedCash.toFixed(2)}`);
  const car = out.debts.find((d) => d.id === "car")!;
  const zip = out.debts.find((d) => d.id === "zip")!;
  check("$6000 windfall fully pays car (both debts cap, remainder to savings)", approx(car.totalBalance!, 0), `car=${car.totalBalance!.toFixed(2)}`);
  check("$6000 windfall fully pays zip", approx(zip.totalBalance!, 0), `zip=${zip.totalBalance!.toFixed(2)}`);
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

// --- Test 6: manually-set debt keeps its amount (acts as a minimum) ---
{
  const manual: BudgetState = {
    ...base,
    debts: [
      { id: "car", name: "Car Loan", amount: 200, totalBalance: 5000, originalBalance: 6000, category: "Debt", isManuallySet: true },
      { id: "zip", name: "ZipPay", amount: 0, totalBalance: 1000, originalBalance: 1000, category: "Debt" },
      { id: "loan", name: "Personal Loan", amount: 0, totalBalance: 3000, originalBalance: 3000, category: "Debt" },
    ],
    savings: [],
  };
  const out = calculateAutoAllocation(manual);
  const car = out.debts.find((d) => d.id === "car")!;
  check("manual debt keeps its minimum amount", approx(car.amount, 200), `car=${car.amount.toFixed(2)}`);
}

// --- Test 6a (balanced mode): auto debts split proportionally by balance ---
{
  const balanced: BudgetState = {
    ...base,
    debtStrategy: "balanced",
    debts: [
      { id: "car", name: "Car Loan", amount: 200, totalBalance: 5000, originalBalance: 6000, category: "Debt", isManuallySet: true },
      { id: "zip", name: "ZipPay", amount: 0, totalBalance: 1000, originalBalance: 1000, category: "Debt" },
      { id: "loan", name: "Personal Loan", amount: 0, totalBalance: 3000, originalBalance: 3000, category: "Debt" },
    ],
    savings: [],
  };
  const out = calculateAutoAllocation(balanced);
  const car = out.debts.find((d) => d.id === "car")!;
  const zip = out.debts.find((d) => d.id === "zip")!;
  const loan = out.debts.find((d) => d.id === "loan")!;
  check("balanced: manual debt keeps exact amount", approx(car.amount, 200), `car=${car.amount.toFixed(2)}`);
  // Remaining pool splits 1000:3000 = 1:3 between zip and loan
  check("balanced: auto debts split proportionally (zip:loan = 1:3)", approx(loan.amount / Math.max(zip.amount, 0.01), 3, 0.1), `zip=${zip.amount.toFixed(2)} loan=${loan.amount.toFixed(2)}`);
}

// --- Test 6b (snowball, the default): even minimums on others, bulk to smallest ---
{
  const snowball: BudgetState = {
    ...base,
    // debtStrategy omitted → defaults to snowball
    debts: [
      { id: "car", name: "Car Loan", amount: 200, totalBalance: 5000, originalBalance: 6000, category: "Debt", isManuallySet: true },
      { id: "zip", name: "ZipPay", amount: 0, totalBalance: 1000, originalBalance: 1000, category: "Debt" },
      { id: "loan", name: "Personal Loan", amount: 0, totalBalance: 3000, originalBalance: 3000, category: "Debt" },
    ],
    savings: [],
  };
  const out = calculateAutoAllocation(snowball);
  const car = out.debts.find((d) => d.id === "car")!;
  const zip = out.debts.find((d) => d.id === "zip")!;
  const loan = out.debts.find((d) => d.id === "loan")!;
  // A manually-set, non-focus debt keeps EXACTLY the amount the user chose.
  check("snowball: manual non-focus debt keeps its exact amount", approx(car.amount, 200), `car=${car.amount.toFixed(2)}`);
  // zip is the smallest balance → it gets the biggest allocation of all.
  check("snowball: focus (smallest) gets the most", zip.amount > loan.amount && zip.amount > car.amount, `zip=${zip.amount.toFixed(2)} loan=${loan.amount.toFixed(2)} car=${car.amount.toFixed(2)}`);
  // The auto non-focus debt still gets a non-zero minimum (not starved to $0).
  check("snowball: auto non-focus debt gets a non-zero minimum", loan.amount > 0.01, `loan=${loan.amount.toFixed(2)}`);
}

// --- Test 6d (snowball): auto-only debts — smallest gets the most, others split evenly ---
{
  const autoOnly: BudgetState = {
    ...base,
    debts: [
      { id: "zip", name: "ZipPay", amount: 0, totalBalance: 1000, originalBalance: 1000, category: "Debt" },
      { id: "cc", name: "Credit Card", amount: 0, totalBalance: 2000, originalBalance: 2000, category: "Debt" },
      { id: "loan", name: "Personal Loan", amount: 0, totalBalance: 3000, originalBalance: 3000, category: "Debt" },
    ],
    savings: [],
  };
  const out = calculateAutoAllocation(autoOnly);
  const zip = out.debts.find((d) => d.id === "zip")!;
  const cc = out.debts.find((d) => d.id === "cc")!;
  const loan = out.debts.find((d) => d.id === "loan")!;
  check("snowball: smallest balance gets the greatest amount", zip.amount > cc.amount && zip.amount > loan.amount, `zip=${zip.amount.toFixed(2)} cc=${cc.amount.toFixed(2)} loan=${loan.amount.toFixed(2)}`);
  check("snowball: the other debts are split evenly", approx(cc.amount, loan.amount, 0.05) && cc.amount > 0.01, `cc=${cc.amount.toFixed(2)} loan=${loan.amount.toFixed(2)}`);
}

// --- Test 6c (snowball): a fully cleared debt rolls its money into the next ---
{
  const rolled: BudgetState = {
    ...base,
    incomes: [{ id: "j", name: "Job", type: "fixed", amount: 3000 }], // big surplus
    debts: [
      { id: "zip", name: "ZipPay", amount: 0, totalBalance: 200, originalBalance: 200, category: "Debt" },
      { id: "card", name: "Credit Card", amount: 0, totalBalance: 800, originalBalance: 800, category: "Debt" },
    ],
    savings: [{ id: "em", name: "Emergency Fund", targetAmount: 5000, currentAmount: 0, weeklyContribution: 0 }],
  };
  const out = calculateAutoAllocation(rolled);
  const zip = out.debts.find((d) => d.id === "zip")!;
  const card = out.debts.find((d) => d.id === "card")!;
  // Surplus is large enough to cover both balances; each is capped at its balance.
  check("snowball: smallest debt fully funded then rolls into next", approx(zip.amount, 200) && approx(card.amount, 800), `zip=${zip.amount.toFixed(2)} card=${card.amount.toFixed(2)}`);
}

// --- Test 6e: manual repayments are LOCKED and never affect each other ---
{
  // The exact scenario reported: pin the Car at $132 and the Wedding at $500.
  // $2,000/wk cash − $300 rent = $1,700 surplus. Each manual amount must be
  // kept to the cent; only the auto debt (credit card) absorbs the remainder.
  const manual: BudgetState = {
    ...base,
    incomes: [{ id: "j", name: "Job", type: "fixed", amount: 2000, isCash: true }],
    debts: [
      { id: "car", name: "Car Loan", amount: 132, totalBalance: 5000, originalBalance: 5000, category: "Debt", isManuallySet: true },
      { id: "wed", name: "David Wedding", amount: 500, totalBalance: 8000, originalBalance: 8000, category: "Debt", isManuallySet: true },
      { id: "cc", name: "Credit Card", amount: 0, totalBalance: 2000, originalBalance: 2000, category: "Debt" },
    ],
    savings: [],
  };
  const out = calculateAutoAllocation(manual);
  const get = (id: string) => out.debts.find((d) => d.id === id)!;
  const car = get("car"), wed = get("wed"), cc = get("cc");
  check("manual: pinned Car stays exactly $132", approx(car.amount, 132), `car=${car.amount.toFixed(2)}`);
  check("manual: pinned Wedding stays exactly $500 (doesn't shift the Car)", approx(wed.amount, 500), `wed=${wed.amount.toFixed(2)}`);
  check("manual: only the auto debt absorbs the rest", approx(cc.amount, 1700 - 132 - 500), `cc=${cc.amount.toFixed(2)}`);
}

// --- Test 6f: manual debts over-committing the surplus are still kept exact ---
{
  // $400/wk cash − $300 rent = $100 surplus, but two pinned debts want $632.
  // Manual amounts are sacred: both keep their full value (the shortfall shows
  // up as a negative surplus in the UI), and the auto debt simply gets nothing.
  const overcommit: BudgetState = {
    ...base,
    incomes: [{ id: "j", name: "Job", type: "fixed", amount: 400, isCash: true }],
    debts: [
      { id: "car", name: "Car Loan", amount: 132, totalBalance: 5000, originalBalance: 5000, category: "Debt", isManuallySet: true },
      { id: "wed", name: "David Wedding", amount: 500, totalBalance: 8000, originalBalance: 8000, category: "Debt", isManuallySet: true },
      { id: "cc", name: "Credit Card", amount: 0, totalBalance: 2000, originalBalance: 2000, category: "Debt" },
    ],
    savings: [],
  };
  const out = calculateAutoAllocation(overcommit);
  const get = (id: string) => out.debts.find((d) => d.id === id)!;
  check("manual: pinned amounts kept exact even when over budget", approx(get("car").amount, 132) && approx(get("wed").amount, 500), `car=${get("car").amount.toFixed(2)} wed=${get("wed").amount.toFixed(2)}`);
  check("manual: auto debt gets nothing when surplus is exhausted (no negatives)", approx(get("cc").amount, 0), `cc=${get("cc").amount.toFixed(2)}`);
}

// --- Test 7: locked savings goals work exactly like manual debts ---
{
  // $1,000 net − $300 rent = $700 surplus, no debts. Lock the Holiday goal at
  // $250/wk; the Emergency Fund (auto) should soak up the rest, and locking one
  // goal must never shrink the locked amount.
  const locked: BudgetState = {
    ...base,
    incomes: [{ id: "j", name: "Job", type: "fixed", amount: 1000, isCash: true }],
    debts: [],
    savings: [
      { id: "hol", name: "Holiday", targetAmount: 5000, currentAmount: 0, weeklyContribution: 250, isLocked: true },
      { id: "em", name: "Emergency Fund", targetAmount: 5000, currentAmount: 0, weeklyContribution: 0 },
    ],
  };
  const out = calculateAutoAllocation(locked);
  const hol = out.savings.find((s) => s.id === "hol")!;
  const em = out.savings.find((s) => s.id === "em")!;
  check("savings: locked goal kept exactly at $250", approx(hol.weeklyContribution, 250), `hol=${hol.weeklyContribution.toFixed(2)}`);
  check("savings: auto goal absorbs the remaining surplus", approx(em.weeklyContribution, 450), `em=${em.weeklyContribution.toFixed(2)}`);
}

// --- Test 7b: locked savings capped at the gap to target, not the pool ---
{
  // Goal needs only $80 more to hit target but is locked at $300/wk: the
  // contribution is trimmed to the $80 gap (never over-funds past 100%).
  const nearlyDone: BudgetState = {
    ...base,
    debts: [],
    savings: [
      { id: "g", name: "Almost There", targetAmount: 1000, currentAmount: 920, weeklyContribution: 300, isLocked: true },
    ],
  };
  const out = calculateAutoAllocation(nearlyDone);
  check("savings: locked contribution capped at gap to target", approx(out.savings[0].weeklyContribution, 80), `g=${out.savings[0].weeklyContribution.toFixed(2)}`);
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
