import React from "react";
import { BudgetState } from "../types";
import { IncomeSummary, calculateIncomeAmount } from "../lib/income";

const WEEKS_PER_MONTH = 52 / 12;

const money = (v: number) =>
  v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

interface PrintSummaryProps {
  state: BudgetState;
  summary: IncomeSummary;
  totalExpenses: number;
  totalDebts: number;
  totalSavingsCont: number;
  weeklySurplus: number;
}

// A clean, print-only budget snapshot. Hidden on screen (see index.css); shown
// only when printing / saving to PDF. Kept deliberately plain — black text on
// white, simple tables — so it reproduces well on paper.
export default function PrintSummary({
  state,
  summary,
  totalExpenses,
  totalDebts,
  totalSavingsCont,
  weeklySurplus,
}: PrintSummaryProps) {
  // Expenses grouped by category, each normalised to a weekly figure.
  const categoryMap = new Map<string, number>();
  for (const e of state.expenses) {
    const weekly = e.frequency === "monthly" ? e.amount / WEEKS_PER_MONTH : e.amount;
    const key = e.category || "General";
    categoryMap.set(key, (categoryMap.get(key) || 0) + weekly);
  }
  const categories = [...categoryMap.entries()].sort((a, b) => b[1] - a[1]);

  const totalDebtBalance = state.debts.reduce(
    (acc, d) => acc + (d.totalBalance || 0),
    0,
  );
  const totalSaved = state.savings.reduce(
    (acc, s) => acc + (s.currentAmount || 0),
    0,
  );
  const printedOn = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const row = (label: string, weekly: number) => (
    <tr>
      <td className="ps-label">{label}</td>
      <td className="ps-num">${money(weekly)}</td>
      <td className="ps-num">${money(weekly * WEEKS_PER_MONTH)}</td>
      <td className="ps-num">${money(weekly * 52)}</td>
    </tr>
  );

  return (
    <div id="print-summary">
      <header className="ps-head">
        <h1>Budget Summary</h1>
        <p>{printedOn}</p>
      </header>

      <section>
        <h2>Weekly Overview</h2>
        <table className="ps-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="ps-num">Weekly</th>
              <th className="ps-num">Monthly</th>
              <th className="ps-num">Yearly</th>
            </tr>
          </thead>
          <tbody>
            {row("Total net income", summary.totalNetIncome)}
            {row("Expenses", totalExpenses)}
            {row("Debt repayments", totalDebts)}
            {row("Savings contributions", totalSavingsCont)}
            <tr className="ps-total">
              <td className="ps-label">Surplus / Deficit</td>
              <td className="ps-num">${money(weeklySurplus)}</td>
              <td className="ps-num">${money(weeklySurplus * WEEKS_PER_MONTH)}</td>
              <td className="ps-num">${money(weeklySurplus * 52)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Income Streams</h2>
        <table className="ps-table">
          <tbody>
            {state.incomes.map((inc) => (
              <tr key={inc.id}>
                <td className="ps-label">
                  {inc.name}
                  {inc.isCash ? " (cash)" : ""}
                </td>
                <td className="ps-num">${money(calculateIncomeAmount(inc))}/wk</td>
              </tr>
            ))}
            {state.incomes.length === 0 && (
              <tr>
                <td className="ps-label">No income streams</td>
                <td className="ps-num">—</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Spending by Category</h2>
        <table className="ps-table">
          <tbody>
            {categories.map(([cat, weekly]) => (
              <tr key={cat}>
                <td className="ps-label">{cat}</td>
                <td className="ps-num">${money(weekly)}/wk</td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td className="ps-label">No expenses</td>
                <td className="ps-num">—</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Debts</h2>
        <table className="ps-table">
          <thead>
            <tr>
              <th>Debt</th>
              <th className="ps-num">Balance</th>
              <th className="ps-num">Weekly repayment</th>
            </tr>
          </thead>
          <tbody>
            {state.debts.map((d) => (
              <tr key={d.id}>
                <td className="ps-label">{d.name}</td>
                <td className="ps-num">${money(d.totalBalance || 0)}</td>
                <td className="ps-num">${money(d.amount)}</td>
              </tr>
            ))}
            {state.debts.length === 0 && (
              <tr>
                <td className="ps-label">Debt-free 🎉</td>
                <td className="ps-num">—</td>
                <td className="ps-num">—</td>
              </tr>
            )}
            {state.debts.length > 0 && (
              <tr className="ps-total">
                <td className="ps-label">Total owing</td>
                <td className="ps-num">${money(totalDebtBalance)}</td>
                <td className="ps-num">${money(totalDebts)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Savings Goals</h2>
        <table className="ps-table">
          <thead>
            <tr>
              <th>Goal</th>
              <th className="ps-num">Saved</th>
              <th className="ps-num">Target</th>
              <th className="ps-num">Weekly</th>
            </tr>
          </thead>
          <tbody>
            {state.savings.map((s) => (
              <tr key={s.id}>
                <td className="ps-label">{s.name}</td>
                <td className="ps-num">${money(s.currentAmount || 0)}</td>
                <td className="ps-num">${money(s.targetAmount || 0)}</td>
                <td className="ps-num">${money(s.weeklyContribution || 0)}</td>
              </tr>
            ))}
            {state.savings.length === 0 && (
              <tr>
                <td className="ps-label">No savings goals</td>
                <td className="ps-num">—</td>
                <td className="ps-num">—</td>
                <td className="ps-num">—</td>
              </tr>
            )}
            {state.savings.length > 0 && (
              <tr className="ps-total">
                <td className="ps-label">Total saved</td>
                <td className="ps-num">${money(totalSaved)}</td>
                <td className="ps-num"></td>
                <td className="ps-num">${money(totalSavingsCont)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <footer className="ps-foot">
        Generated by Budget Planner · figures are weekly unless noted.
      </footer>
    </div>
  );
}
