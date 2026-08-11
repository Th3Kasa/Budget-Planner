import React, { useState } from "react";
import Dashboard from "./components/Dashboard";
import Login from "./components/Login";
import LockScreen from "./components/LockScreen";
import { isPinSet } from "./lib/auth";
import { signOut, useAppSession } from "./lib/auth-client";

export default function App() {
  // Better Auth keeps the session in an httpOnly cookie and exposes it here.
  // The old code had to defend against stale anonymous sessions; anonymous
  // sign-in no longer exists, so a session always means a real account.
  const { session, isPending } = useAppSession();

  // App-lock: locked on load only when the user has set a PIN. No PIN → never
  // locks, so existing users are unaffected.
  const [unlocked, setUnlocked] = useState(() => !isPinSet());

  if (isPending) {
    return (
      <div className="min-h-screen bg-[#F3F4F9] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Login onLogin={() => {}} />;
  }

  if (!unlocked) {
    return (
      <LockScreen
        onUnlock={() => setUnlocked(true)}
        onSignOut={async () => {
          await signOut();
          setUnlocked(true); // reset for the next session
        }}
      />
    );
  }

  return (
    <Dashboard
      session={session}
      onLogout={async () => {
        await signOut();
      }}
    />
  );
}
