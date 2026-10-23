/**
 * Quests are computed from real data (never self-reported checkboxes), so progress
 * cannot be faked by tapping. Completion bonuses are claimed explicitly and are
 * idempotent per quest per period.
 */
import type { Skill } from "@/db/schema";

export type QuestSnapshot = {
  morningPlanned: boolean;
  eveningReviewed: boolean;
  loggedToday: boolean;
  topPrioritiesDoneToday: number;
  briefingReadToday: boolean;
  weekTxnCount: number;
  weekUncategorised: number;
  weeklyReviewDone: boolean;
  storiesExplainedThisWeek: number;
  focusSessionsThisWeek: number; // completed, realistic length
  subscriptionsReviewedThisWeek: number;
  hasSubscriptions: boolean;
  emergencyContributionThisWeek: boolean;
  hasEmergencyGoal: boolean;
};

export type QuestDef = {
  id: string;
  period: "daily" | "weekly";
  title: string;
  description: string;
  skill: Skill;
  bonusXp: number;
  target: number;
  progress: (s: QuestSnapshot) => number;
  available?: (s: QuestSnapshot) => boolean;
  href: string;
};

export const QUESTS: QuestDef[] = [
  { id: "plan-day", period: "daily", title: "Plan your day", description: "Pick up to three priorities in the morning plan.", skill: "discipline", bonusXp: 5, target: 1, progress: (s) => Number(s.morningPlanned), href: "/today?flow=morning" },
  { id: "log-money", period: "daily", title: "Log today's money", description: "Add today's transactions, or confirm a no-spend day.", skill: "money", bonusXp: 5, target: 1, progress: (s) => Number(s.loggedToday), href: "/money/transactions/new" },
  { id: "one-priority", period: "daily", title: "Finish a top priority", description: "Complete one of today's top priorities.", skill: "discipline", bonusXp: 5, target: 1, progress: (s) => Math.min(1, s.topPrioritiesDoneToday), href: "/schedule" },
  { id: "evening", period: "daily", title: "Evening check-in", description: "Close the day: review, carry forward or let go.", skill: "discipline", bonusXp: 5, target: 1, progress: (s) => Number(s.eveningReviewed), href: "/today?flow=evening" },
  { id: "categorize-week", period: "weekly", title: "Categorise this week's transactions", description: "Every expense this week has a category.", skill: "money", bonusXp: 15, target: 1, progress: (s) => Number(s.weekTxnCount > 0 && s.weekUncategorised === 0), href: "/money/transactions?uncategorised=1" },
  { id: "weekly-review", period: "weekly", title: "Complete a weekly money review", description: "Look at what changed, your goals and what's coming up.", skill: "money", bonusXp: 20, target: 1, progress: (s) => Number(s.weeklyReviewDone), href: "/plan/review" },
  { id: "explain-story", period: "weekly", title: "Explain one business development", description: "Read a story and write in one line why it matters.", skill: "business", bonusXp: 15, target: 1, progress: (s) => Math.min(1, s.storiesExplainedThisWeek), href: "/signals" },
  { id: "focus", period: "weekly", title: "Complete a realistic focus session", description: "A session of 15–90 minutes, finished as planned.", skill: "discipline", bonusXp: 10, target: 1, progress: (s) => Math.min(1, s.focusSessionsThisWeek), href: "/schedule/focus" },
  { id: "review-sub", period: "weekly", title: "Review a subscription", description: "Keep, downgrade or cancel one subscription on purpose.", skill: "money", bonusXp: 10, target: 1, progress: (s) => Math.min(1, s.subscriptionsReviewedThisWeek), available: (s) => s.hasSubscriptions, href: "/money/bills" },
  { id: "emergency-progress", period: "weekly", title: "Move your emergency fund forward", description: "Any contribution counts. The amount does not change the reward.", skill: "money", bonusXp: 10, target: 1, progress: (s) => Number(s.emergencyContributionThisWeek), available: (s) => s.hasEmergencyGoal, href: "/plan/goals" },
];

export type QuestStatus = QuestDef & { current: number; complete: boolean; claimed: boolean; periodKey: string };

/** Serializable view for client components (drops the progress functions). */
export type QuestView = Omit<QuestStatus, "progress" | "available">;
export const toQuestView = (q: QuestStatus): QuestView => ({ id: q.id, period: q.period, title: q.title, description: q.description, skill: q.skill, bonusXp: q.bonusXp, target: q.target, href: q.href, current: q.current, complete: q.complete, claimed: q.claimed, periodKey: q.periodKey });

export function evaluateQuests(
  snapshot: QuestSnapshot,
  periodKeys: { daily: string; weekly: string },
  claimedKeys: Set<string>,
): QuestStatus[] {
  return QUESTS.filter((q) => !q.available || q.available(snapshot)).map((q) => {
    const current = Math.min(q.target, q.progress(snapshot));
    const periodKey = periodKeys[q.period];
    return { ...q, current, complete: current >= q.target, claimed: claimedKeys.has(`quest:${q.id}:${periodKey}`), periodKey };
  });
}
