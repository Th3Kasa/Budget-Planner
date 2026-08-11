// Client for the app's own /api routes — the replacement for direct Supabase
// calls from the browser.
//
// The server derives the user from the session cookie, so no user id is ever
// sent from here. Every response shape matches what the components previously
// got back from Supabase, to keep the call sites unchanged in spirit.

import type {
  BudgetState,
  PayslipRecord,
  ShiftLog,
  WeeklySnapshot,
} from "../types";

async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, headers, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    credentials: "same-origin",
    // Caller-supplied headers win, so a raw upload can set its own content type.
    headers: {
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(headers as Record<string, string> | undefined),
    },
    body: json ? JSON.stringify(json) : rest.body,
  });

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body — keep the status line */
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

/* ------------------------------------------------------------------ budget */

export async function getBudget(): Promise<BudgetState | null> {
  const { state } = await request<{ state: BudgetState | null }>("/api/budget");
  return state;
}

export async function saveBudget(state: BudgetState): Promise<void> {
  await request("/api/budget", { method: "PUT", json: { state } });
}

/* -------------------------------------------------------------- shift logs */

export async function getShiftLogs(): Promise<ShiftLog[]> {
  const { logs } = await request<{ logs: ShiftLog[] }>("/api/shift-logs");
  return logs;
}

export async function createShiftLog(
  row: Omit<ShiftLog, "id" | "user_id" | "created_at">,
): Promise<ShiftLog> {
  const { log } = await request<{ log: ShiftLog }>("/api/shift-logs", {
    method: "POST",
    json: row,
  });
  return log;
}

export async function commitWeek(
  weekStart: string,
  weekEnd: string,
  rows: Omit<ShiftLog, "id" | "user_id" | "created_at">[],
): Promise<void> {
  await request("/api/shift-logs", {
    method: "PUT",
    json: { weekStart, weekEnd, rows },
  });
}

export async function deleteShiftLog(id: string): Promise<void> {
  await request(`/api/shift-logs?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/* --------------------------------------------------------------- snapshots */

export async function getSnapshots(): Promise<WeeklySnapshot[]> {
  const { snapshots } = await request<{ snapshots: WeeklySnapshot[] }>(
    "/api/snapshots",
  );
  return snapshots;
}

export async function saveSnapshot(row: {
  week_starting: string;
  net_income: number | null;
  total_debt_balance: number | null;
  total_paid_this_week: number | null;
}): Promise<void> {
  await request("/api/snapshots", { method: "PUT", json: row });
}

/* ---------------------------------------------------------------- payslips */

export async function getPayslips(): Promise<PayslipRecord[]> {
  const { payslips } = await request<{ payslips: PayslipRecord[] }>("/api/payslips");
  return payslips;
}

export async function savePayslip(row: {
  week_starting: string;
  file_name: string;
  employer: string | null;
  payment_date: string | null;
  period_start: string | null;
  period_end: string | null;
  gross_pay: number | null;
  tax_withheld: number | null;
  super_amount: number | null;
  net_pay: number | null;
  storage_path: string | null;
}): Promise<void> {
  await request("/api/payslips", { method: "PUT", json: row });
}

export async function deletePayslip(id: string): Promise<void> {
  await request(`/api/payslips?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** Uploads the PDF and returns the stored URL, or null if the upload failed. */
export async function uploadPayslipPdf(
  file: File | Blob,
  fileName: string,
): Promise<string | null> {
  try {
    const { url } = await request<{ url: string }>(
      `/api/payslips/upload?fileName=${encodeURIComponent(fileName)}`,
      {
        method: "POST",
        body: file,
        headers: { "Content-Type": "application/pdf" },
      },
    );
    return url;
  } catch (err) {
    console.error("Payslip PDF upload failed:", (err as Error).message);
    return null;
  }
}

/**
 * Triggers a download of the payslip PDF. The blob URL is never exposed to the
 * browser — the API checks ownership and streams the bytes back.
 */
export async function downloadPayslipPdf(
  id: string,
  fileName: string,
): Promise<void> {
  const res = await fetch(`/api/payslips/download?id=${encodeURIComponent(id)}`, {
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
