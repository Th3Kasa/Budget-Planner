import React, { useState, useEffect } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import Dashboard from "./components/Dashboard";
import Login from "./components/Login";

export default function App() {
  const [isAuthenticatedLocal, setIsAuthenticatedLocal] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const savedSession = localStorage.getItem("budget_auth_session");
    if (savedSession === "valid") setIsAuthenticatedLocal(true);
  }, []);

  useEffect(() => {
    // Restore an existing anonymous session or create a new one.
    // Cloud sync is best-effort: the app works offline if this fails.
    supabase.auth
      .getSession()
      .then(async ({ data: { session: existing } }) => {
        if (existing) {
          setSession(existing);
        } else {
          const { data, error } = await supabase.auth.signInAnonymously();
          if (error) console.error("Anonymous sign-in failed:", error.message);
          setSession(data.session);
        }
      })
      .catch((err) => console.error("Supabase auth error:", err));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const handleLocalLogin = () => {
    setIsAuthenticatedLocal(true);
    localStorage.setItem("budget_auth_session", "valid");
  };

  if (!isAuthenticatedLocal) {
    return <Login onLogin={handleLocalLogin} />;
  }

  return (
    <Dashboard
      session={session}
      onLogout={() => {
        setIsAuthenticatedLocal(false);
        localStorage.removeItem("budget_auth_session");
      }}
    />
  );
}
