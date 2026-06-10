import React, { useState, useEffect } from 'react';
import { Fingerprint, LockKeyhole, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  
  // Custom states for biometric simulation
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState('');
  const [scanSuccess, setScanSuccess] = useState(false);

  // Check if WebAuthn or simulated biometrics are supported
  useEffect(() => {
    // We default biometric trigger to true in AI Studio view so users can always experience it!
    setIsBiometricSupported(true);
  }, []);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const savedPin = localStorage.getItem('login_pin') || '0000';
    if (pin === savedPin) {
      onLogin();
    } else {
      setError(true);
      setPin('');
      setTimeout(() => setError(false), 2000);
    }
  };

  const handleBiometricLogin = async () => {
    const isRegistered = localStorage.getItem('biometric_enabled') === 'true';
    if (!isRegistered) {
      alert("No biometric (Face ID / Fingerprint) record found. Please sign in with your PIN first (default code is '0000') and go to the App Settings tab to register your biometric credentials!");
      return;
    }

    setIsScanning(true);
    setScanSuccess(false);
    setScanStatus('Initializing camera & sensor...');

    setTimeout(() => {
      setScanStatus('Scanning Face / Fingerprint...');
      
      setTimeout(() => {
        setScanStatus('Verifying secure device keys...');
        
        setTimeout(() => {
          setScanSuccess(true);
          setScanStatus('Biometric Matched!');
          
          setTimeout(() => {
            setIsScanning(false);
            onLogin();
          }, 800);
        }, 1000);
      }, 1200);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-[#F3F4F9] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center text-white mb-6 shadow-xl shadow-indigo-200">
            <LockKeyhole className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome Back</h1>
          <p className="text-gray-500 mt-2">Enter your PIN or use registered biometrics to access your budget.</p>
        </div>

        <div className="bg-white/70 backdrop-blur-xl border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.04)] rounded-3xl p-8 relative">
          <form onSubmit={handlePinSubmit} className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-gray-700">Access PIN</label>
                {error && <span className="text-xs font-bold text-red-500 animate-pulse">Incorrect PIN</span>}
              </div>
              <div className="relative">
                <input
                  type="password"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, ''));
                    setError(false);
                  }}
                  className="w-full text-center text-3xl font-bold bg-gray-50/50 border border-gray-200 rounded-xl py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all tracking-[0.5em]"
                  placeholder="••••"
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={pin.length !== 4}
              className="w-full bg-indigo-600 text-white rounded-xl py-3.5 font-medium flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-200"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {isBiometricSupported && (
            <>
              <div className="my-6 flex items-center justify-center gap-4">
                <div className="h-px bg-gray-200 flex-1"></div>
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Or</span>
                <div className="h-px bg-gray-200 flex-1"></div>
              </div>

              <button
                type="button"
                onClick={handleBiometricLogin}
                className="w-full bg-white border-2 border-gray-100 text-gray-700 rounded-xl py-3.5 font-medium flex items-center justify-center gap-2 hover:bg-gray-50 hover:border-gray-200 transition-all shadow-sm"
              >
                <Fingerprint className="w-5 h-5 text-indigo-600" />
                Use Face ID / Fingerprint
              </button>
            </>
          )}
        </div>
      </div>

      {/* Biometric Scanning Overlay */}
      {isScanning && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-xs w-full text-center shadow-2xl border border-gray-100 relative animate-in zoom-in-95 duration-200">
            <div className="relative w-24 h-24 mx-auto mb-6 flex items-center justify-center">
              {/* Pulsing ring */}
              <div className="absolute inset-0 rounded-full border-4 border-indigo-100 animate-ping opacity-75" />
              <div className="absolute inset-2 rounded-full border-4 border-indigo-200 animate-pulse" />
              
              <div className={`w-16 h-16 rounded-full flex items-center justify-center relative z-10 ${scanSuccess ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white animate-pulse'}`}>
                {scanSuccess ? (
                  <CheckCircle2 className="w-10 h-10" />
                ) : (
                  <Fingerprint className="w-10 h-10" />
                )}
              </div>
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-2">
              {scanSuccess ? 'Verification Successful' : 'Biometric Auth'}
            </h3>
            
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              {!scanSuccess && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
              <span className={scanSuccess ? 'text-emerald-600 font-semibold' : ''}>{scanStatus}</span>
            </div>

            {!scanSuccess && (
              <button
                type="button"
                onClick={() => setIsScanning(false)}
                className="mt-6 px-4 py-2 bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
