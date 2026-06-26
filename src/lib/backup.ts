import { BudgetState } from "../types";

// Full-fidelity JSON backup of the whole budget. Unlike the CSV export (which
// is a flat, lossy spreadsheet view), this round-trips every field — ids,
// colours, priority tiers, locks, windfalls — so it can be restored exactly.
const BACKUP_VERSION = 1;

export function downloadBackup(state: BudgetState) {
  const payload = {
    app: "budget-planner",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `budget-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Validate and extract a BudgetState from a backup file's text. Accepts either
// our wrapper ({ app, version, state }) or a raw BudgetState. Returns null when
// the file isn't a recognisable budget backup.
export function parseBackup(text: string): BudgetState | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const obj = data as Record<string, unknown>;
  const candidate =
    obj && typeof obj.state === "object" && obj.state !== null
      ? (obj.state as Record<string, unknown>)
      : obj;
  if (!candidate || typeof candidate !== "object") return null;
  // A budget must carry these four array fields to be valid.
  const ok =
    Array.isArray(candidate.incomes) &&
    Array.isArray(candidate.expenses) &&
    Array.isArray(candidate.debts) &&
    Array.isArray(candidate.savings);
  return ok ? (candidate as unknown as BudgetState) : null;
}
