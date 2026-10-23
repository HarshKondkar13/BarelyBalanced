/**
 * Chooses ONE next best action for the Today screen, with the reason shown to the user.
 * Deterministic priority order: urgent money obligations first, then planning, then
 * follow-through. It never suggests trading or moving money between investments.
 */
import type { Insight } from "@/lib/finance/insights";
import { formatINR } from "@/lib/money";

export type NBAInput = {
  hour: number; // local hour 0-23
  dow: number; // 0 = Sunday
  overdue: Array<{ id: string; name: string; amount: number }>;
  dueSoon: Array<{ itemId: string; name: string; amount: number; daysAway: number }>;
  insights: Insight[];
  morningPlanned: boolean;
  eveningReviewed: boolean;
  weeklyReviewDone: boolean;
  nextPriority: { id: string; title: string } | null;
  loggedToday: boolean;
  hasAccounts: boolean;
  onboardingDone: boolean;
};

export type NBA = { id: string; title: string; why: string; href: string; cta: string };

export function nextBestAction(i: NBAInput): NBA {
  if (!i.onboardingDone) return { id: "onboarding", title: "Set up your plan", why: "A few answers (all skippable) let the app tailor budgets, reserves and the weekly plan to you.", href: "/onboarding", cta: "Start (5 min)" };
  if (!i.hasAccounts) return { id: "account", title: "Add your main account", why: "Everything else (budgets, insights, cash forecasts) builds on knowing your balances.", href: "/money/accounts/new", cta: "Add account" };
  if (i.overdue.length) {
    const o = i.overdue[0];
    return { id: `overdue:${o.id}`, title: `Record or pay ${o.name}`, why: `It's past its due date (${formatINR(o.amount, { whole: true })}). Late payments can mean fees or interest; if it's already paid, recording it keeps your forecast accurate.`, href: "/money/bills", cta: "Open bills" };
  }
  const shortfall = i.insights.find((x) => x.kind === "cash_shortfall");
  if (shortfall) return { id: shortfall.key, title: shortfall.title, why: shortfall.what, href: "/money", cta: "See the projection" };
  if (!i.morningPlanned && i.hour < 14) return { id: "morning", title: "Plan your day", why: "Choosing up to three priorities takes two minutes and makes the rest of the day easier to judge.", href: "/today?flow=morning", cta: "Plan my day" };
  const urgentBill = i.dueSoon.find((d) => d.daysAway <= 2);
  if (urgentBill) return { id: `due:${urgentBill.itemId}`, title: `${urgentBill.name} is due ${urgentBill.daysAway === 0 ? "today" : urgentBill.daysAway === 1 ? "tomorrow" : "in 2 days"}`, why: `${formatINR(urgentBill.amount, { whole: true })} is coming up. Paying or scheduling it now avoids a last-minute scramble.`, href: "/money/bills", cta: "Review bill" };
  if (!i.weeklyReviewDone && (i.dow === 0 || i.dow === 6 || (i.dow === 1 && i.hour < 12))) return { id: "weekly", title: "Do your weekly money review", why: "Fifteen minutes to see what changed, check goals and decide on next week. Continuing your current plan is a perfectly good outcome.", href: "/plan/review", cta: "Start review" };
  const attention = i.insights.find((x) => x.severity === "attention");
  if (attention) {
    const sched = attention.actions.find((a) => a.type === "schedule_task");
    return { id: attention.key, title: attention.title, why: `${attention.what} ${attention.next}`, href: "/money", cta: sched ? "See suggestion" : "Look into it" };
  }
  if (i.hour >= 19 && !i.eveningReviewed) return { id: "evening", title: "Close the day", why: "A short check-in: decide what moves to tomorrow and note how the day went.", href: "/today?flow=evening", cta: "Evening check-in" };
  if (i.nextPriority) return { id: `task:${i.nextPriority.id}`, title: i.nextPriority.title, why: "It's your next unfinished top priority for today.", href: `/schedule/focus?task=${i.nextPriority.id}`, cta: "Start a focus session" };
  if (!i.loggedToday && i.hour >= 17) return { id: "log", title: "Log today's spending", why: "A one-minute habit that keeps budgets and insights accurate. If you spent nothing, say so.", href: "/money/transactions/new", cta: "Add transaction" };
  return { id: "rest", title: "You're on track", why: "Nothing urgent. Read today's briefing or take a break; not every minute needs filling.", href: "/signals", cta: "Read the briefing" };
}
