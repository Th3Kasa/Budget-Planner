import React, { useState } from "react";
import {
  Briefcase,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Edit2,
  GripVertical,
  Plus,
  Receipt,
  RotateCcw,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
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
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { cn } from "../../lib/utils";
import {
  calculateIncomeAmount,
  isIncomeActive,
  IncomeSummary,
} from "../../lib/income";
import { BudgetElement, BudgetState, IncomeStream, SavingsGoal } from "../../types";
import { getIcon } from "../icons";
import { ItemType } from "../AddItemModal";

const money = (v: number) =>
  v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

interface HomeTabProps {
  state: BudgetState;
  summary: IncomeSummary;
  totalExpenses: number;
  totalDebts: number;
  totalSavingsCont: number;
  totalOutgoings: number;
  weeklySurplus: number;
  onUpdateIncome: (id: string, patch: Partial<IncomeStream>) => void;
  onOpenAdd: (type: ItemType) => void;
  onEdit: (type: ItemType, item: BudgetElement | SavingsGoal | IncomeStream) => void;
  onRemoveIncome: (id: string) => void;
  onRemoveItem: (collection: "expenses" | "debts" | "savings", id: string) => void;
  onPayDebt: (id: string) => void;
  onReorderExpenses: (activeId: string, overId: string) => void;
  onReorderDebts: (activeId: string, overId: string) => void;
  onUpdateDebtAmount: (id: string, amount: number) => void;
  onResetDebtAllocation: (id: string) => void;
  debtStrategy: "snowball" | "balanced";
  onSetDebtStrategy: (strategy: "snowball" | "balanced") => void;
  onRecordWindfall: (name: string, amount: number, priorities?: { debtId: string; amount: number }[]) => void;
  onAdjustVault: (newBalance: number) => void;
  onUndoWindfall: (id: string) => void;
  onCommitWeek: () => Promise<void>;
  savings: SavingsGoal[];
  onPaySavingsGoal: (id: string) => void;
}

type SortableHandleProps = Pick<ReturnType<typeof useSortable>, "attributes" | "listeners">;

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (handleProps: SortableHandleProps) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 200ms ease",
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners })}
    </div>
  );
}

export default function HomeTab({
  state,
  summary,
  totalExpenses,
  totalDebts,
  totalSavingsCont,
  totalOutgoings,
  weeklySurplus,
  onUpdateIncome,
  onOpenAdd,
  onEdit,
  onRemoveIncome,
  onRemoveItem,
  onPayDebt,
  onReorderExpenses,
  onReorderDebts,
  onUpdateDebtAmount,
  onResetDebtAllocation,
  debtStrategy,
  onSetDebtStrategy,
  onRecordWindfall,
  onAdjustVault,
  onUndoWindfall,
  onCommitWeek,
  savings,
  onPaySavingsGoal,
}: HomeTabProps) {
  const [isSellingAsset, setIsSellingAsset] = useState(false);
  const [windfallStep, setWindfallStep] = useState<"enter" | "allocate">("enter");
  const [isAdjustingVault, setIsAdjustingVault] = useState(false);
  const [adjustVaultAmount, setAdjustVaultAmount] = useState("");
  const [assetName, setAssetName] = useState("");
  const [assetAmount, setAssetAmount] = useState("");
  const [debtAllocations, setDebtAllocations] = useState<Record<string, string>>({});
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [editingDebtValue, setEditingDebtValue] = useState("");
  const [commitState, setCommitState] = useState<"idle" | "loading" | "done">("idle");
  const [savingsOpen, setSavingsOpen] = useState(false);

  const centrelinkEnabled = state.centrelinkEnabled !== false;
  const cashBalance = state.cashBalance || 0;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const chartData = [
    { name: "Expenses", value: totalExpenses, color: "#f59e0b" },
    { name: "Debts", value: totalDebts, color: "#ef4444" },
    { name: "Savings", value: totalSavingsCont, color: "#3b82f6" },
  ].filter((item) => item.value > 0);
  if (weeklySurplus > 0) {
    chartData.push({ name: "Surplus", value: weeklySurplus, color: "#10b981" });
  }

  // Total balance across ALL debts divided by total weekly repayments gives
  // the true debt-free horizon accounting for every debt simultaneously.
  const totalDebtBalance = state.debts.reduce((acc, d) => acc + (d.totalBalance || 0), 0);
  const totalWeeklyRepayments = state.debts.reduce((acc, d) => acc + d.amount, 0);
  const debtFreeWeeks =
    totalWeeklyRepayments > 0 && totalDebtBalance > 0
      ? Math.ceil(totalDebtBalance / totalWeeklyRepayments)
      : 0;

  // The debt the snowball is currently attacking: the smallest balance still
  // owing. Highlighted in the list so it's clear where the extra money goes.
  const snowballTargetId =
    debtStrategy === "snowball"
      ? state.debts
          .filter((d) => (d.totalBalance ?? 0) > 0.01)
          .sort((a, b) => (a.totalBalance ?? 0) - (b.totalBalance ?? 0))[0]?.id
      : undefined;

  const closeWindfall = () => {
    setIsSellingAsset(false);
    setWindfallStep("enter");
    setAssetName("");
    setAssetAmount("");
    setDebtAllocations({});
  };

  const handleWindfallNext = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(assetAmount);
    if (!assetName || !amount || amount <= 0) return;
    setWindfallStep("allocate");
    setDebtAllocations({});
  };

  const handleWindfallConfirm = () => {
    const amount = Number(assetAmount);
    if (!assetName || !amount || amount <= 0) return;
    const priorities = Object.entries(debtAllocations)
      .filter(([, v]) => v !== "" && Number(v) > 0)
      .map(([debtId, v]) => ({ debtId, amount: Number(v) }));
    onRecordWindfall(assetName, amount, priorities.length > 0 ? priorities : undefined);
    closeWindfall();
  };

  const totalAllocated = Object.values(debtAllocations).reduce(
    (sum, v) => sum + (Number(v) || 0),
    0,
  );
  const remainingToAllocate = Math.max(0, Number(assetAmount) - totalAllocated);

  const handleAdjustVault = (e: React.FormEvent) => {
    e.preventDefault();
    if (adjustVaultAmount === "") return;
    onAdjustVault(Math.max(0, Number(adjustVaultAmount)));
    setIsAdjustingVault(false);
    setAdjustVaultAmount("");
  };

  const handleCommit = async () => {
    if (commitState !== "idle") return;
    setCommitState("loading");
    try {
      await onCommitWeek();
      setCommitState("done");
      setTimeout(() => setCommitState("idle"), 3000);
    } catch {
      setCommitState("idle");
    }
  };

  const inlineNumberInput = (
    value: number,
    onChange: (v: number) => void,
    width = "w-12",
  ) => (
    <input
      type="number"
      min="0"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`text-xs font-bold bg-transparent border-b border-transparent hover:border-indigo-200 focus:border-indigo-500 outline-none ${width} text-right transition-colors`}
    />
  );

  const expenseIds = state.expenses.map((e) => e.id);
  // In snowball mode the list auto-sorts by balance (smallest at the top, the
  // biggest debt at the bottom) and re-sorts live as balances change. In
  // balanced mode the user's manual drag order is kept.
  const displayDebts =
    debtStrategy === "snowball"
      ? [...state.debts].sort(
          (a, b) => (a.totalBalance ?? 0) - (b.totalBalance ?? 0),
        )
      : state.debts;
  const debtIds = displayDebts.map((d) => d.id);

  return (
    <div className="space-y-8">
      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
        {/* Income Streams */}
        <div className="glass-card p-5 md:p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-indigo-500/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="flex justify-between items-start mb-2">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 relative z-10">
              <Briefcase className="w-5 h-5" />
            </div>
            <button
              onClick={() => onOpenAdd("income")}
              className="z-10 p-1.5 bg-white/50 text-indigo-600 hover:bg-white rounded-lg transition-colors border border-indigo-100"
              aria-label="Add income stream"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <h3 className="text-sm font-medium text-gray-500 relative z-10 mb-2">
            Income Streams
          </h3>
          <div className="space-y-3 relative z-10 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
            {state.incomes.map((inc) => {
              const stalePayslip = inc.type === "payslip" && !isIncomeActive(inc);
              return (
              <div
                key={inc.id}
                className={cn(
                  "bg-white/40 p-2 rounded-lg border border-white/60 relative group/inc",
                  stalePayslip && "opacity-50",
                )}
              >
                <div className="absolute right-1 top-1 opacity-100 sm:opacity-0 sm:group-hover/inc:opacity-100 flex items-center gap-2 transition-opacity">
                  <button
                    onClick={() => onEdit("income", inc)}
                    className="text-gray-400 hover:text-indigo-600 transition-colors"
                    aria-label="Edit income"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onRemoveIncome(inc.id)}
                    className="text-red-400 hover:text-red-600 transition-colors"
                    aria-label="Delete income"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-xs font-semibold text-gray-700 pr-5 flex items-center gap-1.5 flex-wrap">
                  {inc.name}
                  {inc.isCash && (
                    <span className="bg-emerald-100 text-emerald-700 text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wide">
                      Cash
                    </span>
                  )}
                  {inc.type === "payslip" && (
                    <span className="bg-indigo-100 text-indigo-700 text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wide">
                      Payslip
                    </span>
                  )}
                  {stalePayslip && (
                    <span className="bg-gray-100 text-gray-500 text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wide">
                      Past wk
                    </span>
                  )}
                </p>
                {inc.type === "payslip" ? (
                  <div className="mt-1 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500">Gross:</span>
                      <span className="text-xs font-bold text-gray-900">
                        ${(inc.grossPay || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500">Tax:</span>
                      <span className="text-xs font-bold text-pink-600">
                        -${(inc.taxWithheld || 0).toFixed(2)}
                      </span>
                    </div>
                    {(inc.superAmount || 0) > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">Super:</span>
                        <span className="text-xs font-bold text-indigo-600">
                          ${(inc.superAmount || 0).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-100/50">
                      <span className="text-[10px] text-gray-500">Net:</span>
                      <span className="text-xs font-bold text-gray-900">
                        ${((inc.grossPay || 0) - (inc.taxWithheld || 0)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ) : inc.type === "casual" ? (
                  <div className="mt-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500">Rate:</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-gray-400">$</span>
                        {inlineNumberInput(inc.hourlyRate || 0, (v) =>
                          onUpdateIncome(inc.id, { hourlyRate: v }),
                        )}
                      </div>
                    </div>
                    {inc.useShifts ? (
                      <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-100/50">
                        <span className="text-[10px] text-gray-500">Shifts:</span>
                        <span className="text-xs font-bold text-gray-900">
                          {inc.shifts?.filter((s) => (s.hours || 0) > 0).length || 0}{" "}
                          days
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">Hours:</span>
                        {inlineNumberInput(inc.hoursWorked || 0, (v) =>
                          onUpdateIncome(inc.id, { hoursWorked: v }),
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-100/50">
                      <span className="text-[10px] text-gray-500">Total:</span>
                      <span className="text-xs font-bold text-gray-900">
                        ${calculateIncomeAmount(inc).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] text-gray-500">Amount:</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-gray-400">$</span>
                      {inlineNumberInput(
                        inc.amount || 0,
                        (v) => onUpdateIncome(inc.id, { amount: v }),
                        "w-16",
                      )}
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100/50 relative z-10 flex justify-between items-end">
            <span className="text-xs text-gray-500 font-medium">Gross Total:</span>
            <span className="text-xl font-bold text-gray-900">
              ${summary.weeklyGrossIncome.toFixed(2)}
            </span>
          </div>
          <div className="text-[10px] md:text-xs text-indigo-600 font-medium mt-3 bg-indigo-50 px-2 py-1 rounded w-fit inline-flex items-center gap-1 relative z-10">
            <Wallet className="w-3 h-3" />
            Super (12%): ${summary.superContribution.toFixed(2)}
          </div>
        </div>

        {/* Net Income */}
        <div className="glass-card p-5 md:p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-pink-500/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 relative z-10">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-gray-500 relative z-10 flex items-center justify-between">
            Total Net Income
            <span className="text-[9px] font-bold uppercase tracking-wider bg-pink-50 text-pink-600 px-1.5 py-0.5 rounded">
              FY {summary.financialYear}
            </span>
          </h3>
          <div className="mt-1 relative z-10">
            <span className="text-2xl md:text-3xl font-bold text-gray-900">
              ${summary.totalNetIncome.toFixed(2)}
            </span>
          </div>
          <div className="text-[10px] md:text-xs text-gray-500 mt-2 space-y-1 relative z-10">
            <p className="flex justify-between">
              <span>Tax, Medicare, HECS:</span>{" "}
              <span className="text-pink-600 font-medium">
                -${summary.totalDeductions.toFixed(2)}
              </span>
            </p>
            {centrelinkEnabled && (
              <div className="flex flex-col">
                <p className="flex justify-between">
                  <span>Centrelink (F/N):</span>{" "}
                  <span className="text-green-600 font-medium">
                    +${(summary.centrelinkWeekly * 2).toFixed(2)}
                  </span>
                </p>
                <p className="text-right text-[9px] text-gray-400 mt-0.5">
                  Adds +${summary.centrelinkWeekly.toFixed(2)} to weekly budget
                </p>
              </div>
            )}
            {summary.untaxedWeeklyIncome > 0 && (
              <p className="flex justify-between border-t border-gray-100/50 pt-1 mt-1">
                <span>Cash (Untaxed):</span>{" "}
                <span className="text-indigo-600 font-medium">
                  +${summary.untaxedWeeklyIncome.toFixed(2)}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Outgoings */}
        <div className="glass-card p-5 md:p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 bg-amber-500/10 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 relative z-10">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-sm font-medium text-gray-500 relative z-10">
            Total Outgoings
          </h3>
          <div className="mt-1 relative z-10">
            <span className="text-2xl md:text-3xl font-bold text-gray-900">
              ${totalOutgoings.toFixed(2)}
            </span>
          </div>
          <div className="text-[10px] md:text-xs text-gray-500 mt-2 space-y-1 relative z-10">
            <p className="flex justify-between">
              <span>Expenses:</span>{" "}
              <span className="font-medium">${totalExpenses.toFixed(2)}</span>
            </p>
            <p className="flex justify-between">
              <span>Debt/Savings:</span>{" "}
              <span className="font-medium">
                ${(totalDebts + totalSavingsCont).toFixed(2)}
              </span>
            </p>
          </div>
        </div>

        {/* Surplus / Deficit */}
        <div
          className={cn(
            "glass-card p-5 md:p-6 relative overflow-hidden group border",
            weeklySurplus >= 0 ? "border-green-200/50" : "border-red-200/50",
          )}
        >
          <div
            className={cn(
              "absolute top-0 right-0 w-24 h-24 md:w-32 md:h-32 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110",
              weeklySurplus >= 0 ? "bg-green-500/10" : "bg-red-500/10",
            )}
          ></div>
          <div className="flex justify-between items-start mb-4">
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center relative z-10",
                weeklySurplus >= 0
                  ? "bg-green-100 text-green-600"
                  : "bg-red-100 text-red-600",
              )}
            >
              {weeklySurplus >= 0 ? (
                <CircleDollarSign className="w-5 h-5 flex-shrink-0" />
              ) : (
                <TrendingUp className="w-5 h-5 flex-shrink-0 rotate-180" />
              )}
            </div>
          </div>
          <h3 className="text-sm font-medium text-gray-500 relative z-10">
            {weeklySurplus >= 0 ? "Weekly Surplus" : "Weekly Deficit"}
          </h3>
          <div className="mt-1 relative z-10">
            <span
              className={cn(
                "text-2xl md:text-3xl font-bold",
                weeklySurplus >= 0 ? "text-green-600" : "text-red-600",
              )}
            >
              {weeklySurplus >= 0 ? "+" : ""}
              {weeklySurplus.toFixed(2)}
            </span>
          </div>
          <div className="text-[10px] md:text-xs text-gray-500 mt-3 font-medium relative z-10">
            {weeklySurplus >= 0
              ? "Safe to spend or save extra! 🎉"
              : "Action needed: Adjust budget. ⚠️"}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto w-full space-y-6">
        {/* Commit This Week */}
        <div className="glass-card p-4 md:p-5 border border-indigo-100 bg-gradient-to-r from-indigo-50/60 to-purple-50/40 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-gray-800">Commit This Week</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Logs your income &amp; saves a snapshot for the calendar &amp; history
            </p>
          </div>
          <button
            onClick={handleCommit}
            disabled={commitState !== "idle"}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm flex-shrink-0 transition-all",
              commitState === "done"
                ? "bg-green-100 text-green-700 border border-green-200"
                : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-200 disabled:opacity-60",
            )}
          >
            {commitState === "loading" && (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {commitState === "done" && <CheckCircle2 className="w-4 h-4" />}
            {commitState === "loading"
              ? "Saving…"
              : commitState === "done"
                ? "Committed!"
                : "Commit Week"}
          </button>
        </div>

        {/* Expenses & Debts */}
        <div className="glass-card p-4 md:p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base md:text-lg font-bold text-gray-900">
              Expenses & Debts
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenAdd("expense")}
                className="flex items-center gap-1 text-xs md:text-sm text-indigo-600 font-medium hover:text-indigo-800 transition-colors bg-indigo-50 px-2 py-1.5 md:px-3 rounded-lg"
              >
                <Plus className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" /> Expense
              </button>
              <button
                onClick={() => onOpenAdd("debt")}
                className="flex items-center gap-1 text-xs md:text-sm text-red-600 font-medium hover:text-red-800 transition-colors bg-red-50 px-2 py-1.5 md:px-3 rounded-lg"
              >
                <Plus className="w-3 h-3 md:w-4 md:h-4 flex-shrink-0" /> Debt
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {state.expenses.length > 0 && (
              <div className="space-y-3 md:space-y-4">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Expenses
                </h3>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e: DragEndEvent) => {
                    const { active, over } = e;
                    if (over && active.id !== over.id)
                      onReorderExpenses(String(active.id), String(over.id));
                  }}
                >
                  <SortableContext items={expenseIds} strategy={verticalListSortingStrategy}>
                    {state.expenses.map((item) => (
                      <SortableRow key={item.id} id={item.id}>
                        {({ attributes, listeners }) => (
                          <div className="flex items-center justify-between p-3 md:p-4 rounded-xl bg-white/40 border border-white/60 hover:bg-white/60 transition-colors group">
                            <div className="flex items-center gap-2 md:gap-3">
                              <button
                                {...attributes}
                                {...listeners}
                                className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-gray-300 hover:text-gray-500 touch-none flex-shrink-0"
                                aria-label="Drag to reorder"
                              >
                                <GripVertical className="w-4 h-4" />
                              </button>
                              <div className="flex items-center gap-3 md:gap-4">
                                <div
                                  className="w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center text-white shadow-sm flex-shrink-0"
                                  style={{ backgroundColor: item.color }}
                                >
                                  {getIcon(item.icon || "")}
                                </div>
                                <div>
                                  <p className="text-sm md:text-base font-semibold text-gray-900 line-clamp-1">
                                    {item.name}
                                  </p>
                                  <p className="text-[10px] md:text-xs text-gray-500">
                                    {item.category}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 md:gap-4">
                              <div className="text-right">
                                <p className="text-sm md:text-base font-bold text-gray-900">
                                  ${item.amount.toFixed(2)}
                                </p>
                                <p className="text-[10px] md:text-xs text-gray-500">
                                  {item.frequency === "monthly" ? "/ month" : "/ week"}
                                </p>
                                {item.frequency === "monthly" && (
                                  <p className="text-[10px] text-gray-400">
                                    ≈ ${(item.amount / (52 / 12)).toFixed(2)}/wk
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => onEdit("expense", item)}
                                  className="text-gray-400 hover:text-indigo-600 p-1 md:p-2 transition-colors"
                                  title="Edit item"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => onRemoveItem("expenses", item.id)}
                                  className="text-red-400 hover:text-red-600 p-1 md:p-2 transition-colors"
                                  title="Delete item"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </SortableRow>
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            )}

            {state.debts.length > 0 && (
              <div className="space-y-3 md:space-y-4 mt-6">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Debts
                  </h3>
                  <div className="inline-flex items-center rounded-lg bg-gray-100 p-0.5 text-[11px] font-semibold">
                    <button
                      type="button"
                      onClick={() => onSetDebtStrategy("snowball")}
                      className={cn(
                        "px-2.5 py-1 rounded-md transition-colors",
                        debtStrategy === "snowball"
                          ? "bg-white text-indigo-600 shadow-sm"
                          : "text-gray-500 hover:text-gray-700",
                      )}
                      title="Throw all spare cash at the smallest debt first, then roll it into the next"
                    >
                      ⛄ Snowball
                    </button>
                    <button
                      type="button"
                      onClick={() => onSetDebtStrategy("balanced")}
                      className={cn(
                        "px-2.5 py-1 rounded-md transition-colors",
                        debtStrategy === "balanced"
                          ? "bg-white text-indigo-600 shadow-sm"
                          : "text-gray-500 hover:text-gray-700",
                      )}
                      title="Split spare cash across debts proportionally, leftover goes to savings"
                    >
                      ⚖️ Balanced
                    </button>
                  </div>
                </div>
                {debtStrategy === "snowball" && (
                  <p className="text-[11px] text-gray-500 mb-2 leading-snug">
                    Sorted smallest balance first. Your set repayments are kept
                    as minimums, the other debts get an even minimum, and the
                    rest is hurled at the smallest balance until it's gone —
                    then rolls into the next.
                  </p>
                )}
                <div className="flex justify-between items-center text-right mb-2">
                  <span className="text-xs text-gray-500 font-medium">
                    Total Debt Balance:{" "}
                    <span className="text-sm font-bold text-red-600">
                      $
                      {money(
                        state.debts.reduce(
                          (acc, d) => acc + (d.totalBalance || 0),
                          0,
                        ),
                      )}
                    </span>
                  </span>
                  {debtFreeWeeks > 0 && (
                    <span className="text-[10px] md:text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg">
                      Debt-free in ~{debtFreeWeeks} weeks at current rate
                    </span>
                  )}
                </div>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(e: DragEndEvent) => {
                    if (debtStrategy === "snowball") return; // auto-sorted by balance
                    const { active, over } = e;
                    if (over && active.id !== over.id)
                      onReorderDebts(String(active.id), String(over.id));
                  }}
                >
                  <SortableContext items={debtIds} strategy={verticalListSortingStrategy}>
                    {displayDebts.map((item) => {
                      const original =
                        item.originalBalance || item.totalBalance || item.amount;
                      const current = item.totalBalance || 0;
                      const paid = original - current;
                      const progress =
                        original > 0
                          ? Math.min(100, Math.max(0, (paid / original) * 100))
                          : 0;

                      return (
                        <SortableRow key={item.id} id={item.id}>
                          {({ attributes, listeners }) => (
                            <div className="flex flex-col p-4 md:p-5 rounded-2xl bg-white/40 border border-white/60 hover:bg-white/60 transition-colors group relative">
                              {/* Desktop hover actions */}
                              <div className="absolute right-3 top-3 hidden sm:flex opacity-0 group-hover:opacity-100 items-center gap-2 transition-opacity">
                                {item.isManuallySet && (
                                  <button
                                    onClick={() => onResetDebtAllocation(item.id)}
                                    className="p-1.5 text-gray-400 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors"
                                    aria-label="Reset to automatic allocation"
                                    title="Reset to automatic allocation"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => onEdit("debt", item)}
                                  className="text-gray-400 hover:text-indigo-600 transition-colors"
                                  title="Edit item"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => onRemoveItem("debts", item.id)}
                                  className="text-red-400 hover:text-red-600 transition-colors"
                                  title="Delete item"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>

                              <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2">
                                  {debtStrategy === "snowball" ? (
                                    <span
                                      className="p-1 text-gray-200 flex-shrink-0"
                                      title="Auto-sorted: smallest balance first"
                                      aria-hidden
                                    >
                                      <GripVertical className="w-4 h-4" />
                                    </span>
                                  ) : (
                                    <button
                                      {...attributes}
                                      {...listeners}
                                      className="cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-gray-500 touch-none flex-shrink-0"
                                      aria-label="Drag to reorder"
                                    >
                                      <GripVertical className="w-4 h-4" />
                                    </button>
                                  )}
                                  <div className="flex items-center gap-3">
                                    <div
                                      className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm flex-shrink-0"
                                      style={{ backgroundColor: item.color }}
                                    >
                                      {getIcon(item.icon || "credit-card")}
                                    </div>
                                    <div>
                                      <h3 className="font-bold text-gray-900 line-clamp-1 flex items-center gap-1.5">
                                        {item.name}
                                        {item.id === snowballTargetId && (
                                          <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                            ⛄ Focus
                                          </span>
                                        )}
                                      </h3>
                                      <p className="text-xs text-gray-500 flex items-center gap-1">
                                        {editingDebtId === item.id ? (
                                          <span className="flex items-center gap-0.5">
                                            <span className="text-gray-400">$</span>
                                            <input
                                              type="number"
                                              min="0"
                                              step="0.01"
                                              autoFocus
                                              value={editingDebtValue}
                                              onChange={(e) => setEditingDebtValue(e.target.value)}
                                              onBlur={() => {
                                                const num = Number(editingDebtValue);
                                                if (
                                                  editingDebtValue !== "" &&
                                                  !isNaN(num) &&
                                                  num >= 0 &&
                                                  num !== item.amount
                                                ) {
                                                  onUpdateDebtAmount(item.id, num);
                                                }
                                                setEditingDebtId(null);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  e.currentTarget.blur();
                                                } else if (e.key === "Escape") {
                                                  setEditingDebtId(null);
                                                }
                                              }}
                                              className="text-xs font-bold bg-transparent border-b border-indigo-500 outline-none w-14 text-right"
                                            />
                                            <span>/wk repayment</span>
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingDebtId(item.id);
                                              setEditingDebtValue(item.amount.toFixed(2));
                                            }}
                                            className="group/amt inline-flex items-center gap-0.5 hover:text-indigo-600 transition-colors"
                                            title="Click to edit weekly repayment"
                                          >
                                            <span className="border-b border-transparent group-hover/amt:border-indigo-400 transition-colors">
                                              ${item.amount.toFixed(2)}/wk repayment
                                            </span>
                                          </button>
                                        )}
                                      </p>
                                      {item.amount > 0 && current > 0 && editingDebtId !== item.id && (
                                        <p className="text-[10px] text-gray-400 mt-0.5">
                                          • {Math.ceil(current / item.amount)} weeks left
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-2 mt-1 flex-shrink-0">
                                  <div className="text-right">
                                    <span className="text-sm font-bold text-gray-900 block">
                                      ${money(current)} left
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => onPayDebt(item.id)}
                                    className="text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700 hover:bg-red-200 px-2 flex-shrink-0 py-1 rounded-md transition-colors flex items-center gap-1"
                                  >
                                    <Plus className="w-3 h-3" /> Pay
                                  </button>
                                </div>
                              </div>

                              {/* Mobile-only action strip */}
                              <div className="flex sm:hidden items-center justify-end gap-1.5 mb-2">
                                {item.isManuallySet && (
                                  <button
                                    onClick={() => onResetDebtAllocation(item.id)}
                                    className="p-1.5 text-gray-400 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors"
                                    aria-label="Reset allocation"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => onEdit("debt", item)}
                                  className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg transition-colors"
                                  aria-label="Edit"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => onRemoveItem("debts", item.id)}
                                  className="p-1.5 text-red-400 hover:text-red-600 rounded-lg transition-colors"
                                  aria-label="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2 overflow-hidden shadow-inner">
                                <div
                                  className="h-2.5 rounded-full transition-all duration-1000 ease-out"
                                  style={{
                                    width: `${progress}%`,
                                    backgroundColor: item.color || "#ef4444",
                                  }}
                                ></div>
                              </div>
                              <div className="flex justify-between text-[11px] font-medium text-gray-500">
                                <span>{progress.toFixed(0)}% paid</span>
                                <span>${money(paid)} paid back</span>
                              </div>
                            </div>
                          )}
                        </SortableRow>
                      );
                    })}
                  </SortableContext>
                </DndContext>
              </div>
            )}
            {state.expenses.length === 0 && state.debts.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">
                No expenses or debts added yet.
              </p>
            )}
          </div>
        </div>

        {/* Cash Vault */}
        <div className="glass-card mb-6 p-4 md:p-6 border border-emerald-100 bg-gradient-to-br from-emerald-50/50 to-teal-50/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <CircleDollarSign className="w-24 h-24" />
          </div>
          <div className="flex justify-between items-start mb-6 relative">
            <div>
              <h2 className="text-base md:text-xl font-bold text-gray-900">
                Cash Vault
              </h2>
              <p className="text-sm text-gray-600">
                Proceeds from one-off sales or windfalls
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl md:text-3xl font-bold text-emerald-600 drop-shadow-sm">
                ${money(cashBalance)}
              </div>
            </div>
          </div>

          {!isSellingAsset && !isAdjustingVault ? (
            <div className="flex gap-2 w-full">
              <button
                onClick={() => { setIsSellingAsset(true); setWindfallStep("enter"); }}
                className="flex-1 relative flex items-center justify-center gap-2 bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 transition-colors font-bold py-3 text-sm md:text-base rounded-xl shadow-sm"
              >
                <Plus className="w-4 h-4 md:w-5 md:h-5" /> Record Windfall
              </button>
              <button
                onClick={() => {
                  setIsAdjustingVault(true);
                  setAdjustVaultAmount(String(cashBalance));
                }}
                className="px-4 relative flex items-center justify-center gap-2 bg-white text-gray-600 border border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 transition-colors font-bold py-3 text-sm md:text-base rounded-xl shadow-sm"
                title="Adjust balance manually"
              >
                <Edit2 className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>
          ) : isAdjustingVault ? (
            <form
              onSubmit={handleAdjustVault}
              className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 space-y-4 relative mb-4"
            >
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-gray-800">Adjust Vault Balance</h3>
                <button
                  type="button"
                  onClick={() => setIsAdjustingVault(false)}
                  className="text-gray-400 hover:text-gray-600 bg-gray-50 rounded-lg p-1 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block uppercase tracking-wider">
                  New Balance
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-2.5 text-gray-500 font-medium">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={adjustVaultAmount}
                    onChange={(e) => setAdjustVaultAmount(e.target.value)}
                    required
                    className="w-full text-sm pl-8 pr-4 py-2.5 bg-gray-50 border outline-none focus:border-emerald-400 focus:bg-white border-gray-200 transition-colors rounded-xl"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-emerald-500 text-white font-bold py-3 shadow-md rounded-xl hover:bg-emerald-600 hover:shadow-lg transition-all mt-4 text-sm md:text-base"
              >
                Save Balance
              </button>
            </form>
          ) : windfallStep === "enter" ? (
            /* Step 1: Enter source and amount */
            <form
              onSubmit={handleWindfallNext}
              className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 space-y-4 relative mb-4"
            >
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-gray-800">Record Cash Inflow</h3>
                <button
                  type="button"
                  onClick={closeWindfall}
                  className="text-gray-400 hover:text-gray-600 bg-gray-50 rounded-lg p-1 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block uppercase tracking-wider">
                  Source / Item Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sold Car, Tax Return"
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  required
                  className="w-full text-sm px-4 py-2.5 bg-gray-50 border outline-none focus:border-emerald-400 focus:bg-white border-gray-200 transition-colors rounded-xl"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block uppercase tracking-wider">
                  Total Amount
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-2.5 text-gray-500 font-medium">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={assetAmount}
                    onChange={(e) => setAssetAmount(e.target.value)}
                    required
                    className="w-full text-sm pl-8 pr-4 py-2.5 bg-gray-50 border outline-none focus:border-emerald-400 focus:bg-white border-gray-200 transition-colors rounded-xl"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="w-full bg-emerald-500 text-white font-bold py-3 shadow-md rounded-xl hover:bg-emerald-600 hover:shadow-lg transition-all mt-4 text-sm md:text-base flex items-center justify-center gap-2"
              >
                Next: Choose Debt Priority →
              </button>
            </form>
          ) : (
            /* Step 2: Allocate to specific debts */
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 space-y-4 relative mb-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-gray-800">Allocate Windfall</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Total: <span className="font-semibold text-emerald-600">${money(Number(assetAmount))}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeWindfall}
                  className="text-gray-400 hover:text-gray-600 bg-gray-50 rounded-lg p-1 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Remaining indicator */}
              <div className={`rounded-xl p-3 text-center border ${remainingToAllocate < 0 ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
                <span className={`font-bold text-xl ${remainingToAllocate < 0 ? "text-red-600" : "text-emerald-600"}`}>
                  ${money(Math.abs(remainingToAllocate))}
                </span>
                <p className="text-xs text-gray-500 mt-0.5">
                  {remainingToAllocate < 0
                    ? "over-allocated — reduce amounts above"
                    : "remaining → auto-splits to other debts, then savings, then vault"}
                </p>
              </div>

              {/* Debt allocation inputs */}
              {state.debts.filter((d) => (d.totalBalance || 0) > 0).length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Specify amounts for priority debts (optional)
                  </p>
                  {state.debts
                    .filter((d) => (d.totalBalance || 0) > 0)
                    .map((debt) => (
                      <div
                        key={debt.id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0"
                          style={{ backgroundColor: debt.color }}
                        >
                          {getIcon(debt.icon || "credit-card")}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {debt.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            Balance: ${money(debt.totalBalance || 0)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            // Cap at remaining + whatever this debt already has entered,
                            // so "Pay all" never over-allocates.
                            const alreadyEntered = Number(debtAllocations[debt.id]) || 0;
                            const maxPayable = Math.min(
                              debt.totalBalance || 0,
                              remainingToAllocate + alreadyEntered,
                            );
                            setDebtAllocations((prev) => ({
                              ...prev,
                              [debt.id]: maxPayable.toFixed(2),
                            }));
                          }}
                          className="text-[10px] font-bold uppercase tracking-wide text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-1 rounded-lg flex-shrink-0 transition-colors"
                        >
                          Pay all
                        </button>
                        <div className="relative flex-shrink-0">
                          <span className="absolute left-2.5 top-2 text-gray-400 text-sm pointer-events-none">
                            $
                          </span>
                          <input
                            type="number"
                            min="0"
                            max={debt.totalBalance || 0}
                            step="0.01"
                            placeholder="0.00"
                            value={debtAllocations[debt.id] || ""}
                            onChange={(e) =>
                              setDebtAllocations((prev) => ({
                                ...prev,
                                [debt.id]: e.target.value,
                              }))
                            }
                            className="w-24 pl-6 pr-2 py-1.5 text-sm bg-white border border-gray-200 rounded-lg outline-none focus:border-emerald-400 text-right"
                          />
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-2">
                  No active debts — windfall will go to savings goals then vault.
                </p>
              )}

              <button
                type="button"
                onClick={handleWindfallConfirm}
                disabled={remainingToAllocate < 0}
                className="w-full bg-emerald-500 text-white font-bold py-3 shadow-md rounded-xl hover:bg-emerald-600 hover:shadow-lg transition-all text-sm md:text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Allocation
              </button>
              <button
                type="button"
                onClick={() => setWindfallStep("enter")}
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-1 transition-colors"
              >
                ← Back
              </button>
            </div>
          )}

          {state.windfalls && state.windfalls.length > 0 && (
            <div className="mt-6 pt-4 border-t border-emerald-200/50">
              <h3 className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-3">
                Windfall History
              </h3>
              <div className="space-y-3">
                {state.windfalls
                  .slice()
                  .reverse()
                  .map((wf) => (
                    <div
                      key={wf.id}
                      className="bg-white/80 border border-emerald-100 p-3 rounded-xl shadow-sm relative group"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-sm text-gray-800">
                            {wf.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(wf.date).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-sm text-emerald-600">
                            +${money(wf.sourceAmount)}
                          </div>
                          <button
                            onClick={() => onUndoWindfall(wf.id)}
                            className="text-[10px] text-gray-400 hover:text-red-500 font-medium underline mt-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          >
                            Undo Allocation
                          </button>
                        </div>
                      </div>
                      {wf.distributions && wf.distributions.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-100/50 flex flex-wrap gap-1">
                          {wf.distributions.map((d, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-600"
                            >
                              {d.name}: ${d.amount.toFixed(0)}
                            </span>
                          ))}
                          {wf.unallocatedCash > 0.01 && (
                            <span className="text-[10px] bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-emerald-700 font-medium">
                              Vault: ${wf.unallocatedCash.toFixed(0)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Savings Goals mini-widget */}
        {savings.length > 0 && (
          <div className="glass-card p-4 md:p-6">
            <button
              className="w-full flex items-center justify-between"
              onClick={() => setSavingsOpen((o) => !o)}
              aria-expanded={savingsOpen}
            >
              <h2 className="text-base md:text-lg font-bold text-gray-900">
                Savings Goals
              </h2>
              <ChevronDown
                className={cn(
                  "w-4 h-4 text-gray-400 transition-transform",
                  savingsOpen && "rotate-180",
                )}
              />
            </button>

            {savingsOpen && (
              <div className="mt-4 space-y-4">
                {savings.map((s) => {
                  const pct =
                    s.targetAmount > 0
                      ? Math.min(
                          100,
                          ((s.currentAmount || 0) / s.targetAmount) * 100,
                        )
                      : 0;
                  const remaining = s.targetAmount - (s.currentAmount || 0);
                  const weeksLeft =
                    s.weeklyContribution > 0 && remaining > 0
                      ? Math.ceil(remaining / s.weeklyContribution)
                      : null;
                  return (
                    <div key={s.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-gray-800">
                          {s.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          ${(s.currentAmount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
                          / ${s.targetAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, backgroundColor: s.color || "#6366f1" }}
                        />
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-gray-400">
                          +${s.weeklyContribution.toFixed(2)}/wk
                          {s.isLocked && (
                            <span className="ml-1 text-amber-500">🔒</span>
                          )}
                        </span>
                        <div className="flex items-center gap-2">
                          {weeksLeft !== null && !( pct >= 100) && (
                            <span className="text-[10px] text-gray-400">
                              ~{weeksLeft} wks left
                            </span>
                          )}
                          {pct >= 100 ? (
                            <span className="text-[10px] font-bold text-green-600">
                              Complete!
                            </span>
                          ) : (
                            <button
                              onClick={() => onPaySavingsGoal(s.id)}
                              disabled={(s.weeklyContribution || 0) <= 0}
                              className="text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 hover:bg-blue-200 px-1.5 py-0.5 rounded transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-0.5"
                              title={`Add $${(s.weeklyContribution || 0).toFixed(2)} to this goal`}
                            >
                              <Plus className="w-2.5 h-2.5" /> Pay
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Allocation Chart */}
        <div className="glass-card p-4 md:p-6 flex flex-col h-[300px] md:h-[400px]">
          <div className="flex items-center justify-between mb-2 md:mb-6">
            <h2 className="text-base md:text-lg font-bold text-gray-900">
              Allocation Analytics
            </h2>
          </div>
          <div className="flex-1 min-h-0 relative -ml-4">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    wrapperStyle={{ fontSize: "12px" }}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center -mt-8 ml-4">
                <p className="text-gray-400 text-sm">Add data to see chart</p>
              </div>
            )}

            {chartData.length > 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none -mt-8 ml-4">
                <div className="text-center">
                  <span className="block text-[10px] md:text-xs text-gray-500 font-medium">
                    Net Income
                  </span>
                  <span className="block text-lg md:text-xl font-bold text-gray-900">
                    ${summary.totalNetIncome.toFixed(0)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
