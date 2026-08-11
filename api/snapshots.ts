import type { VercelRequest, VercelResponse } from "@vercel/node";
import { asc, eq } from "drizzle-orm";
import { db } from "../src/lib/db/index.js";
import { weeklySnapshots } from "../src/lib/db/schema.js";
import { fail, methodNotAllowed, requireUserId } from "./_lib/guard.js";

/**
 * GET /api/snapshots -> { snapshots } oldest first, for the payoff chart
 * PUT /api/snapshots -> upsert the snapshot for one week
 *
 * Unique on (user_id, week_starting), so re-running a week overwrites it.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ["GET", "PUT"])) return;

  const userId = await requireUserId(req, res);
  if (!userId) return;

  if (req.method === "GET") {
    try {
      const snapshots = await db
        .select()
        .from(weeklySnapshots)
        .where(eq(weeklySnapshots.userId, userId))
        .orderBy(asc(weeklySnapshots.weekStarting));
      return res.status(200).json({ snapshots });
    } catch (err) {
      return fail(res, "Failed to load snapshots", err);
    }
  }

  const b = req.body as Record<string, unknown> | undefined;
  if (!b?.week_starting) {
    return res.status(400).json({ error: "week_starting is required" });
  }

  const num = (v: unknown) => (v == null ? null : String(v));

  try {
    await db
      .insert(weeklySnapshots)
      .values({
        userId,
        weekStarting: String(b.week_starting),
        netIncome: num(b.net_income),
        totalDebtBalance: num(b.total_debt_balance),
        totalPaidThisWeek: num(b.total_paid_this_week),
      })
      .onConflictDoUpdate({
        target: [weeklySnapshots.userId, weeklySnapshots.weekStarting],
        set: {
          netIncome: num(b.net_income),
          totalDebtBalance: num(b.total_debt_balance),
          totalPaidThisWeek: num(b.total_paid_this_week),
        },
      });
    return res.status(200).json({ ok: true });
  } catch (err) {
    return fail(res, "Failed to save snapshot", err);
  }
}
