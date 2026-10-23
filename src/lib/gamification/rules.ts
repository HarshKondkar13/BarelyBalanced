/**
 * Gamification rules. XP rewards consistency, learning and follow-through.
 *
 * Hard rules (enforced here and reviewed in tests):
 * - No XP for trading frequency, spending volume, risk taken, or investment returns.
 * - Every award has an idempotency key so repeat clicks cannot farm XP.
 * - Undoing the underlying action revokes the award.
 * - Amount-independent: contributing ₹100 or ₹1,00,000 to a goal earns the same.
 */
import type { Skill } from "@/db/schema";
import { addDays, dayOfWeek, startOfWeek, type LocalDate } from "@/lib/dates";

export type XpAction =
  | "daily_log"
  | "morning_plan"
  | "evening_review"
  | "priority_done"
  | "focus_done"
  | "habit_done"
  | "budget_set"
  | "weekly_review"
  | "goal_contribution"
  | "subscription_review"
  | "briefing_read"
  | "story_explained"
  | "concept_learned"
  | "categorized_week"
  | "quest_complete"
  | "onboarding_complete";

export const XP_RULES: Record<XpAction, { xp: number; skill: Skill; label: string }> = {
  daily_log: { xp: 5, skill: "money", label: "Logged the day's money" },
  morning_plan: { xp: 10, skill: "discipline", label: "Planned the day" },
  evening_review: { xp: 10, skill: "discipline", label: "Evening check-in" },
  priority_done: { xp: 5, skill: "discipline", label: "Finished a top priority" },
  focus_done: { xp: 10, skill: "discipline", label: "Completed a focus session" },
  habit_done: { xp: 3, skill: "discipline", label: "Kept a habit" },
  budget_set: { xp: 15, skill: "money", label: "Set a monthly budget" },
  weekly_review: { xp: 40, skill: "money", label: "Completed the weekly review" },
  goal_contribution: { xp: 10, skill: "money", label: "Moved a goal forward" },
  subscription_review: { xp: 10, skill: "money", label: "Reviewed a subscription" },
  briefing_read: { xp: 5, skill: "business", label: "Read the daily briefing" },
  story_explained: { xp: 10, skill: "business", label: "Explained a business development" },
  concept_learned: { xp: 5, skill: "investing", label: "Learned a concept" },
  categorized_week: { xp: 15, skill: "money", label: "Categorised the week's transactions" },
  quest_complete: { xp: 0, skill: "discipline", label: "Quest bonus" },
  onboarding_complete: { xp: 20, skill: "money", label: "Set up your plan" },
};

/** Daily caps stop busywork from dominating (e.g. ticking many tiny tasks). */
export const DAILY_CAPS: Partial<Record<XpAction, number>> = {
  priority_done: 3,
  focus_done: 3,
  habit_done: 5,
  story_explained: 2,
  concept_learned: 3,
};

/** Idempotency keys: one award per meaningful unit of work. */
export const xpKey = {
  dailyLog: (date: LocalDate) => `daily_log:${date}`,
  morningPlan: (date: LocalDate) => `morning:${date}`,
  eveningReview: (date: LocalDate) => `evening:${date}`,
  priorityDone: (taskId: string) => `task:${taskId}`,
  focusDone: (sessionId: string) => `focus:${sessionId}`,
  habitDone: (habitId: string, date: LocalDate) => `habit:${habitId}:${date}`,
  budgetSet: (month: string) => `budget:${month}`,
  weeklyReview: (weekStart: LocalDate) => `weekly:${weekStart}`,
  goalContribution: (goalId: string, month: string) => `goal:${goalId}:${month}`,
  subscriptionReview: (itemId: string, quarter: string) => `subreview:${itemId}:${quarter}`,
  briefingRead: (date: LocalDate) => `briefing:${date}`,
  storyExplained: (newsId: string) => `explain:${newsId}`,
  conceptLearned: (conceptId: string) => `concept:${conceptId}`,
  categorizedWeek: (weekStart: LocalDate) => `categorized:${weekStart}`,
  quest: (questId: string, period: string) => `quest:${questId}:${period}`,
  onboarding: () => `onboarding`,
};

export function quarterOf(date: LocalDate): string {
  const m = Number(date.slice(5, 7));
  return `${date.slice(0, 4)}-Q${Math.ceil(m / 3)}`;
}

/* ---------------- Levels ---------------- */

/** Cumulative XP needed to reach `level` (level 1 = 0 XP). Gentle quadratic curve. */
export function xpForLevel(level: number): number {
  const n = level - 1;
  return 50 * n * (n + 1);
}

export function levelFromXp(xp: number) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, xpIntoLevel: xp - floor, xpForNext: next - floor, progress: (xp - floor) / (next - floor) };
}

export const SKILL_PATHS: Record<Skill, { name: string; tiers: Array<{ xp: number; title: string }> }> = {
  money: {
    name: "Money Management",
    tiers: [
      { xp: 0, title: "Getting started" },
      { xp: 100, title: "Tracker" },
      { xp: 300, title: "Budgeter" },
      { xp: 700, title: "Planner" },
      { xp: 1500, title: "Steward" },
    ],
  },
  investing: {
    name: "Investing Knowledge",
    tiers: [
      { xp: 0, title: "Curious" },
      { xp: 50, title: "Learner" },
      { xp: 150, title: "Informed" },
      { xp: 400, title: "Analytical" },
      { xp: 900, title: "Thoughtful investor" },
    ],
  },
  business: {
    name: "Business Awareness",
    tiers: [
      { xp: 0, title: "Reader" },
      { xp: 75, title: "Follower" },
      { xp: 250, title: "Analyst" },
      { xp: 600, title: "Strategist" },
      { xp: 1200, title: "Insider-level context" },
    ],
  },
  discipline: {
    name: "Personal Discipline",
    tiers: [
      { xp: 0, title: "Starting out" },
      { xp: 100, title: "Consistent" },
      { xp: 350, title: "Reliable" },
      { xp: 800, title: "Focused" },
      { xp: 1600, title: "Steady" },
    ],
  },
};

export function skillTier(skill: Skill, xp: number) {
  const tiers = SKILL_PATHS[skill].tiers;
  let idx = 0;
  for (let i = 0; i < tiers.length; i++) if (xp >= tiers[i].xp) idx = i;
  const next = tiers[idx + 1];
  return {
    tier: idx + 1,
    title: tiers[idx].title,
    nextTitle: next?.title ?? null,
    progress: next ? (xp - tiers[idx].xp) / (next.xp - tiers[idx].xp) : 1,
    xpToNext: next ? next.xp - xp : 0,
  };
}

/* ---------------- Flexible streaks ---------------- */

/**
 * A streak counts consecutive days with at least one meaningful action, where each
 * calendar week forgives up to `restDaysPerWeek` missed days. Today never breaks the
 * streak (the day is not over). A break is reported neutrally with a recovery path.
 */
export function computeStreak(
  activeDays: Set<LocalDate>,
  today: LocalDate,
  restDaysPerWeek = 1,
  weekStartsOn = 1,
): {
  current: number;
  restDaysUsedThisWeek: number;
  restDaysLeftThisWeek: number;
  activeToday: boolean;
  lookback: Array<{ date: LocalDate; state: "active" | "rest" | "missed" | "today" }>;
} {
  const restUsed = new Map<string, number>();
  const states = new Map<LocalDate, "active" | "rest" | "missed" | "today">();
  const activeToday = activeDays.has(today);
  let current = activeToday ? 1 : 0;
  states.set(today, activeToday ? "active" : "today");
  for (let i = 1, d = addDays(today, -1); i <= 400; i++, d = addDays(d, -1)) {
    if (activeDays.has(d)) {
      current++;
      states.set(d, "active");
      continue;
    }
    const wk = startOfWeek(d, weekStartsOn);
    const used = restUsed.get(wk) ?? 0;
    // A rest day only bridges a gap if there is earlier activity to connect to.
    if (used < restDaysPerWeek && activeDays.has(addDays(d, -1))) {
      restUsed.set(wk, used + 1);
      states.set(d, "rest");
      continue;
    }
    states.set(d, "missed");
    break;
  }
  const usedThisWeek = restUsed.get(startOfWeek(today, weekStartsOn)) ?? 0;
  const lookback: Array<{ date: LocalDate; state: "active" | "rest" | "missed" | "today" }> = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDays(today, -i);
    lookback.push({ date: day, state: states.get(day) ?? (activeDays.has(day) ? "active" : "missed") });
  }
  return {
    current,
    restDaysUsedThisWeek: usedThisWeek,
    restDaysLeftThisWeek: Math.max(0, restDaysPerWeek - usedThisWeek),
    activeToday,
    lookback,
  };
}

export const isWeekend = (d: LocalDate) => [0, 6].includes(dayOfWeek(d));

/* ---------------- Cosmetics ---------------- */

export const COSMETICS = [
  { id: "accent-teal", name: "Teal accent", unlockLevel: 1, kind: "accent" },
  { id: "accent-indigo", name: "Indigo accent", unlockLevel: 3, kind: "accent" },
  { id: "accent-saffron", name: "Saffron accent", unlockLevel: 5, kind: "accent" },
  { id: "accent-rose", name: "Rose accent", unlockLevel: 8, kind: "accent" },
  { id: "badge-ledger", name: "Ledger badge", unlockLevel: 4, kind: "badge" },
  { id: "badge-compass", name: "Compass badge", unlockLevel: 6, kind: "badge" },
] as const;
