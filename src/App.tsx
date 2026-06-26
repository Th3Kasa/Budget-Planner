import React, { useState, useEffect } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import Dashboard from "./components/Dashboard";
import Login from "./components/Login";
import LockScreen from "./components/LockScreen";
import { isPinSet } from "./lib/auth";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // App-lock: locked on load only when the user has set a PIN. No PIN → never
  // locks, so existing users are unaffected.
  const [unlocked, setUnlocked] = useState(() => !isPinSet());

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (s && !s.user?.email) {
        // Sign out any stale anonymous session so the email-login gate is enforced.
        await supabase.auth.signOut();
        setSession(null);
      } else {
        setSession(s);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s && s.user?.email ? s : null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
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
          await supabase.auth.signOut();
          setUnlocked(true); // reset for the next session
        }}
      />
    );
  }

  return (
    <Dashboard
      session={session}
      onLogout={async () => {
        await supabase.auth.signOut();
      }}
    />
  );
}
