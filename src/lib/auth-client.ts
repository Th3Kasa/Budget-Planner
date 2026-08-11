import { createAuthClient } from "better-auth/react";

// Same-origin: the API is served from /api/auth/* alongside the SPA, so no
// baseURL is needed. Session cookies are httpOnly and set by the server.
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;

/**
 * The slice of the session the app actually uses.
 *
 * Previously this was Supabase's `Session`. Components only ever read
 * `session.user.id` and `session.user.email`, so the local type keeps the
 * component signatures unchanged.
 */
export interface AppSession {
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
}

/**
 * useSession() narrowed to the shape the app uses.
 *
 * The generated client type depends on the server's auth config, which lives
 * outside the Vite program, so the inferred payload is not usable here. This
 * asserts the documented shape once, in one place, instead of at every call.
 */
export function useAppSession(): {
  session: AppSession | null;
  isPending: boolean;
} {
  const { data, isPending } = useSession() as unknown as {
    data: { user: { id: string; email: string; name?: string | null } } | null;
    isPending: boolean;
  };

  return {
    session: data?.user
      ? {
          user: {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name ?? null,
          },
        }
      : null,
    isPending,
  };
}
