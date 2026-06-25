import { BudgetState, BudgetElement, SavingsGoal, Windfall } from "../types";
import { summarizeIncome } from "./income";

// Snowball: share of the leftover surplus reserved and split EVENLY across the
// non-focus debts as minimum payments (so none sit at $0). The rest is hurled
// at the smallest balance. 0.30 = 30% spread across the others, ~70% to the
// focus debt.
const SNOWBALL_RESERVE = 0.30;

// Round to whole cents. The allocation math divides pools by weights, which
// produces long fractions (e.g. 1330.1825384615386). Money is only ever
// meaningful to 2 dp, so every rebalanced/recalculated figure is rounded
// through here before it leaves the engine. (+ EPSILON nudges values sitting
// exactly on the half-cent — like 0.005 — up rather than down.)
export const round2 = (n: number): number =>
  Math.round((n + Number.EPSILON) * 100) / 100;

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
    const t1Pool = pool * 0.70;
    const restPool = pool * 0.30;
    const t1Leftover = fillSavingsEqually(tier1, t1Pool, gap, assign);
    return fillSavingsEqually([...tier2, ...tier3], restPool + t1Leftover, gap, assign);
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

  // Manually-set debts are LOCKED to exactly the amount the user entered — they
  // are never auto-adjusted (only capped at their own balance, since you can't
  // repay more than you owe). Editing one manual debt therefore never changes
  // another; only the auto debts rebalance around them. Auto debts start at 0
  // and the chosen strategy below fills them from whatever surplus is left.
  for (const d of debts) {
    if (d.isManuallySet) {
      d.amount = Math.max(0, Math.min(d.amount, d.totalBalance ?? Infinity));
      pool -= d.amount;
    } else {
      d.amount = 0;
    }
  }
  // If the locked repayments exceed the surplus there's nothing left to spread.
  // (The shortfall surfaces as a negative surplus in the UI, not here.)
  pool = Math.max(0, pool);
  // Locked savings goals work exactly like manual debts: the contribution the
  // user set is kept to the cent (capped only at the gap to that goal's target,
  // since you'd never contribute past 100%). Locking one goal therefore never
  // shrinks another — only the auto goals rebalance around them.
  for (const s of savings) {
    if (s.isLocked) {
      const gap =
        s.targetAmount > 0
          ? Math.max(0, s.targetAmount - (s.currentAmount || 0))
          : Infinity;
      s.weeklyContribution = Math.max(0, Math.min(s.weeklyContribution || 0, gap));
      pool -= s.weeklyContribution;
    } else {
      s.weeklyContribution = 0;
    }
  }
  pool = Math.max(0, pool);

  // Remaining pool is split across debts according to the chosen strategy.
  // (Manual amounts above act as each debt's minimum payment either way.)
  const strategy = prevState.debtStrategy ?? "snowball";
  if (strategy === "snowball") {
    // Debt snowball: every debt keeps getting a fair, even minimum, but the
    // bulk of the surplus is hurled at the SMALLEST balance so it clears
    // fastest — then rolls into the next once it's gone. Manual amounts above
    // already act as that debt's own minimum. Because the whole allocation
    // re-runs on every payment/edit, the snowball rolls forward on its own.
    const room = (d: BudgetElement) =>
      Math.max(0, (d.totalBalance ?? 0) - d.amount);
    const ordered = debts
      .filter((d) => room(d) > 0.01)
      .sort((a, b) => (a.totalBalance ?? 0) - (b.totalBalance ?? 0));

    // 1) Reserve a slice and split it EVENLY across the non-focus AUTO debts
    //    (everything except the smallest, excluding ones the user gave a fixed
    //    amount) as minimum payments, capped at each one's balance. Unused
    //    reserve flows back to the focus debt. Manually-set debts keep exactly
    //    the amount the user chose.
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

  // Whole-cent every rebalanced figure so the UI (and the Edit modal's
  // pre-filled inputs) never surface values like 1330.1825384615386.
  for (const d of debts) d.amount = round2(d.amount);
  for (const s of savings) s.weeklyContribution = round2(s.weeklyContribution);

  return { ...prevState, debts, savings };
}

// Distributes a one-off cash windfall against actual balances.
// If debtPriorities is provided, those debts are paid first (up to each
// specified amount), then the remainder is spread proportionally across
// the other debts, then savings equally, then Cash Vault.
export function distributeWindfall(
  prevState: BudgetState,
  name: string,
  amount: number,
  debtPriorities?: { debtId: string; amount: number }[],
): BudgetState {
  const debts = prevState.debts.map((d) => ({ ...d }));
  const savings = prevState.savings.map((s) => ({ ...s }));
  const distributions: Windfall["distributions"] = [];

  const record = (
    type: "debt" | "savings",
    id: string,
    itemName: string,
    amt: number,
  ) => {
    if (amt <= 0.001) return;
    const existing = distributions.find((x) => x.id === id);
    if (existing) existing.amount += amt;
    else distributions.push({ type, id, name: itemName, amount: amt });
  };

  let pool = amount;
  const prioritizedIds = new Set<string>();

  // 1. Apply explicit priority allocations first
  if (debtPriorities && debtPriorities.length > 0) {
    for (const p of debtPriorities) {
      const debt = debts.find((d) => d.id === p.debtId);
      if (!debt || (debt.totalBalance ?? 0) <= 0.001 || pool <= 0.001) continue;
      const allocation = Math.min(p.amount, debt.totalBalance ?? 0, pool);
      if (allocation > 0.001) {
        debt.totalBalance = Math.max(0, (debt.totalBalance ?? 0) - allocation);
        record("debt", debt.id, debt.name, allocation);
        pool -= allocation;
        prioritizedIds.add(p.debtId);
      }
    }
  }

  // 2. Remaining pool spreads proportionally across non-priority debts
  pool = splitProportional(
    debts.filter((d) => !prioritizedIds.has(d.id)),
    pool,
    (d) => Math.max(0, d.totalBalance ?? 0),
    (d) => Math.max(0, d.totalBalance ?? 0),
    (d, amt) => {
      d.totalBalance = Math.max(0, (d.totalBalance ?? 0) - amt);
      record("debt", d.id, d.name, amt);
    },
  );

  // 3. Whatever is left fills savings goals via tiered priority
  pool = allocateSavingsTiered(
    savings,
    pool,
    (s) =>
      s.targetAmount > 0
        ? Math.max(0, s.targetAmount - (s.currentAmount || 0))
        : Infinity,
    (s, amt) => {
      s.currentAmount = (s.currentAmount || 0) + amt;
      record("savings", s.id, s.name, amt);
    },
  );

  // Whole-cent the proportional splits before they're stored or displayed.
  for (const d of debts) {
    if (d.totalBalance != null) d.totalBalance = round2(d.totalBalance);
  }
  for (const s of savings) s.currentAmount = round2(s.currentAmount || 0);
  for (const dist of distributions) dist.amount = round2(dist.amount);

  const windfall: Windfall = {
    id: "windfall-" + Date.now(),
    name,
    sourceAmount: amount,
    date: Date.now(),
    distributions,
    unallocatedCash: round2(pool),
  };

  return calculateAutoAllocation({
    ...prevState,
    debts,
    savings,
    cashBalance: (prevState.cashBalance || 0) + pool,
    windfalls: [...(prevState.windfalls || []), windfall],
  });
}

// Reverses a recorded windfall: restores debt balances, pulls the money
// back out of savings and the vault, then re-runs the weekly allocation.
export function undoWindfall(prevState: BudgetState, id: string): BudgetState {
  const wf = (prevState.windfalls || []).find((w) => w.id === id);
  if (!wf) return prevState;

  const debts = prevState.debts.map((d) => ({ ...d }));
  const savings = prevState.savings.map((s) => ({ ...s }));

  for (const dist of wf.distributions) {
    if (dist.type === "debt") {
      const d = debts.find((x) => x.id === dist.id);
      if (d) d.totalBalance = (d.totalBalance || 0) + dist.amount;
    } else {
      const s = savings.find((x) => x.id === dist.id);
      if (s)
        s.currentAmount = Math.max(0, (s.currentAmount || 0) - dist.amount);
    }
  }

  return calculateAutoAllocation({
    ...prevState,
    debts,
    savings,
    cashBalance: Math.max(0, (prevState.cashBalance || 0) - wf.unallocatedCash),
    windfalls: (prevState.windfalls || []).filter((w) => w.id !== id),
  });
}
