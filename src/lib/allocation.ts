import { BudgetState, BudgetElement, SavingsGoal, Windfall } from "../types";
import { summarizeIncome } from "./income";

// Priority waterfall (shared by weekly auto-allocation and windfalls):
//   1. Locked items keep their manual amounts
//   2. Car loan
//   3. Buy-now-pay-later debts (Zip, Afterpay) split equally
//   4. Family ("mama") debts
//   5. Any other debts split equally
//   6. 90% business goal / 10% emergency fund
//   7. Remaining savings goals split equally

const BNPL_NAMES = [
  "zip money",
  "zip pay",
  "after pay",
  "zipmoney",
  "zippay",
  "afterpay",
];

const nameMatches = (name: string, needles: string[]) =>
  needles.some((n) => name.toLowerCase().includes(n));

interface Sink {
  cap: number; // most this target can still absorb
  add: (amt: number) => void;
}

// Pour `pool` into one sink, respecting its cap. Returns what's left.
function fillOne(sink: Sink, pool: number): number {
  const amt = Math.min(sink.cap, pool);
  if (amt > 0) {
    sink.add(amt);
    sink.cap -= amt;
  }
  return pool - amt;
}

// Split `pool` equally across sinks; when one hits its cap, redistribute
// the remainder among the rest. Returns what's left unspent.
function fillEqually(sinks: Sink[], pool: number): number {
  let open = sinks.filter((s) => s.cap > 0.01);
  while (open.length > 0 && pool > 0.01) {
    const split = pool / open.length;
    for (const s of open) {
      const amt = Math.min(split, s.cap);
      s.add(amt);
      s.cap -= amt;
      pool -= amt;
    }
    // Each round either retires a capped sink or fully drains the pool,
    // so this always terminates.
    open = open.filter((s) => s.cap > 0.01);
  }
  return Math.max(0, pool);
}

// Runs the priority waterfall over a pool of money.
// The debt/goal sink factories decide what "absorbing money" means
// (weekly repayment amounts vs. actual balance reductions).
function runWaterfall(
  pool: number,
  debts: BudgetElement[],
  savings: SavingsGoal[],
  debtSink: (d: BudgetElement) => Sink,
  goalSink: (s: SavingsGoal) => Sink,
): number {
  const unlockedDebts = debts.filter((d) => !d.isLocked);

  for (const d of unlockedDebts.filter((d) => nameMatches(d.name, ["car"]))) {
    pool = fillOne(debtSink(d), pool);
  }

  pool = fillEqually(
    unlockedDebts
      .filter((d) => nameMatches(d.name, BNPL_NAMES))
      .map(debtSink),
    pool,
  );

  for (const d of unlockedDebts.filter((d) => nameMatches(d.name, ["mama"]))) {
    pool = fillOne(debtSink(d), pool);
  }

  // Anything still owing that the named priorities didn't cover.
  pool = fillEqually(unlockedDebts.map(debtSink), pool);

  // 90% business / 10% emergency. Each side works independently and any
  // unspent share returns to the pool (this previously double-counted).
  if (pool > 0.01) {
    const business = savings.filter(
      (s) => !s.isLocked && nameMatches(s.name, ["business"]),
    );
    const emergency = savings.filter(
      (s) => !s.isLocked && nameMatches(s.name, ["emergency"]),
    );
    let businessPool = pool * 0.9;
    let emergencyPool = pool * 0.1;
    businessPool = fillEqually(business.map(goalSink), businessPool);
    emergencyPool = fillEqually(emergency.map(goalSink), emergencyPool);
    pool = businessPool + emergencyPool;
  }

  pool = fillEqually(
    savings.filter((s) => !s.isLocked).map(goalSink),
    pool,
  );

  return pool;
}

// Distributes weekly surplus (net income minus expenses) across debt
// repayments and savings contributions. Locked items keep their amounts.
export function calculateAutoAllocation(prevState: BudgetState): BudgetState {
  const debts = prevState.debts.map((d) => ({ ...d }));
  const savings = prevState.savings.map((s) => ({ ...s }));

  const { totalNetIncome } = summarizeIncome(prevState);
  let pool =
    totalNetIncome - prevState.expenses.reduce((acc, el) => acc + el.amount, 0);
  if (pool < 0) pool = 0;

  for (const d of debts) {
    if (d.isLocked) {
      d.amount = Math.min(pool, d.amount);
      pool -= d.amount;
    } else {
      d.amount = 0;
    }
  }
  for (const s of savings) {
    if (s.isLocked) {
      s.weeklyContribution = Math.min(pool, s.weeklyContribution);
      pool -= s.weeklyContribution;
    } else {
      s.weeklyContribution = 0;
    }
  }

  const debtSink = (d: BudgetElement): Sink => ({
    cap: Math.max(0, (d.totalBalance ?? Infinity) - d.amount),
    add: (amt) => {
      d.amount += amt;
    },
  });
  const goalSink = (s: SavingsGoal): Sink => ({
    cap:
      s.targetAmount > 0
        ? Math.max(
            0,
            s.targetAmount - (s.currentAmount || 0) - s.weeklyContribution,
          )
        : Infinity,
    add: (amt) => {
      s.weeklyContribution += amt;
    },
  });

  runWaterfall(pool, debts, savings, debtSink, goalSink);

  return { ...prevState, debts, savings };
}

// Distributes a one-off cash windfall down the same priority list, but
// against actual balances. Whatever is left lands in the Cash Vault.
export function distributeWindfall(
  prevState: BudgetState,
  name: string,
  amount: number,
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

  const debtSink = (d: BudgetElement): Sink => ({
    cap: Math.max(0, d.totalBalance || 0),
    add: (amt) => {
      d.totalBalance = Math.max(0, (d.totalBalance || 0) - amt);
      record("debt", d.id, d.name, amt);
    },
  });
  const goalSink = (s: SavingsGoal): Sink => ({
    cap:
      s.targetAmount > 0
        ? Math.max(0, s.targetAmount - (s.currentAmount || 0))
        : Infinity,
    add: (amt) => {
      s.currentAmount = (s.currentAmount || 0) + amt;
      record("savings", s.id, s.name, amt);
    },
  });

  const unallocatedCash = runWaterfall(
    amount,
    debts,
    savings,
    debtSink,
    goalSink,
  );

  const windfall: Windfall = {
    id: "windfall-" + Date.now(),
    name,
    sourceAmount: amount,
    date: Date.now(),
    distributions,
    unallocatedCash,
  };

  return calculateAutoAllocation({
    ...prevState,
    debts,
    savings,
    cashBalance: (prevState.cashBalance || 0) + unallocatedCash,
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
      if (s) s.currentAmount = Math.max(0, (s.currentAmount || 0) - dist.amount);
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
