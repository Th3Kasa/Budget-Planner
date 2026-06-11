import React, { useState, useEffect } from 'react';
import { ArrowRight, Eye, EyeOff, Fingerprint, LockKeyhole } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || 'admin@bas-bp.vercel.app';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    setBiometricAvailable(
      typeof window !== 'undefined' &&
      'credentials' in navigator &&
      'PasswordCredential' in window,
    );
  }, []);

  const doSignIn = async (email: string, pw: string): Promise<boolean> => {
    const { error: err } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (err) {
      // Invalid credentials gets a friendly message; anything else (server /
      // config errors) is surfaced verbatim so problems aren't masked.
      setError(
        /invalid login credentials/i.test(err.message)
          ? 'Incorrect password. Please try again.'
          : err.message,
      );
      return false;
    }
    // Offer credentials to the browser's native manager (triggers biometric prompt on iOS/Android).
    if ('credentials' in navigator && 'PasswordCredential' in window) {
      try {
        const cred = new (window as any).PasswordCredential({
          id: email,
          password: pw,
          name: 'Budget Planner',
        });
        await navigator.credentials.store(cred);
      } catch {
        // Non-critical — ignore if not supported or user dismissed
      }
    }
    onLogin();
    return true;
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError('');
    await doSignIn(ADMIN_EMAIL, password);
    setLoading(false);
  };

  const handleBiometricLogin = async () => {
    if (!('credentials' in navigator) || loading) return;
    setError('');
    try {
      const cred = await navigator.credentials.get({
        password: true,
        mediation: 'required' as CredentialMediationRequirement,
      } as any);
      if (!cred || !('password' in (cred as any))) {
        setError('No saved credentials found. Please sign in with your password first.');
        return;
      }
      setLoading(true);
      const pc = cred as any;
      await doSignIn(pc.id, pc.password);
      setLoading(false);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        setError('Biometric authentication failed. Please use your password.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F4F9] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center text-white mb-6 shadow-xl shadow-indigo-200">
            <LockKeyhole className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome Back</h1>
          <p className="text-gray-500 mt-2 text-sm">Sign in to access your budget.</p>
        </div>

        <div className="bg-white/70 backdrop-blur-xl border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.04)] rounded-3xl p-8">
          <form onSubmit={handlePasswordSubmit} className="space-y-5">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Email</label>
              <input
                type="email"
                value={ADMIN_EMAIL}
                readOnly
                className="w-full bg-gray-100 border border-gray-200 rounded-xl py-3 px-4 text-gray-500 text-sm cursor-default"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter your password"
                  autoFocus
                  autoComplete="current-password"
                  className="w-full bg-gray-50/50 border border-gray-200 rounded-xl py-3 px-4 pr-12 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={!password || loading}
              className="w-full bg-indigo-600 text-white rounded-xl py-3.5 font-medium flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-200"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Sign In <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          {biometricAvailable && (
            <>
              <div className="my-6 flex items-center gap-4">
                <div className="h-px bg-gray-200 flex-1" />
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Or</span>
                <div className="h-px bg-gray-200 flex-1" />
              </div>

              <button
                type="button"
                onClick={handleBiometricLogin}
                disabled={loading}
                className="w-full bg-white border-2 border-gray-100 text-gray-700 rounded-xl py-3.5 font-medium flex items-center justify-center gap-2 hover:bg-gray-50 hover:border-gray-200 transition-all shadow-sm disabled:opacity-50"
              >
                <Fingerprint className="w-5 h-5 text-indigo-600" />
                Use Face ID / Fingerprint
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
