// Session guard for the API routes.
//
// Supabase enforced per-user access with row-level security: even a buggy query
// could not return another user's rows, because Postgres refused. Neon has no
// such backstop — the ownership check now lives entirely in application code.
//
// So: every route calls requireUserId() first, and every query filters on the
// id it returns. Never take a user id from the request body or query string.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth.js";

/**
 * Resolves the signed-in user's id, or writes a 401 and returns null.
 *
 *   const userId = await requireUserId(req, res);
 *   if (!userId) return;
 */
export async function requireUserId(
  req: VercelRequest,
  res: VercelResponse,
): Promise<string | null> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user?.id) {
      res.status(401).json({ error: "Not signed in" });
      return null;
    }

    return session.user.id;
  } catch (err) {
    console.error("Session lookup failed:", err);
    res.status(500).json({ error: "Session lookup failed" });
    return null;
  }
}

/** Rejects any method not in `allowed`, mirroring the shape of the other errors. */
export function methodNotAllowed(
  req: VercelRequest,
  res: VercelResponse,
  allowed: string[],
): boolean {
  if (allowed.includes(req.method ?? "")) return false;
  res.setHeader("Allow", allowed.join(", "));
  res.status(405).json({ error: `Method ${req.method} not allowed` });
  return true;
}

/** Narrows unknown thrown values to something loggable without leaking internals. */
export function fail(res: VercelResponse, context: string, err: unknown) {
  console.error(`${context}:`, err);
  res.status(500).json({ error: context });
}
