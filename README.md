# Budget Planner

A weekly budget planner for casual workers in Australia. Tracks hourly/shift-based
income, estimates tax (2024-25 brackets), Medicare levy, HECS repayments and the
Centrelink income test, then auto-allocates your surplus across debts and savings
goals by priority. Syncs across devices via Firebase.

## Features

- **Multiple income streams** — casual (hourly or detailed Mon-Sun shifts with
  overtime and allowances), fixed weekly, and untaxed cash income
- **Australian deductions** — financial-year-aware (auto-switches each 1 July):
  - Income tax: 2025-26 rates, plus the legislated 16% → 15% bracket cut from
    1 July 2026
  - Medicare levy: 2% with the single low-income threshold ($27,222) and
    10c/$ phase-in
  - HECS/HELP: the new (2025-26+) marginal repayment system — 15c/$ above
    $67,000 (+17c/$ above $125,000, capped at 10% of income), with CPI-indexed
    2026-27 thresholds ($69,528 / $129,717)
  - Super guarantee 12% (final legislated rate, from 1 July 2025)
  - Optional Centrelink JobSeeker top-up using the income test ($150/fn free
    area, 50c/60c tapers) with an adjustable maximum rate ($808.70/fn single,
    20 March 2026 indexation)
- **Auto-allocation engine** — distributes weekly surplus down a priority
  waterfall (car loan → BNPL → family debts → other debts → 90/10
  business/emergency split → remaining goals). Manually edited amounts are
  locked and respected.
- **Cash Vault & windfalls** — record one-off cash inflows (asset sales, tax
  returns); they're distributed down the same priority list against actual
  balances, with full undo
- **Savings goals** with progress tracking and vault transfers
- **Calendar** for one-off income/expense events
- **CSV export** and reset from Settings
- **Cloud sync** via Google sign-in + Firestore, with a local PIN screen lock

## Project Structure

```
src/
  lib/
    calculators.ts   Tax, Medicare, HECS, Centrelink, super formulas
    income.ts        Income stream maths + weekly income summary
    allocation.ts    Priority waterfall (weekly allocation + windfalls)
    exportCsv.ts     CSV snapshot export
  components/
    Dashboard.tsx    State container, persistence, navigation
    AddItemModal.tsx Add/edit form for incomes, expenses, debts, goals
    tabs/            HomeTab, HistoryTab, GoalsTab, SettingsTab
    Login.tsx        PIN / biometric screen lock
  types.ts           Shared data model
```

## Run Locally

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev       # start dev server on http://localhost:3000
npm run lint      # type-check
npm run build     # production build
```

Firebase configuration lives in `firebase-applet-config.json`; Firestore
security rules are in `firestore.rules` (per-user access only).

> **Note:** tax, HECS and Centrelink figures are simplified estimates for
> personal planning — not financial advice.
