// Telegram bot for the Budget Planner, deployed as a Supabase Edge Function.
//
// Flow: Telegram → this webhook → read/modify the owner's `budgets.state` row
// (and `payslips`) using the service role. The web app subscribes to that row
// in realtime, so any change here shows up live in the open app.
//
// Auth: Telegram is told a `secret_token` when we register the webhook; it
// echoes it back in the `X-Telegram-Bot-Api-Secret-Token` header, which we
// check against `bot_config.webhook_secret`. The bot then only acts on messages
// from the owner chat (trust-on-first-use: the first chat to message it is
// locked in as the owner).
//
// Config (token, owner ids, webhook secret) lives in the private `bot_config`
// table — RLS is on with no policies, so only the service role can read it.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  calculateAutoAllocation,
  summarizeIncome,
  weekStartOf,
  type BudgetState,
  type IncomeStream,
} from "./budget-logic.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

interface BotConfig {
  id: number;
  owner_user_id: string;
  owner_chat_id: string | null;
  bot_token: string;
  webhook_secret: string;
}

const ok = () => new Response("ok");

const money = (n: number) =>
  "$" +
  (Math.round(n * 100) / 100).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

async function tg(token: string, method: string, payload: unknown) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("Telegram call failed:", method, e);
  }
}

async function loadState(userId: string): Promise<BudgetState | null> {
  const { data } = await admin
    .from("budgets")
    .select("state")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.state as BudgetState) ?? null;
}

async function saveState(userId: string, state: BudgetState) {
  await admin
    .from("budgets")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
}

const HELP = [
  "<b>Bas Budget Bot</b> 🤖",
  "",
  "<b>/status</b> — debts, snowball focus, savings & net income",
  "<b>pay &lt;debt&gt; [amount]</b> — log a repayment",
  "   e.g. <code>pay zip</code> or <code>pay zip 50</code>",
  "<b>expense &lt;amount&gt; &lt;name&gt;</b> — add a weekly expense",
  "   e.g. <code>expense 15 gym</code>",
  "<b>payslip gross &lt;g&gt; tax &lt;t&gt; super &lt;s&gt;</b> — log this week's payslip",
  "   e.g. <code>payslip gross 1200 tax 300 super 144</code>",
  "",
  "Changes sync to your app instantly.",
].join("\n");

function statusText(state: BudgetState): string {
  const debts = state.debts ?? [];
  const owing = debts
    .filter((d) => (d.totalBalance ?? 0) > 0.01)
    .sort((a, b) => (a.totalBalance ?? 0) - (b.totalBalance ?? 0));
  const totalBal = debts.reduce((a, d) => a + (d.totalBalance ?? 0), 0);
  const totalWk = debts.reduce((a, d) => a + (d.amount ?? 0), 0);
  const weeks = totalWk > 0 && totalBal > 0 ? Math.ceil(totalBal / totalWk) : 0;
  const summary = summarizeIncome(state);

  const lines: string[] = ["<b>💰 Budget status</b>"];
  lines.push(`Net income: <b>${money(summary.totalNetIncome)}/wk</b>`);
  lines.push(`Total debt: <b>${money(totalBal)}</b>`);
  lines.push(`Weekly repayments: <b>${money(totalWk)}</b>`);
  if (weeks > 0) lines.push(`Debt-free in ~<b>${weeks} weeks</b>`);

  if (owing.length) {
    const strategy = state.debtStrategy ?? "snowball";
    if (strategy === "snowball") {
      lines.push(`\n⛄ <b>Snowball focus:</b> ${owing[0].name} (${money(owing[0].totalBalance ?? 0)} left)`);
    }
    lines.push("\n<b>Debts</b> (smallest first)");
    for (const d of owing) {
      lines.push(`• ${d.name}: ${money(d.totalBalance ?? 0)} — ${money(d.amount ?? 0)}/wk`);
    }
  } else {
    lines.push("\n🎉 No debt remaining!");
  }

  const savings = state.savings ?? [];
  if (savings.length) {
    lines.push("\n<b>Savings</b>");
    for (const s of savings) {
      lines.push(`• ${s.name}: ${money(s.currentAmount ?? 0)} / ${money(s.targetAmount ?? 0)}`);
    }
  }
  return lines.join("\n");
}

Deno.serve(async (req) => {
  const { data: cfg } = await admin
    .from("bot_config")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (!cfg) return new Response("no config", { status: 500 });
  const config = cfg as BotConfig;

  // Authenticate the request actually came from Telegram.
  if (req.headers.get("x-telegram-bot-api-secret-token") !== config.webhook_secret) {
    return new Response("forbidden", { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const msg = update?.message ?? update?.edited_message;
  const chatId = msg?.chat?.id;
  const text: string = (msg?.text ?? "").trim();
  if (!chatId) return ok(); // not a text message we handle

  const reply = (t: string) =>
    tg(config.bot_token, "sendMessage", {
      chat_id: chatId,
      text: t,
      parse_mode: "HTML",
    });

  // Trust-on-first-use: first chat to message the bot becomes the owner.
  if (!config.owner_chat_id) {
    await admin
      .from("bot_config")
      .update({ owner_chat_id: String(chatId) })
      .eq("id", config.id);
    await reply("✅ Locked to this chat — you're the owner now.\n\n" + HELP);
    return ok();
  }
  if (String(chatId) !== String(config.owner_chat_id)) return ok(); // ignore strangers

  const state = await loadState(config.owner_user_id);
  if (!state) {
    await reply("Couldn't find your budget. Open the app once, then try again.");
    return ok();
  }

  const lower = text.toLowerCase();

  if (lower === "/start" || lower === "/help" || lower === "help") {
    await reply(HELP);
    return ok();
  }

  if (lower === "/status" || lower === "status") {
    await reply(statusText(state));
    return ok();
  }

  // pay <debt> [amount]
  const pay = text.match(/^\/?pay\s+(.+?)(?:\s+\$?(\d+(?:\.\d+)?))?$/i);
  if (pay) {
    const q = pay[1].toLowerCase();
    const debts = state.debts ?? [];
    const debt =
      debts.find((d) => d.name.toLowerCase() === q) ??
      debts.find((d) => d.name.toLowerCase().includes(q));
    if (!debt) {
      await reply(`No debt matching "${pay[1]}". Send /status to see the names.`);
      return ok();
    }
    const amt = pay[2] ? Number(pay[2]) : debt.amount ?? 0;
    if (!(amt > 0)) {
      await reply(`"${debt.name}" has no weekly repayment set. Try <code>pay ${debt.name} 50</code>.`);
      return ok();
    }
    const before = debt.totalBalance ?? 0;
    debt.totalBalance = Math.max(0, before - amt);
    await saveState(config.owner_user_id, state); // payDebt mirrors the app: no re-allocation
    const cleared = (debt.totalBalance ?? 0) <= 0.01;
    await reply(
      `✅ Paid ${money(amt)} off <b>${debt.name}</b>.\n` +
        `Balance: ${money(before)} → <b>${money(debt.totalBalance ?? 0)}</b>` +
        (cleared ? " 🎉 Cleared! The snowball rolls to the next debt." : ""),
    );
    return ok();
  }

  // expense <amount> <name>
  const exp = text.match(/^\/?expense\s+\$?(\d+(?:\.\d+)?)\s+(.+)$/i);
  if (exp) {
    const amount = Number(exp[1]);
    const name = exp[2].trim();
    const next: BudgetState = {
      ...state,
      expenses: [
        ...(state.expenses ?? []),
        {
          id: "tg-" + Date.now(),
          name,
          amount,
          frequency: "weekly",
          category: "General",
          color: "#f59e0b",
          icon: "receipt",
        },
      ],
    };
    const allocated = calculateAutoAllocation(next); // pool shrank → debts/savings rebalance
    await saveState(config.owner_user_id, allocated);
    await reply(`✅ Added weekly expense <b>${name}</b> at ${money(amount)}/wk.\n\n` + statusText(allocated));
    return ok();
  }

  // payslip gross <g> [tax <t>] [super <s>] [employer <name>]
  if (/^\/?payslip\b/i.test(text)) {
    const grab = (key: string) => {
      const m = text.match(new RegExp(key + "\\s+\\$?(\\d+(?:\\.\\d+)?)", "i"));
      return m ? Number(m[1]) : undefined;
    };
    const gross = grab("gross");
    if (gross === undefined) {
      await reply("Tell me the gross, e.g. <code>payslip gross 1200 tax 300 super 144</code>.");
      return ok();
    }
    const tax = grab("tax") ?? 0;
    const superAmt = grab("super") ?? 0;
    const empMatch = text.match(/employer\s+([^\d].*?)(?:\s+(?:gross|tax|super)\b|$)/i);
    const employer = empMatch ? empMatch[1].trim() : "Payslip";
    const week = weekStartOf();

    const stream: IncomeStream = {
      id: "tg-payslip-" + Date.now(),
      name: employer,
      type: "payslip",
      grossPay: gross,
      taxWithheld: tax,
      superAmount: superAmt,
      weekStarting: week,
    };
    const next: BudgetState = {
      ...state,
      incomes: [...(state.incomes ?? []), stream],
    };
    const allocated = calculateAutoAllocation(next); // income changed → rebalance
    await saveState(config.owner_user_id, allocated);

    // Archive it alongside the app's own payslip records.
    await admin.from("payslips").upsert(
      {
        user_id: config.owner_user_id,
        week_starting: week,
        employer,
        gross_pay: gross,
        tax_withheld: tax,
        super_amount: superAmt,
        net_pay: gross - tax,
        file_name: `Telegram_${employer.replace(/[^\w]+/g, "_")}_${week}`,
      },
      { onConflict: "user_id,week_starting,file_name" },
    );

    await reply(
      `✅ Logged payslip from <b>${employer}</b> for week of ${week}.\n` +
        `Gross ${money(gross)} · Tax ${money(tax)} · Super ${money(superAmt)} · Net <b>${money(gross - tax)}</b>\n\n` +
        statusText(allocated),
    );
    return ok();
  }

  await reply("Didn't catch that. Send /help for what I can do.");
  return ok();
});
