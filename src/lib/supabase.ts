/// <reference types="vite/client" />
import { createClient } from "@supabase/supabase-js";

// The publishable key is safe to embed: data access is enforced by
// row-level security, and this key ships in the JS bundle regardless.
const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  "https://iwjdboupmrrfwuiwoyry.supabase.co";
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  "sb_publishable_Oz1_N9j4sX9-DQVYdLhoYA_05q2SMQ4";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 2,
    },
  },
});
