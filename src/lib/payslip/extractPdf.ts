// Browser-side PDF text extraction via pdf.js. Kept in its own module so it
// can be lazy-loaded (pdf.js is large) only when a user actually uploads a
// payslip, keeping it out of the main bundle.
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
// Vite resolves this to a hashed URL for the worker script.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

// Extract the PDF's text as visual lines: items sharing a y-position are
// joined left-to-right, and lines run top-to-bottom. This mirrors how a
// person reads the slip, which is what the parser's heuristics expect.
export async function extractPdfLines(file: File): Promise<string[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const lines: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const byRow = new Map<number, [number, string][]>();

    for (const item of content.items) {
      const it = item as { str: string; transform: number[] };
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const x = Math.round(it.transform[4]);
      const row = byRow.get(y) ?? [];
      row.push([x, it.str]);
      byRow.set(y, row);
    }

    const ys = [...byRow.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const row = byRow.get(y)!;
      row.sort((a, b) => a[0] - b[0]);
      lines.push(row.map((r) => r[1]).join(" "));
    }
  }

  return lines;
}
