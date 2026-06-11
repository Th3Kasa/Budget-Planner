import React, { useState, useEffect } from "react";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  getDay,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  TrendingDown,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { IncomeStream, ShiftLog, WeeklySnapshot } from "../../types";

const WEEKS_PER_MONTH = 4.33;

const money = (v: number) =>
  v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

interface HistoryTabProps {
  totalNetIncome: number;
  totalExpenses: number;
  totalDebts: number;
  totalSavingsCont: number;
  weeklySurplus: number;
  incomes: IncomeStream[];
  session: Session | null;
}

export default function HistoryTab({
  totalNetIncome,
  totalExpenses,
  totalDebts,
  totalSavingsCont,
  weeklySurplus,
  incomes,
  session,
}: HistoryTabProps) {
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [shiftLogs, setShiftLogs] = useState<ShiftLog[]>([]);
  const [snapshots, setSnapshots] = useState<WeeklySnapshot[]>([]);

  const casualIncomes = incomes.filter((i) => i.type === "casual");

  const [showLogForm, setShowLogForm] = useState(false);
  const [logStreamId, setLogStreamId] = useState(casualIncomes[0]?.id ?? "");
  const [logHours, setLogHours] = useState("");
  const [logRate, setLogRate] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [isSavingLog, setIsSavingLog] = useState(false);

  const monthlySurplus = weeklySurplus * WEEKS_PER_MONTH;

  // Keep logStreamId pointing at a valid stream even if incomes list changes.
  useEffect(() => {
    if (casualIncomes.length === 0) return;
    const valid = casualIncomes.some((i) => i.id === logStreamId);
    if (!valid) setLogStreamId(casualIncomes[0].id);
  }, [casualIncomes, logStreamId]);

  // Pre-fill the hourly rate from the selected income stream.
  useEffect(() => {
    const stream = incomes.find((i) => i.id === logStreamId);
    if (stream?.hourlyRate) setLogRate(String(stream.hourlyRate));
  }, [logStreamId, incomes]);

  // Load shift logs and weekly snapshots from Supabase.
  useEffect(() => {
    if (!session?.user) return;
    const userId = session.user.id;
    let alive = true;
    Promise.all([
      supabase
        .from("shift_logs")
        .select("*")
        .eq("user_id", userId)
        .order("shift_date", { ascending: false }),
      supabase
        .from("weekly_snapshots")
        .select("*")
        .eq("user_id", userId)
        .order("week_starting", { ascending: true }),
    ]).then(([logsRes, snapsRes]) => {
      if (!alive) return;
      if (logsRes.error)
        console.error("Shift log load failed:", logsRes.error.message);
      else if (logsRes.data) setShiftLogs(logsRes.data as ShiftLog[]);
      if (snapsRes.error)
        console.error("Snapshot load failed:", snapsRes.error.message);
      else if (snapsRes.data) setSnapshots(snapsRes.data as WeeklySnapshot[]);
    });
    return () => {
      alive = false;
    };
  }, [session]);

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user || !logHours || !logRate) return;
    setIsSavingLog(true);

    const stream = incomes.find((i) => i.id === logStreamId);
    const { data, error } = await supabase
      .from("shift_logs")
      .insert({
        user_id: session.user.id,
        shift_date: selectedDate,
        income_stream_id: logStreamId,
        income_stream_name: stream?.name ?? "Shift",
        hours: Number(logHours),
        hourly_rate: Number(logRate),
        notes: logNotes || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to save shift:", error.message);
    } else if (data) {
      setShiftLogs((prev) => [data as ShiftLog, ...prev]);
      setLogHours("");
      setLogNotes("");
      setShowLogForm(false);
    }
    setIsSavingLog(false);
  };

  const handleDeleteShift = async (id: string) => {
    const { error } = await supabase.from("shift_logs").delete().eq("id", id);
    if (!error) setShiftLogs((prev) => prev.filter((l) => l.id !== id));
  };

  const daysWithLogs = new Set(shiftLogs.map((l) => l.shift_date));
  const selectedDayLogs = shiftLogs.filter(
    (l) => l.shift_date === selectedDate,
  );

  const weekTotal = (log: ShiftLog) => Number(log.hours) * Number(log.hourly_rate);

  // Commit Week tags auto-generated rows with a "[auto] ..." note. Payslip
  // markers carry their actuals as JSON; parse them so the calendar can show
  // gross/tax/net instead of an hours × rate line.
  const parsePayslipLog = (
    log: ShiftLog,
  ): { gross: number; tax: number; super: number } | null => {
    const prefix = "[auto] payslip ";
    const notes = log.notes ?? "";
    if (!notes.startsWith(prefix)) return null;
    try {
      const o = JSON.parse(notes.slice(prefix.length));
      return {
        gross: Number(o.gross) || 0,
        tax: Number(o.tax) || 0,
        super: Number(o.super) || 0,
      };
    } catch {
      return null;
    }
  };

  // Hide internal "[auto] ..." markers from the user-facing notes line.
  const displayNotes = (log: ShiftLog) => {
    const notes = log.notes ?? "";
    return notes.startsWith("[auto]") ? "" : notes;
  };

  const metricRows = [
    { label: "Total Net Income", weekly: totalNetIncome, cls: "text-emerald-600" },
    { label: "Expenses", weekly: totalExpenses, cls: "text-amber-600" },
    { label: "Debt Repayments", weekly: totalDebts, cls: "text-rose-600" },
    { label: "Savings Contributions", weekly: totalSavingsCont, cls: "text-blue-600" },
  ];

  const chartData = snapshots.map((s) => ({
    week: format(parseISO(s.week_starting), "d MMM"),
    balance: Number(Number(s.total_debt_balance).toFixed(2)),
  }));

  return (
    <div className="space-y-6">
      {/* Financial Log */}
      <div className="glass-card p-4 md:p-6 border border-white/60">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Financial Log</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 rounded-lg">
              <tr>
                <th className="px-6 py-4 rounded-tl-lg font-bold">Metric</th>
                <th className="px-6 py-4 font-bold text-right">Weekly</th>
                <th className="px-6 py-4 font-bold text-right">Monthly</th>
                <th className="px-6 py-4 rounded-tr-lg font-bold text-right">Yearly</th>
              </tr>
            </thead>
            <tbody>
              {metricRows.map((row) => (
                <tr key={row.label} className="bg-white border-b border-gray-100 shadow-sm">
                  <td className={`px-6 py-4 font-bold ${row.cls}`}>{row.label}</td>
                  <td className={`px-6 py-4 text-right font-semibold ${row.cls}`}>${money(row.weekly)}</td>
                  <td className={`px-6 py-4 text-right font-semibold ${row.cls}`}>${money(row.weekly * WEEKS_PER_MONTH)}</td>
                  <td className={`px-6 py-4 text-right font-semibold ${row.cls}`}>${money(row.weekly * 52)}</td>
                </tr>
              ))}
              <tr className="font-bold bg-gray-50/50">
                <td className="px-6 py-4 text-gray-900">Surplus / Deficit</td>
                <td className={`px-6 py-4 text-right ${weeklySurplus >= 0 ? "text-emerald-700" : "text-rose-700"}`}>${money(weeklySurplus)}</td>
                <td className={`px-6 py-4 text-right ${monthlySurplus >= 0 ? "text-emerald-700" : "text-rose-700"}`}>${money(monthlySurplus)}</td>
                <td className={`px-6 py-4 text-right ${weeklySurplus >= 0 ? "text-emerald-700" : "text-rose-700"}`}>${money(weeklySurplus * 52)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Shift Calendar */}
      <div className="glass-card p-4 md:p-6 border border-white/60">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-600" />
            Shift Calendar
          </h2>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCurrentMonthDate(subMonths(currentMonthDate, 1))}
              className="p-1 hover:bg-gray-100 rounded-lg transition"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <span className="font-semibold text-gray-800 min-w-[120px] text-center">
              {format(currentMonthDate, "MMMM yyyy")}
            </span>
            <button
              onClick={() => setCurrentMonthDate(addMonths(currentMonthDate, 1))}
              className="p-1 hover:bg-gray-100 rounded-lg transition"
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider py-2">
              {day}
            </div>
          ))}
          {Array.from({ length: getDay(startOfMonth(currentMonthDate)) }).map((_, i) => (
            <div key={"empty-" + i} className="p-2 md:p-4 rounded-xl bg-gray-50/30 border border-transparent" />
          ))}
          {eachDayOfInterval({
            start: startOfMonth(currentMonthDate),
            end: endOfMonth(currentMonthDate),
          }).map((date) => {
            const dateStr = format(date, "yyyy-MM-dd");
            const isCurrent = dateStr === selectedDate;
            const hasLog = daysWithLogs.has(dateStr);
            return (
              <div
                key={dateStr}
                onClick={() => {
                  setSelectedDate(dateStr);
                  setShowLogForm(false);
                  setLogHours("");
                  setLogNotes("");
                }}
                className={`p-1 md:p-2 rounded-xl border flex flex-col items-center justify-start min-h-[52px] md:min-h-[70px] transition-all cursor-pointer ${
                  isCurrent
                    ? "bg-indigo-50 border-indigo-300 shadow-sm"
                    : "bg-white/40 border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/20"
                }`}
              >
                <span className={`text-sm font-medium ${isCurrent ? "text-indigo-700" : "text-gray-700"}`}>
                  {format(date, "d")}
                </span>
                {hasLog && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1" />}
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-6 border-t border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800">
              {format(parseISO(selectedDate), "EEEE, MMMM do yyyy")}
            </h3>
            {casualIncomes.length > 0 && session?.user && (
              <button
                onClick={() => setShowLogForm((v) => !v)}
                className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition"
              >
                <Plus className="w-4 h-4" /> Log Shift
              </button>
            )}
          </div>

          {showLogForm && (
            <form
              onSubmit={handleSaveShift}
              className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-3 mb-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Income Stream
                  </label>
                  <select
                    value={logStreamId}
                    onChange={(e) => setLogStreamId(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-400 outline-none bg-white"
                  >
                    {casualIncomes.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Hourly Rate ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={logRate}
                    onChange={(e) => setLogRate(e.target.value)}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-400 outline-none"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Hours Worked
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={logHours}
                  onChange={(e) => setLogHours(e.target.value)}
                  placeholder="e.g. 7.5"
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-400 outline-none"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  placeholder="e.g. Overtime, 9am-5pm"
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-400 outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isSavingLog}
                  className="flex-1 bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  {isSavingLog ? "Saving..." : "Save Shift"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLogForm(false)}
                  className="px-4 py-2.5 text-sm text-gray-500 bg-gray-50 rounded-xl hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {selectedDayLogs.length === 0 && !showLogForm ? (
            <p className="text-sm text-gray-400 text-center py-4 italic">
              No shifts logged on this day.
            </p>
          ) : (
            <div className="space-y-2">
              {selectedDayLogs.map((log) => {
                const ps = parsePayslipLog(log);
                const note = displayNotes(log);
                return (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 md:p-4 bg-white rounded-xl border border-gray-100 shadow-sm"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                        {log.income_stream_name}
                        {ps && (
                          <span className="bg-indigo-100 text-indigo-700 text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wide">
                            Payslip
                          </span>
                        )}
                      </p>
                      {ps ? (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Gross ${money(ps.gross)} · Tax{" "}
                          <span className="text-rose-500">-${money(ps.tax)}</span>
                          {ps.super > 0 && <> · Super ${money(ps.super)}</>} ={" "}
                          <span className="font-bold text-emerald-600">
                            Net ${money(ps.gross - ps.tax)}
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {Number(log.hours)}h × ${money(Number(log.hourly_rate))}/hr ={" "}
                          <span className="font-bold text-emerald-600">
                            ${money(weekTotal(log))}
                          </span>
                          {note && (
                            <span className="ml-2 text-gray-400">· {note}</span>
                          )}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteShift(log.id)}
                      className="p-1.5 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition"
                      aria-label="Delete shift"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Debt Payoff Progress */}
      <div className="glass-card p-4 md:p-6 border border-white/60">
        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <TrendingDown className="w-5 h-5 text-indigo-600" />
          Debt Payoff Progress
        </h2>
        {chartData.length < 2 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            Not enough data yet — your debt balance chart appears after a few
            weeks of tracking.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} />
              <YAxis
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                tick={{ fontSize: 12 }}
                width={50}
              />
              <Tooltip
                formatter={(v) => [`$${money(Number(v))}`, "Total Debt"]}
              />
              <Line
                type="monotone"
                dataKey="balance"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
