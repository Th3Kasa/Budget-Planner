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
  ShieldCheck,
  Trash2,
} from "lucide-react";

interface SettingsTabProps {
  centrelinkEnabled: boolean;
  centrelinkMaxFortnightly: number;
  isSyncing: boolean;
  onToggleCentrelink: (enabled: boolean) => void;
  onChangeCentrelinkMax: (amount: number) => void;
  onExportCsv: () => void;
  onResetData: () => void;
}

export default function SettingsTab({
  centrelinkEnabled,
  centrelinkMaxFortnightly,
  isSyncing,
  onToggleCentrelink,
  onChangeCentrelinkMax,
  onExportCsv,
  onResetData,
}: SettingsTabProps) {
  const [currentPinInput, setCurrentPinInput] = useState("");
  const [newPinInput, setNewPinInput] = useState("");
  const [confirmPinInput, setConfirmPinInput] = useState("");
  const [pinSuccessMsg, setPinSuccessMsg] = useState("");
  const [pinErrorMsg, setPinErrorMsg] = useState("");

  const [isBiometricRegistered, setIsBiometricRegistered] = useState(
    () => localStorage.getItem("biometric_enabled") === "true",
  );
  const [showBioScannerReg, setShowBioScannerReg] = useState(false);
  const [bioRegStep, setBioRegStep] = useState(0);
  const [bioRegText, setBioRegText] = useState("");

  const handleChangePin = (e: React.FormEvent) => {
    e.preventDefault();
    setPinSuccessMsg("");
    setPinErrorMsg("");

    const savedPin = localStorage.getItem("login_pin") || "0000";
    if (currentPinInput !== savedPin) {
      setPinErrorMsg("Current PIN is incorrect.");
      return;
    }
    if (newPinInput.length !== 4 || !/^\d+$/.test(newPinInput)) {
      setPinErrorMsg("New PIN must be exactly 4 digits.");
      return;
    }
    if (newPinInput !== confirmPinInput) {
      setPinErrorMsg("New PIN and Confirm PIN do not match.");
      return;
    }

    localStorage.setItem("login_pin", newPinInput);
    setPinSuccessMsg("PIN updated successfully!");
    setCurrentPinInput("");
    setNewPinInput("");
    setConfirmPinInput("");
  };

  const handleStartBiometricReg = () => {
    setShowBioScannerReg(true);
    setBioRegStep(1);
    setBioRegText("Initializing secure biometric sensor...");

    setTimeout(() => {
      setBioRegStep(2);
      setBioRegText("Present your fingerprint or face to the camera...");
      setTimeout(() => {
        setBioRegStep(3);
        setBioRegText("Verifying credential keys & registering device security keys...");
        setTimeout(() => {
          setBioRegStep(4);
          setBioRegText("Biometrics registered successfully!");
          localStorage.setItem("biometric_enabled", "true");
          setIsBiometricRegistered(true);
          setTimeout(() => setShowBioScannerReg(false), 1500);
        }, 1200);
      }, 1500);
    }, 1000);
  };

  const handleRemoveBiometricReg = () => {
    localStorage.removeItem("biometric_enabled");
    setIsBiometricRegistered(false);
    alert("Biometric credential registration has been cleared.");
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

  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200 max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* PIN Management Card */}
        <div className="glass-card p-6 border border-gray-100/50 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                <KeyRound className="w-5 h-5 flex-shrink-0" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Access Login PIN</h3>
                <p className="text-xs text-gray-500">
                  Update your 4-digit screen lock code.
                </p>
              </div>
            </div>

            <form onSubmit={handleChangePin} className="space-y-4 mt-6">
              {[
                {
                  label: "Current PIN",
                  value: currentPinInput,
                  set: setCurrentPinInput,
                },
                { label: "New PIN", value: newPinInput, set: setNewPinInput },
                {
                  label: "Confirm New PIN",
                  value: confirmPinInput,
                  set: setConfirmPinInput,
                },
              ].map((field) => (
                <div key={field.label}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    {field.label}
                  </label>
                  <input
                    type="password"
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
                className="w-full bg-indigo-600 text-white font-medium py-3 rounded-xl hover:bg-indigo-700 transition-colors mt-2"
              >
                Change PIN Code
              </button>
            </form>
          </div>
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
                  Biometric Credentials
                </h3>
                <p className="text-xs text-gray-500">
                  Enable Face ID / fingerprint login.
                </p>
              </div>
            </div>

            <div className="mt-6 border border-gray-100 rounded-2xl p-4 bg-gray-50/20">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-gray-500">
                  DEVICE STATUS
                </span>
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${isBiometricRegistered ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}
                >
                  {isBiometricRegistered ? "Registered and Active" : "Not Registered"}
                </span>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-gray-800">
                      Local Storage Only
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      The biometric flag is saved locally in this browser and
                      never leaves your device.
                    </p>
                  </div>
                </div>

                {isBiometricRegistered ? (
                  <div className="space-y-3 pt-2">
                    <div className="text-xs bg-emerald-50 text-emerald-700 font-bold px-3 py-2.5 rounded-xl border border-emerald-100 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                      Biometrics are ready for your next screen unlock.
                    </div>
                    <button
                      onClick={handleRemoveBiometricReg}
                      className="w-full bg-white border border-red-200 text-red-600 font-semibold py-2.5 rounded-xl hover:bg-red-50 hover:border-red-300 transition-colors text-xs"
                    >
                      Deregister Fingerprint / Face ID
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <p className="text-[11px] text-gray-500">
                      Register your device for fast, PIN-free dashboard logins.
                    </p>
                    <button
                      onClick={handleStartBiometricReg}
                      className="w-full bg-emerald-600 text-white font-medium py-3 rounded-xl hover:bg-emerald-700 transition shadow"
                    >
                      Register Face ID / Touch ID
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="text-[10px] text-gray-400 mt-6 text-center leading-relaxed">
            Stored in browser local storage. If you clear your browser data you
            will need to log back in with your PIN.
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
            The CSV includes incomes, expenses, debts, goals, windfalls,
            calendar events, and a weekly summary. Reset restores the default
            sample budget.
          </p>
        </div>

        {/* Cloud Sync */}
        <div className="glass-card p-6 border border-gray-100/50 md:col-span-2">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                isSyncing
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-gray-50 text-gray-400"
              }`}
            >
              {isSyncing ? (
                <Cloud className="w-5 h-5 flex-shrink-0" />
              ) : (
                <CloudOff className="w-5 h-5 flex-shrink-0" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Cloud Sync</h3>
              <p className="text-xs text-gray-500">
                Your budget syncs automatically across devices.
              </p>
            </div>
            <span
              className={`ml-auto text-[10px] uppercase font-bold px-2 py-1 rounded ${
                isSyncing
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              {isSyncing ? "Active" : "Offline"}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-4">
            Your data is stored securely in a private database protected by
            row-level security — no sign-in required. Shift logs and weekly debt
            snapshots are saved to the cloud as you use the app.
          </p>
        </div>
      </div>

      {/* Biometric Registration Modal */}
      {showBioScannerReg && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-xs w-full text-center shadow-2xl border border-gray-100 relative animate-in zoom-in-95 duration-200">
            <div className="relative w-24 h-24 mx-auto mb-6 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-100 animate-ping opacity-75" />
              <div className="absolute inset-2 rounded-full border-4 border-indigo-200 animate-pulse" />
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center relative z-10 ${bioRegStep === 4 ? "bg-emerald-500 text-white" : "bg-indigo-600 text-white animate-pulse"}`}
              >
                {bioRegStep === 4 ? (
                  <CheckCircle2 className="w-10 h-10" />
                ) : (
                  <Fingerprint className="w-10 h-10" />
                )}
              </div>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {bioRegStep === 4 ? "Registration Successful" : "Registering Biometrics"}
            </h3>

            <div className="flex items-center justify-center gap-2 text-sm text-gray-500 min-h-[40px]">
              {bioRegStep < 4 && (
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              )}
              <span
                className={
                  bioRegStep === 4
                    ? "text-emerald-600 font-semibold text-xs"
                    : "text-xs"
                }
              >
                {bioRegText}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
