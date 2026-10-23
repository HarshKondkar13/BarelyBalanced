import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { getSessionUser } from "@/server/session";
import { loadAccounts, loadCategories, loadTransactions } from "@/server/finance";
import { toCsv } from "@/lib/csv/import";
import { paiseToDecimalString } from "@/lib/money";

/** Data export for the signed-in user only. Integration secrets are never included. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const format = req.nextUrl.searchParams.get("format") === "json" ? "json" : "csv";
  const [accounts, cats, txns] = await Promise.all([loadAccounts(db, user.id), loadCategories(db, user.id), loadTransactions(db, user.id)]);
  const acct = new Map(accounts.map((a) => [a.id, a.name]));
  const cat = new Map(cats.map((c) => [c.id, c.name]));
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    const rows = txns.flatMap((t) =>
      (t.splits.length ? t.splits : [{ categoryId: null, amount: t.amount }]).map((sp) => ({
        date: t.date,
        type: t.type,
        description: t.description,
        account: acct.get(t.accountId) ?? "",
        to_account: t.toAccountId ? (acct.get(t.toAccountId) ?? "") : "",
        category: sp.categoryId ? (cat.get(sp.categoryId) ?? "") : t.type === "transfer" ? "" : "Uncategorised",
        amount_inr: paiseToDecimalString(sp.amount),
        transaction_total_inr: paiseToDecimalString(t.amount),
        tags: t.tags.join(";"),
        notes: t.notes ?? "",
        transaction_id: t.id,
      })),
    );
    const csv = toCsv(rows, ["date", "type", "description", "account", "to_account", "category", "amount_inr", "transaction_total_inr", "tags", "notes", "transaction_id"]);
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="transactions-${stamp}.csv"`, "Cache-Control": "no-store" } });
  }
  const u = user.id;
  const [prefs, profile, budgets, recurring, goals, contributions, holdings, tasks, routines, habits, habitLogs, dailyReviews, weeklyReviews, xp, bookmarks] = await Promise.all([
    db.select().from(s.preferences).where(eq(s.preferences.userId, u)),
    db.select().from(s.financialProfile).where(eq(s.financialProfile.userId, u)),
    db.select().from(s.budgets).where(eq(s.budgets.userId, u)),
    db.select().from(s.recurringItems).where(eq(s.recurringItems.userId, u)),
    db.select().from(s.goals).where(eq(s.goals.userId, u)),
    db.select().from(s.goalContributions).where(eq(s.goalContributions.userId, u)),
    db.select().from(s.holdings).where(eq(s.holdings.userId, u)),
    db.select().from(s.tasks).where(eq(s.tasks.userId, u)),
    db.select().from(s.routines).where(eq(s.routines.userId, u)),
    db.select().from(s.habits).where(eq(s.habits.userId, u)),
    db.select().from(s.habitLogs).where(eq(s.habitLogs.userId, u)),
    db.select().from(s.dailyReviews).where(eq(s.dailyReviews.userId, u)),
    db.select().from(s.weeklyReviews).where(eq(s.weeklyReviews.userId, u)),
    db.select().from(s.xpEvents).where(eq(s.xpEvents.userId, u)),
    db.select().from(s.newsBookmarks).where(eq(s.newsBookmarks.userId, u)),
  ]);
  const body = {
    exportedAt: new Date().toISOString(),
    note: "Money values are integer paise (1 INR = 100 paise). Dates are in your timezone.",
    user: { name: user.name, email: user.email, isDemo: user.isDemo },
    preferences: prefs, financialProfile: profile, accounts, categories: cats, transactions: txns, budgets, recurringItems: recurring, goals, goalContributions: contributions, holdings, tasks, routines, habits, habitLogs, dailyReviews, weeklyReviews, xpEvents: xp, newsBookmarks: bookmarks,
  };
  return new NextResponse(JSON.stringify(body, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="paisa-export-${stamp}.json"`, "Cache-Control": "no-store" } });
}
