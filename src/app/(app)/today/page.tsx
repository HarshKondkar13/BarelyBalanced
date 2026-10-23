import Link from "next/link";
import { and, eq, gte, lte } from "drizzle-orm";
import { ArrowRight, Flame, Moon, Plus, Sunrise } from "lucide-react";
import { getContext } from "@/server/context";
import { loadFinanceSnapshot, loadProgress } from "@/server/views";
import { materializeRoutines } from "@/server/schedule";
import { loadStories } from "@/server/news";
import { externalEvents } from "@/db/schema";
import { addDays, dayOfWeek, formatLongDate, formatTime12, localDateTimeToInstant, relativeDayLabel, toLocalTime } from "@/lib/dates";
import { dayCapacity, type Block } from "@/lib/schedule/planner";
import { nextBestAction } from "@/lib/next-best-action";
import { formatINR, formatPercent } from "@/lib/money";
import { Badge, ButtonLink, Card, CardHeader, Money, Progress, Stat } from "@/components/ui";
import { TaskItem } from "@/components/task-item";
import { InsightCard } from "@/components/insight-card";
import { QuestList } from "@/components/quest-list";
import { toQuestView } from "@/lib/gamification/quests";
import { EveningReview, MorningPlan } from "./flows";

export const metadata = { title: "Today" };

export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const ctx = await getContext();
  const { db, user, today, tz, prefs } = ctx;
  const sp = await searchParams;
  await materializeRoutines(user.id, today, db);
  const now = new Date();
  const hour = Number(toLocalTime(now, tz).slice(0, 2));
  const fin = await loadFinanceSnapshot(ctx);
  const [progress, events, news] = await Promise.all([
    loadProgress(ctx, fin),
    db.select().from(externalEvents).where(and(eq(externalEvents.userId, user.id), gte(externalEvents.endAt, localDateTimeToInstant(today, "00:00", tz)), lte(externalEvents.startAt, localDateTimeToInstant(addDays(today, 1), "00:00", tz)))),
    loadStories(db, { topics: prefs?.newsTopics?.length ? prefs.newsTopics : undefined, sinceDays: 3, limit: 3 }),
  ]);
  const tasksToday = progress.todayTasks.sort((a, b) => Number(b.isTopPriority) - Number(a.isTopPriority) || (a.startTime ?? "99").localeCompare(b.startTime ?? "99"));
  const priorities = tasksToday.filter((t) => t.isTopPriority).slice(0, 3);
  const rest = tasksToday.filter((t) => !t.isTopPriority && t.status !== "skipped");
  const gamified = prefs?.gamification !== "off";
  const reduced = prefs?.gamification === "reduced";

  const blocks: Block[] = [
    ...tasksToday.filter((t) => t.startTime && t.status === "todo").map((t) => ({ id: t.id, title: t.title, start: t.startTime!, durationMin: t.durationMin, source: "task" as const })),
    ...events.filter((e) => e.startAt && e.endAt).map((e) => ({ id: e.id, title: e.title ?? "Busy", start: toLocalTime(e.startAt!, tz), durationMin: Math.round((e.endAt!.getTime() - e.startAt!.getTime()) / 60000), source: "calendar" as const })),
  ];
  const cap = dayCapacity(blocks, tasksToday.filter((t) => !t.startTime && t.status === "todo").map((t) => t.durationMin));

  const nba = nextBestAction({
    hour,
    dow: dayOfWeek(today),
    overdue: fin.overdue.map((o) => ({ id: o.id, name: o.name, amount: o.amount })),
    dueSoon: fin.dueSoon,
    insights: fin.insights,
    morningPlanned: progress.snapshot.morningPlanned,
    eveningReviewed: progress.snapshot.eveningReviewed,
    weeklyReviewDone: progress.weeklyReviewDone,
    nextPriority: priorities.find((t) => t.status === "todo") ?? null,
    loggedToday: progress.snapshot.loggedToday,
    hasAccounts: fin.accounts.length > 0,
    onboardingDone: Boolean(prefs?.onboardingCompletedAt),
  });
  const insight = fin.insights.find((i) => i.key !== nba.id) ?? null;
  const budgetTotal = fin.variance.totalBudget;
  const flow = sp.flow === "morning" ? "morning" : sp.flow === "evening" ? "evening" : null;
  const mode = hour < 12 ? "morning" : hour >= 18 ? "evening" : "day";
  const name = prefs?.displayName || user.name.split(" ")[0];
  const quests = progress.quests.map(toQuestView);
  const openQuests = quests.filter((q) => !q.claimed);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-muted">{formatLongDate(today)}</p>
        <h1 className="text-2xl font-bold tracking-tight">{mode === "morning" ? "Good morning" : mode === "evening" ? "Good evening" : "Hello"}, {name}</h1>
        {gamified && progress.streak.current > 1 ? (
          <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted">
            <Flame size={14} className="text-accent" aria-hidden /> {progress.streak.current}-day rhythm
            {progress.streak.restDaysLeftThisWeek > 0 ? <span className="text-subtle"> · {progress.streak.restDaysLeftThisWeek} rest day available this week</span> : null}
          </p>
        ) : null}
      </header>

      {flow === "morning" ? <MorningPlan tasks={tasksToday.filter((t) => t.status === "todo")} freeMinutes={cap.windowMin - cap.committedMin - cap.bufferMin} /> : null}
      {flow === "evening" ? <EveningReview unfinished={tasksToday.filter((t) => t.status === "todo")} loggedToday={progress.snapshot.loggedToday} /> : null}

      {!flow ? (
        <section aria-labelledby="nba-title" className="rounded-[var(--radius)] bg-primary p-4 text-primary-fg shadow-[var(--shadow)]">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Next best action</p>
          <h2 id="nba-title" className="mt-1 text-lg font-bold leading-snug">{nba.title}</h2>
          <p className="mt-1 text-sm opacity-90"><span className="font-semibold">Why: </span>{nba.why}</p>
          <Link href={nba.href} className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary-fg px-4 text-sm font-semibold text-primary">
            {nba.cta} <ArrowRight size={16} aria-hidden />
          </Link>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Today's plan"
            subtitle={`${tasksToday.filter((t) => t.status === "done").length} of ${tasksToday.filter((t) => t.status !== "skipped").length} done${events.length ? ` · ${events.length} calendar event${events.length > 1 ? "s" : ""}` : ""}`}
            action={<Link href="/schedule" className="text-sm font-semibold text-primary">Schedule</Link>}
          />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-subtle">Top priorities</h3>
          {priorities.length ? (
            <ul className="divide-y divide-border">{priorities.map((t) => <TaskItem key={t.id} task={t} tomorrow={addDays(today, 1)} />)}</ul>
          ) : (
            <p className="py-2 text-sm text-muted">None chosen yet. <Link href="/today?flow=morning" className="font-semibold text-primary">Pick up to three</Link>.</p>
          )}
          {rest.length || events.length ? (
            <details className="mt-2">
              <summary className="flex min-h-10 items-center text-sm font-medium text-primary">Everything else today ({rest.length + events.length})</summary>
              <ul className="divide-y divide-border">
                {events.filter((e) => e.startAt).map((e) => (
                  <li key={e.id} className="flex min-h-12 items-center gap-3 py-2 text-sm">
                    <Badge tone="info">Cal</Badge>
                    <span className="flex-1 truncate">{e.title ?? "Busy"}</span>
                    <span className="num text-xs text-muted">{formatTime12(toLocalTime(e.startAt!, tz))}</span>
                  </li>
                ))}
                {rest.map((t) => <TaskItem key={t.id} task={t} tomorrow={addDays(today, 1)} />)}
              </ul>
            </details>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {!progress.snapshot.morningPlanned ? <ButtonLink href="/today?flow=morning" variant="soft" size="sm"><Sunrise size={14} aria-hidden /> Morning plan</ButtonLink> : null}
            {hour >= 16 && !progress.snapshot.eveningReviewed ? <ButtonLink href="/today?flow=evening" variant="soft" size="sm"><Moon size={14} aria-hidden /> Evening check-in</ButtonLink> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Money this month" subtitle={`${formatPercent(fin.elapsed)} of the month gone`} action={<ButtonLink href="/money/transactions/new" size="sm" aria-label="Add a transaction"><Plus size={16} aria-hidden /> Add</ButtonLink>} />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Spent so far" value={<Money paise={fin.monthSummary.spending} />} hint="after refunds; transfers excluded" />
            <Stat label="Budget left" value={budgetTotal ? <Money paise={fin.variance.totalRemaining} /> : "—"} hint={budgetTotal ? `of ${formatINR(budgetTotal, { whole: true })} budgeted` : <Link href="/money/budgets" className="font-semibold text-primary">Set budgets</Link>} />
          </div>
          {budgetTotal ? <Progress className="mt-3" value={fin.variance.totalSpentInBudgeted / budgetTotal} tone={fin.variance.totalRemaining < 0 ? "danger" : fin.variance.totalSpentInBudgeted / budgetTotal > fin.elapsed + 0.1 ? "attention" : "primary"} label="Budget used" /> : null}
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-subtle">Coming up (7 days)</h3>
          {fin.overdue.length || fin.dueSoon.length ? (
            <ul className="mt-1 divide-y divide-border text-sm">
              {fin.overdue.map((o) => (
                <li key={o.id} className="flex min-h-11 items-center justify-between gap-2"><span className="truncate">{o.name} <Badge tone="danger">Overdue</Badge></span><span className="num">{formatINR(o.amount, { whole: true })}</span></li>
              ))}
              {fin.dueSoon.slice(0, 4).map((d) => (
                <li key={`${d.itemId}-${d.date}`} className="flex min-h-11 items-center justify-between gap-2"><span className="truncate">{d.name} <span className="text-xs text-subtle">· {relativeDayLabel(d.date, today)}</span></span><span className="num">{formatINR(d.amount, { whole: true })}</span></li>
              ))}
            </ul>
          ) : <p className="mt-1 text-sm text-muted">No bills due in the next week{fin.recurring.length ? "" : ". Add recurring bills to get reminders"}.</p>}
        </Card>
      </div>

      {insight ? (
        <section aria-label="Insight">
          <InsightCard insight={insight} compact />
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Briefing" subtitle={news.usingDemo ? "Demonstration stories: no news provider connected" : "Latest from your followed topics"} action={<Link href="/signals" className="text-sm font-semibold text-primary">Signals</Link>} />
          <ul className="space-y-3">
            {news.stories.map((s) => (
              <li key={s.id}>
                <Link href={`/signals/${s.id}`} className="block rounded-lg hover:bg-surface-2">
                  <p className="text-[15px] font-medium leading-snug">{s.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted">{s.explainer?.whyItMatters ?? s.summary}</p>
                  <p className="mt-0.5 text-xs text-subtle">{s.isDemo ? <Badge tone="accent">Demo</Badge> : s.sourceName} · {s.topic}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        {gamified ? (
          <Card>
            <CardHeader
              title="Quests"
              subtitle={reduced ? "Simple checklist mode" : `Level ${progress.summary.level} · ${progress.xpToday} XP today`}
              action={<Link href="/progress" className="text-sm font-semibold text-primary">Progress</Link>}
            />
            {!reduced ? <Progress value={progress.summary.progress} label={`Progress to level ${progress.summary.level + 1}`} className="mb-2" /> : null}
            <QuestList quests={openQuests.slice(0, 4)} reduced={reduced} />
            {openQuests.length > 4 ? <Link href="/progress" className="mt-2 inline-flex min-h-10 items-center text-sm font-medium text-primary">{openQuests.length - 4} more quests</Link> : null}
            {openQuests.length === 0 ? <p className="text-sm text-muted">All quests done for now. Enjoy the rest of your day.</p> : null}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
