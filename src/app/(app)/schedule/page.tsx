import Link from "next/link";
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { getContext } from "@/server/context";
import { materializeRoutines } from "@/server/schedule";
import { externalEvents, habitLogs, habits, tasks } from "@/db/schema";
import { addDays, formatLongDate, localDateTimeToInstant, relativeDayLabel, toLocalTime, formatTime12, startOfWeek } from "@/lib/dates";
import { dayCapacity, findConflicts, findFreeSlot, slipSuggestions, type Block } from "@/lib/schedule/planner";
import { Badge, Card, CardHeader, Notice, PageHeader, SectionTitle, SubNav } from "@/components/ui";
import { TaskItem } from "@/components/task-item";
import { AddTask } from "@/components/add-task";
import { CarryForward } from "@/components/carry-forward";
import { HabitRow } from "@/components/habit-row";
import { cn } from "@/lib/cn";
import { SCHEDULE_TABS } from "./tabs";

export const metadata = { title: "Schedule" };


export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const ctx = await getContext();
  const { db, user, today, tz } = ctx;
  const sp = await searchParams;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  await materializeRoutines(user.id, date, db);

  const dayStart = localDateTimeToInstant(date, "00:00", tz);
  const dayEnd = localDateTimeToInstant(addDays(date, 1), "00:00", tz);
  const weekStart = startOfWeek(today, ctx.prefs?.weekStartsOn ?? 1);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const [dayTasks, events, stale, habitRows, logs] = await Promise.all([
    db.select().from(tasks).where(and(eq(tasks.userId, user.id), eq(tasks.planDate, date))).orderBy(asc(tasks.startTime), asc(tasks.createdAt)),
    db.select().from(externalEvents).where(and(eq(externalEvents.userId, user.id), lte(externalEvents.startAt, dayEnd), gte(externalEvents.endAt, dayStart))),
    date === today ? db.select().from(tasks).where(and(eq(tasks.userId, user.id), eq(tasks.status, "todo"), lte(tasks.planDate, addDays(today, -1)), gte(tasks.planDate, addDays(today, -14)))) : Promise.resolve([]),
    db.select().from(habits).where(and(eq(habits.userId, user.id), eq(habits.archived, false))),
    db.select().from(habitLogs).where(and(eq(habitLogs.userId, user.id), gte(habitLogs.date, weekStart))),
  ]);
  const allDayEvents = await db.select().from(externalEvents).where(and(eq(externalEvents.userId, user.id), eq(externalEvents.allDayDate, date), isNull(externalEvents.startAt)));

  const blocks: Block[] = [
    ...dayTasks.filter((t) => t.startTime && t.status !== "skipped").map((t) => ({ id: t.id, title: t.title, start: t.startTime!, durationMin: t.durationMin, source: "task" as const })),
    ...events.filter((e) => e.startAt && e.endAt && e.status !== "cancelled").map((e) => ({ id: e.id, title: e.title ?? "Busy", start: toLocalTime(e.startAt!, tz), durationMin: Math.round((e.endAt!.getTime() - e.startAt!.getTime()) / 60000), source: "calendar" as const })),
  ];
  const conflicts = findConflicts(blocks);
  const conflictIds = new Set(conflicts.flatMap((c) => [c.a.id, c.b.id]));
  const flexible = dayTasks.filter((t) => !t.startTime && t.status === "todo").map((t) => t.durationMin);
  const cap = dayCapacity(blocks.filter((b) => b.source === "calendar" || dayTasks.find((t) => t.id === b.id)?.status === "todo"), flexible);
  const slot = findFreeSlot(blocks, 30, undefined, date === today ? toLocalTime(new Date(), tz) : undefined);
  const suggestions = slipSuggestions(dayTasks.filter((t) => t.status === "todo"));
  const timeline = [
    ...dayTasks.filter((t) => t.startTime).map((t) => ({ type: "task" as const, time: t.startTime!, t })),
    ...events.filter((e) => e.startAt).map((e) => ({ type: "event" as const, time: toLocalTime(e.startAt!, tz), e })),
  ].sort((a, b) => a.time.localeCompare(b.time));
  const anytime = dayTasks.filter((t) => !t.startTime);
  const tomorrow = addDays(date, 1);
  const tv = (t: (typeof dayTasks)[number]) => ({ ...t });

  return (
    <>
      <PageHeader eyebrow={relativeDayLabel(date, today)} title={formatLongDate(date)} />
      <SubNav items={SCHEDULE_TABS} active="/schedule" />
      <nav aria-label="Choose day" className="mb-4 flex items-center gap-2 text-sm">
        <Link className="min-h-9 rounded-full border border-border px-3 py-1.5" href={`/schedule?date=${addDays(date, -1)}`}>← Prev</Link>
        {date !== today ? <Link className="min-h-9 rounded-full border border-border px-3 py-1.5" href="/schedule">Today</Link> : null}
        <Link className="min-h-9 rounded-full border border-border px-3 py-1.5" href={`/schedule?date=${addDays(date, 1)}`}>Next →</Link>
      </nav>

      {stale.length ? <div className="mb-4"><CarryForward tasks={stale.map((t) => ({ id: t.id, title: t.title, planDate: t.planDate!, carryCount: t.carryCount }))} today={today} /></div> : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Capacity" subtitle="Realistic planning keeps a buffer for transitions and surprises" />
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-surface-2 p-2"><p className="num font-semibold">{Math.round((cap.committedMin + cap.flexibleMin) / 6) / 10}h</p><p className="text-xs text-muted">planned</p></div>
              <div className="rounded-xl bg-surface-2 p-2"><p className="num font-semibold">{Math.round(cap.bufferMin / 6) / 10}h</p><p className="text-xs text-muted">buffer (20%)</p></div>
              <div className={cn("rounded-xl p-2", cap.overcommitted ? "bg-danger-soft text-danger" : "bg-positive-soft text-positive")}><p className="num font-semibold">{Math.round(cap.freeMin / 6) / 10}h</p><p className="text-xs">{cap.overcommitted ? "over capacity" : "free"}</p></div>
            </div>
            {cap.overcommitted ? <Notice tone="attention" className="mt-3">This day holds more than fits between 8 am and 9 pm with a buffer. Move something to another day or the inbox. You don&apos;t have to fill every free minute either.</Notice> : null}
            {conflicts.length ? (
              <Notice tone="danger" className="mt-3" title={`${conflicts.length} scheduling conflict${conflicts.length > 1 ? "s" : ""}`}>
                <ul>{conflicts.map((c) => <li key={c.a.id + c.b.id}>&ldquo;{c.a.title}&rdquo; overlaps &ldquo;{c.b.title}&rdquo; by {c.overlapMin} min</li>)}</ul>
              </Notice>
            ) : null}
          </Card>

          {suggestions.length ? (
            <Card>
              <CardHeader title="Some tasks keep slipping" subtitle="That usually means the plan needs adjusting, not you" />
              <ul className="space-y-2 text-sm text-muted">{suggestions.map((s) => <li key={s.taskId}>{s.message}</li>)}</ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Timeline" subtitle={events.length || allDayEvents.length ? "Your tasks plus events from connected calendars" : "Timed tasks. Connect Google Calendar in Settings to see events here."} />
            {allDayEvents.length ? <ul className="mb-2 flex flex-wrap gap-1.5">{allDayEvents.map((e) => <li key={e.id}><Badge tone="info">All day · {e.title ?? "Busy"}</Badge></li>)}</ul> : null}
            {timeline.length === 0 ? <p className="text-sm text-muted">Nothing at a fixed time. {slot ? `Your first free 30-minute slot is at ${formatTime12(slot)}.` : ""}</p> : (
              <ul className="divide-y divide-border">
                {timeline.map((item) =>
                  item.type === "task" ? (
                    <TaskItem key={item.t.id} task={tv(item.t)} tomorrow={tomorrow} conflict={conflictIds.has(item.t.id)} />
                  ) : (
                    <li key={item.e.id} className="flex min-h-14 items-center gap-3 py-2">
                      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-info-soft text-[10px] font-bold text-info" aria-hidden>Cal</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium">{item.e.title ?? "Busy"}</p>
                        <p className="text-xs text-muted">
                          {formatTime12(item.time)} – {formatTime12(toLocalTime(item.e.endAt!, tz))} · Google Calendar (read-only)
                          {conflictIds.has(item.e.id) ? <Badge tone="danger" className="ml-1">Overlaps</Badge> : null}
                        </p>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Anytime today" subtitle="Flexible tasks without a fixed time" />
            {anytime.length ? <ul className="divide-y divide-border">{anytime.map((t) => <TaskItem key={t.id} task={tv(t)} tomorrow={tomorrow} />)}</ul> : <p className="mb-2 text-sm text-muted">No flexible tasks.</p>}
            <div className="mt-3"><AddTask date={date} suggestedSlot={slot ? formatTime12(slot) : null} /></div>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title="Habits this week" action={<Link href="/schedule/routines" className="text-sm font-semibold text-primary">Manage</Link>} />
            {habitRows.length ? (
              <ul className="divide-y divide-border">
                {habitRows.map((h) => <HabitRow key={h.id} habit={h} days={weekDays} doneDates={logs.filter((l) => l.habitId === h.id).map((l) => l.date)} />)}
              </ul>
            ) : <p className="text-sm text-muted">No habits yet. Add one or two you genuinely want, not ten.</p>}
            <p className="mt-2 text-xs text-subtle">Weekly targets leave room for rest days.</p>
          </Card>
        </aside>
      </div>
      <SectionTitle>Plan ahead</SectionTitle>
      <p className="text-sm text-muted">Financial follow-through, such as the weekly money review, bill reminders and briefing reading, appears here as routines. Manage them under <Link href="/schedule/routines" className="font-semibold text-primary">Routines</Link>.</p>
    </>
  );
}
