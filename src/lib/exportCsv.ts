import { BudgetState } from "../types";
import { calculateIncomeAmount, summarizeIncome } from "./income";

const esc = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Builds a flat CSV snapshot of the whole budget.
export function buildBudgetCsv(state: BudgetState): string {
  const summary = summarizeIncome(state);
  const rows: (string | number)[][] = [
    ["Section", "Name", "Detail", "Weekly Amount", "Balance / Target", "Saved / Original"],
  ];

  for (const inc of state.incomes) {
    rows.push([
      "Income",
      inc.name,
      inc.type === "casual"
        ? `$${inc.hourlyRate || 0}/hr${inc.isCash ? " (cash)" : ""}`
        : inc.type === "payslip"
          ? `payslip (tax $${(inc.taxWithheld || 0).toFixed(2)}, super $${(inc.superAmount || 0).toFixed(2)})`
          : `fixed${inc.isCash ? " (cash)" : ""}`,
      calculateIncomeAmount(inc).toFixed(2),
      "",
      "",
    ]);
  }
  for (const e of state.expenses) {
    rows.push(["Expense", e.name, e.category, e.amount.toFixed(2), "", ""]);
  }
  for (const d of state.debts) {
    rows.push([
      "Debt",
      d.name,
      d.isManuallySet ? "manually-set" : "auto",
      d.amount.toFixed(2),
      (d.totalBalance ?? 0).toFixed(2),
      (d.originalBalance ?? 0).toFixed(2),
    ]);
  }
  for (const s of state.savings) {
    rows.push([
      "Savings Goal",
      s.name,
      s.isLocked ? "locked" : "auto",
      s.weeklyContribution.toFixed(2),
      s.targetAmount.toFixed(2),
      (s.currentAmount || 0).toFixed(2),
    ]);
  }
  for (const w of state.windfalls || []) {
    rows.push([
      "Windfall",
      w.name,
      new Date(w.date).toLocaleDateString(),
      "",
      w.sourceAmount.toFixed(2),
      w.unallocatedCash.toFixed(2),
    ]);
  }
  rows.push([]);
  rows.push(["Summary", "Gross Weekly Income", "", summary.weeklyGrossIncome.toFixed(2), "", ""]);
  rows.push(["Summary", "Tax / Medicare / HECS", "", summary.totalDeductions.toFixed(2), "", ""]);
  rows.push(["Summary", "Centrelink (weekly)", "", summary.centrelinkWeekly.toFixed(2), "", ""]);
  rows.push(["Summary", "Total Net Income", "", summary.totalNetIncome.toFixed(2), "", ""]);
  rows.push(["Summary", "Cash Vault Balance", "", "", (state.cashBalance || 0).toFixed(2), ""]);

  return rows.map((r) => r.map(esc).join(",")).join("\n");
}

export function downloadBudgetCsv(state: BudgetState) {
  const csv = buildBudgetCsv(state);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `budget-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
