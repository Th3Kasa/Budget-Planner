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

export interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  amount: number;
  type: "income" | "expense";
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
  calendarEvents?: CalendarEvent[];
  windfalls?: Windfall[];
  centrelinkEnabled?: boolean; // undefined = true (legacy states)
  centrelinkMaxFortnightly?: number; // undefined = current JobSeeker single rate
}
