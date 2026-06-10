import React, { useState, useEffect } from 'react';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import Dashboard from './components/Dashboard';
import Login from './components/Login';
import { ShieldCheck, CloudIcon } from 'lucide-react';

export default function App() {
  const [isAuthenticatedLocal, setIsAuthenticatedLocal] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Check local storage for existing session
  useEffect(() => {
    const session = localStorage.getItem('budget_auth_session');
    if (session === 'valid') {
      setIsAuthenticatedLocal(true);
    }
  }, []);

  // Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setIsLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLocalLogin = () => {
    setIsAuthenticatedLocal(true);
    localStorage.setItem('budget_auth_session', 'valid');
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error signing in with Google: ", error);
      alert("Failed to sign in. Please try again.");
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-[#F3F4F9] flex items-center justify-center">
        <div className="animate-pulse text-indigo-600 font-bold">Loading secure environment...</div>
      </div>
    );
  }

  // If no Firebase user, prompt to sign in with Google for cloud sync
  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-[#F3F4F9] flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />

        <div className="w-full max-w-sm relative z-10 text-center">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl mx-auto flex items-center justify-center text-white mb-6 shadow-xl shadow-indigo-200">
            <CloudIcon className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Cloud Sync</h1>
          <p className="text-gray-500 mt-3 mb-8">Sign in with Google to securely sync your budget across your phone, tablet, and computer.</p>

          <button
            onClick={handleGoogleLogin}
            className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl py-4 font-bold flex items-center justify-center gap-3 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // User is authenticated with Google but not locally unlocked
  if (!isAuthenticatedLocal) {
    return <Login onLogin={handleLocalLogin} />;
  }

  return (
    <Dashboard 
      firebaseUser={firebaseUser} 
      onLogout={() => {
        setIsAuthenticatedLocal(false);
        localStorage.removeItem('budget_auth_session');
      }} 
    />
  );
}
