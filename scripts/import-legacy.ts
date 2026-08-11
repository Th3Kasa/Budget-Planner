/**
 * Import a Supabase-era backup into Neon, attached to a real Better Auth account.
 *
 * The old rows were owned by Supabase anonymous-auth UUIDs, which have no
 * equivalent under Better Auth. So this is a deliberate, one-off reattachment:
 * you sign up for a real account first, then point this script at the account
 * and at the legacy user whose data should become yours.
 *
 * Usage:
 *   npm run db:import-legacy -- \
 *     --file "../backups/supabase-budget-planner-2026-08-10.json" \
 *     --email you@example.com \
 *     --legacy-user f329a18b-f23a-4a18-89ae-296c20ec52e2
 *
 * Add --dry-run to print what would be written without touching the database.
 *
 * Safe to re-run: the budget upserts on user_id, and the child tables skip rows
 * whose id already exists.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";

config({ path: ".env.local" });

const { db } = await import("../src/lib/db/index.js");
const { budgets, payslips, shiftLogs, user, weeklySnapshots } = await import(
  "../src/lib/db/schema.js"
);

/* ------------------------------------------------------------------- args */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const filePath = arg("file");
const email = arg("email");
const legacyUserId = arg("legacy-user");
const dryRun = process.argv.includes("--dry-run");

if (!filePath || !email || !legacyUserId) {
  console.error(
    "Missing required argument.\n" +
      "  --file <path to backup json>\n" +
      "  --email <email of an existing account>\n" +
      "  --legacy-user <supabase user_id to import>\n" +
      "  [--dry-run]",
  );
  process.exit(1);
}

/* ------------------------------------------------------------------- input */

type Backup = {
  budgets: { user_id: string; state: unknown; updated_at: string }[];
  payslips: Record<string, unknown>[];
  shift_logs: Record<string, unknown>[];
  weekly_snapshots: Record<string, unknown>[];
};

const backup: Backup = JSON.parse(readFileSync(resolve(filePath), "utf8"));

type Row = Record<string, unknown> & { user_id: string };

const mine = <T extends { user_id: string }>(rows: T[]) =>
  rows.filter((r) => r.user_id === legacyUserId);

const budgetRow = mine(backup.budgets)[0];
const logs = mine(backup.shift_logs as Row[]);
const snaps = mine(backup.weekly_snapshots as Row[]);
const slips = mine(backup.payslips as Row[]);

if (!budgetRow && !logs.length && !snaps.length && !slips.length) {
  console.error(
    `No rows in the backup belong to legacy user ${legacyUserId}.\n` +
      `Available user ids: ${[...new Set(backup.budgets.map((b) => b.user_id))].join(", ")}`,
  );
  process.exit(1);
}

/* ------------------------------------------------------------------ target */

const [target] = await db.select().from(user).where(eq(user.email, email));

if (!target) {
  console.error(
    `No account found for ${email}. Sign up in the app first, then re-run this.`,
  );
  process.exit(1);
}

console.log(`Importing legacy user ${legacyUserId}  ->  ${email} (${target.id})`);
console.log(
  `  budget: ${budgetRow ? "yes" : "none"}   shift_logs: ${logs.length}   ` +
    `snapshots: ${snaps.length}   payslips: ${slips.length}`,
);

if (dryRun) {
  console.log("\n--dry-run: nothing written.");
  process.exit(0);
}

/* ----------------------------------------------------------------- import */

if (budgetRow) {
  await db
    .insert(budgets)
    .values({
      userId: target.id,
      state: budgetRow.state as Record<string, unknown>,
      updatedAt: new Date(budgetRow.updated_at),
    })
    .onConflictDoUpdate({
      target: budgets.userId,
      set: {
        state: budgetRow.state as Record<string, unknown>,
        updatedAt: new Date(budgetRow.updated_at),
      },
    });
  console.log("  budget imported");
}

for (const r of logs) {
  await db
    .insert(shiftLogs)
    .values({
      id: r.id as string,
      userId: target.id,
      shiftDate: r.shift_date as string,
      incomeStreamId: r.income_stream_id as string,
      incomeStreamName: r.income_stream_name as string,
      hours: String(r.hours),
      hourlyRate: String(r.hourly_rate),
      notes: (r.notes as string | null) ?? null,
      createdAt: new Date(r.created_at as string),
    })
    .onConflictDoNothing();
}
console.log(`  ${logs.length} shift logs imported`);

for (const r of snaps) {
  await db
    .insert(weeklySnapshots)
    .values({
      id: r.id as string,
      userId: target.id,
      weekStarting: r.week_starting as string,
      netIncome: r.net_income == null ? null : String(r.net_income),
      totalDebtBalance:
        r.total_debt_balance == null ? null : String(r.total_debt_balance),
      totalPaidThisWeek:
        r.total_paid_this_week == null ? null : String(r.total_paid_this_week),
      createdAt: new Date(r.created_at as string),
    })
    .onConflictDoNothing();
}
console.log(`  ${snaps.length} weekly snapshots imported`);

let orphanedPdfs = 0;
for (const r of slips) {
  // storage_path pointed at the Supabase `payslip-pdfs` bucket. Those objects
  // do not exist in Vercel Blob, so the reference is dropped rather than
  // imported as a dead link — re-upload the PDFs from the app if you want them.
  if (r.storage_path) orphanedPdfs++;
  await db
    .insert(payslips)
    .values({
      id: r.id as string,
      userId: target.id,
      weekStarting: r.week_starting as string,
      employer: (r.employer as string | null) ?? null,
      paymentDate: (r.payment_date as string | null) ?? null,
      periodStart: (r.period_start as string | null) ?? null,
      periodEnd: (r.period_end as string | null) ?? null,
      grossPay: r.gross_pay == null ? null : String(r.gross_pay),
      taxWithheld: r.tax_withheld == null ? null : String(r.tax_withheld),
      superAmount: r.super_amount == null ? null : String(r.super_amount),
      netPay: r.net_pay == null ? null : String(r.net_pay),
      fileName: r.file_name as string,
      storagePath: null,
      createdAt: new Date(r.created_at as string),
    })
    .onConflictDoNothing();
}
console.log(`  ${slips.length} payslips imported`);
if (orphanedPdfs) {
  console.log(
    `  note: ${orphanedPdfs} payslip PDF(s) were stored in Supabase Storage and ` +
      `were not migrated. Metadata is intact; re-upload the files to restore them.`,
  );
}

/* ------------------------------------------------------------------ verify */

const counts = (await db.execute(sql`
  SELECT 'budgets' t, count(*) n FROM budgets WHERE user_id = ${target.id}
  UNION ALL SELECT 'shift_logs', count(*) FROM shift_logs WHERE user_id = ${target.id}
  UNION ALL SELECT 'weekly_snapshots', count(*) FROM weekly_snapshots WHERE user_id = ${target.id}
  UNION ALL SELECT 'payslips', count(*) FROM payslips WHERE user_id = ${target.id}
`)) as unknown;

// The neon-http driver returns the rows array directly; other drivers wrap it
// in { rows }. Handle both so this keeps working if the driver is swapped.
const rows = (
  Array.isArray(counts) ? counts : ((counts as { rows?: unknown[] }).rows ?? [])
) as { t: string; n: number }[];

console.log("\nRows now owned by this account:");
for (const row of rows) {
  console.log(`  ${row.t}: ${row.n}`);
}
