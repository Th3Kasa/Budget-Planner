import React, { useEffect, useState } from "react";
import { Fingerprint, LockKeyhole } from "lucide-react";
import {
  verifyPin,
  isBiometricRegistered,
  verifyBiometric,
} from "../lib/auth";

const LOCKOUT_MS = 30000;
const MAX_ATTEMPTS = 5;

// Privacy app-lock shown after the Supabase session is established but before
// the dashboard is revealed. Unlocks with the hashed PIN or a registered
// WebAuthn biometric. A sign-out escape means nobody can ever be trapped.
export default function LockScreen({
  onUnlock,
  onSignOut,
}: {
  onUnlock: () => void;
  onSignOut: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const bio = isBiometricRegistered();

  const locked = now < lockedUntil;
  const remaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [locked]);

  const submitPin = async (value: string) => {
    if (locked) return;
    if (await verifyPin(value)) {
      onUnlock();
      return;
    }
    const a = attempts + 1;
    setPin("");
    if (a >= MAX_ATTEMPTS) {
      setLockedUntil(Date.now() + LOCKOUT_MS);
      setAttempts(0);
      setError(`Too many attempts. Try again in ${LOCKOUT_MS / 1000}s.`);
    } else {
      setAttempts(a);
      setError(
        `Incorrect PIN. ${MAX_ATTEMPTS - a} attempt${MAX_ATTEMPTS - a === 1 ? "" : "s"} left.`,
      );
    }
  };

  const onChange = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    setPin(digits);
    setError("");
    if (digits.length === 4) submitPin(digits);
  };

  const tryBiometric = async () => {
    setError("");
    if (await verifyBiometric()) onUnlock();
    else setError("Biometric check failed — enter your PIN.");
  };

  // Prompt for biometric immediately if one is registered (expected app-lock UX).
  useEffect(() => {
    if (bio) tryBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[#F3F4F9] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center text-white mb-6 shadow-xl shadow-indigo-200">
            <LockKeyhole className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            App Locked
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            Enter your PIN to unlock your budget.
          </p>
        </div>

        <div className="bg-white/70 backdrop-blur-xl border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.04)] rounded-3xl p-8">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 text-center">
            4-digit PIN
          </label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoFocus
            disabled={locked}
            value={pin}
            onChange={(e) => onChange(e.target.value)}
            placeholder="••••"
            className="w-full text-center tracking-[0.6em] text-2xl font-bold px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
          />

          {error && (
            <p className="text-sm text-red-500 font-medium mt-3 text-center">
              {locked ? `Too many attempts. Try again in ${remaining}s.` : error}
            </p>
          )}

          {bio && (
            <button
              type="button"
              onClick={tryBiometric}
              disabled={locked}
              className="mt-5 w-full bg-white border-2 border-gray-100 text-gray-700 rounded-xl py-3.5 font-medium flex items-center justify-center gap-2 hover:bg-gray-50 hover:border-gray-200 transition-all shadow-sm disabled:opacity-50"
            >
              <Fingerprint className="w-5 h-5 text-indigo-600" />
              Use Face ID / Fingerprint
            </button>
          )}

          <button
            type="button"
            onClick={onSignOut}
            className="mt-5 w-full text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}
