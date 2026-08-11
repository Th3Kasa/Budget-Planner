// Better Auth server instance. Server-only — nothing under api/_lib is routed
// by Vercel (leading underscore) and nothing here may be imported from src/,
// since it reads DATABASE_URL and the signing secret.

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../../src/lib/db/index.js";
import * as schema from "../../src/lib/db/schema.js";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  emailAndPassword: {
    enabled: true,
    // No mail provider is wired up, so requiring verification would lock the
    // only account out. Revisit if this app ever has more than one user.
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days, matching the old Supabase session
    updateAge: 60 * 60 * 24, // refresh the cookie at most once a day
  },
});
