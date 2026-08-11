import type { VercelRequest, VercelResponse } from "@vercel/node";
import { and, eq } from "drizzle-orm";
import { db } from "../../src/lib/db/index.js";
import { payslips } from "../../src/lib/db/schema.js";
import { fail, methodNotAllowed, requireUserId } from "../_lib/guard.js";

/**
 * GET /api/payslips/download?id=<uuid>
 *
 * Streams the PDF back through the API rather than redirecting to the blob URL,
 * so the storage location is never exposed to the browser and ownership is
 * checked on every download. Replaces Supabase's createSignedUrl.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ["GET"])) return;

  const userId = await requireUserId(req, res);
  if (!userId) return;

  const id = typeof req.query.id === "string" ? req.query.id : undefined;
  if (!id) return res.status(400).json({ error: "id query param is required" });

  try {
    const [row] = await db
      .select({ url: payslips.storagePath, fileName: payslips.fileName })
      .from(payslips)
      .where(and(eq(payslips.id, id), eq(payslips.userId, userId)));

    if (!row) return res.status(404).json({ error: "Payslip not found" });
    if (!row.url) {
      return res.status(404).json({ error: "No PDF stored for this payslip" });
    }

    const upstream = await fetch(row.url);
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: "Stored PDF is unreachable" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${row.fileName.replace(/"/g, "")}.pdf"`,
    );
    res.setHeader("Cache-Control", "private, no-store");

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.status(200).send(buf);
  } catch (err) {
    return fail(res, "Failed to download payslip", err);
  }
}
