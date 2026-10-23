import "server-only";
import { and, eq, gte, lte } from "drizzle-orm";
import { habitLogs, tasks } from "@/db/schema";
import { addDays, endOfMonth, monthKey, startOfWeek, formatShortDate, diffDays } from "@/lib/dates";
import { computeBalances, summarizePeriod, UNCATEGORISED } from "@/lib/finance/ledger";
import { occurrencesBetween } from "@/lib/finance/forecast";
import { illustrativeMix } from "@/lib/finance/allocation";
import { formatINR } from "@/lib/money";
import type { AppContext } from "./context";
import type { FinanceSnapshot } from "./views";
import { buildPlan } from "./plan";

export type ReviewAction = { id: string; title: string; planDate: string; kind: "money_review" | "bill" | "budget_setup" | "plan_review" | "task"; durationMin: number; why: string };

/** Everything shown in the weekly review, computed deterministically for the current week. */
export async function buildWeeklyReview(ctx: AppContext, fin: FinanceSnapshot) {
  const { today, db, user } = ctx;
  const weekStart = startOfWeek(today, ctx.prefs?.weekStartsOn ?? 1);
  const last7From = addDays(today, -6);
  const prev7From = addDays(today, -13);
  const thisWeek = summarizePeriod(fin.txns, last7From, today, fin.categories);
  const prevWeek = summarizePeriod(fin.txns, prev7From, addDays(today, -7), fin.categories);
  const catName = (id: string) => (id === UNCATEGORISED ? "Uncategorised" : (fin.categories.find((c) => c.id === id)?.name ?? "Uncategorised"));
  const changes = [...new Set([...thisWeek.byCategory.keys(), ...prevWeek.byCategory.keys()])]
    .map((id) => ({ id, name: catName(id), now: thisWeek.byCategory.get(id) ?? 0, before: prevWeek.byCategory.get(id) ?? 0 }))
    .map((c) => ({ ...c, delta: c.now - c.before }))
    .filter((c) => Math.abs(c.delta) >= 50000)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 4);
  const balNow = computeBalances(fin.accounts, fin.txns, today);
  const balThen = computeBalances(fin.accounts, fin.txns, addDays(today, -7));
  const liquidTypes = new Set(["bank", "cash", "wallet"]);
  const liquidDelta = fin.accounts.filter((a) => liquidTypes.has(a.type) && !a.archived).reduce((s, a) => s + (balNow.get(a.id)!.balance - balThen.get(a.id)!.balance), 0);
  const cardOwedDelta = fin.accounts.filter((a) => a.type === "credit_card").reduce((s, a) => s + ((balNow.get(a.id)!.owed ?? 0) - (balThen.get(a.id)!.owed ?? 0)), 0);

  const planData = buildPlan(ctx, fin);
  const upcoming = occurrencesBetween(fin.recurring, today, addDays(today, 14)).filter((o) => o.direction === "outflow");
  const upcomingTotal = upcoming.reduce((a, o) => a + o.amount, 0);
  const longestGoal = planData.goalsWithPace.filter((g) => g.kind !== "emergency" && g.monthsLeft).sort((a, b) => (b.monthsLeft ?? 0) - (a.monthsLeft ?? 0))[0];
  const mix = illustrativeMix(longestGoal?.monthsLeft ? longestGoal.monthsLeft / 12 : 10, planData.risk.level);

  const [weekTasks, weekHabits] = await Promise.all([
    db.select().from(tasks).where(and(eq(tasks.userId, user.id), gte(tasks.planDate, weekStart), lte(tasks.planDate, today))),
    db.select().from(habitLogs).where(and(eq(habitLogs.userId, user.id), gte(habitLogs.date, weekStart))),
  ]);
  const time = {
    planned: weekTasks.filter((t) => t.status !== "skipped").length,
    done: weekTasks.filter((t) => t.status === "done").length,
    slipped: weekTasks.filter((t) => t.carryCount >= 2 && t.status === "todo").map((t) => t.title).slice(0, 3),
    habitChecks: weekHabits.length,
  };

  // Suggested actions; the user chooses which to accept.
  const actions: ReviewAction[] = [];
  const nextMonday = addDays(weekStart, 7);
  for (const o of upcoming.slice(0, 4)) {
    const d = addDays(o.date, -1) < today ? today : addDays(o.date, -1);
    actions.push({ id: `bill:${o.itemId}:${o.date}`, title: `Pay ${o.name} (${formatINR(o.amount, { whole: true })})`, planDate: d, kind: "bill", durationMin: 10, why: `Due ${formatShortDate(o.date)}` });
  }
  for (const line of planData.plan.schedule) {
    actions.push({ id: `contrib:${line.target}:${weekStart}`, title: `Set aside ${formatINR(line.monthly, { whole: true })} for ${line.target.split(" (")[0].toLowerCase()}`, planDate: nextMonday, kind: "money_review", durationMin: 15, why: line.rationale });
  }
  if (diffDays(endOfMonth(monthKey(today)), today) <= 7) {
    actions.push({ id: `budget:${monthKey(addDays(endOfMonth(monthKey(today)), 1))}`, title: "Set next month's budget", planDate: endOfMonth(monthKey(today)), kind: "budget_setup", durationMin: 15, why: "The month ends within a week." });
  }
  for (const i of fin.insights.slice(0, 2)) {
    const a = i.actions.find((x) => x.type === "schedule_task");
    if (a && a.type === "schedule_task") actions.push({ id: `insight:${i.key}`, title: a.task.title, planDate: a.task.planDate, kind: a.task.kind === "task" ? "money_review" : (a.task.kind as ReviewAction["kind"]), durationMin: a.task.durationMin, why: i.title });
  }
  if (planData.plan.outcome === "room_to_increase" || planData.plan.outcome === "fund_near_term") {
    actions.push({ id: `planreview:${weekStart}`, title: "Review investment plan scenarios (30 min)", planDate: addDays(nextMonday, 5), kind: "plan_review", durationMin: 30, why: "A calm look before changing anything." });
  }

  const snapshot = {
    generatedFor: today,
    spending7d: thisWeek.spending,
    spendingPrev7d: prevWeek.spending,
    income7d: thisWeek.income,
    liquidDelta,
    cardOwedDelta,
    upcoming14d: upcomingTotal,
    planOutcome: planData.plan.outcome,
    monthlySurplus: planData.plan.monthlySurplus,
    emergencyMonthsCovered: planData.plan.emergencyMonthsCovered,
    tasksDone: time.done,
    tasksPlanned: time.planned,
  };
  return { weekStart, thisWeek, prevWeek, changes, liquidDelta, cardOwedDelta, planData, upcoming, upcomingTotal, mix, longestGoal, time, actions, snapshot };
}
