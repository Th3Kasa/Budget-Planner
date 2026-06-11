// Heuristic parser for Australian payslip PDFs. Takes the lines of text
// extracted from a PDF (see extractPdf.ts) and pulls out the figures the
// budget needs. Pure and framework-free so it can be unit-tested directly.

export interface ParsedPayslip {
  employer?: string;
  gross?: number;
  tax?: number;
  super?: number;
  net?: number;
  paymentDate?: string; // ISO yyyy-MM-dd
  periodStart?: string; // ISO yyyy-MM-dd
  periodEnd?: string; // ISO yyyy-MM-dd
}

const AMOUNT = "\\$?\\s*([\\d,]+\\.\\d{2})";
const DATE = "(\\d{1,2}\\/\\d{1,2}\\/\\d{2,4})";

const num = (s?: string): number | undefined =>
  s ? Number(s.replace(/,/g, "")) : undefined;

// Australian payslips write dates as D/M/YYYY (or D/M/YY). Normalise to ISO.
export function auDateToISO(dmy?: string): string | undefined {
  if (!dmy) return undefined;
  const m = dmy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return undefined;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parsePayslip(lines: string[]): ParsedPayslip {
  const flat = lines.join("  ");
  const grab = (re: RegExp): string | undefined => {
    const m = flat.match(re);
    return m ? m[1] : undefined;
  };

  const gross = num(grab(new RegExp("GROSS\\s*PAY[:\\s]*" + AMOUNT, "i")));
  const net = num(grab(new RegExp("NET\\s*PAY[:\\s]*" + AMOUNT, "i")));
  // PAYG line lists current then YTD; the first amount after the label is this period.
  const tax = num(grab(new RegExp("PAYG\\s*Withholding[\\s\\S]*?" + AMOUNT, "i")));
  const superAmt = num(
    grab(new RegExp("Super\\s*Guarantee[^$]*?" + AMOUNT, "i")),
  );

  const paymentDate = auDateToISO(
    grab(new RegExp("Payment\\s*Date[:\\s]*" + DATE, "i")),
  );
  const period = flat.match(
    new RegExp("Pay\\s*Period\\s*From[:\\s]*" + DATE + "[\\s\\S]*?To[:\\s]*" + DATE, "i"),
  );

  // Employer: prefer a line carrying a company suffix; else the line directly
  // above "Pay Slip For".
  let employer: string | undefined;
  const suffix = lines.find(
    (l) =>
      /\b(Pty\.?\s*Ltd|Pty\.?|Limited|Ltd\.?|Inc\.?)\b/i.test(l) &&
      !/ABN/i.test(l),
  );
  if (suffix) {
    employer = suffix.trim();
  } else {
    const i = lines.findIndex((l) => /Pay\s*Slip\s*For/i.test(l));
    if (i > 0) employer = lines[i - 1].trim();
  }

  return {
    employer,
    gross,
    tax,
    super: superAmt,
    net,
    paymentDate,
    periodStart: auDateToISO(period?.[1]),
    periodEnd: auDateToISO(period?.[2]),
  };
}

// Canonical storage name, e.g. "PaySlip_Go_Traffic_2026-06-01".
// Strips company suffixes and non-word characters from the employer and keys
// the record to the pay-period start (the Monday of the week worked).
export function payslipFileName(
  employer: string | undefined,
  dateISO: string | undefined,
): string {
  const cleaned = (employer ?? "Payslip")
    .replace(/\b(Pty\.?\s*Ltd|Pty\.?|Limited|Ltd\.?|Inc\.?)\b/gi, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .join("_");
  const date = dateISO || new Date().toISOString().slice(0, 10);
  return `PaySlip_${cleaned || "Payslip"}_${date}`;
}
