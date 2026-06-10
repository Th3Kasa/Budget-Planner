# Design: Supabase Migration, Live Allocation, Drag Reorder & Shift Logging

**Date:** 2026-06-10
**Status:** Approved

---

## 1. Overview

Four connected changes to the Budget Planner app:

1. **Replace Firebase with Supabase** — free Postgres backend, anonymous auth (no login screen), row-level security
2. **Live proportional debt reallocation** — remove Auto-Allocate button; edits to one debt instantly re-split the surplus across the rest
3. **Drag-to-reorder Expenses & Debts** — dnd-kit with snap animations; debt order becomes allocation priority
4. **Shift logging & calendar** — replace the static "Events for [date]" section with a real shift-log flow tied to the calendar and a debt payoff chart

---

## 2. Backend — Supabase

### 2.1 Auth

- **Anonymous auth only** — no email, no Google, no sign-in screen
- On first load, `supabase.auth.signInAnonymously()` creates a persistent anonymous session; Supabase stores the session token in localStorage automatically
- Subsequent loads restore the session via `supabase.auth.getSession()` — no re-auth needed
- PIN screen remains as the only local lock (unchanged)
- RLS policies use `auth.uid()` from the anonymous session — data is fully isolated per device/browser
- The Settings "Cloud Sync" card shows sync status (active / offline) only — no sign-in button needed
- On first session establishment, if `localStorage` has `budget_state_v4`, upload it to Supabase and set `localStorage.budget_migrated = "true"` to prevent repeat uploads

### 2.2 Database Schema

```sql
-- Budget state (replaces Firestore budgets collection)
create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  state jsonb not null,
  updated_at timestamptz default now()
);
alter table budgets enable row level security;
create policy "owner only" on budgets
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Individual shift records
create table shift_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  shift_date date not null,
  income_stream_id text not null,
  hours numeric(5,2) not null,
  hourly_rate numeric(8,2) not null,
  earnings numeric(10,2) generated always as (hours * hourly_rate) stored,
  notes text,
  created_at timestamptz default now()
);
alter table shift_logs enable row level security;
create policy "owner only" on shift_logs
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Weekly snapshots for debt payoff chart
create table weekly_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  week_starting date not null,
  net_income numeric(10,2),
  total_debt_balance numeric(10,2),
  total_paid_this_week numeric(10,2),
  snapshot jsonb,
  created_at timestamptz default now(),
  unique (user_id, week_starting)
);
alter table weekly_snapshots enable row level security;
create policy "owner only" on weekly_snapshots
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

### 2.3 Sync Strategy

- Budget state: write on every state change, debounced 800 ms (same as current Firebase logic)
- Realtime subscription replaces `onSnapshot` — updates state when another device writes
- Shift logs and snapshots: written immediately on user action (no debounce needed, low frequency)

### 2.4 Config

New file: `src/lib/supabase.ts` — exports `supabase` client initialised from env vars:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Firebase files removed: `src/firebase.ts`, `firebase-applet-config.json`, `firebase.json`, `firestore.rules`
Firebase packages removed from `package.json`: `firebase`

---

## 3. Allocation Rework

### 3.1 Remove Auto-Allocate Button

The explicit "Auto-Allocate" button in HomeTab is removed. There is no longer a concept of "locked" vs "unlocked" amounts at the debt level.

### 3.2 Live Proportional Rebalance

**Trigger:** user edits any single debt's `$/wk` field.

**Algorithm:**
```
weeklyPool = totalNetIncome - totalExpenses
lockedTotal = sum of all manually-edited debt $/wk values (including the one just changed)
remainingPool = weeklyPool - lockedTotal - totalSavingsContributions

For each unedited debt:
  share = debt.totalBalance / sum(unedited debts' balances)
  debt.amount = min(share * remainingPool, debt.totalBalance / 52)
```

- "Manually edited" is tracked per debt with `isManuallySet: boolean` on `BudgetElement`
- Editing any field marks that debt `isManuallySet = true`
- A new "Reset" icon (circular arrow, per debt row) clears `isManuallySet` and triggers a full rebalance across all debts
- `isManuallySet` is not persisted — clears on page load so fresh allocations are always proportional

### 3.3 Savings Goals

Savings goals are unaffected by this rework. They keep their existing contribution amounts and can still be edited directly.

---

## 4. Drag-to-Reorder

### 4.1 Library

`@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` — React drag-and-drop standard, no native HTML5 drag issues, works on touch/mobile.

### 4.2 Behaviour

- Both Expenses list and Debts list are independently sortable
- Drag handle (⠿ gripper icon) appears on hover/focus of each row — drag initiates from the handle only, not the whole row, so tapping amounts/names still works
- **Animation:** items use `CSS.Transform.toString(transform)` with `transition: transform 200ms ease` — smooth slide as items make room; on drop, spring snaps to final position using dnd-kit's `defaultDropAnimationSideEffects`
- Order is stored as the array order in `BudgetState.debts` / `BudgetState.expenses` — no separate order field needed
- Debt order = allocation priority (first debt in array is highest priority in the waterfall)

### 4.3 Persistence

Reordering triggers the normal state → localStorage → debounced Supabase write, same as any other state change.

---

## 5. Calendar & Shift Logging

### 5.1 Remove

- "Events for [date]" detail section under the calendar in HistoryTab is removed
- `CalendarEvent` type and all event add/edit/delete handlers are removed
- `calendarEvents` field removed from `BudgetState`

### 5.2 Log a Shift

New UI in HistoryTab — clicking a day on the calendar opens a **Log Shift** panel (not a modal):

Fields:
- Income stream (dropdown, pre-selects your first casual stream)
- Hours worked (number, required)
- Hourly rate (pre-fills from the income stream, editable)
- Notes (optional text)

On save: writes to `shift_logs` table. The day on the calendar gets a small indicator dot.

### 5.3 Weekly Auto-Snapshot

On every app load (after auth), if the previous Monday's snapshot doesn't exist in `weekly_snapshots`, create one using the current budget state. This is fire-and-forget — no UI.

### 5.4 Debt Payoff Chart

New chart in HistoryTab below the existing log table:
- X-axis: weeks (from earliest snapshot to today)
- Y-axis: total outstanding debt balance
- Line chart using the existing Recharts dependency
- Falls back gracefully to "Not enough data yet" when fewer than 2 snapshots exist

---

## 6. Migration Path

1. First sign-in: if `localStorage` has `budget_state_v4`, the app uploads it to Supabase `budgets` table and sets `localStorage.budget_migrated = "true"` — subsequent loads skip the upload
2. Users who never sign in (no Supabase account): app continues working with localStorage only — no data loss
3. `firebase-applet-config.json` is deleted; if the file is absent, no Firebase initialisation runs

---

## 7. Files Touched

| File | Change |
|------|--------|
| `src/lib/supabase.ts` | New — Supabase client |
| `src/App.tsx` | Replace Firebase auth with Supabase magic-link flow |
| `src/firebase.ts` | Deleted |
| `firebase-applet-config.json` | Deleted |
| `firebase.json` | Deleted |
| `firestore.rules` | Deleted |
| `src/components/Dashboard.tsx` | Replace Firestore sync with Supabase; remove Firebase props |
| `src/types.ts` | Add `isManuallySet` to BudgetElement; remove `calendarEvents`, `CalendarEvent` |
| `src/lib/allocation.ts` | New proportional algorithm, remove waterfall priority logic |
| `src/components/tabs/HomeTab.tsx` | Add dnd-kit to Expenses & Debts; remove Auto-Allocate button |
| `src/components/tabs/HistoryTab.tsx` | Remove calendar events; add Log Shift panel; add debt payoff chart |
| `src/components/tabs/SettingsTab.tsx` | Replace Google/magic-link card with sync status indicator only |
| `package.json` | Add `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@supabase/supabase-js`; remove `firebase` |
| `.env.local` | New — Supabase URL and anon key |

---

## 8. Out of Scope

- Google OAuth (requires Google Cloud Console setup — deferred)
- Push notifications for shift reminders
- Budgeting reports / PDF export
- Multiple income streams per shift log entry
