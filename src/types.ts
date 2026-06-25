export interface BudgetElement {
  id: string;
  name: string;
  amount: number;
  frequency?: "weekly" | "monthly"; // expenses only; undefined = weekly
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
  splitWeight?: number;         // Relative allocation weight; undefined = equal (treated as 1)
  isManuallyWeighted?: boolean; // true when user has set a custom split weight
  priorityTier?: 1 | 2 | 3;    // 1=top (70% of pool), 2=secondary (100% after tier1 done), 3=general (equal split, default)
  deadline?: string;           // optional "yyyy-MM-dd" target date — drives the required-contribution hint and on-track badge
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
  type: "casual" | "fixed" | "payslip";
  hourlyRate?: number;
  hoursWorked?: number;
  amount?: number;
  isCash?: boolean;
  shifts?: Shift[];
  useShifts?: boolean;
  // Payslip actuals (type === "payslip"): figures taken straight off the slip,
  // so tax and super are known and never estimated.
  grossPay?: number;
  taxWithheld?: number;
  superAmount?: number;
  weekStarting?: string; // "yyyy-MM-dd" Monday — payslips count only for their own week
  // Captured when a payslip PDF is parsed (all ISO yyyy-MM-dd).
  paymentDate?: string;
  payPeriodStart?: string;
  payPeriodEnd?: string;
}

// Row shape of the Supabase `shift_logs` table.
export interface ShiftLog {
  id: string;
  user_id: string;
  shift_date: string; // "yyyy-MM-dd"
  income_stream_id: string;
  income_stream_name: string;
  hours: number;
  hourly_rate: number;
  notes?: string | null;
  created_at: string;
}

// Row shape of the Supabase `weekly_snapshots` table.
export interface WeeklySnapshot {
  id: string;
  user_id: string;
  week_starting: string; // "yyyy-MM-dd"
  net_income: number;
  total_debt_balance: number;
  total_paid_this_week: number;
  created_at: string;
}

// A weekly net-worth checkpoint (savings + cash vault − debt). Stored inside
// the synced budget blob, so it needs no extra table — it rides along with the
// existing cloud sync and localStorage persistence.
export interface NetWorthPoint {
  week: string; // "yyyy-MM-dd" Monday
  savings: number;
  vault: number;
  debt: number;
  netWorth: number;
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

// Row shape of the Supabase `payslips` table.
export interface PayslipRecord {
  id: string;
  user_id: string;
  week_starting: string; // "yyyy-MM-dd"
  employer?: string | null;
  payment_date?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  gross_pay?: number | null;
  tax_withheld?: number | null;
  super_amount?: number | null;
  net_pay?: number | null;
  file_name: string;
  storage_path?: string | null;
  created_at: string;
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
  netWorthHistory?: NetWorthPoint[]; // weekly net-worth checkpoints for the trend chart
  centrelinkEnabled?: boolean; // undefined = true (legacy states)
  centrelinkMaxFortnightly?: number; // undefined = current JobSeeker single rate
  // How the weekly surplus is split across debts:
  //   "snowball"  → minimums on every debt, all extra to the smallest balance
  //                 first, rolling into the next as each one clears (default).
  //   "balanced"  → auto debts share the pool proportionally by balance, and
  //                 leftover surplus flows on to savings goals.
  debtStrategy?: "snowball" | "balanced"; // undefined = "snowball"
}
