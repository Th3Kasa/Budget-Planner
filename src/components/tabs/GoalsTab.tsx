import React, { useState } from "react";
import { Edit2, GripVertical, Plus, RotateCcw, Star, Target, Trash2 } from "lucide-react";
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
import { SavingsGoal } from "../../types";

const money = (v: number) =>
  v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

interface GoalsTabProps {
  savings: SavingsGoal[];
  onEditGoal: (goal: SavingsGoal) => void;
  onRemoveGoal: (id: string) => void;
  onAddGoal: () => void;
  onUpdateSavingsWeight: (id: string, weight: number) => void;
  onResetSavingsWeight: (id: string) => void;
  onRecalculateSavings: () => void;
  onLockSavingsGoal: (id: string, amount: number) => void;
  onUnlockSavingsGoal: (id: string) => void;
  onPaySavingsGoal: (id: string) => void;
  onReorderSavings: (activeId: string, overId: string) => void;
}

function SortableGoalCard({
  id,
  children,
}: {
  id: string;
  children: (props: {
    dragHandleAttributes: ReturnType<typeof useSortable>["attributes"];
    dragHandleListeners: ReturnType<typeof useSortable>["listeners"];
  }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ dragHandleAttributes: attributes, dragHandleListeners: listeners })}
    </div>
  );
}

export default function GoalsTab({
  savings,
  onEditGoal,
  onRemoveGoal,
  onAddGoal,
  onUpdateSavingsWeight,
  onResetSavingsWeight,
  onRecalculateSavings,
  onLockSavingsGoal,
  onUnlockSavingsGoal,
  onPaySavingsGoal,
  onReorderSavings,
}: GoalsTabProps) {
  const [editingWeightId, setEditingWeightId] = useState<string | null>(null);
  const [editingWeightValue, setEditingWeightValue] = useState("");
  const [editingContribId, setEditingContribId] = useState<string | null>(null);
  const [editingContribValue, setEditingContribValue] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const isDone = (s: SavingsGoal) =>
    s.targetAmount > 0 && (s.currentAmount || 0) >= s.targetAmount;

  // The "active" priority goal = first incomplete priority goal in list order.
  const activePriorityId = savings.find(
    (s) => !s.isLocked && !isDone(s) && (s.priorityTier ?? 3) === 1,
  )?.id;

  // Rank label for waiting priority goals (2nd, 3rd, etc.)
  const priorityRank = (s: SavingsGoal): number => {
    let rank = 0;
    for (const g of savings) {
      if ((g.priorityTier ?? 3) !== 1) continue;
      rank++;
      if (g.id === s.id) return rank;
    }
    return rank;
  };

  const getSplitPct = (s: SavingsGoal): number => {
    if (isDone(s) || s.isLocked) return 0;
    const isPriority = (s.priorityTier ?? 3) === 1;

    if (isPriority) {
      if (s.id !== activePriorityId) return 0; // waiting its turn
      const generalNeedy = savings.some(
        (g) => !g.isLocked && !isDone(g) && (g.priorityTier ?? 3) !== 1,
      );
      return generalNeedy ? 70 : 100;
    }

    // General goal
    const generals = savings.filter(
      (g) => !g.isLocked && !isDone(g) && (g.priorityTier ?? 3) !== 1,
    );
    const totalW = generals.reduce((sum, g) => sum + (g.splitWeight || 1), 0);
    if (totalW <= 0) return 0;
    const myShare = Math.round(
      (activePriorityId ? 30 : 100) * ((s.splitWeight || 1) / totalW),
    );
    return myShare;
  };

  const totalSaved = savings.reduce((acc, s) => acc + (s.currentAmount || 0), 0);
  const weeklyRate = savings.reduce((acc, s) => acc + (s.weeklyContribution || 0), 0);

  const weeksLeft = (s: SavingsGoal): number => {
    if (!s.targetAmount || !s.weeklyContribution) return 0;
    const remaining = s.targetAmount - (s.currentAmount || 0);
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / s.weeklyContribution);
  };

  const goalsWithCountdown = savings.filter(
    (s) =>
      s.targetAmount > 0 &&
      s.weeklyContribution > 0 &&
      s.targetAmount > (s.currentAmount || 0),
  );
  const maxWeeks =
    goalsWithCountdown.length > 0
      ? Math.max(...goalsWithCountdown.map(weeksLeft))
      : 0;

  const goalIds = savings.map((s) => s.id);

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 border border-indigo-100/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-bl-full pointer-events-none" />
          <h3 className="text-sm font-medium text-gray-500">Total Goals Configured</h3>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-gray-900">{savings.length}</span>
            <span className="text-xs text-gray-500 font-medium">milestones</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">Active savings targets set</p>
        </div>

        <div className="glass-card p-6 border border-emerald-100/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-bl-full pointer-events-none" />
          <h3 className="text-sm font-medium text-gray-500">Total Saved Collectively</h3>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-emerald-600">${money(totalSaved)}</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">Accumulated across all targets</p>
        </div>

        <div className="glass-card p-6 border border-violet-100/50 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-bl-full pointer-events-none" />
          <h3 className="text-sm font-medium text-gray-500">All Goals Complete In</h3>
          <div className="mt-2 flex items-baseline gap-2">
            {maxWeeks > 0 ? (
              <>
                <span className="text-3xl font-extrabold text-violet-600">
                  {maxWeeks.toLocaleString()}
                </span>
                <span className="text-xs text-gray-500 font-medium">weeks</span>
              </>
            ) : (
              <span className="text-3xl font-extrabold text-gray-400">—</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            ${money(weeklyRate)}/wk total rate
            {maxWeeks > 0 && ` · ~${(maxWeeks / 52).toFixed(1)} yrs`}
          </p>
        </div>
      </div>

      {/* Goals list */}
      <div className="glass-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Your Savings Targets</h2>
            <p className="text-sm text-gray-500">
              Drag to set priority order. The top priority goal gets 70% of your savings pool.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRecalculateSavings}
              className="flex items-center justify-center gap-1.5 text-sm bg-white border border-gray-200 text-gray-600 font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-50 hover:text-indigo-600 hover:border-indigo-200 transition"
              title="Unlock all weekly contributions and rebalance based on current income"
            >
              <RotateCcw className="w-4 h-4 flex-shrink-0" /> Recalculate
            </button>
            <button
              onClick={onAddGoal}
              className="flex items-center justify-center gap-1.5 text-sm bg-indigo-600 text-white font-semibold px-4 py-2.5 rounded-xl hover:bg-indigo-700 transition"
            >
              <Plus className="w-4 h-4 flex-shrink-0" /> Add Savings Goal
            </button>
          </div>
        </div>

        {savings.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl">
            <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="font-bold text-gray-700">No Savings Goals Set</h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto mt-1 mb-4">
              Set milestones like emergency funds, home deposits, or custom savings projects.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e: DragEndEvent) => {
              const { active, over } = e;
              if (over && active.id !== over.id) {
                onReorderSavings(String(active.id), String(over.id));
              }
            }}
          >
            <SortableContext items={goalIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {savings.map((s) => {
                  const target = s.targetAmount || 0;
                  const current = s.currentAmount || 0;
                  const pct =
                    target > 0 ? Math.min(100, Math.max(0, (current / target) * 100)) : 0;
                  const done = isDone(s);
                  const isPriority = (s.priorityTier ?? 3) === 1;
                  const isActive = s.id === activePriorityId;
                  const rank = isPriority ? priorityRank(s) : 0;
                  const splitPct = getSplitPct(s);

                  return (
                    <SortableGoalCard key={s.id} id={s.id}>
                      {({ dragHandleAttributes, dragHandleListeners }) => (
                        <div
                          className={`p-5 rounded-2xl border transition relative group flex gap-3 ${
                            isActive
                              ? "bg-amber-50/60 border-amber-200"
                              : done
                              ? "bg-emerald-50/40 border-emerald-100"
                              : "bg-white/40 border-white/60 hover:bg-white/60"
                          }`}
                        >
                          {/* Drag handle */}
                          <button
                            {...dragHandleAttributes}
                            {...dragHandleListeners}
                            className="mt-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
                            aria-label="Drag to reorder"
                          >
                            <GripVertical className="w-4 h-4" />
                          </button>

                          <div className="flex-1 min-w-0">
                            {/* Header row */}
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow flex-shrink-0"
                                  style={{ backgroundColor: s.color || "#3b82f6" }}
                                >
                                  <Target className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <h3 className="font-bold text-gray-900 truncate">{s.name}</h3>
                                    {isPriority && !done && (
                                      <span
                                        className={`inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                          isActive
                                            ? "bg-amber-100 text-amber-700 border border-amber-300"
                                            : "bg-amber-50 text-amber-600 border border-amber-200"
                                        }`}
                                      >
                                        <Star className="w-2.5 h-2.5" />
                                        {isActive ? `P${rank} Active` : `P${rank}`}
                                      </span>
                                    )}
                                  </div>

                                  {/* Contribution + pool % */}
                                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                    {editingContribId === s.id ? (
                                      <span className="flex items-center gap-0.5">
                                        <span className="text-xs text-gray-500">$</span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          autoFocus
                                          value={editingContribValue}
                                          onChange={(e) => setEditingContribValue(e.target.value)}
                                          onBlur={() => {
                                            const v = Number(editingContribValue);
                                            if (editingContribValue !== "" && !isNaN(v) && v >= 0) {
                                              if (v === 0) onUnlockSavingsGoal(s.id);
                                              else onLockSavingsGoal(s.id, v);
                                            }
                                            setEditingContribId(null);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") e.currentTarget.blur();
                                            else if (e.key === "Escape") setEditingContribId(null);
                                          }}
                                          className="text-xs font-bold bg-transparent border-b border-indigo-500 outline-none w-14 text-center"
                                        />
                                        <span className="text-xs text-gray-500">/wk</span>
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingContribId(s.id);
                                          setEditingContribValue(
                                            s.weeklyContribution
                                              ? s.weeklyContribution.toFixed(2)
                                              : "",
                                          );
                                        }}
                                        className={`text-xs font-semibold px-1.5 py-0.5 rounded transition-colors ${
                                          s.isLocked
                                            ? "text-amber-700 bg-amber-50 hover:bg-amber-100"
                                            : "text-gray-500 bg-transparent hover:bg-gray-100"
                                        }`}
                                        title={
                                          s.isLocked
                                            ? "Manually locked — click to edit"
                                            : "Click to lock a specific amount"
                                        }
                                      >
                                        ${money(s.weeklyContribution || 0)}/wk
                                        {s.isLocked ? " 🔒" : " auto"}
                                      </button>
                                    )}
                                    {s.isLocked && editingContribId !== s.id && (
                                      <button
                                        type="button"
                                        onClick={() => onUnlockSavingsGoal(s.id)}
                                        className="p-0.5 text-gray-400 hover:text-indigo-600 transition-colors"
                                        title="Unlock — let engine auto-allocate"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                      </button>
                                    )}
                                    {!s.isLocked && (
                                      <>
                                        <span className="text-gray-300">·</span>
                                        {done ? (
                                          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                                            ✓ Funded
                                          </span>
                                        ) : isPriority && !isActive ? (
                                          <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                                            Waiting · #{rank}
                                          </span>
                                        ) : editingWeightId === s.id ? (
                                          <span className="flex items-center gap-0.5">
                                            <input
                                              type="number"
                                              min="0.1"
                                              step="1"
                                              autoFocus
                                              value={editingWeightValue}
                                              onChange={(e) =>
                                                setEditingWeightValue(e.target.value)
                                              }
                                              onBlur={() => {
                                                const v = Number(editingWeightValue);
                                                if (
                                                  editingWeightValue !== "" &&
                                                  !isNaN(v) &&
                                                  v > 0
                                                ) {
                                                  onUpdateSavingsWeight(s.id, v);
                                                }
                                                setEditingWeightId(null);
                                              }}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") e.currentTarget.blur();
                                                else if (e.key === "Escape")
                                                  setEditingWeightId(null);
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
                                              setEditingWeightValue(
                                                String(s.splitWeight || 1),
                                              );
                                            }}
                                            className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded hover:bg-indigo-100 transition-colors"
                                            title="Click to set split weight"
                                          >
                                            {splitPct}% of pool
                                          </button>
                                        )}
                                        {s.isManuallyWeighted &&
                                          editingWeightId !== s.id &&
                                          !done &&
                                          !isPriority && (
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

                              {/* Edit / delete */}
                              <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex items-center gap-1 transition flex-shrink-0">
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
                            </div>

                            {/* Progress */}
                            <div className="flex justify-between items-end text-sm mb-1.5">
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

                            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden shadow-inner">
                              <div
                                className="h-2.5 rounded-full transition-all duration-1000 ease-out"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: s.color || "#3b82f6",
                                }}
                              />
                            </div>

                            {weeksLeft(s) > 0 && (
                              <p className="text-xs text-gray-400 mt-1.5">
                                • {weeksLeft(s).toLocaleString()} weeks left
                                <span className="text-gray-300 mx-1">·</span>
                                ~{(weeksLeft(s) / 52).toFixed(1)} yrs
                              </p>
                            )}

                            {/* Pay button */}
                            <div className="mt-3 border-t border-gray-100/60 pt-3 flex justify-end">
                              <button
                                onClick={() => onPaySavingsGoal(s.id)}
                                disabled={pct >= 100 || (s.weeklyContribution || 0) <= 0}
                                className="text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                                title={`Add $${(s.weeklyContribution || 0).toFixed(2)} to saved amount`}
                              >
                                <Plus className="w-3 h-3" /> Pay
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </SortableGoalCard>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
