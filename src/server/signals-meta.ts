import "server-only";
import { and, eq, like } from "drizzle-orm";
import { newsBookmarks, xpEvents } from "@/db/schema";
import { relevanceNotes, type RelevanceData } from "@/lib/news/relevance";
import type { AppContext } from "./context";
import type { FinanceSnapshot } from "./views";

export async function learnedConcepts(ctx: AppContext) {
  const rows = await ctx.db.select({ k: xpEvents.idempotencyKey }).from(xpEvents).where(and(eq(xpEvents.userId, ctx.user.id), like(xpEvents.idempotencyKey, "concept:%")));
  return new Set(rows.map((r) => r.k.slice("concept:".length)));
}

export async function bookmarks(ctx: AppContext) {
  return ctx.db.select().from(newsBookmarks).where(eq(newsBookmarks.userId, ctx.user.id));
}

export function relevanceData(fin: FinanceSnapshot): RelevanceData {
  return {
    hasEquityHoldings: fin.holdings.some((h) => h.assetClass === "equity"),
    hasDebtHoldings: fin.holdings.some((h) => h.assetClass === "debt"),
    hasGoldHoldings: fin.holdings.some((h) => h.assetClass === "gold"),
    hasSip: fin.recurring.some((r) => r.active && r.kind === "investment"),
    hasLoanPayments: (fin.profile?.monthlyDebtPayments ?? 0) > 0 || fin.recurring.some((r) => r.active && r.kind === "emi"),
    datedGoals: fin.goals.filter((g) => g.targetDate).length,
    hasEmergencyGoal: fin.goals.some((g) => g.kind === "emergency"),
  };
}

export { relevanceNotes };
