import { BudgetState, BudgetElement, SavingsGoal, Windfall } from "../types";
import { summarizeIncome } from "./income";

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

// Position-based priority allocation:
//   The first incomplete priority goal (by list order) is "active" and
//   gets 70% of the savings pool. General goals share the remaining 30%.
//   When the active goal is funded, the next priority goal in list order
//   takes over at 70%. Once all priority goals are done, general goals
//   share the full pool equally. The 70/30 split self-balances — surplus
//   from one side spills to the other so the whole pool is always used.
function allocateSavingsTiered(
  goals: SavingsGoal[],
  pool: number,
  gap: (s: SavingsGoal) => number,
  assign: (s: SavingsGoal, amt: number) => void,
): number {
  // First incomplete priority goal in list order becomes the active one.
  const activePriority = goals.find(
    (s) => (s.priorityTier ?? 3) === 1 && gap(s) > 0.01,
  );
  const generals = goals.filter((s) => (s.priorityTier ?? 3) !== 1);

  if (activePriority) {
    // No general goals need funding → priority goal takes everything.
    if (!generals.some((s) => gap(s) > 0.01)) {
      return fillSavingsEqually([activePriority], pool, gap, assign);
    }
    // Priority goal gets 70% head start; generals share 30%.
    const priorityLeftover = fillSavingsEqually(
      [activePriority],
      pool * 0.7,
      gap,
      assign,
    );
    const generalsLeftover = fillSavingsEqually(
      generals,
      pool * 0.3 + priorityLeftover,
      gap,
      assign,
    );
    // If generals finish early, spill the remainder back to priority.
    return fillSavingsEqually([activePriority], generalsLeftover, gap, assign);
  }

  // All priority goals are funded — generals split the full pool equally.
  return fillSavingsEqually(generals, pool, gap, assign);
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
      // A fully-funded locked goal must not keep consuming pool.
      const complete = s.targetAmount > 0 && (s.currentAmount || 0) >= s.targetAmount;
      if (complete) {
        s.weeklyContribution = 0;
      } else {
        s.weeklyContribution = Math.min(pool, s.weeklyContribution || 0);
        pool -= s.weeklyContribution;
      }
    } else {
      s.weeklyContribution = 0;
    }
  }

  // Remaining pool: auto debts share proportionally by outstanding balance.
  pool = splitProportional(
    debts.filter((d) => !d.isManuallySet),
    pool,
    (d) => Math.max(0, d.totalBalance ?? 0),
    (d) => Math.max(0, (d.totalBalance ?? Infinity) - d.amount),
    (d, amt) => {
      d.amount += amt;
    },
  );

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

  const windfall: Windfall = {
    id: "windfall-" + Date.now(),
    name,
    sourceAmount: amount,
    date: Date.now(),
    distributions,
    unallocatedCash: pool,
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
