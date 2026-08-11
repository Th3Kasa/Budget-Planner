import type { VercelRequest, VercelResponse } from "@vercel/node";
import { del } from "@vercel/blob";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../src/lib/db/index.js";
import { payslips } from "../src/lib/db/schema.js";
import { fail, methodNotAllowed, requireUserId } from "./_lib/guard.js";

/**
 * GET    /api/payslips            -> { payslips } newest week first
 * PUT    /api/payslips            -> upsert one payslip record
 * DELETE /api/payslips?id=<uuid>  -> delete the record and its stored PDF
 *
 * The PDF itself is uploaded separately by /api/payslips/upload, which returns
 * the blob URL that gets stored here as storage_path.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ["GET", "PUT", "DELETE"])) return;

  const userId = await requireUserId(req, res);
  if (!userId) return;

  if (req.method === "GET") {
    try {
      const rows = await db
        .select()
        .from(payslips)
        .where(eq(payslips.userId, userId))
        .orderBy(desc(payslips.weekStarting));
      return res.status(200).json({ payslips: rows });
    } catch (err) {
      return fail(res, "Failed to load payslips", err);
    }
  }

  if (req.method === "PUT") {
    const b = req.body as Record<string, unknown> | undefined;
    if (!b?.week_starting || !b?.file_name) {
      return res
        .status(400)
        .json({ error: "week_starting and file_name are required" });
    }

    const num = (v: unknown) =>
      v == null || v === "" ? null : String(Number(v));
    const str = (v: unknown) => (v == null || v === "" ? null : String(v));

    const values = {
      employer: str(b.employer),
      paymentDate: str(b.payment_date),
      periodStart: str(b.period_start),
      periodEnd: str(b.period_end),
      grossPay: num(b.gross_pay),
      taxWithheld: num(b.tax_withheld),
      superAmount: num(b.super_amount),
      netPay: num(b.net_pay),
      storagePath: str(b.storage_path),
    };

    try {
      await db
        .insert(payslips)
        .values({
          userId,
          weekStarting: String(b.week_starting),
          fileName: String(b.file_name),
          ...values,
        })
        .onConflictDoUpdate({
          target: [payslips.userId, payslips.weekStarting, payslips.fileName],
          set: values,
        });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return fail(res, "Failed to save payslip", err);
    }
  }

  /* ---------------------------------------------------------------- delete */

  const id = typeof req.query.id === "string" ? req.query.id : undefined;
  if (!id) return res.status(400).json({ error: "id query param is required" });

  try {
    // Scoped by userId as well as id — deleting by id alone would let any
    // signed-in account remove another's payslip.
    const [row] = await db
      .delete(payslips)
      .where(and(eq(payslips.id, id), eq(payslips.userId, userId)))
      .returning({ storagePath: payslips.storagePath });

    if (!row) return res.status(404).json({ error: "Payslip not found" });

    // Best-effort blob cleanup: the record is already gone, so a failure here
    // leaves an orphaned file rather than a broken UI.
    if (row.storagePath?.startsWith("http")) {
      try {
        await del(row.storagePath);
      } catch (blobErr) {
        console.error("Blob delete failed (record removed):", blobErr);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return fail(res, "Failed to delete payslip", err);
  }
}
