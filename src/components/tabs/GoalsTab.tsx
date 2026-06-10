import React, { useState } from "react";
import { Edit2, Plus, RotateCcw, Target, Trash2, Wallet } from "lucide-react";
import { SavingsGoal } from "../../types";

const money = (v: number) =>
  v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

interface GoalsTabProps {
  savings: SavingsGoal[];
  cashBalance: number;
  onAllocateFromVault: (goalId: string, amount: number) => void;
  onEditGoal: (goal: SavingsGoal) => void;
  onRemoveGoal: (id: string) => void;
  onAddGoal: () => void;
  onUpdateSavingsWeight: (id: string, weight: number) => void;
  onResetSavingsWeight: (id: string) => void;
}

export default function GoalsTab({
  savings,
  cashBalance,
  onAllocateFromVault,
  onEditGoal,
  onRemoveGoal,
  onAddGoal,
  onUpdateSavingsWeight,
  onResetSavingsWeight,
}: GoalsTabProps) {
  const [allocatingGoalId, setAllocatingGoalId] = useState<string | null>(null);
  const [allocationAmount, setAllocationAmount] = useState("");
  const [editingWeightId, setEditingWeightId] = useState<string | null>(null);
  const [editingWeightValue, setEditingWeightValue] = useState("");

  // Unlocked goals share the auto-allocation pool; compute each goal's actual %
  const unlockedGoals = savings.filter((s) => !s.isLocked);
  const totalWeight = unlockedGoals.reduce((sum, s) => sum + (s.splitWeight || 1), 0);
  const getSplitPct = (s: SavingsGoal) =>
    totalWeight > 0
      ? Math.round(((s.splitWeight || 1) / totalWeight) * 100)
      : 100;

  const totalSaved = savings.reduce((acc, s) => acc + (s.currentAmount || 0), 0);
  const weeklyRate = savings.reduce(
    (acc, s) => acc + (s.weeklyContribution || 0),
    0,
  );

  const handleTransfer = (goalId: string) => {
    const amt = Number(allocationAmount);
    if (isNaN(amt) || amt <= 0) return;
    if (amt > cashBalance) {
      alert("Insufficient funds in Cash Vault!");
      return;
    }
    const goal = savings.find((s) => s.id === goalId);
    if (goal && goal.targetAmount > 0) {
      const remaining = goal.targetAmount - (goal.currentAmount || 0);
      if (amt > remaining) {
        alert(`That would overshoot the target. Maximum you can add is $${remaining.toFixed(2)}.`);
        return;
      }
    }
    onAllocateFromVault(goalId, amt);
    setAllocatingGoalId(null);
    setAllocationAmount("");
  };

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 border border-indigo-100/50 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-full pointer-events-none" />
          <h3 className="text-sm font-medium text-gray-500">
            Total Goals Configured
          </h3>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-gray-900">
              {savings.length}
            </span>
            <span className="text-xs text-gray-500 font-medium">milestones</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">Active savings targets set</p>
        </div>

        <div className="glass-card p-6 border border-emerald-100/50 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full pointer-events-none" />
          <h3 className="text-sm font-medium text-gray-500">
            Total Saved Collectively
          </h3>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-600">
              ${money(totalSaved)}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Accumulated across all targets
          </p>
        </div>

        <div className="glass-card p-6 border border-indigo-100/50 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-full pointer-events-none" />
          <h3 className="text-sm font-medium text-gray-500">
            Weekly Savings Rate
          </h3>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-indigo-600">
              ${money(weeklyRate)}
            </span>
            <span className="text-xs text-gray-500 font-medium">/wk</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Allocations committed per week
          </p>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Your Savings Targets
            </h2>
            <p className="text-sm text-gray-500">
              Monitor completion rates and allocate extra Cash Vault balance.
            </p>
          </div>
          <button
            onClick={onAddGoal}
            className="flex items-center justify-center gap-1.5 text-sm bg-indigo-600 text-white font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition"
          >
            <Plus className="w-4 h-4 flex-shrink-0" /> Add Savings Goal
          </button>
        </div>

        {savings.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl">
            <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="font-bold text-gray-700">No Savings Goals Set</h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto mt-1 mb-4">
              Set milestones like emergency funds, home deposits, or custom
              savings projects.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {savings.map((s) => {
              const target = s.targetAmount || 0;
              const current = s.currentAmount || 0;
              const pct =
                target > 0
                  ? Math.min(100, Math.max(0, (current / target) * 100))
                  : 0;

              return (
                <div
                  key={s.id}
                  className="p-5 rounded-2xl bg-white/40 border border-white/60 hover:bg-white/60 transition relative group flex flex-col justify-between"
                >
                  <div className="absolute right-4 top-4 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex items-center gap-1.5 transition">
                    <button
                      onClick={() => onEditGoal(s)}
                      className="p-1 px-1.5 bg-white shadow-sm border border-gray-100 text-gray-400 hover:text-indigo-600 rounded-lg transition"
                      aria-label="Edit goal"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onRemoveGoal(s.id)}
                      className="p-1 px-1.5 bg-white shadow-sm border border-gray-100 text-gray-400 hover:text-rose-600 rounded-lg transition"
                      aria-label="Delete goal"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow flex-shrink-0"
                        style={{ backgroundColor: s.color || "#3b82f6" }}
                      >
                        <Target className="w-5 h-5 flex-shrink-0" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-gray-900 truncate">{s.name}</h3>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <p className="text-xs text-gray-500">
                            ${money(s.weeklyContribution || 0)}/wk auto
                          </p>
                          {!s.isLocked && (
                            <>
                              <span className="text-gray-300">·</span>
                              {editingWeightId === s.id ? (
                                <span className="flex items-center gap-0.5">
                                  <input
                                    type="number"
                                    min="0.1"
                                    step="1"
                                    autoFocus
                                    value={editingWeightValue}
                                    onChange={(e) => setEditingWeightValue(e.target.value)}
                                    onBlur={() => {
                                      const v = Number(editingWeightValue);
                                      if (editingWeightValue !== "" && !isNaN(v) && v > 0) {
                                        onUpdateSavingsWeight(s.id, v);
                                      }
                                      setEditingWeightId(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") e.currentTarget.blur();
                                      else if (e.key === "Escape") setEditingWeightId(null);
                                    }}
                                    className="text-xs font-bold bg-transparent border-b border-indigo-500 outline-none w-10 text-center"
                                  />
                                  <span className="text-xs text-gray-500">wt</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingWeightId(s.id);
                                    setEditingWeightValue(String(s.splitWeight || 1));
                                  }}
                                  className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded hover:bg-indigo-100 transition-colors"
                                  title="Click to set split weight"
                                >
                                  {getSplitPct(s)}% split
                                </button>
                              )}
                              {s.isManuallyWeighted && editingWeightId !== s.id && (
                                <button
                                  type="button"
                                  onClick={() => onResetSavingsWeight(s.id)}
                                  className="p-0.5 text-gray-400 hover:text-indigo-600 transition-colors"
                                  title="Reset to equal split"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-end text-sm mb-2">
                      <div>
                        <span className="text-lg font-bold text-gray-900">
                          ${money(current)}
                        </span>
                        <span className="text-xs text-gray-500 ml-1">
                          saved of ${money(target)}
                        </span>
                      </div>
                      <span className="font-bold text-indigo-600 text-xs">
                        {pct.toFixed(0)}%
                      </span>
                    </div>

                    <div className="w-full bg-gray-100 rounded-full h-3 mb-4 overflow-hidden shadow-inner">
                      <div
                        className="h-3 rounded-full transition-all duration-1000 ease-out"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: s.color || "#3b82f6",
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-2 border-t border-gray-100/60 pt-4">
                    {allocatingGoalId === s.id ? (
                      <div className="flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-150">
                        <span className="text-xs text-gray-500 font-bold block whitespace-nowrap">
                          From Vault: $
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="Amount"
                          value={allocationAmount}
                          onChange={(e) => setAllocationAmount(e.target.value)}
                          autoFocus
                        />
                        <button
                          onClick={() => handleTransfer(s.id)}
                          className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition"
                        >
                          Transfer
                        </button>
                        <button
                          onClick={() => setAllocatingGoalId(null)}
                          className="px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-200 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-400">
                          Cash Vault:{" "}
                          <b className="font-bold text-gray-600">
                            ${cashBalance.toFixed(2)}
                          </b>{" "}
                          available
                        </span>
                        <button
                          onClick={() => {
                            setAllocatingGoalId(s.id);
                            setAllocationAmount("");
                          }}
                          disabled={cashBalance <= 0}
                          className="text-xs font-bold uppercase tracking-wider bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                        >
                          <Wallet className="w-3.5 h-3.5 flex-shrink-0" /> Add
                          Vault Cash
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
