import React, { useState, useEffect } from 'react';
import { signInWithPopup, signOut, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import Dashboard from './components/Dashboard';
import Login from './components/Login';

export default function App() {
  const [isAuthenticatedLocal, setIsAuthenticatedLocal] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    const session = localStorage.getItem('budget_auth_session');
    if (session === 'valid') setIsAuthenticatedLocal(true);
  }, []);

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
    } catch (error: any) {
      console.error("Google sign-in error:", error);
      const code = error?.code ?? "unknown";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
      if (code === "auth/unauthorized-domain") {
        alert(`Google sign-in blocked: this domain is not authorised in your Firebase project.\n\nFix: Firebase Console → Authentication → Settings → Authorised domains → add "${window.location.hostname}"`);
      } else if (code === "auth/operation-not-allowed") {
        alert("Google sign-in is not enabled.\n\nFix: Firebase Console → Authentication → Sign-in method → enable Google.");
      } else {
        alert(`Sign-in failed (${code}). Check the browser console for details.`);
      }
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen bg-[#F3F4F9] flex items-center justify-center">
        <div className="animate-pulse text-indigo-600 font-bold">Loading secure environment...</div>
      </div>
    );
  }

  if (!isAuthenticatedLocal) {
    return <Login onLogin={handleLocalLogin} />;
  }

  return (
    <Dashboard
      firebaseUser={firebaseUser}
      onGoogleLogin={handleGoogleLogin}
      onGoogleLogout={handleGoogleLogout}
      onLogout={() => {
        setIsAuthenticatedLocal(false);
        localStorage.removeItem('budget_auth_session');
      }}
    />
  );
}
