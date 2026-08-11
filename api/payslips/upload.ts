import type { VercelRequest, VercelResponse } from "@vercel/node";
import { put } from "@vercel/blob";
import { fail, methodNotAllowed, requireUserId } from "../_lib/guard.js";

// Raw PDF bytes arrive as the request body, so Vercel's JSON parsing is off.
export const config = { api: { bodyParser: false } };

const MAX_BYTES = 10 * 1024 * 1024; // matches the old Supabase bucket limit

/**
 * POST /api/payslips/upload?fileName=<name>
 * Body: the raw PDF. Returns { url } to store as the payslip's storage_path.
 *
 * Blob URLs get a random suffix, so they are unguessable, and the app never
 * hands them to the browser — downloads go through /api/payslips/download,
 * which checks ownership first.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (methodNotAllowed(req, res, ["POST"])) return;

  const userId = await requireUserId(req, res);
  if (!userId) return;

  const fileName =
    typeof req.query.fileName === "string" ? req.query.fileName : undefined;
  if (!fileName) {
    return res.status(400).json({ error: "fileName query param is required" });
  }

  try {
    const chunks: Buffer[] = [];
    let total = 0;

    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > MAX_BYTES) {
        return res.status(413).json({ error: "PDF exceeds the 10 MB limit" });
      }
      chunks.push(buf);
    }

    if (total === 0) return res.status(400).json({ error: "Empty body" });

    const body = Buffer.concat(chunks);
    if (body.subarray(0, 5).toString() !== "%PDF-") {
      return res.status(415).json({ error: "Body is not a PDF" });
    }

    // Pathname is namespaced by user id so one account's files can never
    // collide with another's.
    const blob = await put(`payslips/${userId}/${fileName}.pdf`, body, {
      access: "public",
      addRandomSuffix: true,
      contentType: "application/pdf",
    });

    return res.status(201).json({ url: blob.url });
  } catch (err) {
    return fail(res, "Failed to upload payslip PDF", err);
  }
}
