import type { VercelRequest, VercelResponse } from "@vercel/node";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/index.js";
import { budgets } from "../src/lib/db/schema.js";
import { fail, methodNotAllowed, requireUserId } from "./_lib/guard.js";

/**
 * GET  /api/budget  -> { state } | { state: null }
 * PUT  /api/budget  -> upsert the caller's budget state
 *
 * One row per user, enforced by the unique constraint on user_id.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ["GET", "PUT"])) return;

  const userId = await requireUserId(req, res);
  if (!userId) return;

  if (req.method === "GET") {
    try {
      const [row] = await db
        .select({ state: budgets.state })
        .from(budgets)
        .where(eq(budgets.userId, userId));
      return res.status(200).json({ state: row?.state ?? null });
    } catch (err) {
      return fail(res, "Failed to load budget", err);
    }
  }

  const state = (req.body as { state?: unknown } | undefined)?.state;
  if (state === undefined || state === null || typeof state !== "object") {
    return res.status(400).json({ error: "Body must be { state: object }" });
  }

  try {
    await db
      .insert(budgets)
      .values({
        userId,
        state: state as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: budgets.userId,
        set: { state: state as Record<string, unknown>, updatedAt: new Date() },
      });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return fail(res, "Failed to save budget", err);
  }
}
