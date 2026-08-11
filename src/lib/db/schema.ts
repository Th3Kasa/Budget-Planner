// Drizzle schema for Neon Postgres.
//
// Two groups of tables:
//   1. Better Auth core tables (user/session/account/verification). These are
//      dictated by Better Auth — column names must match what the adapter
//      expects, so they use camelCase identifiers rather than the snake_case
//      used elsewhere in this file.
//   2. Application tables, carried over from Supabase. The shapes match the
//      original Supabase DDL so the exported backup imports without conversion,
//      with one deliberate change: user_id is now text referencing user.id
//      (Better Auth ids are text, not uuid).
//
// Authorization note: Supabase enforced per-user access with row-level
// security. Neon has no equivalent here, so *every* query against these tables
// must filter by the session's user id. See src/lib/db/queries.ts — all app
// access goes through those helpers so the ownership filter cannot be
// forgotten at a call site.

import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/* ---------------------------------------------------------------- Better Auth */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updatedAt")
    .$defaultFn(() => new Date())
    .notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").$defaultFn(() => new Date()),
  updatedAt: timestamp("updatedAt").$defaultFn(() => new Date()),
});

/* ----------------------------------------------------------------- App tables */

export const budgets = pgTable("budgets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  state: jsonb("state").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const shiftLogs = pgTable(
  "shift_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    shiftDate: date("shift_date").notNull(),
    incomeStreamId: text("income_stream_id").notNull(),
    incomeStreamName: text("income_stream_name").notNull(),
    hours: numeric("hours").notNull(),
    hourlyRate: numeric("hourly_rate").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("shift_logs_user_date_idx").on(t.userId, t.shiftDate)],
);

export const weeklySnapshots = pgTable(
  "weekly_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    weekStarting: date("week_starting").notNull(),
    netIncome: numeric("net_income"),
    totalDebtBalance: numeric("total_debt_balance"),
    totalPaidThisWeek: numeric("total_paid_this_week"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [unique("weekly_snapshots_user_week_key").on(t.userId, t.weekStarting)],
);

export const payslips = pgTable(
  "payslips",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    weekStarting: date("week_starting").notNull(),
    employer: text("employer"),
    paymentDate: date("payment_date"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    grossPay: numeric("gross_pay"),
    taxWithheld: numeric("tax_withheld"),
    superAmount: numeric("super_amount"),
    netPay: numeric("net_pay"),
    fileName: text("file_name").notNull(),
    // Was a Supabase Storage object path; now a Vercel Blob URL.
    storagePath: text("storage_path"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("payslips_user_week_idx").on(t.userId, t.weekStarting),
    // The app upserts payslips on this triple. Supabase had no matching
    // constraint, so that upsert could not resolve a conflict target; it is
    // declared properly here.
    unique("payslips_user_week_file_key").on(
      t.userId,
      t.weekStarting,
      t.fileName,
    ),
  ],
);
