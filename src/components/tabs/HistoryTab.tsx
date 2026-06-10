import React, { useState } from "react";
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
  Edit2,
  Trash2,
} from "lucide-react";
import { CalendarEvent } from "../../types";

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
  calendarEvents: CalendarEvent[];
  onSaveEvent: (ev: CalendarEvent) => void;
  onDeleteEvent: (id: string) => void;
}

export default function HistoryTab({
  totalNetIncome,
  totalExpenses,
  totalDebts,
  totalSavingsCont,
  weeklySurplus,
  calendarEvents,
  onSaveEvent,
  onDeleteEvent,
}: HistoryTabProps) {
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [calTitle, setCalTitle] = useState("");
  const [calAmount, setCalAmount] = useState("");
  const [calType, setCalType] = useState<"income" | "expense">("expense");
  const [calIdToEdit, setCalIdToEdit] = useState<string | null>(null);

  const monthlySurplus = weeklySurplus * WEEKS_PER_MONTH;

  const resetForm = () => {
    setCalIdToEdit(null);
    setCalTitle("");
    setCalAmount("");
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!calTitle || !calAmount) return;
    onSaveEvent({
      id: calIdToEdit || Date.now().toString(),
      date: selectedDate,
      title: calTitle,
      amount: Number(calAmount),
      type: calType,
    });
    resetForm();
  };

  const handleEdit = (ev: CalendarEvent) => {
    setCalIdToEdit(ev.id);
    setSelectedDate(ev.date);
    setCalTitle(ev.title);
    setCalAmount(String(ev.amount));
    setCalType(ev.type);
  };

  const metricRows: {
    label: string;
    weekly: number;
    monthly?: number;
    cls: string;
  }[] = [
    {
      label: "Total Net Income",
      weekly: totalNetIncome,
      cls: "text-emerald-600",
    },
    { label: "Expenses", weekly: totalExpenses, cls: "text-amber-600" },
    { label: "Debt Repayments", weekly: totalDebts, cls: "text-rose-600" },
    {
      label: "Savings Contributions",
      weekly: totalSavingsCont,
      cls: "text-blue-600",
    },
  ];

  const selectedEvents = calendarEvents.filter((e) => e.date === selectedDate);

  return (
    <div className="space-y-6">
      <div className="glass-card p-4 md:p-6 border border-white/60">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Financial Log</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 rounded-lg">
              <tr>
                <th className="px-6 py-4 rounded-tl-lg font-bold">Metric</th>
                <th className="px-6 py-4 font-bold text-right">Weekly</th>
                <th className="px-6 py-4 font-bold text-right">Monthly</th>
                <th className="px-6 py-4 rounded-tr-lg font-bold text-right">
                  Yearly
                </th>
              </tr>
            </thead>
            <tbody>
              {metricRows.map((row) => (
                <tr
                  key={row.label}
                  className="bg-white border-b border-gray-100 shadow-sm"
                >
                  <td className={`px-6 py-4 font-bold ${row.cls}`}>
                    {row.label}
                  </td>
                  <td className={`px-6 py-4 text-right font-semibold ${row.cls}`}>
                    ${money(row.weekly)}
                  </td>
                  <td className={`px-6 py-4 text-right font-semibold ${row.cls}`}>
                    ${money(row.weekly * WEEKS_PER_MONTH)}
                  </td>
                  <td className={`px-6 py-4 text-right font-semibold ${row.cls}`}>
                    ${money(row.weekly * 52)}
                  </td>
                </tr>
              ))}
              <tr className="bg-white font-bold bg-gray-50/50">
                <td className="px-6 py-4 text-gray-900">Surplus / Deficit</td>
                <td
                  className={`px-6 py-4 text-right ${weeklySurplus >= 0 ? "text-emerald-700" : "text-rose-700"}`}
                >
                  ${money(weeklySurplus)}
                </td>
                <td
                  className={`px-6 py-4 text-right ${monthlySurplus >= 0 ? "text-emerald-700" : "text-rose-700"}`}
                >
                  ${money(monthlySurplus)}
                </td>
                <td
                  className={`px-6 py-4 text-right ${weeklySurplus >= 0 ? "text-emerald-700" : "text-rose-700"}`}
                >
                  ${money(weeklySurplus * 52)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-card p-4 md:p-6 border border-white/60">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-600" />
            Calendar View
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
            <div
              key={day}
              className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wider py-2"
            >
              {day}
            </div>
          ))}
          {Array.from({ length: getDay(startOfMonth(currentMonthDate)) }).map(
            (_, i) => (
              <div
                key={"empty-" + i}
                className="p-2 md:p-4 rounded-xl bg-gray-50/30 border border-transparent"
              />
            ),
          )}
          {eachDayOfInterval({
            start: startOfMonth(currentMonthDate),
            end: endOfMonth(currentMonthDate),
          }).map((date) => {
            const dateStr = format(date, "yyyy-MM-dd");
            const isCurrent = dateStr === selectedDate;
            const dayEvents = calendarEvents.filter((e) => e.date === dateStr);

            return (
              <div
                key={dateStr}
                onClick={() => {
                  setSelectedDate(dateStr);
                  resetForm();
                }}
                className={`p-1 md:p-2 rounded-xl border flex flex-col items-center justify-start min-h-[60px] md:min-h-[80px] transition-all cursor-pointer ${
                  isCurrent
                    ? "bg-indigo-50 border-indigo-300 shadow-sm"
                    : "bg-white/40 border-gray-200 hover:border-indigo-200 hover:bg-indigo-50/20 text-gray-700"
                }`}
              >
                <span
                  className={`text-sm font-medium ${isCurrent ? "text-indigo-700" : ""}`}
                >
                  {format(date, "d")}
                </span>
                <div className="flex flex-col w-full px-1 gap-0.5 mt-1">
                  {dayEvents.map((e) => (
                    <div
                      key={e.id}
                      className={`text-[9px] md:text-[10px] leading-tight truncate px-1 py-0.5 rounded flex items-center ${
                        e.type === "income"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {e.amount} {e.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-6 border-t border-gray-100">
          <h3 className="font-bold text-gray-800 mb-4 flex justify-between items-center">
            <span>
              Events for {format(parseISO(selectedDate), "MMMM do, yyyy")}
            </span>
            {calIdToEdit && (
              <button
                onClick={resetForm}
                className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100 transition-colors"
              >
                Cancel Edit
              </button>
            )}
          </h3>

          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 space-y-4">
              <form
                onSubmit={handleSave}
                className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4 relative"
              >
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCalType("expense")}
                    className={`flex-1 py-1.5 text-sm rounded-lg font-bold transition ${calType === "expense" ? "bg-rose-100 text-rose-700" : "text-gray-500 hover:bg-gray-50"}`}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalType("income")}
                    className={`flex-1 py-1.5 text-sm rounded-lg font-bold transition ${calType === "income" ? "bg-emerald-100 text-emerald-700" : "text-gray-500 hover:bg-gray-50"}`}
                  >
                    Income
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Title (e.g. Groceries)"
                  value={calTitle}
                  onChange={(e) => setCalTitle(e.target.value)}
                  className="w-full text-sm px-4 py-2 bg-gray-50 border-gray-200 border outline-none focus:border-indigo-400 focus:bg-white transition-colors rounded-xl"
                  required
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Amount"
                  value={calAmount}
                  onChange={(e) => setCalAmount(e.target.value)}
                  className="w-full text-sm px-4 py-2 bg-gray-50 border-gray-200 border outline-none focus:border-indigo-400 focus:bg-white transition-colors rounded-xl"
                  required
                />
                <button
                  type="submit"
                  className="w-full bg-indigo-600 text-white font-bold py-2 rounded-xl shadow-sm hover:shadow-md hover:bg-indigo-700 transition flex items-center justify-center text-sm"
                >
                  {calIdToEdit ? "Save Changes" : "Add Event"}
                </button>
              </form>
            </div>
            <div className="flex-1 space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {selectedEvents.length === 0 ? (
                <div className="text-sm text-gray-400 p-6 bg-white/50 border border-gray-100 rounded-2xl text-center italic">
                  No events on this day.
                </div>
              ) : (
                selectedEvents.map((e) => (
                  <div
                    key={e.id}
                    className="flex justify-between items-center p-3 md:p-4 rounded-xl border border-gray-100 bg-white shadow-sm group"
                  >
                    <div>
                      <div className="text-sm font-semibold text-gray-800">
                        {e.title}
                      </div>
                      <div
                        className={`text-xs font-bold mt-0.5 ${e.type === "income" ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        {e.type === "income" ? "+" : "-"}$
                        {Number(e.amount).toFixed(2)}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(e)}
                        className="p-1.5 text-gray-400 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg transition-colors"
                        aria-label="Edit event"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteEvent(e.id)}
                        className="p-1.5 text-gray-400 bg-gray-50 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"
                        aria-label="Delete event"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
