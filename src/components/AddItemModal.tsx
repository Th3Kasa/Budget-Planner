import React, { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Upload, X } from "lucide-react";
import {
  parsePayslip,
  payslipFileName,
  type ParsedPayslip,
} from "../lib/payslip/parsePayslip";

export type ItemType = "expense" | "savings" | "debt" | "income";

export interface ShiftFields {
  day: string;
  hours: string;
  travelAllowance: string;
  mealAllowance: string;
  overtimeHours: string;
  overtimeRate: string;
}

export interface NewItemFields {
  name: string;
  amount: string;
  frequency: "weekly" | "monthly"; // expenses only
  targetAmount: string;
  currentAmount: string;
  totalBalance: string;
  category: string;
  type: string;
  isCash: boolean;
  hourlyRate: string;
  hoursWorked: string;
  useShifts: boolean;
  shifts: ShiftFields[];
  priorityTier: string; // "1" | "2" | "3" — only used for savings goals
  grossPay: string; // payslip income only
  taxWithheld: string; // payslip income only
  superAmount: string; // payslip income only
  paymentDate: string; // payslip income only — ISO yyyy-MM-dd
  payPeriodStart: string; // payslip income only — ISO yyyy-MM-dd
  payPeriodEnd: string; // payslip income only — ISO yyyy-MM-dd
}

const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const emptyItemFields = (): NewItemFields => ({
  name: "",
  amount: "",
  frequency: "weekly",
  targetAmount: "",
  currentAmount: "",
  totalBalance: "",
  category: "General",
  type: "casual",
  isCash: false,
  hourlyRate: "",
  hoursWorked: "",
  useShifts: false,
  priorityTier: "3",
  grossPay: "",
  taxWithheld: "",
  superAmount: "",
  paymentDate: "",
  payPeriodStart: "",
  payPeriodEnd: "",
  shifts: DAYS.map((day) => ({
    day,
    hours: "",
    travelAllowance: "",
    mealAllowance: "",
    overtimeHours: "",
    overtimeRate: "",
  })),
});

const TYPE_LABELS: Record<ItemType, string> = {
  expense: "Expense",
  debt: "Debt",
  income: "Income Stream",
  savings: "Savings Goal",
};

interface AddItemModalProps {
  itemType: ItemType;
  isEditing: boolean;
  initialFields: NewItemFields;
  onClose: () => void;
  onSubmit: (fields: NewItemFields) => void;
  onPayslipArchive?: (fields: NewItemFields, file: File | null) => void;
}

export default function AddItemModal({
  itemType,
  isEditing,
  initialFields,
  onClose,
  onSubmit,
  onPayslipArchive,
}: AddItemModalProps) {
  const [item, setItem] = useState<NewItemFields>(initialFields);
  const [parsing, setParsing] = useState(false);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedPayslip | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const set = (patch: Partial<NewItemFields>) =>
    setItem((prev) => ({ ...prev, ...patch }));

  // Upload a payslip PDF, extract its text with pdf.js (lazy-loaded), and
  // pre-fill the form for the user to review and tweak.
  const handlePayslipUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setParsing(true);
    setParseErr(null);
    try {
      const { extractPdfLines } = await import("../lib/payslip/extractPdf");
      const lines = await extractPdfLines(file);
      const r = parsePayslip(lines);
      if (r.gross == null && r.net == null) throw new Error("nothing recognised");
      setPdfFile(file);
      setParsed(r);
      setItem((prev) => ({
        ...prev,
        name: r.employer || prev.name,
        grossPay: r.gross != null ? String(r.gross) : prev.grossPay,
        taxWithheld: r.tax != null ? String(r.tax) : prev.taxWithheld,
        superAmount: r.super != null ? String(r.super) : prev.superAmount,
        paymentDate: r.paymentDate || "",
        payPeriodStart: r.periodStart || "",
        payPeriodEnd: r.periodEnd || "",
      }));
    } catch {
      setParseErr(
        "Couldn't read this payslip automatically. Enter the figures manually below.",
      );
    } finally {
      setParsing(false);
    }
  };

  const setShift = (i: number, key: keyof ShiftFields, value: string) => {
    setItem((prev) => {
      const shifts = prev.shifts.map((s, idx) =>
        idx === i ? { ...s, [key]: value } : s,
      );
      return { ...prev, shifts };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item.name) return;
    // Savings goals don't require a weekly contribution (engine auto-allocates)
    if (itemType !== "income" && itemType !== "savings" && !item.amount) return;
    if (itemType === "income") {
      if (item.type === "fixed" && !item.amount) return;
      if (item.type === "payslip" && !item.grossPay) return;
      if (
        item.type === "casual" &&
        !item.useShifts &&
        !item.hourlyRate &&
        !item.amount
      )
        return;
    }
    onSubmit(item);
    if (itemType === "income" && item.type === "payslip") {
      onPayslipArchive?.(item, pdfFile);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <X className="w-5 h-5 flex-shrink-0" />
        </button>
        <h2 className="text-xl font-bold mb-6 text-gray-900">
          {isEditing ? "Edit" : "Add New"} {TYPE_LABELS[itemType]}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              required
              value={item.name}
              onChange={(e) => set({ name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder={
                itemType === "income"
                  ? "e.g., Target, Uber"
                  : itemType === "expense"
                    ? "e.g., Netflix, Gym"
                    : "e.g., New Laptop"
              }
            />
          </div>

          {itemType === "income" ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Income Type
                </label>
                <select
                  value={item.type}
                  onChange={(e) => set({ type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="casual">Casual (Hourly)</option>
                  <option value="fixed">Fixed (Weekly)</option>
                  <option value="payslip">Payslip (This Week's Actuals)</option>
                </select>
              </div>
              {item.type === "payslip" ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Upload Payslip PDF{" "}
                      <span className="text-gray-400 font-normal">
                        (auto-fills the fields)
                      </span>
                    </label>
                    <label
                      className={`flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed rounded-xl cursor-pointer transition ${
                        parsing
                          ? "border-indigo-300 bg-indigo-50/50 text-indigo-500"
                          : "border-gray-300 text-gray-600 hover:border-indigo-400 hover:bg-indigo-50/30"
                      }`}
                    >
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        disabled={parsing}
                        onChange={handlePayslipUpload}
                      />
                      {parsing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Reading
                          payslip…
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" /> Choose a PDF
                        </>
                      )}
                    </label>
                    {parseErr && (
                      <p className="text-xs text-amber-600 mt-2 flex items-start gap-1">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        {parseErr}
                      </p>
                    )}
                    {parsed && !parseErr && (
                      <div className="mt-2 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2.5 text-xs space-y-1">
                        <p className="flex items-center gap-1 font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          Read successfully — review &amp; tweak below
                        </p>
                        {(parsed.periodStart || parsed.paymentDate) && (
                          <p className="text-gray-500">
                            {parsed.periodStart && parsed.periodEnd && (
                              <>
                                Period {parsed.periodStart} → {parsed.periodEnd}
                              </>
                            )}
                            {parsed.paymentDate && (
                              <> · Paid {parsed.paymentDate}</>
                            )}
                          </p>
                        )}
                        <p className="text-gray-500">
                          Stored as:{" "}
                          <span className="font-mono text-gray-700">
                            {payslipFileName(
                              parsed.employer,
                              parsed.periodStart,
                            )}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-px flex-1 bg-gray-100" />
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                      or enter manually
                    </span>
                    <span className="h-px flex-1 bg-gray-100" />
                  </div>
                  <p className="text-xs text-gray-500 -mt-1">
                    Figures are taken straight off your payslip for this week —
                    tax and super are used as-is, no estimating. Logged against
                    the current week only.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Gross Pay ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={item.grossPay}
                      onChange={(e) => set({ grossPay: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Before tax, e.g. 1240.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tax Withheld ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.taxWithheld}
                      onChange={(e) => set({ taxWithheld: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="PAYG on the slip, e.g. 210.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Super ($){" "}
                      <span className="text-gray-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.superAmount}
                      onChange={(e) => set({ superAmount: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="e.g. 148.80"
                    />
                  </div>
                  {item.grossPay && (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5 text-sm">
                      <span className="text-gray-600">Net this week: </span>
                      <span className="font-bold text-emerald-700">
                        $
                        {(
                          Number(item.grossPay) - (Number(item.taxWithheld) || 0)
                        ).toFixed(2)}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {item.type === "casual" ? "Hourly Rate ($)" : "Weekly Amount ($)"}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required={!(item.type === "casual" && item.useShifts)}
                      value={item.type === "casual" ? item.hourlyRate : item.amount}
                      onChange={(e) =>
                        set(
                          item.type === "casual"
                            ? { hourlyRate: e.target.value }
                            : { amount: e.target.value },
                        )
                      }
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="0.00"
                    />
                  </div>
              {item.type === "casual" && (
                <>
                  <div className="flex items-center gap-2 mt-4 mb-2">
                    <input
                      type="checkbox"
                      id="useShiftsCheckbox"
                      checked={item.useShifts}
                      onChange={(e) => set({ useShifts: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                    />
                    <label
                      htmlFor="useShiftsCheckbox"
                      className="text-sm font-medium text-gray-700 cursor-pointer"
                    >
                      Enter detailed shifts (Mon-Sun)
                    </label>
                  </div>

                  {item.useShifts ? (
                    <div className="max-h-64 overflow-y-auto pr-2 space-y-4 border border-gray-200 rounded-xl p-3 bg-gray-50/50">
                      {item.shifts.map((shift, i) => (
                        <div
                          key={shift.day}
                          className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm space-y-2"
                        >
                          <h4 className="font-bold text-xs text-gray-700 uppercase tracking-wider">
                            {shift.day}
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {(
                              [
                                ["hours", "Base Hours", "Hours"],
                                ["overtimeHours", "OT Hours", "OT Hours"],
                                ["overtimeRate", "OT Rate ($)", "$"],
                                ["travelAllowance", "Travel Allow ($)", "$"],
                                ["mealAllowance", "Meal Allow ($)", "$"],
                              ] as [keyof ShiftFields, string, string][]
                            ).map(([key, label, placeholder]) => (
                              <div key={key}>
                                <label className="text-[10px] font-medium text-gray-500">
                                  {label}
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={shift[key]}
                                  onChange={(e) =>
                                    setShift(i, key, e.target.value)
                                  }
                                  className="w-full text-xs px-2 py-1 border border-gray-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                                  placeholder={placeholder}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1 mt-2">
                        Total Hours Worked (Weekly)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        value={item.hoursWorked}
                        onChange={(e) => set({ hoursWorked: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="e.g. 20"
                      />
                    </div>
                  )}
                </>
              )}
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="isCashCheckbox"
                  checked={item.isCash}
                  onChange={(e) => set({ isCash: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                />
                <label
                  htmlFor="isCashCheckbox"
                  className="text-sm font-medium text-gray-700"
                >
                  Paid in cash (Untaxed)
                </label>
              </div>
                </>
              )}
            </>
          ) : (
            <>
              {itemType === "expense" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Frequency
                  </label>
                  <div className="flex rounded-xl overflow-hidden border border-gray-200">
                    {(["weekly", "monthly"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => set({ frequency: f })}
                        className={`flex-1 py-2 text-sm font-semibold transition ${
                          item.frequency === f
                            ? "bg-indigo-600 text-white"
                            : "bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {itemType === "savings"
                    ? "Weekly Contribution ($)"
                    : itemType === "expense"
                      ? `${item.frequency === "monthly" ? "Monthly" : "Weekly"} Amount ($)`
                      : "Weekly Amount ($)"}
                  {itemType === "savings" && (
                    <span className="text-gray-400 font-normal ml-1">(Optional — auto-allocated if blank)</span>
                  )}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required={itemType !== "savings"}
                  value={item.amount}
                  onChange={(e) => set({ amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="0.00"
                />
                {itemType === "expense" && item.frequency === "monthly" && item.amount && (
                  <p className="text-xs text-gray-500 mt-1">
                    ≈ ${(Number(item.amount) / (52 / 12)).toFixed(2)}/wk in budget
                  </p>
                )}
              </div>
              {itemType === "debt" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total Balance ($){" "}
                    <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.totalBalance}
                    onChange={(e) => set({ totalBalance: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="e.g. 5000"
                  />
                </div>
              )}
              {itemType === "savings" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 mt-2">
                      Savings Priority
                    </label>
                    <select
                      value={item.priorityTier}
                      onChange={(e) => set({ priorityTier: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      <option value="3">General — equal split with other goals</option>
                      <option value="1">High Priority — 70% of savings pool while active</option>
                      <option value="2">Secondary Priority — 100% after High Priority is complete</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 mt-2">
                      Target Amount ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      value={item.targetAmount}
                      onChange={(e) => set({ targetAmount: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="e.g. 10000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 mt-2">
                      Total Saved ($){" "}
                      <span className="text-gray-400 font-normal">
                        (Current Amount)
                      </span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.currentAmount}
                      onChange={(e) => set({ currentAmount: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="e.g. 2000"
                    />
                  </div>
                </>
              )}
            </>
          )}

          {itemType === "expense" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                value={item.category}
                onChange={(e) => set({ category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                <option value="General">General</option>
                <option value="Housing">Housing</option>
                <option value="Transport">Transport</option>
                <option value="Food/Dining">Food/Dining</option>
                <option value="Health">Health</option>
                <option value="Entertainment">Entertainment</option>
              </select>
            </div>
          )}
          <button
            type="submit"
            className="w-full bg-indigo-600 text-white font-medium py-3 rounded-xl mt-6 hover:bg-indigo-700 transition"
          >
            {isEditing ? "Save " : "Add "}
            {itemType === "income" ? "Income" : TYPE_LABELS[itemType].split(" ")[0]}
          </button>
        </form>
      </div>
    </div>
  );
}
