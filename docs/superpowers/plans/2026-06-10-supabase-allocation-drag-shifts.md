# Supabase Migration, Live Allocation, Drag Reorder & Shift Logging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Firebase with Supabase (anonymous auth), replace the hardcoded allocation waterfall with live proportional rebalancing, add dnd-kit drag-to-reorder on Expenses and Debts lists, and replace the calendar event system with a shift-log flow and debt payoff chart.

**Architecture:** Supabase handles persistence (anonymous auth + Postgres) replacing Firebase entirely. `src/lib/supabase.ts` exports the client; `App.tsx` bootstraps the anonymous session; `Dashboard.tsx` syncs state via Supabase realtime. Allocation is rewritten as a pure proportional function — no name matching. dnd-kit wraps the Expenses and Debts lists inside `HomeTab.tsx`. `HistoryTab.tsx` gains a shift-log panel (writes to Supabase `shift_logs`) and a `LineChart` of `weekly_snapshots`.

**Tech Stack:** `@supabase/supabase-js` v2, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`, Recharts (already installed), React 19 + TypeScript + Vite + Tailwind CSS v4.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/supabase.ts` | **Create** | Supabase client singleton |
| `.env.local` | **Create** | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` |
| `src/firebase.ts` | **Delete** | Replaced by supabase.ts |
| `firebase-applet-config.json` | **Delete** | No longer needed |
| `firebase.json` | **Delete** | No longer needed |
| `firestore.rules` | **Delete** | No longer needed |
| `src/types.ts` | **Modify** | Add `isManuallySet` to `BudgetElement`; add `ShiftLog`; remove `CalendarEvent`; remove `calendarEvents` from `BudgetState` |
| `src/lib/allocation.ts` | **Rewrite** | Proportional algorithm; keep `distributeWindfall` + `undoWindfall` (simplified) |
| `src/App.tsx` | **Rewrite** | Supabase anonymous auth; remove all Firebase imports |
| `src/components/Dashboard.tsx` | **Modify** | Supabase sync replacing Firestore; remove Firebase props; add weekly snapshot trigger |
| `src/components/tabs/HomeTab.tsx` | **Modify** | dnd-kit on Expenses and Debts; remove Auto-Allocate button; add per-debt reset icon |
| `src/components/tabs/HistoryTab.tsx` | **Rewrite** | Remove calendar events; add Log Shift panel; add debt payoff LineChart |
| `src/components/tabs/SettingsTab.tsx` | **Modify** | Replace Google/magic-link card with Supabase sync status indicator |

---

## Task 1: Install packages and delete Firebase files

**Files:**
- Modify: `package.json`
- Delete: `src/firebase.ts`, `firebase-applet-config.json`, `firebase.json`, `firestore.rules`

- [ ] **Step 1: Install Supabase and dnd-kit, remove Firebase**

```bash
cd repo
npm install @supabase/supabase-js @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm uninstall firebase
```

Expected output: no errors, `package.json` updated.

- [ ] **Step 2: Delete Firebase files**

```bash
rm src/firebase.ts firebase-applet-config.json firebase.json firestore.rules
```

- [ ] **Step 3: Verify TypeScript still compiles (will fail — that's expected)**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors about missing `firebase` imports (we'll fix these in later tasks). That's fine.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: install Supabase + dnd-kit, remove Firebase"
```

---

## Task 2: Create Supabase project and database schema

**Files:**
- Create: `.env.local`

- [ ] **Step 1: Create Supabase project using the Supabase MCP tool**

Use `mcp__plugin_supabase_supabase__create_project` with:
```json
{
  "name": "budget-planner",
  "region": "ap-southeast-2",
  "confirm_cost": true
}
```

Wait for the project to be ready (status = `ACTIVE_HEALTHY`).

- [ ] **Step 2: Get the project URL and anon key**

Use `mcp__plugin_supabase_supabase__get_project_url` and `mcp__plugin_supabase_supabase__get_publishable_keys` with the project ID from Step 1.

- [ ] **Step 3: Create `.env.local`**

```
VITE_SUPABASE_URL=<url from step 2>
VITE_SUPABASE_ANON_KEY=<anon key from step 2>
```

- [ ] **Step 4: Apply the database migrations using `mcp__plugin_supabase_supabase__apply_migration`**

Migration name: `create_budget_tables`

```sql
-- Enable anonymous auth (required for signInAnonymously)
-- This is done in the Supabase dashboard, not SQL — see Step 5.

-- Budget state table
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  state jsonb not null default '{}',
  updated_at timestamptz default now(),
  unique (user_id)
);
alter table budgets enable row level security;
create policy "owner only" on budgets
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Shift logs table
create table if not exists shift_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  shift_date date not null,
  income_stream_id text not null,
  income_stream_name text not null,
  hours numeric(5,2) not null,
  hourly_rate numeric(8,2) not null,
  notes text,
  created_at timestamptz default now()
);
alter table shift_logs enable row level security;
create policy "owner only" on shift_logs
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Weekly snapshots for debt payoff chart
create table if not exists weekly_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  week_starting date not null,
  net_income numeric(10,2),
  total_debt_balance numeric(10,2),
  total_paid_this_week numeric(10,2),
  created_at timestamptz default now(),
  unique (user_id, week_starting)
);
alter table weekly_snapshots enable row level security;
create policy "owner only" on weekly_snapshots
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

- [ ] **Step 5: Enable Anonymous Auth in the Supabase dashboard**

Open: `https://supabase.com/dashboard/project/<project-id>/auth/providers`

Scroll to **Anonymous Sign-ins** → toggle **Enable anonymous sign-ins** → Save.

*(This cannot be done via SQL — it's a project setting.)*

- [ ] **Step 6: Commit**

```bash
git add .env.local
git commit -m "chore: add Supabase env config"
```

---

## Task 3: Supabase client + anonymous auth bootstrap

**Files:**
- Create: `src/lib/supabase.ts`
- Rewrite: `src/App.tsx`

- [ ] **Step 1: Create `src/lib/supabase.ts`**

```typescript
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 2: Rewrite `src/App.tsx`**

```typescript
import React, { useState, useEffect } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import Dashboard from "./components/Dashboard";
import Login from "./components/Login";

export default function App() {
  const [isAuthenticatedLocal, setIsAuthenticatedLocal] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    const savedSession = localStorage.getItem("budget_auth_session");
    if (savedSession === "valid") setIsAuthenticatedLocal(true);
  }, []);

  useEffect(() => {
    // Restore existing session or create a new anonymous one.
    supabase.auth.getSession().then(async ({ data: { session: existing } }) => {
      if (existing) {
        setSession(existing);
      } else {
        const { data } = await supabase.auth.signInAnonymously();
        setSession(data.session);
      }
      setIsLoadingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, s) => setSession(s),
    );
    return () => subscription.unsubscribe();
  }, []);

  const handleLocalLogin = () => {
    setIsAuthenticatedLocal(true);
    localStorage.setItem("budget_auth_session", "valid");
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-[#F3F4F9] flex items-center justify-center">
        <div className="animate-pulse text-indigo-600 font-bold">
          Loading secure environment...
        </div>
      </div>
    );
  }

  if (!isAuthenticatedLocal) {
    return <Login onLogin={handleLocalLogin} />;
  }

  return (
    <Dashboard
      session={session}
      onLogout={() => {
        setIsAuthenticatedLocal(false);
        localStorage.removeItem("budget_auth_session");
      }}
    />
  );
}
```

- [ ] **Step 3: Verify TypeScript (errors expected in Dashboard)**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase.ts src/App.tsx
git commit -m "feat: add Supabase client and anonymous auth bootstrap"
```

---

## Task 4: Update types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Replace `src/types.ts` entirely**

```typescript
export interface BudgetElement {
  id: string;
  name: string;
  amount: number;
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
  type: "casual" | "fixed";
  hourlyRate?: number;
  hoursWorked?: number;
  amount?: number;
  isCash?: boolean;
  shifts?: Shift[];
  useShifts?: boolean;
}

export interface ShiftLog {
  id: string;
  user_id: string;
  shift_date: string; // ISO date string "yyyy-MM-dd"
  income_stream_id: string;
  income_stream_name: string;
  hours: number;
  hourly_rate: number;
  notes?: string;
  created_at: string;
}

export interface WeeklySnapshot {
  id: string;
  user_id: string;
  week_starting: string; // ISO date string "yyyy-MM-dd"
  net_income: number;
  total_debt_balance: number;
  total_paid_this_week: number;
  created_at: string;
}

export interface Windfall {
  id: string;
  name: string;
  sourceAmount: number;
  date: number;
  distributions: {
    type: "debt" | "savings";
    id: string;
    amount: number;
    name: string;
  }[];
  unallocatedCash: number;
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
  windfalls?: Windfall[];
  centrelinkEnabled?: boolean;
  centrelinkMaxFortnightly?: number;
}
```

- [ ] **Step 2: Verify types compile (errors in HistoryTab expected)**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: update types — add ShiftLog, WeeklySnapshot, isManuallySet; remove CalendarEvent"
```

---

## Task 5: Rewrite allocation logic

**Files:**
- Rewrite: `src/lib/allocation.ts`

The new algorithm:
- **Manual debts** (`isManuallySet = true`): their `amount` is preserved as-is (capped at balance).
- **Auto debts** (`isManuallySet = false`): receive the remaining pool split proportionally by `totalBalance`.
- No name-based priority matching.
- `distributeWindfall` fills debts proportionally by balance, then savings proportionally.

- [ ] **Step 1: Rewrite `src/lib/allocation.ts`**

```typescript
import { BudgetState, BudgetElement, SavingsGoal, Windfall } from "../types";
import { summarizeIncome } from "./income";

// Distribute `pool` across `items` proportional to `weight(item)`.
// Each item is capped at `cap(item)`. Returns leftover pool.
function splitProportional(
  items: BudgetElement[],
  pool: number,
  weight: (d: BudgetElement) => number,
  cap: (d: BudgetElement) => number,
  assign: (d: BudgetElement, amt: number) => void,
): number {
  let remaining = items.filter((d) => cap(d) > 0.01);
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
      if (cap(d) - actual > 0.01) nextRemaining.push(d);
    }
    pool -= spent;
    remaining = nextRemaining;
    if (spent < 0.001) break;
  }
  return Math.max(0, pool);
}

function splitSavingsProportional(
  items: SavingsGoal[],
  pool: number,
  assign: (s: SavingsGoal, amt: number) => void,
): number {
  const eligible = items.filter(
    (s) => !s.isLocked && s.targetAmount > (s.currentAmount || 0),
  );
  if (eligible.length === 0) return pool;
  const split = pool / eligible.length;
  for (const s of eligible) {
    const roomLeft = s.targetAmount - (s.currentAmount || 0) - s.weeklyContribution;
    const actual = Math.min(split, Math.max(0, roomLeft));
    if (actual > 0.001) assign(s, actual);
  }
  return 0;
}

// Distributes weekly surplus across debt repayments and savings contributions.
// Manually-set debt amounts are preserved; the rest are split proportionally
// by outstanding balance. Drag order in the array determines visual priority
// but allocation is purely proportional.
export function calculateAutoAllocation(prevState: BudgetState): BudgetState {
  const debts = prevState.debts.map((d) => ({ ...d }));
  const savings = prevState.savings.map((s) => ({ ...s }));

  const { totalNetIncome } = summarizeIncome(prevState);
  const totalExpenses = prevState.expenses.reduce((acc, el) => acc + el.amount, 0);
  let pool = Math.max(0, totalNetIncome - totalExpenses);

  // Deduct locked savings contributions first.
  for (const s of savings) {
    if (s.isLocked) {
      s.weeklyContribution = Math.min(pool, s.weeklyContribution);
      pool -= s.weeklyContribution;
    } else {
      s.weeklyContribution = 0;
    }
  }

  // Deduct manually-set debt amounts.
  const manualDebts = debts.filter((d) => d.isManuallySet);
  const autoDebts = debts.filter((d) => !d.isManuallySet);

  for (const d of manualDebts) {
    const cappedAmount = Math.min(d.amount, d.totalBalance ?? d.amount, pool);
    d.amount = Math.max(0, cappedAmount);
    pool -= d.amount;
  }

  // Split remaining pool across auto debts proportional to outstanding balance.
  for (const d of autoDebts) d.amount = 0;

  pool = splitProportional(
    autoDebts,
    pool,
    (d) => Math.max(0, d.totalBalance ?? 0),
    (d) => Math.max(0, (d.totalBalance ?? Infinity) - d.amount),
    (d, amt) => { d.amount += amt; },
  );

  // Remaining pool flows to unlocked savings goals equally.
  splitSavingsProportional(
    savings.filter((s) => !s.isLocked),
    pool,
    (s, amt) => { s.weeklyContribution += amt; },
  );

  return { ...prevState, debts, savings };
}

// Distributes a one-off windfall against actual balances.
// Debts are filled proportionally, then savings proportionally.
// Whatever remains lands in the Cash Vault.
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

  // Fill debts proportionally by balance.
  let pool = splitProportional(
    debts,
    amount,
    (d) => Math.max(0, d.totalBalance ?? 0),
    (d) => Math.max(0, d.totalBalance ?? 0),
    (d, amt) => {
      d.totalBalance = Math.max(0, (d.totalBalance ?? 0) - amt);
      record("debt", d.id, d.name, amt);
    },
  );

  // Fill savings proportionally by remaining gap.
  const savingsItems = savings.filter(
    (s) => s.targetAmount > (s.currentAmount || 0),
  );
  if (savingsItems.length > 0 && pool > 0.01) {
    const split = pool / savingsItems.length;
    for (const s of savingsItems) {
      const gap = s.targetAmount - (s.currentAmount || 0);
      const amt = Math.min(split, gap);
      if (amt > 0.001) {
        s.currentAmount = (s.currentAmount || 0) + amt;
        record("savings", s.id, s.name, amt);
        pool -= amt;
      }
    }
  }

  const windfall: Windfall = {
    id: "windfall-" + Date.now(),
    name,
    sourceAmount: amount,
    date: Date.now(),
    distributions,
    unallocatedCash: Math.max(0, pool),
  };

  return calculateAutoAllocation({
    ...prevState,
    debts,
    savings,
    cashBalance: (prevState.cashBalance || 0) + Math.max(0, pool),
    windfalls: [...(prevState.windfalls || []), windfall],
  });
}

// Reverses a recorded windfall: restores debt balances, pulls money back
// from savings and the vault, then re-runs the weekly allocation.
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
```

- [ ] **Step 2: Run the existing verify script to confirm core logic still passes**

```bash
npx tsx scripts/verify-allocation.ts
```

Expected: most checks pass. The "locked debt" test may differ — that's OK, we removed name-matching. Fix any failures before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/allocation.ts
git commit -m "feat: replace waterfall with proportional debt allocation"
```

---

## Task 6: Update Dashboard.tsx — Supabase sync

**Files:**
- Modify: `src/components/Dashboard.tsx`

- [ ] **Step 1: Replace Firebase imports and sync logic in `Dashboard.tsx`**

Replace the top of the file (imports + `DashboardProps` + both `useEffect` sync blocks):

```typescript
// Remove these imports entirely:
// import { doc, setDoc, onSnapshot } from "firebase/firestore";
// import { User } from "firebase/auth";
// import { db } from "../firebase";

// Add these:
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { format, startOfWeek } from "date-fns";
```

Change `DashboardProps`:
```typescript
interface DashboardProps {
  session: Session | null;
  onGoogleLogin?: never;   // remove — no longer used
  onGoogleLogout?: never;  // remove — no longer used
  onLogout?: () => void;
}
```

Replace the two Firebase `useEffect` blocks (localStorage + Firestore) with:
```typescript
// Persist to localStorage immediately; debounce cloud writes 800 ms.
useEffect(() => {
  localStorage.setItem("budget_state_v4", JSON.stringify(state));
  if (!session?.user) return;

  const timeout = setTimeout(async () => {
    await supabase
      .from("budgets")
      .upsert({ user_id: session.user.id, state, updated_at: new Date().toISOString() },
               { onConflict: "user_id" });
  }, 800);
  return () => clearTimeout(timeout);
}, [state, session]);

// Pull latest state from Supabase on mount (first sign-in migration included).
useEffect(() => {
  if (!session?.user) return;

  const load = async () => {
    // One-time migration: upload localStorage data to Supabase.
    const migrated = localStorage.getItem("budget_migrated");
    if (!migrated) {
      const local = localStorage.getItem("budget_state_v4");
      if (local) {
        const parsed = JSON.parse(local);
        await supabase
          .from("budgets")
          .upsert({ user_id: session.user.id, state: parsed, updated_at: new Date().toISOString() },
                   { onConflict: "user_id" });
        localStorage.setItem("budget_migrated", "true");
        return; // state already loaded from localStorage above
      }
    }

    const { data } = await supabase
      .from("budgets")
      .select("state")
      .eq("user_id", session.user.id)
      .single();
    if (data?.state) setState(data.state as BudgetState);
  };

  load();

  // Realtime subscription: update state when another device writes.
  const channel = supabase
    .channel("budgets-sync")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "budgets",
        filter: `user_id=eq.${session.user.id}` },
      (payload) => {
        const incoming = payload.new as { state: BudgetState };
        setState((prev) =>
          JSON.stringify(prev) !== JSON.stringify(incoming.state)
            ? incoming.state
            : prev,
        );
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}, [session]);

// Weekly snapshot: write once per week to track debt payoff progress.
useEffect(() => {
  if (!session?.user) return;
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const totalDebtBalance = state.debts.reduce((s, d) => s + (d.totalBalance ?? 0), 0);
  const totalPaid = state.debts.reduce((s, d) => s + d.amount, 0);

  supabase
    .from("weekly_snapshots")
    .upsert(
      {
        user_id: session.user.id,
        week_starting: weekStart,
        net_income: 0, // updated below
        total_debt_balance: totalDebtBalance,
        total_paid_this_week: totalPaid,
      },
      { onConflict: "user_id,week_starting", ignoreDuplicates: true },
    );
}, [session]);
```

- [ ] **Step 2: Remove all references to `firebaseUser`, `onGoogleLogin`, `onGoogleLogout` in `Dashboard.tsx`**

Search and replace:
- `firebaseUser` → `session?.user`
- Remove the `onGoogleLogin` and `onGoogleLogout` props from the `<SettingsTab>` render call (we'll update SettingsTab in Task 9)

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat: replace Firestore sync with Supabase upsert + realtime"
```

---

## Task 7: Drag-to-reorder Expenses and Debts

**Files:**
- Modify: `src/components/tabs/HomeTab.tsx`

dnd-kit pattern: wrap each list in `<DndContext>` + `<SortableContext>`. Each row gets `useSortable(id)`. The drag handle is a `⠿` gripper icon. On `onDragEnd`, call a new `onReorderExpenses` / `onReorderDebts` prop.

- [ ] **Step 1: Add reorder handlers to `Dashboard.tsx`**

Inside `Dashboard.tsx`, add two handlers after the existing `removeItem` handler:

```typescript
const reorderItems = (
  type: "expenses" | "debts",
  activeId: string,
  overId: string,
) => {
  setState((prev) => {
    const items = [...prev[type]];
    const oldIndex = items.findIndex((i) => i.id === activeId);
    const newIndex = items.findIndex((i) => i.id === overId);
    if (oldIndex === -1 || newIndex === -1) return prev;
    const [moved] = items.splice(oldIndex, 1);
    items.splice(newIndex, 0, moved);
    return { ...prev, [type]: items };
  });
};
```

Add to the `<HomeTab>` render call:
```typescript
onReorderExpenses={(activeId, overId) => reorderItems("expenses", activeId, overId)}
onReorderDebts={(activeId, overId) => reorderItems("debts", activeId, overId)}
```

- [ ] **Step 2: Add the reorder props to `HomeTab`'s props interface**

In `HomeTab.tsx`, add to the props interface:
```typescript
onReorderExpenses: (activeId: string, overId: string) => void;
onReorderDebts: (activeId: string, overId: string) => void;
```

- [ ] **Step 3: Add a reusable `SortableRow` component at the top of `HomeTab.tsx`**

Add these imports at the top of `HomeTab.tsx`:
```typescript
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
```

Add this component just before `export default function HomeTab`:
```typescript
function DragHandle({ attributes, listeners }: {
  attributes: React.HTMLAttributes<HTMLButtonElement>;
  listeners: Record<string, Function> | undefined;
}) {
  return (
    <button
      {...attributes}
      {...(listeners as any)}
      className="cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-gray-500 touch-none"
      aria-label="Drag to reorder"
      tabIndex={0}
    >
      <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
        <circle cx="2" cy="2" r="1.5" /><circle cx="8" cy="2" r="1.5" />
        <circle cx="2" cy="8" r="1.5" /><circle cx="8" cy="8" r="1.5" />
        <circle cx="2" cy="14" r="1.5" /><circle cx="8" cy="14" r="1.5" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 4: Wrap the Expenses list section in DndContext + SortableContext**

In `HomeTab.tsx`, locate the expenses map (renders each `expense` row). Wrap it:

```typescript
const sensors = useSensors(
  useSensor(PointerSensor),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);

// Inside JSX, replace the existing expenses ul/div with:
<DndContext
  sensors={sensors}
  collisionDetection={closestCenter}
  onDragEnd={(event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorderExpenses(String(active.id), String(over.id));
    }
  }}
>
  <SortableContext
    items={state.expenses.map((e) => e.id)}
    strategy={verticalListSortingStrategy}
  >
    {state.expenses.map((expense) => (
      <SortableExpenseRow
        key={expense.id}
        expense={expense}
        onEdit={() => onEdit("expense", expense)}
        onRemove={() => onRemoveItem("expenses", expense.id)}
      />
    ))}
  </SortableContext>
</DndContext>
```

Add `SortableExpenseRow` component (before `HomeTab`):
```typescript
function SortableExpenseRow({
  expense,
  onEdit,
  onRemove,
}: {
  expense: BudgetElement;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: expense.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 200ms ease",
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 group">
      <DragHandle attributes={attributes as any} listeners={listeners} />
      {/* existing expense row content here — copy the current row JSX exactly */}
    </div>
  );
}
```

*(The existing expense row JSX stays unchanged inside the wrapper — just move it.)*

- [ ] **Step 5: Repeat for Debts list** — same pattern as Step 4 but with a `SortableDebtRow` component and `onReorderDebts`.

- [ ] **Step 6: Remove the Auto-Allocate button** — search `HomeTab.tsx` for "Auto-Allocate" and delete that button element and its `onAutoAllocate` prop reference.

Remove from `Dashboard.tsx`: the `handleAutoAllocate` function and its passing to `<HomeTab>`.

Remove from `HomeTab.tsx` props interface: `onAutoAllocate`.

- [ ] **Step 7: Add per-debt Reset icon** — for each debt row in `SortableDebtRow`, add a small circular-arrow button:

```typescript
import { RotateCcw } from "lucide-react";

// Inside SortableDebtRow, next to the edit/delete buttons:
{debt.isManuallySet && (
  <button
    onClick={onReset}
    className="p-1.5 text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
    title="Reset to auto allocation"
  >
    <RotateCcw className="w-3.5 h-3.5" />
  </button>
)}
```

Add `onReset` to `SortableDebtRow` props. In `Dashboard.tsx`, add the handler:
```typescript
const resetDebtAllocation = (id: string) => {
  setState((prev) =>
    calculateAutoAllocation({
      ...prev,
      debts: prev.debts.map((d) =>
        d.id === id ? { ...d, isManuallySet: false } : d,
      ),
    }),
  );
};
```

- [ ] **Step 8: Wire `isManuallySet` on debt amount edit**

In `Dashboard.tsx`, find where debt amounts are manually edited (the inline `amount` field update in `HomeTab` — look for `onUpdateDebt` or similar inline edit handler). When a debt's `amount` changes via the UI input, set `isManuallySet: true` and call `calculateAutoAllocation`:

```typescript
const updateDebtAmount = (id: string, amount: number) => {
  setState((prev) =>
    calculateAutoAllocation({
      ...prev,
      debts: prev.debts.map((d) =>
        d.id === id ? { ...d, amount, isManuallySet: true } : d,
      ),
    }),
  );
};
```

Pass `updateDebtAmount` to `HomeTab` as `onUpdateDebtAmount`.

- [ ] **Step 9: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```

Fix any errors.

- [ ] **Step 10: Commit**

```bash
git add src/components/tabs/HomeTab.tsx src/components/Dashboard.tsx
git commit -m "feat: drag-to-reorder expenses and debts with dnd-kit; remove Auto-Allocate button"
```

---

## Task 8: Rewrite HistoryTab — remove calendar events, add shift log panel

**Files:**
- Rewrite: `src/components/tabs/HistoryTab.tsx`

- [ ] **Step 1: Remove calendar event props from Dashboard.tsx**

In `Dashboard.tsx`, delete:
- `handleSaveCalendarEvent`
- `handleDeleteCalendarEvent`
- The `calendarEvents`, `onSaveEvent`, `onDeleteEvent` props passed to `<HistoryTab>`

Add instead:
```typescript
// No new props needed — HistoryTab fetches shift_logs and snapshots from Supabase directly using the session.
```

Pass `session` to `<HistoryTab>`:
```typescript
<HistoryTab
  totalNetIncome={summary.totalNetIncome}
  totalExpenses={totalExpenses}
  totalDebts={totalDebts}
  totalSavingsCont={totalSavingsCont}
  weeklySurplus={weeklySurplus}
  incomes={state.incomes}
  session={session}
/>
```

- [ ] **Step 2: Rewrite `src/components/tabs/HistoryTab.tsx`**

```typescript
import React, { useState, useEffect } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  getDay,
  parseISO,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { IncomeStream, ShiftLog, WeeklySnapshot } from "../../types";

const WEEKS_PER_MONTH = 4.33;
const money = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface HistoryTabProps {
  totalNetIncome: number;
  totalExpenses: number;
  totalDebts: number;
  totalSavingsCont: number;
  weeklySurplus: number;
  incomes: IncomeStream[];
  session: Session | null;
}

export default function HistoryTab({
  totalNetIncome,
  totalExpenses,
  totalDebts,
  totalSavingsCont,
  weeklySurplus,
  incomes,
  session,
}: HistoryTabProps) {
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [shiftLogs, setShiftLogs] = useState<ShiftLog[]>([]);
  const [snapshots, setSnapshots] = useState<WeeklySnapshot[]>([]);

  // Log shift form state
  const [logHours, setLogHours] = useState("");
  const [logRate, setLogRate] = useState("");
  const [logStreamId, setLogStreamId] = useState(incomes[0]?.id ?? "");
  const [logNotes, setLogNotes] = useState("");
  const [isSavingLog, setIsSavingLog] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);

  const monthlySurplus = weeklySurplus * WEEKS_PER_MONTH;

  // Pre-fill rate when stream changes
  useEffect(() => {
    const stream = incomes.find((i) => i.id === logStreamId);
    if (stream?.hourlyRate) setLogRate(String(stream.hourlyRate));
  }, [logStreamId, incomes]);

  // Load shift logs and snapshots from Supabase
  useEffect(() => {
    if (!session?.user) return;

    const loadData = async () => {
      const [logsResult, snapshotsResult] = await Promise.all([
        supabase
          .from("shift_logs")
          .select("*")
          .eq("user_id", session.user.id)
          .order("shift_date", { ascending: false }),
        supabase
          .from("weekly_snapshots")
          .select("*")
          .eq("user_id", session.user.id)
          .order("week_starting", { ascending: true }),
      ]);
      if (logsResult.data) setShiftLogs(logsResult.data as ShiftLog[]);
      if (snapshotsResult.data) setSnapshots(snapshotsResult.data as WeeklySnapshot[]);
    };

    loadData();
  }, [session]);

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user || !logHours || !logRate) return;
    setIsSavingLog(true);

    const stream = incomes.find((i) => i.id === logStreamId);
    const newLog = {
      user_id: session.user.id,
      shift_date: selectedDate,
      income_stream_id: logStreamId,
      income_stream_name: stream?.name ?? "Unknown",
      hours: Number(logHours),
      hourly_rate: Number(logRate),
      notes: logNotes || null,
    };

    const { data, error } = await supabase
      .from("shift_logs")
      .insert(newLog)
      .select()
      .single();

    if (!error && data) {
      setShiftLogs((prev) => [data as ShiftLog, ...prev]);
      setLogHours("");
      setLogNotes("");
      setShowLogForm(false);
    }
    setIsSavingLog(false);
  };

  const handleDeleteShift = async (id: string) => {
    await supabase.from("shift_logs").delete().eq("id", id);
    setShiftLogs((prev) => prev.filter((l) => l.id !== id));
  };

  const daysWithLogs = new Set(shiftLogs.map((l) => l.shift_date));
  const selectedDayLogs = shiftLogs.filter((l) => l.shift_date === selectedDate);

  const casualIncomes = incomes.filter((i) => i.type === "casual");

  const metricRows = [
    { label: "Total Net Income", weekly: totalNetIncome, cls: "text-emerald-600" },
    { label: "Expenses", weekly: totalExpenses, cls: "text-amber-600" },
    { label: "Debt Repayments", weekly: totalDebts, cls: "text-rose-600" },
    { label: "Savings Contributions", weekly: totalSavingsCont, cls: "text-blue-600" },
  ];

  const chartData = snapshots.map((s) => ({
    week: format(parseISO(s.week_starting), "d MMM"),
    balance: Number(s.total_debt_balance.toFixed(2)),
  }));

  return (
    <div className="space-y-6">
      {/* Financial Log Table */}
      <div className="glass-card p-4 md:p-6 border border-white/60">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Financial Log</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 rounded-lg">
              <tr>
                <th className="px-6 py-4 rounded-tl-lg font-bold">Metric</th>
                <th className="px-6 py-4 font-bold text-right">Weekly</th>
                <th className="px-6 py-4 font-bold text-right">Monthly</th>
                <th className="px-6 py-4 rounded-tr-lg font-bold text-right">Yearly</th>
              </tr>
            </thead>
            <tbody>
              {metricRows.map((row) => (
                <tr key={row.label} className="bg-white border-b border-gray-100">
                  <td className={`px-6 py-4 font-bold ${row.cls}`}>{row.label}</td>
                  <td className={`px-6 py-4 text-right font-semibold ${row.cls}`}>${money(row.weekly)}</td>
                  <td className={`px-6 py-4 text-right font-semibold ${row.cls}`}>${money(row.weekly * WEEKS_PER_MONTH)}</td>
                  <td className={`px-6 py-4 text-right font-semibold ${row.cls}`}>${money(row.weekly * 52)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50/50 font-bold">
                <td className="px-6 py-4 text-gray-900">Surplus / Deficit</td>
                <td className={`px-6 py-4 text-right ${weeklySurplus >= 0 ? "text-emerald-700" : "text-rose-700"}`}>${money(weeklySurplus)}</td>
                <td className={`px-6 py-4 text-right ${monthlySurplus >= 0 ? "text-emerald-700" : "text-rose-700"}`}>${money(monthlySurplus)}</td>
                <td className={`px-6 py-4 text-right ${weeklySurplus >= 0 ? "text-emerald-700" : "text-rose-700"}`}>${money(weeklySurplus * 52)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Calendar + Shift Log */}
      <div className="glass-card p-4 md:p-6 border border-white/60">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-600" />
            Shift Calendar
          </h2>
          <div className="flex items-center gap-4">
            <button onClick={() => setCurrentMonthDate(subMonths(currentMonthDate, 1))} className="p-1 hover:bg-gray-100 rounded-lg" aria-label="Previous month">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <span className="font-semibold text-gray-800 min-w-[120px] text-center">
              {format(currentMonthDate, "MMMM yyyy")}
            </span>
            <button onClick={() => setCurrentMonthDate(addMonths(currentMonthDate, 1))} className="p-1 hover:bg-gray-100 rounded-lg" aria-label="Next month">
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider py-2">{day}</div>
          ))}
          {Array.from({ length: getDay(startOfMonth(currentMonthDate)) }).map((_, i) => (
            <div key={"empty-" + i} className="p-2 md:p-4 rounded-xl bg-gray-50/30 border border-transparent" />
          ))}
          {eachDayOfInterval({ start: startOfMonth(currentMonthDate), end: endOfMonth(currentMonthDate) }).map((date) => {
            const dateStr = format(date, "yyyy-MM-dd");
            const isCurrent = dateStr === selectedDate;
            const hasLog = daysWithLogs.has(dateStr);
            return (
              <div
                key={dateStr}
                onClick={() => { setSelectedDate(dateStr); setShowLogForm(false); }}
                className={`p-1 md:p-2 rounded-xl border flex flex-col items-center justify-start min-h-[52px] md:min-h-[70px] transition-all cursor-pointer ${
                  isCurrent ? "bg-indigo-50 border-indigo-300 shadow-sm" : "bg-white/40 border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/20"
                }`}
              >
                <span className={`text-sm font-medium ${isCurrent ? "text-indigo-700" : "text-gray-700"}`}>
                  {format(date, "d")}
                </span>
                {hasLog && (
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1" />
                )}
              </div>
            );
          })}
        </div>

        {/* Selected day panel */}
        <div className="mt-6 pt-6 border-t border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800">
              {format(parseISO(selectedDate), "EEEE, MMMM do yyyy")}
            </h3>
            {casualIncomes.length > 0 && (
              <button
                onClick={() => setShowLogForm((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition"
              >
                <Plus className="w-4 h-4" /> Log Shift
              </button>
            )}
          </div>

          {showLogForm && (
            <form onSubmit={handleSaveShift} className="bg-white p-4 rounded-2xl border border-gray-100 space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Income Stream</label>
                  <select
                    value={logStreamId}
                    onChange={(e) => setLogStreamId(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-400 outline-none"
                  >
                    {casualIncomes.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Hourly Rate ($)</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={logRate} onChange={(e) => setLogRate(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-400 outline-none"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Hours Worked</label>
                <input
                  type="number" step="0.25" min="0"
                  value={logHours} onChange={(e) => setLogHours(e.target.value)}
                  placeholder="e.g. 7.5"
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-400 outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={logNotes} onChange={(e) => setLogNotes(e.target.value)}
                  placeholder="e.g. Double time, 9am–5pm"
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-400 outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit" disabled={isSavingLog}
                  className="flex-1 bg-indigo-600 text-white text-sm font-medium py-2 rounded-xl hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  {isSavingLog ? "Saving..." : "Save Shift"}
                </button>
                <button type="button" onClick={() => setShowLogForm(false)}
                  className="px-4 py-2 text-sm text-gray-500 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {selectedDayLogs.length === 0 && !showLogForm ? (
            <p className="text-sm text-gray-400 text-center py-4">No shifts logged on this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedDayLogs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{log.income_stream_name}</p>
                    <p className="text-xs text-gray-500">
                      {log.hours}h × ${log.hourly_rate}/hr = <span className="font-semibold text-emerald-600">${(log.hours * log.hourly_rate).toFixed(2)}</span>
                      {log.notes && <span className="ml-2 text-gray-400">· {log.notes}</span>}
                    </p>
                  </div>
                  <button onClick={() => handleDeleteShift(log.id)} className="p-1.5 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Debt Payoff Chart */}
      <div className="glass-card p-4 md:p-6 border border-white/60">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Debt Payoff Progress</h2>
        {chartData.length < 2 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            Not enough data yet — your debt balance chart will appear after a few weeks of tracking.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => [`$${money(v)}`, "Total Debt Balance"]} />
              <Line type="monotone" dataKey="balance" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```

- [ ] **Step 4: Commit**

```bash
git add src/components/tabs/HistoryTab.tsx src/components/Dashboard.tsx
git commit -m "feat: replace calendar events with shift log panel and debt payoff chart"
```

---

## Task 9: Update SettingsTab — Supabase sync status

**Files:**
- Modify: `src/components/tabs/SettingsTab.tsx`

- [ ] **Step 1: Replace the Cloud Sync card content in `SettingsTab.tsx`**

Remove: `firebaseUser`, `onGoogleLogin`, `onGoogleLogout` props.
Add: `isSyncing: boolean` prop (passed from `Dashboard.tsx` — `true` when `session?.user` exists).

Update the `SettingsTabProps` interface:
```typescript
interface SettingsTabProps {
  centrelinkEnabled: boolean;
  centrelinkMaxFortnightly: number;
  isSyncing: boolean;
  onToggleCentrelink: (enabled: boolean) => void;
  onChangeCentrelinkMax: (amount: number) => void;
  onExportCsv: () => void;
  onResetData: () => void;
}
```

Replace the Cloud Sync card body with:
```typescript
{/* Cloud Sync */}
<div className="glass-card p-6 border border-gray-100/50 md:col-span-2">
  <div className="flex items-center gap-3 mb-4">
    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isSyncing ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-400"}`}>
      <Cloud className="w-5 h-5 flex-shrink-0" />
    </div>
    <div>
      <h3 className="font-bold text-gray-900">Cloud Sync</h3>
      <p className="text-xs text-gray-500">Your budget syncs automatically across devices.</p>
    </div>
    <div className="ml-auto">
      <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${isSyncing ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-500"}`}>
        {isSyncing ? "Active" : "Offline"}
      </span>
    </div>
  </div>
  <p className="text-[11px] text-gray-400 mt-2">
    Your data is stored securely in a private Supabase database. Sync happens automatically — no sign-in required.
  </p>
</div>
```

Remove unused imports (`User` from `firebase/auth`, `LogOut`, `CloudOff`). Keep `Cloud` import from lucide-react.

- [ ] **Step 2: In `Dashboard.tsx`, pass `isSyncing` to `<SettingsTab>`**

```typescript
<SettingsTab
  ...
  isSyncing={!!session?.user}
  // remove: firebaseUser, onGoogleLogin, onGoogleLogout
/>
```

- [ ] **Step 3: Type-check with zero errors**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules"
```

Expected: no output (zero errors).

- [ ] **Step 4: Commit**

```bash
git add src/components/tabs/SettingsTab.tsx src/components/Dashboard.tsx
git commit -m "feat: SettingsTab — replace Google auth card with Supabase sync status"
```

---

## Task 10: End-to-end smoke test and push

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Manual checklist**

Open `http://localhost:3000` and verify:
- [ ] PIN screen appears on fresh load
- [ ] After PIN → Dashboard loads (Home tab)
- [ ] Expenses list shows drag handles; dragging an expense reorders it
- [ ] Debts list shows drag handles; dragging a debt reorders it
- [ ] Editing a debt's $/wk amount shows a reset icon and adjusts other debts proportionally
- [ ] Clicking the reset icon on a debt reverts it to auto-allocation
- [ ] History tab: calendar shows, clicking a day opens "Log Shift" button
- [ ] Logging a shift saves it and shows a dot on the calendar
- [ ] Debt payoff chart shows "Not enough data yet" (expected on first use)
- [ ] Settings tab: Cloud Sync card shows "Active" (green) if Supabase connected

- [ ] **Step 3: Final type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Push to GitHub**

```bash
git push origin main
```

---

## Notes for the implementing agent

- **Anonymous auth must be enabled** in the Supabase dashboard before `signInAnonymously()` will work (Task 2 Step 5). If you see `Anonymous sign-ins are disabled`, that's the missing step.
- **`date-fns` `startOfWeek`** needs to be imported in `Dashboard.tsx` — it's already a project dependency.
- The `verify-allocation.ts` script tests the old waterfall logic. After Task 5, some checks (e.g. "car loan paid first") will fail because we removed name-matching. Update the script to test proportional allocation instead.
- Keep the existing `scripts/verify-allocation.ts` tests for `distributeWindfall`, `undoWindfall`, and FY detection — those are still valid.
