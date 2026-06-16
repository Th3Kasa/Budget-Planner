import React, { useEffect, useState } from "react";
import {
  Home,
  LogOut,
  PieChart,
  Settings,
  Target,
  Wallet,
} from "lucide-react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { addDays, format, startOfWeek } from "date-fns";
import { cn } from "../lib/utils";
import { isIncomeActive, summarizeIncome } from "../lib/income";
import { DEFAULT_JOBSEEKER_MAX_FORTNIGHTLY } from "../lib/calculators";
import {
  calculateAutoAllocation,
  distributeWindfall,
  undoWindfall,
} from "../lib/allocation";
import { downloadBudgetCsv } from "../lib/exportCsv";
import {
  BudgetElement,
  BudgetState,
  IncomeStream,
  SavingsGoal,
} from "../types";
import { payslipFileName } from "../lib/payslip/parsePayslip";
import AddItemModal, {
  emptyItemFields,
  ItemType,
  NewItemFields,
} from "./AddItemModal";
import HomeTab from "./tabs/HomeTab";
import HistoryTab from "./tabs/HistoryTab";
import GoalsTab from "./tabs/GoalsTab";
import SettingsTab from "./tabs/SettingsTab";

interface DashboardProps {
  session: Session | null;
  onLogout?: () => void;
}

const INITIAL_STATE: BudgetState = {
  incomes: [
    {
      id: "job-1",
      name: "Casual Income",
      type: "casual",
      hourlyRate: 35,
      hoursWorked: 25,
    },
  ],
  expenses: [
    { id: "nib", name: "NIB Health", amount: 13.0, category: "Health", color: "#10b981", icon: "receipt" },
    { id: "gym", name: "Global Gym", amount: 15.45, category: "Health", color: "#8b5cf6", icon: "receipt" },
    { id: "telecom", name: "More Telecom", amount: 28.0, category: "Phone/Internet", color: "#3b82f6", icon: "smartphone" },
    { id: "subs", name: "Netflix & YouTube", amount: 12.45, category: "Entertainment", color: "#ec4899", icon: "smartphone" },
    { id: "rideshare", name: "Uber & DiDi", amount: 60.0, category: "Transport", color: "#f59e0b", icon: "car" },
    { id: "eating-out", name: "Dining & Cafes", amount: 120.0, category: "Food/Dining", color: "#ef4444", icon: "utensils" },
    { id: "groceries", name: "Coles & Woolies", amount: 60.0, category: "Food/Dining", color: "#10b981", icon: "receipt" },
  ],
  debts: [
    { id: "personal-loan", name: "Car Loan (CBA)", amount: 132, totalBalance: 13160.66, originalBalance: 15000, category: "Debt", color: "#ef4444", icon: "credit-card" },
    { id: "bnpl", name: "ZipPay & Afterpay", amount: 45.0, totalBalance: 500, originalBalance: 1000, category: "Debt", color: "#f59e0b", icon: "credit-card" },
  ],
  savings: [
    { id: "business", name: "Start a Business", targetAmount: 10000, currentAmount: 0, weeklyContribution: 100, color: "#3b82f6" },
    { id: "house", name: "House Deposit", targetAmount: 200000, currentAmount: 0, weeklyContribution: 50, color: "#ec4899" },
    { id: "emergency", name: "Emergency Fund", targetAmount: 5000, currentAmount: 0, weeklyContribution: 50, color: "#10b981" },
  ],
};

const GOAL_COLORS = ["#3b82f6", "#ec4899", "#10b981", "#f59e0b", "#8b5cf6"];

function loadInitialState(): BudgetState {
  const saved = localStorage.getItem("budget_state_v4");
  if (!saved) return INITIAL_STATE;
  try {
    const parsed = JSON.parse(saved);
    if (!parsed.incomes) {
      parsed.incomes = [
        {
          id: "job-legacy",
          name: "Casual Job",
          type: "casual",
          hourlyRate: parsed.hourlyRate || 35,
          hoursWorked: parsed.hoursWorked || 25,
        },
      ];
    }
    if (parsed.debts) {
      parsed.debts = parsed.debts.map((d: BudgetElement) => ({
        ...d,
        originalBalance: d.originalBalance || d.totalBalance || d.amount * 52,
      }));
    }
    return parsed;
  } catch {
    return INITIAL_STATE;
  }
}

type TabKey = "home" | "history" | "goals" | "settings";

const NAV_ITEMS: { tab: TabKey; icon: React.ElementType }[] = [
  { tab: "home", icon: Home },
  { tab: "history", icon: PieChart },
  { tab: "goals", icon: Target },
  { tab: "settings", icon: Settings },
];

function NavButton({
  tab,
  icon: Icon,
  size,
  activeTab,
  onSelect,
  label,
}: {
  tab: TabKey;
  icon: React.ElementType;
  size: "sm" | "lg";
  activeTab: TabKey;
  onSelect: (tab: TabKey) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => onSelect(tab)}
      className={cn(
        "rounded-xl transition-colors",
        size === "sm" ? "p-2" : "p-3",
        activeTab === tab
          ? "bg-indigo-100 text-indigo-600"
          : "text-gray-400 hover:text-indigo-500 hover:bg-white/50",
      )}
      aria-label={label}
    >
      <Icon className={size === "sm" ? "w-5 h-5" : "w-6 h-6"} />
    </button>
  );
}

const TAB_COPY = {
  home: {
    title: "Weekly Budget Planner",
    subtitle: "Track your casual income, Centrelink, and savings goals.",
  },
  history: {
    title: "Weekly, Monthly, Yearly Log",
    subtitle: "Track your progress on a weekly, monthly, and yearly basis.",
  },
  goals: {
    title: "Savings Goals Tracker",
    subtitle: "Monitor and manage your financial milestones.",
  },
  settings: {
    title: "App Settings",
    subtitle: "Customize your app experience.",
  },
};

export default function Dashboard({ session, onLogout }: DashboardProps) {
  const [state, setState] = useState<BudgetState>(loadInitialState);
  const [activeTab, setActiveTab] =
    useState<keyof typeof TAB_COPY>("home");

  // Add/Edit modal
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItemType, setNewItemType] = useState<ItemType>("expense");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [modalInitialFields, setModalInitialFields] = useState<NewItemFields>(
    emptyItemFields(),
  );

  // Cloud writes are held until the initial cloud load finishes, so a
  // freshly opened tab can never overwrite newer cloud data with stale
  // local state.
  const [cloudReady, setCloudReady] = useState(false);
  const [payslipRefreshKey, setPayslipRefreshKey] = useState(0);

  // Live cloud-sync status, surfaced in Settings so failed writes aren't silent.
  const [syncStatus, setSyncStatus] = useState<
    "offline" | "syncing" | "synced" | "error"
  >("offline");

  // Persist locally immediately; debounce cloud writes so inline edits
  // don't fire a Supabase write per keystroke.
  useEffect(() => {
    localStorage.setItem("budget_state_v4", JSON.stringify(state));
    if (!session?.user || !cloudReady) {
      setSyncStatus("offline");
      return;
    }
    setSyncStatus("syncing");
    const timeout = setTimeout(() => {
      supabase
        .from("budgets")
        .upsert(
          {
            user_id: session.user.id,
            state,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        )
        .then(({ error }) => {
          if (error) {
            console.error("Cloud sync failed:", error.message);
            setSyncStatus("error");
          } else {
            setSyncStatus("synced");
          }
        });
    }, 800);
    return () => clearTimeout(timeout);
  }, [state, session, cloudReady]);

  // On first session: pull cloud state (or migrate local data up once).
  // Then subscribe to realtime updates from other devices.
  useEffect(() => {
    if (!session?.user) return;
    const userId = session.user.id;

    const load = async () => {
      const { data, error } = await supabase
        .from("budgets")
        .select("state")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) {
        // Leave cloudReady false: don't risk overwriting cloud data we
        // couldn't read. Local-only mode still works.
        console.error("Cloud load failed:", error.message);
        return;
      }
      if (data?.state) {
        setState((prev) =>
          JSON.stringify(prev) !== JSON.stringify(data.state)
            ? (data.state as BudgetState)
            : prev,
        );
      }
      // No cloud row yet: the debounced write effect above will create it
      // from the current local state once cloudReady is set.
      setCloudReady(true);
    };
    load();

    let channel = supabase
      .channel("budgets-sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "budgets",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const incoming = (payload.new as { state?: BudgetState })?.state;
          if (!incoming) return;
          setState((prev) =>
            JSON.stringify(prev) !== JSON.stringify(incoming) ? incoming : prev,
          );
        },
      )
      .subscribe();

    // On mobile, browsers suspend WebSockets when the tab goes to the
    // background. Reconnect + pull fresh state when the user returns.
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      supabase.removeChannel(channel);
      channel = supabase
        .channel("budgets-sync-" + Date.now())
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "budgets",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const incoming = (payload.new as { state?: BudgetState })?.state;
            if (!incoming) return;
            setState((prev) =>
              JSON.stringify(prev) !== JSON.stringify(incoming) ? incoming : prev,
            );
          },
        )
        .subscribe();
      // Also re-fetch latest cloud state to catch writes made on other devices.
      supabase
        .from("budgets")
        .select("state")
        .eq("user_id", userId)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.state) {
            setState((prev) =>
              JSON.stringify(prev) !== JSON.stringify(data.state)
                ? (data.state as BudgetState)
                : prev,
            );
          }
        });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [session]);

  const summary = summarizeIncome(state);

  // Keep this week's snapshot (Monday-based) in step with the latest figures
  // for the debt-payoff chart. Debounced and upserting (rather than
  // ignore-duplicates) so the week's data point reflects the current state,
  // not whatever happened to exist the first time the app loaded that week.
  const snapshotDebtBalance = state.debts.reduce(
    (acc, d) => acc + (d.totalBalance ?? 0),
    0,
  );
  const snapshotPaid = state.debts.reduce((acc, d) => acc + d.amount, 0);
  useEffect(() => {
    if (!session?.user || !cloudReady) return;
    const userId = session.user.id;
    const weekStart = format(
      startOfWeek(new Date(), { weekStartsOn: 1 }),
      "yyyy-MM-dd",
    );
    const timeout = setTimeout(() => {
      supabase
        .from("weekly_snapshots")
        .upsert(
          {
            user_id: userId,
            week_starting: weekStart,
            net_income: summary.totalNetIncome,
            total_debt_balance: snapshotDebtBalance,
            total_paid_this_week: snapshotPaid,
          },
          { onConflict: "user_id,week_starting" },
        )
        .then(({ error }) => {
          if (error) console.error("Snapshot write failed:", error.message);
        });
    }, 1000);
    return () => clearTimeout(timeout);
  }, [
    session,
    cloudReady,
    summary.totalNetIncome,
    snapshotDebtBalance,
    snapshotPaid,
  ]);

  const totalExpenses = state.expenses.reduce(
    (acc, el) =>
      acc + (el.frequency === "monthly" ? el.amount / (52 / 12) : el.amount),
    0,
  );
  const totalDebts = state.debts.reduce((acc, el) => acc + el.amount, 0);
  const totalSavingsCont = state.savings.reduce(
    (acc, el) => acc + el.weeklyContribution,
    0,
  );
  const totalOutgoings = totalExpenses + totalDebts + totalSavingsCont;
  const weeklySurplus = summary.totalNetIncome - totalOutgoings;

  // ----- Modal handlers -----

  const openAddModal = (type: ItemType) => {
    setNewItemType(type);
    setEditingItemId(null);
    setModalInitialFields(emptyItemFields());
    setIsAddingItem(true);
  };

  const openEditModal = (
    type: ItemType,
    item: BudgetElement | SavingsGoal | IncomeStream,
  ) => {
    const anyItem = item as any;
    setNewItemType(type);
    setEditingItemId(anyItem.id);
    setModalInitialFields({
      ...emptyItemFields(),
      name: anyItem.name || "",
      amount: String(
        type === "savings"
          ? anyItem.weeklyContribution ?? ""
          : // Auto-balanced debts show a blank repayment so editing them
            // (e.g. the name) doesn't accidentally pin the computed amount.
            type === "debt" && !anyItem.isManuallySet
            ? ""
            : anyItem.amount ?? "",
      ),
      frequency: anyItem.frequency || "weekly",
      targetAmount: String(anyItem.targetAmount || ""),
      currentAmount: String(anyItem.currentAmount || ""),
      totalBalance: String(anyItem.originalBalance || anyItem.totalBalance || ""),
      category: anyItem.category || "General",
      priorityTier: String(anyItem.priorityTier ?? 3),
      type: anyItem.type || "casual",
      isCash: anyItem.isCash || false,
      hourlyRate: String(anyItem.hourlyRate || ""),
      hoursWorked: String(anyItem.hoursWorked || ""),
      grossPay: String(anyItem.grossPay || ""),
      taxWithheld: String(anyItem.taxWithheld || ""),
      superAmount: String(anyItem.superAmount || ""),
      paymentDate: anyItem.paymentDate || "",
      payPeriodStart: anyItem.payPeriodStart || "",
      payPeriodEnd: anyItem.payPeriodEnd || "",
      useShifts: anyItem.useShifts || false,
      shifts: anyItem.shifts
        ? anyItem.shifts.map((s: any) => ({
            day: s.day,
            hours: String(s.hours || ""),
            travelAllowance: String(s.travelAllowance || ""),
            mealAllowance: String(s.mealAllowance || ""),
            overtimeHours: String(s.overtimeHours || ""),
            overtimeRate: String(s.overtimeRate || ""),
          }))
        : emptyItemFields().shifts,
    });
    setIsAddingItem(true);
  };

  const closeModal = () => {
    setIsAddingItem(false);
    setEditingItemId(null);
  };

  const handleSubmitItem = (fields: NewItemFields) => {
    if (newItemType === "expense" || newItemType === "debt") {
      const isDebt = newItemType === "debt";
      const collectionName = isDebt ? "debts" : "expenses";
      // A debt with ANY repayment entered is "pinned" (manual) — including an
      // explicit 0, which pauses it (gets nothing). Left blank, it's
      // auto-balanced by the allocation engine like the other auto debts.
      const debtPinned = isDebt && fields.amount.trim() !== "";
      const itemToSave: BudgetElement = {
        id: editingItemId || Date.now().toString(),
        name: fields.name,
        amount: Number(fields.amount),
        frequency: !isDebt ? (fields.frequency || "weekly") : undefined,
        totalBalance:
          isDebt && fields.totalBalance ? Number(fields.totalBalance) : undefined,
        originalBalance:
          isDebt && fields.totalBalance ? Number(fields.totalBalance) : undefined,
        category: isDebt ? "Debt" : fields.category,
        color: isDebt ? "#ef4444" : "#f59e0b",
        icon: isDebt ? "credit-card" : "receipt",
      };

      setState((prev) => {
        const nextState = {
          ...prev,
          [collectionName]: editingItemId
            ? prev[collectionName].map((item) =>
                item.id === editingItemId
                  ? isDebt
                    ? { ...itemToSave, color: item.color, icon: item.icon, isManuallySet: debtPinned }
                    : { ...itemToSave, color: item.color, icon: item.icon }
                  : item,
              )
            : isDebt
              ? [...prev[collectionName], { ...itemToSave, isManuallySet: debtPinned }]
              : [...prev[collectionName], itemToSave],
        };
        return calculateAutoAllocation(nextState);
      });
    } else if (newItemType === "savings") {
      const tier = (Number(fields.priorityTier) || 3) as 1 | 2 | 3;
      // Only lock the goal if the user explicitly set a weekly contribution.
      // Leaving it blank lets the engine auto-allocate based on tiers/weights.
      const manualContribution = Number(fields.amount) || 0;
      const lockGoal = manualContribution > 0;
      setState((prev) => {
        if (editingItemId) {
          const nextState = {
            ...prev,
            savings: prev.savings.map((item) =>
              item.id === editingItemId
                ? {
                    ...item,
                    name: fields.name,
                    targetAmount: Number(fields.targetAmount) || 0,
                    currentAmount: Number(fields.currentAmount) || 0,
                    ...(lockGoal
                      ? { weeklyContribution: manualContribution, isLocked: true }
                      : { isLocked: false }),
                    priorityTier: tier,
                  }
                : item,
            ),
          };
          return calculateAutoAllocation(nextState);
        }
        const newGoal: SavingsGoal = {
          id: Date.now().toString(),
          name: fields.name,
          targetAmount: Number(fields.targetAmount) || 0,
          currentAmount: Number(fields.currentAmount) || 0,
          weeklyContribution: manualContribution,
          color: GOAL_COLORS[prev.savings.length % GOAL_COLORS.length],
          isLocked: lockGoal,
          priorityTier: tier,
        };
        return calculateAutoAllocation({
          ...prev,
          savings: [...prev.savings, newGoal],
        });
      });
    } else if (newItemType === "income") {
      const isPayslip = fields.type === "payslip";
      const itemToSave: IncomeStream = {
        id: editingItemId || Date.now().toString(),
        name: fields.name,
        type: fields.type as "casual" | "fixed" | "payslip",
        amount: fields.type === "fixed" ? Number(fields.amount) : undefined,
        hourlyRate:
          fields.type === "casual"
            ? Number(fields.hourlyRate || fields.amount)
            : undefined,
        hoursWorked:
          fields.type === "casual" ? Number(fields.hoursWorked || 20) : undefined,
        // Payslip actuals — tax/super are known, not estimated. Logged against
        // the current week so it only counts toward this week's budget.
        grossPay: isPayslip ? Number(fields.grossPay) || 0 : undefined,
        taxWithheld: isPayslip ? Number(fields.taxWithheld) || 0 : undefined,
        superAmount: isPayslip ? Number(fields.superAmount) || 0 : undefined,
        weekStarting: isPayslip
          ? format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd")
          : undefined,
        paymentDate: isPayslip ? fields.paymentDate || undefined : undefined,
        payPeriodStart: isPayslip ? fields.payPeriodStart || undefined : undefined,
        payPeriodEnd: isPayslip ? fields.payPeriodEnd || undefined : undefined,
        isCash: isPayslip ? false : fields.isCash,
        useShifts: fields.useShifts,
        shifts:
          fields.useShifts && !isPayslip
            ? fields.shifts.map((s) => ({
                day: s.day,
                hours: Number(s.hours) || 0,
                travelAllowance: Number(s.travelAllowance) || 0,
                mealAllowance: Number(s.mealAllowance) || 0,
                overtimeHours: Number(s.overtimeHours) || 0,
                overtimeRate: Number(s.overtimeRate) || 0,
              }))
            : undefined,
      };

      setState((prev) =>
        calculateAutoAllocation({
          ...prev,
          incomes: editingItemId
            ? prev.incomes.map((item) =>
                item.id === editingItemId ? { ...item, ...itemToSave } : item,
              )
            : [...prev.incomes, itemToSave],
        }),
      );
    }

    closeModal();
  };

  // ----- Item handlers -----

  const updateIncome = (id: string, patch: Partial<IncomeStream>) => {
    setState((prev) => ({
      ...prev,
      incomes: prev.incomes.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
  };

  const removeIncome = (id: string) => {
    setState((prev) =>
      calculateAutoAllocation({
        ...prev,
        incomes: prev.incomes.filter((item) => item.id !== id),
      }),
    );
  };

  const removeItem = (type: "expenses" | "debts" | "savings", id: string) => {
    setState((prev) =>
      calculateAutoAllocation({
        ...prev,
        [type]: prev[type].filter((item: { id: string }) => item.id !== id),
      }),
    );
  };

  const payDebt = (id: string) => {
    setState((prev) => ({
      ...prev,
      debts: prev.debts.map((d) =>
        d.id === id && d.totalBalance !== undefined
          ? { ...d, totalBalance: Math.max(0, d.totalBalance - d.amount) }
          : d,
      ),
    }));
  };

  // Apply every debt's weekly repayment at once, then re-run allocation so a
  // debt that just cleared hands its budget to the next one automatically.
  const payAllDebts = () => {
    setState((prev) =>
      calculateAutoAllocation({
        ...prev,
        debts: prev.debts.map((d) =>
          d.totalBalance !== undefined
            ? { ...d, totalBalance: Math.max(0, d.totalBalance - d.amount) }
            : d,
        ),
      }),
    );
  };

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

  const updateDebtAmount = (id: string, amount: number) => {
    setState((prev) =>
      calculateAutoAllocation({
        ...prev,
        debts: prev.debts.map((d) =>
          d.id === id ? { ...d, amount: Math.max(0, amount), isManuallySet: true } : d,
        ),
      }),
    );
  };

  const setDebtStrategy = (strategy: "snowball" | "balanced") => {
    setState((prev) =>
      calculateAutoAllocation({ ...prev, debtStrategy: strategy }),
    );
  };

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

  // ----- Vault / windfalls -----

  const handleRecordWindfall = (
    name: string,
    amount: number,
    debtPriorities?: { debtId: string; amount: number }[],
  ) => {
    setState((prev) => distributeWindfall(prev, name, amount, debtPriorities));
  };

  const handleUndoWindfall = (id: string) => {
    setState((prev) => undoWindfall(prev, id));
  };

  const handleAdjustVault = (newBalance: number) => {
    setState((prev) => ({ ...prev, cashBalance: Math.max(0, newBalance) }));
  };

  const updateSavingsWeight = (id: string, weight: number) => {
    setState((prev) =>
      calculateAutoAllocation({
        ...prev,
        savings: prev.savings.map((s) =>
          s.id === id
            ? { ...s, splitWeight: Math.max(0.1, weight), isManuallyWeighted: true }
            : s,
        ),
      }),
    );
  };

  const resetSavingsWeight = (id: string) => {
    setState((prev) =>
      calculateAutoAllocation({
        ...prev,
        savings: prev.savings.map((s) =>
          s.id === id ? { ...s, splitWeight: undefined, isManuallyWeighted: false } : s,
        ),
      }),
    );
  };

  const recalculateAllSavings = () => {
    setState((prev) =>
      calculateAutoAllocation({
        ...prev,
        savings: prev.savings.map((s) => ({ ...s, isLocked: false })),
      }),
    );
  };

  const lockSavingsGoal = (id: string, amount: number) => {
    setState((prev) =>
      calculateAutoAllocation({
        ...prev,
        savings: prev.savings.map((s) =>
          s.id === id
            ? { ...s, weeklyContribution: Math.max(0, amount), isLocked: true }
            : s,
        ),
      }),
    );
  };

  const unlockSavingsGoal = (id: string) => {
    setState((prev) =>
      calculateAutoAllocation({
        ...prev,
        savings: prev.savings.map((s) =>
          s.id === id ? { ...s, isLocked: false } : s,
        ),
      }),
    );
  };

  const paySavingsGoal = (id: string) => {
    setState((prev) => ({
      ...prev,
      savings: prev.savings.map((s) =>
        s.id === id
          ? {
              ...s,
              currentAmount: Math.min(
                s.targetAmount || Infinity,
                (s.currentAmount || 0) + (s.weeklyContribution || 0),
              ),
            }
          : s,
      ),
    }));
  };

  // Apply every goal's weekly contribution at once (mirrors payAllDebts).
  const payAllSavings = () => {
    setState((prev) => ({
      ...prev,
      savings: prev.savings.map((s) => ({
        ...s,
        currentAmount: Math.min(
          s.targetAmount || Infinity,
          (s.currentAmount || 0) + (s.weeklyContribution || 0),
        ),
      })),
    }));
  };

  // Maps a shift's day name to its offset from Monday (weekStartsOn: 1).
  const DAY_OFFSET: Record<string, number> = {
    Monday: 0,
    Tuesday: 1,
    Wednesday: 2,
    Thursday: 3,
    Friday: 4,
    Saturday: 5,
    Sunday: 6,
  };

  const handleCommitWeek = async (): Promise<void> => {
    if (!session?.user) return;
    const userId = session.user.id;
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const weekStart = format(monday, "yyyy-MM-dd");
    const weekEnd = format(addDays(monday, 6), "yyyy-MM-dd");
    // Pay day is Thursday — weekly totals and payslips land here as one marker.
    const payDay = format(addDays(monday, 3), "yyyy-MM-dd");

    // Commit is idempotent: clear this week's auto-committed rows first so
    // pressing the button twice never stacks duplicates. Manually logged
    // shifts (notes without the "[auto]" marker) are left untouched.
    await supabase
      .from("shift_logs")
      .delete()
      .eq("user_id", userId)
      .gte("shift_date", weekStart)
      .lte("shift_date", weekEnd)
      .like("notes", "[auto]%");

    const rows: {
      user_id: string;
      shift_date: string;
      income_stream_id: string;
      income_stream_name: string;
      hours: number;
      hourly_rate: number;
      notes: string;
    }[] = [];

    for (const stream of state.incomes.filter((s) => s.type === "casual")) {
      const rate = stream.hourlyRate ?? 0;
      if (stream.useShifts) {
        // Detailed shifts: one marker per worked day, on its real date.
        for (const sh of stream.shifts ?? []) {
          const hours = sh.hours || 0;
          const offset = DAY_OFFSET[sh.day];
          if (hours > 0 && rate > 0 && offset !== undefined) {
            rows.push({
              user_id: userId,
              shift_date: format(addDays(monday, offset), "yyyy-MM-dd"),
              income_stream_id: stream.id,
              income_stream_name: stream.name,
              hours,
              hourly_rate: rate,
              notes: "[auto] shift",
            });
          }
        }
      } else {
        // Weekly hours total — no per-day detail, so one marker on pay day.
        const hours = stream.hoursWorked ?? 0;
        if (hours > 0 && rate > 0) {
          rows.push({
            user_id: userId,
            shift_date: payDay,
            income_stream_id: stream.id,
            income_stream_name: stream.name,
            hours,
            hourly_rate: rate,
            notes: "[auto] weekly",
          });
        }
      }
    }

    // Payslips for this week: a single marker on pay day carrying the actuals.
    for (const ps of state.incomes.filter(
      (s) => s.type === "payslip" && isIncomeActive(s),
    )) {
      const gross = ps.grossPay || 0;
      if (gross > 0) {
        rows.push({
          user_id: userId,
          shift_date: payDay,
          income_stream_id: ps.id,
          income_stream_name: ps.name,
          hours: 0,
          hourly_rate: 0,
          notes: `[auto] payslip ${JSON.stringify({
            gross,
            tax: ps.taxWithheld || 0,
            super: ps.superAmount || 0,
          })}`,
        });
      }
    }

    if (rows.length > 0) {
      await supabase.from("shift_logs").insert(rows);
    }

    // Upsert this week's snapshot (net already includes payslip actuals).
    const totalDebtBalance = state.debts.reduce((acc, d) => acc + (d.totalBalance ?? 0), 0);
    await supabase.from("weekly_snapshots").upsert(
      {
        user_id: userId,
        week_starting: weekStart,
        net_income: summary.totalNetIncome,
        total_debt_balance: totalDebtBalance,
        total_paid_this_week: state.debts.reduce((acc, d) => acc + d.amount, 0),
      },
      { onConflict: "user_id,week_starting" },
    );
  };

  const handlePayslipArchive = async (
    fields: NewItemFields,
    file: File | null,
  ) => {
    if (!session?.user) return;
    const userId = session.user.id;
    const weekStart = format(
      startOfWeek(new Date(), { weekStartsOn: 1 }),
      "yyyy-MM-dd",
    );
    const fileName = payslipFileName(
      fields.name || undefined,
      fields.payPeriodStart || undefined,
    );

    let storagePath: string | null = null;
    if (file) {
      storagePath = `${userId}/${fileName}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from("payslip-pdfs")
        .upload(storagePath, file, { upsert: true, contentType: "application/pdf" });
      if (uploadErr) {
        console.error("Payslip PDF upload failed:", uploadErr.message);
        storagePath = null;
      }
    }

    const gross = Number(fields.grossPay) || null;
    const tax = Number(fields.taxWithheld) || null;
    const { error: dbErr } = await supabase.from("payslips").upsert(
      {
        user_id: userId,
        week_starting: weekStart,
        employer: fields.name || null,
        payment_date: fields.paymentDate || null,
        period_start: fields.payPeriodStart || null,
        period_end: fields.payPeriodEnd || null,
        gross_pay: gross,
        tax_withheld: tax,
        super_amount: Number(fields.superAmount) || null,
        net_pay: gross != null && tax != null ? gross - tax : gross,
        file_name: fileName,
        storage_path: storagePath,
      },
      { onConflict: "user_id,week_starting,file_name" },
    );
    if (dbErr) {
      console.error("Payslip archive insert failed:", dbErr.message);
    } else {
      setPayslipRefreshKey((k) => k + 1);
    }
  };

  // One-off deployment of money toward a debt (knocks down its balance) or a
  // savings goal (tops it up). Source "vault" draws from the banked Cash Vault;
  // source "surplus" deploys this week's free surplus (a recurring weekly pool,
  // so it isn't a stored balance to deduct from).
  const allocateFunds = (
    source: "vault" | "surplus",
    target: { type: "debt" | "savings"; id: string },
    amount: number,
  ) => {
    const amt = Math.max(0, amount);
    if (amt <= 0) return;
    setState((prev) =>
      calculateAutoAllocation({
        ...prev,
        debts: prev.debts.map((d) =>
          target.type === "debt" &&
          d.id === target.id &&
          d.totalBalance !== undefined
            ? { ...d, totalBalance: Math.max(0, d.totalBalance - amt) }
            : d,
        ),
        savings: prev.savings.map((s) =>
          target.type === "savings" && s.id === target.id
            ? {
                ...s,
                currentAmount: Math.min(
                  s.targetAmount || Infinity,
                  (s.currentAmount || 0) + amt,
                ),
              }
            : s,
        ),
        ...(source === "vault"
          ? { cashBalance: Math.max(0, (prev.cashBalance || 0) - amt) }
          : {}),
      }),
    );
  };

  // ----- Settings -----

  const handleToggleCentrelink = (enabled: boolean) => {
    setState((prev) =>
      calculateAutoAllocation({ ...prev, centrelinkEnabled: enabled }),
    );
  };

  const handleChangeCentrelinkMax = (amount: number) => {
    setState((prev) =>
      calculateAutoAllocation({ ...prev, centrelinkMaxFortnightly: amount }),
    );
  };

  const handleResetData = () => {
    setState(INITIAL_STATE);
  };

  const navButton = (tab: TabKey, icon: React.ElementType, size: "sm" | "lg") => (
    <NavButton
      key={tab}
      tab={tab}
      icon={icon}
      size={size}
      activeTab={activeTab}
      onSelect={setActiveTab}
      label={TAB_COPY[tab].title}
    />
  );

  return (
    <div className="flex flex-col-reverse lg:flex-row h-[100dvh] overflow-hidden bg-[#F3F4F9] text-[#1A1A24] font-sans">
      {/* Mobile bottom nav */}
      <div className="lg:hidden bg-white/90 backdrop-blur-md border-t border-gray-200/50 flex justify-around items-center p-3 z-20 pb-safe">
        {NAV_ITEMS.map((n) => navButton(n.tab, n.icon, "sm"))}
        {onLogout && (
          <button onClick={onLogout} className="p-2 text-red-400" aria-label="Log out">
            <LogOut className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Desktop sidebar */}
      <nav className="w-24 h-full bg-white/60 backdrop-blur-md border-r border-white/40 flex-col items-center py-6 gap-8 z-10 hidden lg:flex">
        <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
          <Wallet className="w-6 h-6" />
        </div>
        <div className="flex flex-col gap-6 flex-1 mt-8">
          {NAV_ITEMS.filter((n) => n.tab !== "settings").map((n) =>
            navButton(n.tab, n.icon, "lg"),
          )}
        </div>
        <div className="mt-auto flex flex-col gap-4 items-center">
          {navButton("settings", Settings, "lg")}
          {onLogout && (
            <button
              onClick={onLogout}
              className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
              aria-label="Log out"
            >
              <LogOut className="w-6 h-6" />
            </button>
          )}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar relative h-full">
        <div className="max-w-6xl mx-auto space-y-8 pb-20 lg:pb-32">
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200/50 pb-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
                {TAB_COPY[activeTab].title}
              </h1>
              <p className="text-sm md:text-base text-gray-500 mt-1">
                {TAB_COPY[activeTab].subtitle}
              </p>
            </div>
          </header>

          {activeTab === "home" && (
            <HomeTab
              state={state}
              summary={summary}
              totalExpenses={totalExpenses}
              totalDebts={totalDebts}
              totalSavingsCont={totalSavingsCont}
              totalOutgoings={totalOutgoings}
              weeklySurplus={weeklySurplus}
              onUpdateIncome={updateIncome}
              onOpenAdd={openAddModal}
              onEdit={openEditModal}
              onRemoveIncome={removeIncome}
              onRemoveItem={removeItem}
              onPayDebt={payDebt}
              onPayAllDebts={payAllDebts}
              onReorderExpenses={(a, b) => reorderItems("expenses", a, b)}
              onReorderDebts={(a, b) => reorderItems("debts", a, b)}
              onUpdateDebtAmount={updateDebtAmount}
              onResetDebtAllocation={resetDebtAllocation}
              debtStrategy={state.debtStrategy ?? "snowball"}
              onSetDebtStrategy={setDebtStrategy}
              onRecordWindfall={handleRecordWindfall}
              onAdjustVault={handleAdjustVault}
              onUndoWindfall={handleUndoWindfall}
              onCommitWeek={handleCommitWeek}
              onAllocateFunds={allocateFunds}
              savings={state.savings}
              onPaySavingsGoal={paySavingsGoal}
              onPayAllSavings={payAllSavings}
            />
          )}

          {activeTab === "history" && (
            <HistoryTab
              totalNetIncome={summary.totalNetIncome}
              totalExpenses={totalExpenses}
              totalDebts={totalDebts}
              totalSavingsCont={totalSavingsCont}
              weeklySurplus={weeklySurplus}
              incomes={state.incomes}
              session={session}
              payslipRefreshKey={payslipRefreshKey}
            />
          )}

          {activeTab === "goals" && (
            <GoalsTab
              savings={state.savings}
              onEditGoal={(goal) => openEditModal("savings", goal)}
              onRemoveGoal={(id) => removeItem("savings", id)}
              onAddGoal={() => openAddModal("savings")}
              onUpdateSavingsWeight={updateSavingsWeight}
              onResetSavingsWeight={resetSavingsWeight}
              onRecalculateSavings={recalculateAllSavings}
              onLockSavingsGoal={lockSavingsGoal}
              onUnlockSavingsGoal={unlockSavingsGoal}
              onPaySavingsGoal={paySavingsGoal}
              onPayAllSavings={payAllSavings}
            />
          )}

          {activeTab === "settings" && (
            <SettingsTab
              centrelinkEnabled={state.centrelinkEnabled !== false}
              centrelinkMaxFortnightly={
                state.centrelinkMaxFortnightly ??
                DEFAULT_JOBSEEKER_MAX_FORTNIGHTLY
              }
              syncStatus={syncStatus}
              onToggleCentrelink={handleToggleCentrelink}
              onChangeCentrelinkMax={handleChangeCentrelinkMax}
              onExportCsv={() => downloadBudgetCsv(state)}
              onResetData={handleResetData}
            />
          )}

          {isAddingItem && (
            <AddItemModal
              itemType={newItemType}
              isEditing={!!editingItemId}
              initialFields={modalInitialFields}
              onClose={closeModal}
              onSubmit={handleSubmitItem}
              onPayslipArchive={handlePayslipArchive}
            />
          )}
        </div>
      </main>
    </div>
  );
}
