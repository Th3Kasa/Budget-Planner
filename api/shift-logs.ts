import type { VercelRequest, VercelResponse } from "@vercel/node";
import { and, between, desc, eq, like } from "drizzle-orm";
import { db } from "../src/lib/db/index.js";
import { shiftLogs } from "../src/lib/db/schema.js";
import { fail, methodNotAllowed, requireUserId } from "./_lib/guard.js";

/**
 * GET    /api/shift-logs            -> { logs } newest first
 * POST   /api/shift-logs            -> insert one log, returns the created row
 * PUT    /api/shift-logs            -> commit-week: replace this week's "[auto]"
 *                                      rows with a fresh set (idempotent)
 * DELETE /api/shift-logs?id=<uuid>  -> delete one of the caller's logs
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ["GET", "POST", "PUT", "DELETE"])) return;

  const userId = await requireUserId(req, res);
  if (!userId) return;

  /* ------------------------------------------------------------------ list */

  if (req.method === "GET") {
    try {
      const logs = await db
        .select()
        .from(shiftLogs)
        .where(eq(shiftLogs.userId, userId))
        .orderBy(desc(shiftLogs.shiftDate));
      return res.status(200).json({ logs });
    } catch (err) {
      return fail(res, "Failed to load shift logs", err);
    }
  }

  /* ---------------------------------------------------------------- insert */

  if (req.method === "POST") {
    const b = req.body as Record<string, unknown> | undefined;
    if (!b?.shift_date || !b?.income_stream_id) {
      return res
        .status(400)
        .json({ error: "shift_date and income_stream_id are required" });
    }

    try {
      const [row] = await db
        .insert(shiftLogs)
        .values({
          // userId comes from the session, never from the body.
          userId,
          shiftDate: String(b.shift_date),
          incomeStreamId: String(b.income_stream_id),
          incomeStreamName: String(b.income_stream_name ?? "Shift"),
          hours: String(b.hours ?? 0),
          hourlyRate: String(b.hourly_rate ?? 0),
          notes: b.notes == null ? null : String(b.notes),
        })
        .returning();
      return res.status(201).json({ log: row });
    } catch (err) {
      return fail(res, "Failed to save shift", err);
    }
  }

  /* ---------------------------------------------------------- commit week */

  if (req.method === "PUT") {
    const { weekStart, weekEnd, rows } = (req.body ?? {}) as {
      weekStart?: string;
      weekEnd?: string;
      rows?: Record<string, unknown>[];
    };

    if (!weekStart || !weekEnd || !Array.isArray(rows)) {
      return res
        .status(400)
        .json({ error: "Body must be { weekStart, weekEnd, rows[] }" });
    }

    try {
      // Idempotent: clear this week's auto-committed rows so pressing commit
      // twice never stacks duplicates. Manually logged shifts (notes without
      // the "[auto]" marker) are left alone.
      //
      // Neon's HTTP driver has no interactive transactions, so the delete and
      // insert are separate round trips. A failure between them leaves the week
      // cleared but not repopulated — pressing commit again fixes it, which is
      // why the operation is built to be idempotent in the first place.
      await db
        .delete(shiftLogs)
        .where(
          and(
            eq(shiftLogs.userId, userId),
            between(shiftLogs.shiftDate, weekStart, weekEnd),
            like(shiftLogs.notes, "[auto]%"),
          ),
        );

      if (rows.length > 0) {
        await db.insert(shiftLogs).values(
          rows.map((r) => ({
            userId,
            shiftDate: String(r.shift_date),
            incomeStreamId: String(r.income_stream_id),
            incomeStreamName: String(r.income_stream_name ?? "Shift"),
            hours: String(r.hours ?? 0),
            hourlyRate: String(r.hourly_rate ?? 0),
            notes: r.notes == null ? null : String(r.notes),
          })),
        );
      }

      return res.status(200).json({ ok: true, inserted: rows.length });
    } catch (err) {
      return fail(res, "Failed to commit week", err);
    }
  }

  /* ---------------------------------------------------------------- delete */

  const id = typeof req.query.id === "string" ? req.query.id : undefined;
  if (!id) return res.status(400).json({ error: "id query param is required" });

  try {
    // The userId predicate is what stops one account deleting another's rows.
    // The old Supabase call deleted by id alone and leaned on RLS for this.
    const deleted = await db
      .delete(shiftLogs)
      .where(and(eq(shiftLogs.id, id), eq(shiftLogs.userId, userId)))
      .returning({ id: shiftLogs.id });

    if (deleted.length === 0) {
      return res.status(404).json({ error: "Shift log not found" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    return fail(res, "Failed to delete shift", err);
  }
}
