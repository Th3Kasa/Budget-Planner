import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Download,
  Fingerprint,
  KeyRound,
  Landmark,
  Loader2,
  Monitor,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  Trash2,
} from "lucide-react";
import { getTheme, setTheme, Theme } from "../../lib/theme";
import {
  isPinSet,
  setPin as savePin,
  verifyPin,
  clearPin,
  isWebAuthnAvailable,
  isBiometricRegistered,
  registerBiometric,
  clearBiometric,
} from "../../lib/auth";

interface SettingsTabProps {
  centrelinkEnabled: boolean;
  centrelinkMaxFortnightly: number;
  syncStatus: "offline" | "syncing" | "synced" | "error";
  onToggleCentrelink: (enabled: boolean) => void;
  onChangeCentrelinkMax: (amount: number) => void;
  onExportCsv: () => void;
  onResetData: () => void;
}

export default function SettingsTab({
  centrelinkEnabled,
  centrelinkMaxFortnightly,
  syncStatus,
  onToggleCentrelink,
  onChangeCentrelinkMax,
  onExportCsv,
  onResetData,
}: SettingsTabProps) {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const chooseTheme = (t: Theme) => {
    setThemeState(t);
    setTheme(t);
  };

  const [pinConfigured, setPinConfigured] = useState(() => isPinSet());
  const [currentPinInput, setCurrentPinInput] = useState("");
  const [newPinInput, setNewPinInput] = useState("");
  const [confirmPinInput, setConfirmPinInput] = useState("");
  const [pinSuccessMsg, setPinSuccessMsg] = useState("");
  const [pinErrorMsg, setPinErrorMsg] = useState("");
  const [pinBusy, setPinBusy] = useState(false);

  const bioAvailable = isWebAuthnAvailable();
  const [bioRegistered, setBioRegistered] = useState(() =>
    isBiometricRegistered(),
  );
  const [bioBusy, setBioBusy] = useState(false);
  const [bioError, setBioError] = useState("");

  const resetPinFields = () => {
    setCurrentPinInput("");
    setNewPinInput("");
    setConfirmPinInput("");
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinSuccessMsg("");
    setPinErrorMsg("");

    if (pinConfigured && !(await verifyPin(currentPinInput))) {
      setPinErrorMsg("Current PIN is incorrect.");
      return;
    }
    if (newPinInput.length !== 4 || !/^\d{4}$/.test(newPinInput)) {
      setPinErrorMsg("New PIN must be exactly 4 digits.");
      return;
    }
    if (newPinInput !== confirmPinInput) {
      setPinErrorMsg("New PIN and Confirm PIN do not match.");
      return;
    }

    setPinBusy(true);
    await savePin(newPinInput);
    setPinBusy(false);
    setPinConfigured(true);
    setPinSuccessMsg(
      "PIN saved. Your budget will be locked next time you open the app.",
    );
    resetPinFields();
  };

  const handleRemovePin = async () => {
    setPinSuccessMsg("");
    setPinErrorMsg("");
    if (!(await verifyPin(currentPinInput))) {
      setPinErrorMsg("Enter your current PIN to remove the lock.");
      return;
    }
    clearPin();
    clearBiometric(); // biometric only makes sense alongside a PIN
    setPinConfigured(false);
    setBioRegistered(false);
    setPinSuccessMsg("PIN lock removed.");
    resetPinFields();
  };

  const handleRegisterBiometric = async () => {
    setBioError("");
    setBioBusy(true);
    try {
      const ok = await registerBiometric("Budget Planner");
      if (ok) setBioRegistered(true);
      else setBioError("Registration was cancelled or isn't supported here.");
    } catch {
      setBioError("Couldn't register biometrics on this device.");
    } finally {
      setBioBusy(false);
    }
  };

  const handleRemoveBiometric = () => {
    clearBiometric();
    setBioRegistered(false);
  };

  const handleReset = () => {
    if (
      window.confirm(
        "Reset ALL budget data (incomes, expenses, debts, goals, windfalls)? This cannot be undone.",
      )
    ) {
      onResetData();
    }
  };

  const pinInputs: { label: string; value: string; set: (v: string) => void }[] =
    [
      ...(pinConfigured
        ? [
            {
              label: "Current PIN",
              value: currentPinInput,
              set: setCurrentPinInput,
            },
          ]
        : []),
      { label: "New PIN", value: newPinInput, set: setNewPinInput },
      {
        label: "Confirm New PIN",
        value: confirmPinInput,
        set: setConfirmPinInput,
      },
    ];

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200 max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Appearance */}
        <div className="glass-card p-6 border border-gray-100/50 md:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-violet-50 flex items-center justify-center text-violet-600">
              <Palette className="w-5 h-5 flex-shrink-0" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Appearance</h3>
              <p className="text-xs text-gray-500">
                Choose a light or dark theme, or follow your device.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-2">
            {(
              [
                { key: "light", label: "Light", icon: Sun },
                { key: "dark", label: "Dark", icon: Moon },
                { key: "system", label: "System", icon: Monitor },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                onClick={() => chooseTheme(opt.key)}
                className={`flex flex-col items-center justify-center gap-2 py-4 rounded-2xl border transition ${
                  theme === opt.key
                    ? "border-indigo-400 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-500/30"
                    : "border-gray-200 bg-white text-gray-600 hover:border-indigo-200 hover:text-indigo-600"
                }`}
              >
                <opt.icon className="w-5 h-5" />
                <span className="text-sm font-semibold">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* PIN Management Card */}
        <div className="glass-card p-6 border border-gray-100/50 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                <KeyRound className="w-5 h-5 flex-shrink-0" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">App-Lock PIN</h3>
                <p className="text-xs text-gray-500">
                  {pinConfigured
                    ? "Your budget is locked with a 4-digit PIN."
                    : "Set a 4-digit PIN to lock your budget."}
                </p>
              </div>
            </div>

            <form onSubmit={handleChangePin} className="space-y-4 mt-6">
              {pinInputs.map((field) => (
                <div key={field.label}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    {field.label}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    className="w-full text-center tracking-[0.5em] text-lg font-bold px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="••••"
                    value={field.value}
                    onChange={(e) =>
                      field.set(e.target.value.replace(/\D/g, ""))
                    }
                    required
                  />
                </div>
              ))}

              {pinErrorMsg && (
                <div className="text-xs bg-red-50 text-red-600 font-medium p-3 rounded-xl border border-red-100 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {pinErrorMsg}
                </div>
              )}
              {pinSuccessMsg && (
                <div className="text-xs bg-emerald-50 text-emerald-600 font-medium p-3 rounded-xl border border-emerald-100 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  {pinSuccessMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={pinBusy}
                className="w-full bg-indigo-600 text-white font-medium py-3 rounded-xl hover:bg-indigo-700 transition-colors mt-2 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {pinBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                {pinConfigured ? "Change PIN" : "Set PIN"}
              </button>
              {pinConfigured && (
                <button
                  type="button"
                  onClick={handleRemovePin}
                  className="w-full bg-white border border-red-200 text-red-600 font-semibold py-2.5 rounded-xl hover:bg-red-50 hover:border-red-300 transition text-xs"
                >
                  Remove PIN lock (enter current PIN above)
                </button>
              )}
            </form>
          </div>
          <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">
            Stored only on this device as a salted PBKDF2-SHA-256 hash — never in
            plain text, never uploaded.
          </p>
        </div>

        {/* Biometrics Management */}
        <div className="glass-card p-6 border border-gray-100/50 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                <Fingerprint className="w-5 h-5 flex-shrink-0" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">
                  Biometric Unlock
                </h3>
                <p className="text-xs text-gray-500">
                  Use Face ID / fingerprint to unlock.
                </p>
              </div>
            </div>

            <div className="mt-6 border border-gray-100 rounded-2xl p-4 bg-gray-50/20">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-gray-500">
                  DEVICE STATUS
                </span>
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${
                    bioRegistered
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {bioRegistered ? "Registered" : "Not Registered"}
                </span>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-gray-800">
                      Real WebAuthn credential
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Uses your device's platform authenticator. The credential
                      stays on this device and never leaves it.
                    </p>
                  </div>
                </div>

                {!bioAvailable ? (
                  <div className="text-xs bg-amber-50 text-amber-700 font-medium px-3 py-2.5 rounded-xl border border-amber-100">
                    This browser/device doesn't support biometric (WebAuthn)
                    unlock.
                  </div>
                ) : !pinConfigured ? (
                  <div className="text-xs bg-amber-50 text-amber-700 font-medium px-3 py-2.5 rounded-xl border border-amber-100">
                    Set an app-lock PIN first — biometrics unlock alongside it.
                  </div>
                ) : bioRegistered ? (
                  <div className="space-y-3 pt-2">
                    <div className="text-xs bg-emerald-50 text-emerald-700 font-bold px-3 py-2.5 rounded-xl border border-emerald-100 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                      Biometrics are ready for your next unlock.
                    </div>
                    <button
                      onClick={handleRemoveBiometric}
                      className="w-full bg-white border border-red-200 text-red-600 font-semibold py-2.5 rounded-xl hover:bg-red-50 hover:border-red-300 transition-colors text-xs"
                    >
                      Remove Face ID / Fingerprint
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    {bioError && (
                      <div className="text-xs bg-red-50 text-red-600 font-medium p-3 rounded-xl border border-red-100 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        {bioError}
                      </div>
                    )}
                    <button
                      onClick={handleRegisterBiometric}
                      disabled={bioBusy}
                      className="w-full bg-emerald-600 text-white font-medium py-3 rounded-xl hover:bg-emerald-700 transition shadow flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {bioBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                      Register Face ID / Touch ID
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="text-[10px] text-gray-400 mt-6 text-center leading-relaxed">
            Clearing your browser data removes the local PIN and biometric
            credential; you'll just sign in again with your password.
          </div>
        </div>

        {/* Income Settings */}
        <div className="glass-card p-6 border border-gray-100/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
              <Landmark className="w-5 h-5 flex-shrink-0" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Centrelink Payments</h3>
              <p className="text-xs text-gray-500">
                Include the Centrelink income-test top-up in your weekly budget.
              </p>
            </div>
          </div>

          <label className="flex items-center justify-between mt-6 p-4 border border-gray-100 rounded-2xl bg-gray-50/20 cursor-pointer">
            <span className="text-sm font-semibold text-gray-700">
              {centrelinkEnabled
                ? "Centrelink included in income"
                : "Centrelink excluded from income"}
            </span>
            <input
              type="checkbox"
              checked={centrelinkEnabled}
              onChange={(e) => onToggleCentrelink(e.target.checked)}
              className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
            />
          </label>

          {centrelinkEnabled && (
            <div className="mt-3 p-4 border border-gray-100 rounded-2xl bg-gray-50/20">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Maximum Fortnightly Payment ($)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={centrelinkMaxFortnightly}
                onChange={(e) =>
                  onChangeCentrelinkMax(Math.max(0, Number(e.target.value)))
                }
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold"
              />
              <p className="text-[11px] text-gray-400 mt-2">
                JobSeeker single (no children) is $808.70/fn from 20 March 2026.
                Rates are indexed every 20 March and 20 September — update this
                to match your own payment.
              </p>
            </div>
          )}

          <p className="text-[11px] text-gray-400 mt-3">
            Turn this off if you don't receive Centrelink payments — the
            estimated fortnightly payment will be removed from all income
            calculations and auto-allocation.
          </p>
        </div>

        {/* Data Management */}
        <div className="glass-card p-6 border border-gray-100/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
              <Download className="w-5 h-5 flex-shrink-0" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Data Management</h3>
              <p className="text-xs text-gray-500">
                Export a snapshot or start fresh.
              </p>
            </div>
          </div>

          <div className="space-y-3 mt-6">
            <button
              onClick={onExportCsv}
              className="w-full bg-indigo-600 text-white font-medium py-3 rounded-xl hover:bg-indigo-700 transition flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" /> Export Budget as CSV
            </button>
            <button
              onClick={handleReset}
              className="w-full bg-white border border-red-200 text-red-600 font-semibold py-3 rounded-xl hover:bg-red-50 hover:border-red-300 transition flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Reset All Budget Data
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-3">
            The CSV includes incomes, expenses, debts, goals, windfalls, and a
            weekly summary. Reset restores the default sample budget.
          </p>
        </div>

        {/* Cloud Sync */}
        <div className="glass-card p-6 border border-gray-100/50 md:col-span-2">
          {(() => {
            const ui = {
              synced: { label: "Synced", circle: "bg-emerald-50 text-emerald-600", chip: "bg-emerald-100 text-emerald-800" },
              syncing: { label: "Syncing…", circle: "bg-amber-50 text-amber-600", chip: "bg-amber-100 text-amber-800" },
              error: { label: "Sync error", circle: "bg-red-50 text-red-600", chip: "bg-red-100 text-red-800" },
              offline: { label: "Offline", circle: "bg-gray-50 text-gray-400", chip: "bg-gray-100 text-gray-500" },
            }[syncStatus];
            const online = syncStatus === "synced" || syncStatus === "syncing";
            return (
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${ui.circle}`}>
                  {syncStatus === "syncing" ? (
                    <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin" />
                  ) : online ? (
                    <Cloud className="w-5 h-5 flex-shrink-0" />
                  ) : (
                    <CloudOff className="w-5 h-5 flex-shrink-0" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Cloud Backup</h3>
                  <p className="text-xs text-gray-500">
                    {syncStatus === "error"
                      ? "Couldn't reach the cloud — changes are saved locally and will retry."
                      : "Your budget backs up to the cloud automatically."}
                  </p>
                </div>
                <span className={`ml-auto text-[10px] uppercase font-bold px-2 py-1 rounded ${ui.chip}`}>
                  {ui.label}
                </span>
              </div>
            );
          })()}
          <p className="text-[11px] text-gray-400 mt-4">
            Your data is stored securely in a private database protected by
            row-level security — no sign-in required. Shift logs and weekly debt
            snapshots are saved to the cloud as you use the app. Backup is tied
            to this browser; clearing browser data starts a fresh backup.
          </p>
        </div>
      </div>
    </div>
  );
}
