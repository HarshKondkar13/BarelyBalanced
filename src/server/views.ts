import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  dailyReviews,
  dismissedInsights,
  financialProfile,
  focusSessions,
  goalContributions,
  goals,
  newsBookmarks,
  recurringItems,
  tasks,
  transactions,
  weeklyReviews,
  xpEvents,
} from "@/db/schema";
import { addDays, endOfMonth, isoWeekId, localDateTimeToInstant, monthKey, startOfMonth, startOfWeek } from "@/lib/dates";
import { budgetVariance, computeBalances, computeNetWorth, summarizePeriod } from "@/lib/finance/ledger";
import { dueSoon, overdue } from "@/lib/finance/forecast";
import { generateInsights, type Insight } from "@/lib/finance/insights";
import { evaluateQuests, type QuestSnapshot } from "@/lib/gamification/quests";
import { computeStreak } from "@/lib/gamification/rules";
import type { AppContext } from "./context";
import { loadAccounts, loadBudgets, loadCategories, loadHoldings, loadRecurring, loadTransactions, toRecurringLike } from "./finance";
import { activeDays, xpSummary } from "./xp";

const LIQUID_TYPES = new Set(["bank", "cash", "wallet"]);

/** Everything money-related for the current month, computed deterministically. */
export async function loadFinanceSnapshot(ctx: AppContext) {
  const { db, user, today, prefs } = ctx;
  const month = monthKey(today);
  const [accounts, cats, allTxns, budgetRows, recurringRows, holdingRows, [profile], goalRows, contributions, dismissed] = await Promise.all([
    loadAccounts(db, user.id),
    loadCategories(db, user.id),
    loadTransactions(db, user.id),
    loadBudgets(db, user.id, month),
    loadRecurring(db, user.id),
    loadHoldings(db, user.id),
    db.select().from(financialProfile).where(eq(financialProfile.userId, user.id)),
    db.select().from(goals).where(and(eq(goals.userId, user.id), eq(goals.archived, false))).orderBy(asc(goals.priority)),
    db.select().from(goalContributions).where(eq(goalContributions.userId, user.id)),
    db.select({ key: dismissedInsights.insightKey }).from(dismissedInsights).where(eq(dismissedInsights.userId, user.id)),
  ]);
  const balances = computeBalances(accounts, allTxns, today);
  const netWorth = computeNetWorth(
    accounts,
    balances,
    holdingRows.map((h) => ({ id: h.id, name: h.name, value: h.value, valuationDate: h.valuationDate, includeInNetWorth: h.includeInNetWorth })),
  );
  const liquidCash = accounts.filter((a) => !a.archived && LIQUID_TYPES.has(a.type)).reduce((s, a) => s + (balances.get(a.id)?.balance ?? 0), 0);
  const monthSummary = summarizePeriod(allTxns, startOfMonth(month), endOfMonth(month), cats);
  const daysInMonth = Number(endOfMonth(month).slice(8));
  const elapsed = Number(today.slice(8)) / daysInMonth;
  const variance = budgetVariance(budgetRows.map((b) => ({ categoryId: b.categoryId, amount: b.amount })), monthSummary, elapsed);
  const recurring = toRecurringLike(recurringRows);

  const goalProgress = goalRows.map((g) => {
    const saved = contributions.filter((c) => c.goalId === g.id).reduce((s, c) => s + c.amount, 0);
    return { ...g, saved, progress: g.targetAmount > 0 ? saved / g.targetAmount : 0 };
  });
  const emergencyGoal = goalProgress.find((g) => g.kind === "emergency");
  const emergencyFundBalance = emergencyGoal ? emergencyGoal.saved : (profile?.emergencySavings ?? null);

  // Estimates prefer onboarding answers, falling back to the last 3 months of actuals.
  const threeMonthsAgo = addDays(startOfMonth(month), -90);
  const recent = summarizePeriod(allTxns, threeMonthsAgo, addDays(startOfMonth(month), -1), cats);
  const monthsOfHistory = Math.max(1, Math.min(3, Math.round((Date.parse(startOfMonth(month)) - Date.parse(accounts.map((a) => a.openingDate).sort()[0] ?? startOfMonth(month))) / (30 * 86400000))));
  const monthlyIncomeEstimate = profile?.monthlyIncome ?? (recent.income > 0 ? Math.round(recent.income / monthsOfHistory) : null);
  const monthlyEssentialsEstimate = profile?.monthlyEssentials ?? (recent.essentialSpending > 0 ? Math.round(recent.essentialSpending / monthsOfHistory) : null);

  const dismissedSet = new Set(dismissed.map((d) => d.key));
  const txnMeta = new Map(allTxns.map((t) => [t.id, { description: t.description }]));
  const insights: Insight[] = generateInsights({
    today,
    weekStartsOn: prefs?.weekStartsOn ?? 1,
    month,
    monthStart: startOfMonth(month),
    monthEnd: endOfMonth(month),
    txns: allTxns.filter((t) => t.date >= addDays(today, -130)),
    txnMeta,
    categories: cats,
    budgets: budgetRows.map((b) => ({ categoryId: b.categoryId, amount: b.amount })),
    recurring: recurringRows.map((r) => ({ ...toRecurringLike([r])[0], lastReviewedAt: r.lastReviewedAt })),
    liquidCash,
    monthlyIncomeEstimate,
    monthlyEssentialsEstimate,
    emergencyFundBalance,
  }).filter((i) => !dismissedSet.has(i.key));

  return {
    month,
    accounts,
    categories: cats,
    txns: allTxns,
    balances,
    netWorth,
    liquidCash,
    monthSummary,
    variance,
    budgets: budgetRows,
    recurring,
    recurringRows,
    holdings: holdingRows,
    profile: profile ?? null,
    goals: goalProgress,
    emergencyFundBalance,
    monthlyIncomeEstimate,
    monthlyEssentialsEstimate,
    insights,
    dueSoon: dueSoon(recurring, today, 7),
    overdue: overdue(recurring, today),
    elapsed,
  };
}

export type FinanceSnapshot = Awaited<ReturnType<typeof loadFinanceSnapshot>>;

/** Quests, streak and level for the progress widgets. */
export async function loadProgress(ctx: AppContext, fin?: Pick<FinanceSnapshot, "txns" | "recurringRows" | "goals">) {
  const { db, user, today, prefs } = ctx;
  const weekStart = startOfWeek(today, prefs?.weekStartsOn ?? 1);
  const weekEnd = addDays(weekStart, 6);
  const weekStartInstant = localDateTimeToInstant(weekStart, "00:00", ctx.tz);
  const [summary, days, reviewsToday, todayTasks, weekly, focus, todayXp, weekXp, emergencyContrib] = await Promise.all([
    xpSummary(db, user.id),
    activeDays(db, user.id, addDays(today, -400)),
    db.select().from(dailyReviews).where(and(eq(dailyReviews.userId, user.id), eq(dailyReviews.date, today))),
    db.select().from(tasks).where(and(eq(tasks.userId, user.id), eq(tasks.planDate, today))),
    db.select().from(weeklyReviews).where(and(eq(weeklyReviews.userId, user.id), eq(weeklyReviews.weekStart, weekStart))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(focusSessions)
      .where(and(eq(focusSessions.userId, user.id), eq(focusSessions.completed, true), gte(focusSessions.plannedMin, 15), lte(focusSessions.plannedMin, 90), gte(focusSessions.startedAt, weekStartInstant))),
    db.select().from(xpEvents).where(and(eq(xpEvents.userId, user.id), eq(xpEvents.localDate, today), isNull(xpEvents.revokedAt))),
    db.select().from(xpEvents).where(and(eq(xpEvents.userId, user.id), gte(xpEvents.localDate, weekStart), isNull(xpEvents.revokedAt))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(goalContributions)
      .innerJoin(goals, eq(goals.id, goalContributions.goalId))
      .where(and(eq(goalContributions.userId, user.id), eq(goals.kind, "emergency"), gte(goalContributions.date, weekStart), sql`${goalContributions.amount} > 0`)),
  ]);
  const txns = fin?.txns ?? (await loadTransactions(db, user.id, { from: weekStart, to: weekEnd }));
  const weekTxns = txns.filter((t) => t.date >= weekStart && t.date <= weekEnd && t.type === "expense");
  const recurringRows = fin?.recurringRows ?? (await db.select().from(recurringItems).where(eq(recurringItems.userId, user.id)));
  const goalsList = fin?.goals ?? [];
  const snapshot: QuestSnapshot = {
    morningPlanned: reviewsToday.some((r) => r.kind === "morning"),
    eveningReviewed: reviewsToday.some((r) => r.kind === "evening"),
    loggedToday: txns.some((t) => t.createdAt && t.date === today) || todayXp.some((x) => x.action === "daily_log"),
    topPrioritiesDoneToday: todayTasks.filter((t) => t.isTopPriority && t.status === "done").length,
    briefingReadToday: todayXp.some((x) => x.action === "briefing_read"),
    weekTxnCount: weekTxns.length,
    weekUncategorised: weekTxns.filter((t) => t.splits.some((s) => s.categoryId === null)).length,
    weeklyReviewDone: weekly.some((w) => w.completedAt),
    storiesExplainedThisWeek: weekXp.filter((x) => x.action === "story_explained").length,
    focusSessionsThisWeek: focus[0]?.n ?? 0,
    subscriptionsReviewedThisWeek: recurringRows.filter((r) => r.kind === "subscription" && r.lastReviewedAt && r.lastReviewedAt >= weekStartInstant).length,
    hasSubscriptions: recurringRows.some((r) => r.kind === "subscription" && r.active),
    emergencyContributionThisWeek: (emergencyContrib[0]?.n ?? 0) > 0,
    hasEmergencyGoal: goalsList.some((g) => g.kind === "emergency"),
  };
  const periodKeys = { daily: today, weekly: isoWeekId(today) };
  const claimed = new Set(weekXp.filter((x) => x.action === "quest_complete").map((x) => x.idempotencyKey));
  // Daily quest claims are dated today; include them too.
  for (const x of todayXp) if (x.action === "quest_complete") claimed.add(x.idempotencyKey);
  const quests = evaluateQuests(snapshot, periodKeys, claimed);
  const streak = computeStreak(days, today, prefs?.restDaysPerWeek ?? 1, prefs?.weekStartsOn ?? 1);
  const xpToday = todayXp.reduce((s, x) => s + x.xp, 0);
  const xpThisWeek = weekXp.reduce((s, x) => s + x.xp, 0);
  return { summary, quests, streak, snapshot, xpToday, xpThisWeek, weekStart, todayTasks, weeklyReviewDone: snapshot.weeklyReviewDone };
}

export async function bookmarkedIds(ctx: AppContext, ids: string[]) {
  if (ids.length === 0) return new Set<string>();
  const rows = await ctx.db
    .select({ id: newsBookmarks.newsItemId })
    .from(newsBookmarks)
    .where(and(eq(newsBookmarks.userId, ctx.user.id), inArray(newsBookmarks.newsItemId, ids)));
  return new Set(rows.map((r) => r.id));
}

export async function txnCountToday(ctx: AppContext) {
  const [r] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(eq(transactions.userId, ctx.user.id), eq(transactions.date, ctx.today)));
  return r?.n ?? 0;
}
