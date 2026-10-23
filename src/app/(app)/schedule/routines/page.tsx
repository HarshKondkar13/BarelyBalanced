import { and, eq } from "drizzle-orm";
import { getContext } from "@/server/context";
import { habits, routines } from "@/db/schema";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Select, SubNav } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { ActionButton } from "@/components/toast";
import { archiveHabitAction, createHabitAction, createRoutineAction, toggleRoutineAction } from "@/app/(app)/_actions/schedule";
import { formatTime12 } from "@/lib/dates";
import { SCHEDULE_TABS } from "../tabs";

export const metadata = { title: "Routines & habits" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function RoutinesPage() {
  const { db, user } = await getContext();
  const [rs, hs] = await Promise.all([
    db.select().from(routines).where(eq(routines.userId, user.id)),
    db.select().from(habits).where(and(eq(habits.userId, user.id), eq(habits.archived, false))),
  ]);
  return (
    <>
      <PageHeader title="Routines & habits" />
      <SubNav items={SCHEDULE_TABS} active="/schedule/routines" />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Routines" subtitle="Recurring time blocks that appear on your schedule automatically" />
          <ul className="mb-4 divide-y divide-border">
            {rs.map((r) => (
              <li key={r.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.title} {!r.active ? <Badge>Paused</Badge> : null}</p>
                  <p className="text-xs text-muted">{r.daysOfWeek.map((d) => DAYS[d]).join(", ")}{r.startTime ? ` · ${formatTime12(r.startTime)}` : ""} · {r.durationMin} min</p>
                </div>
                <ActionButton action={toggleRoutineAction.bind(null, r.id)}>{r.active ? "Pause" : "Resume"}</ActionButton>
              </li>
            ))}
          </ul>
          <details>
            <summary className="min-h-10 text-sm font-semibold text-primary">Add a routine</summary>
            <div className="mt-3">
              <ActionForm action={createRoutineAction} submitLabel="Add routine" resetOnSuccess>
                <Field label="Title" htmlFor="r-title"><Input id="r-title" name="title" placeholder="e.g. Monthly budget setup" required /></Field>
                <fieldset>
                  <legend className="mb-1 text-sm font-medium">Days</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((d, i) => (
                      <label key={d} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-sm"><input type="checkbox" name="days" value={i} className="accent-[var(--primary)]" />{d}</label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Start" htmlFor="r-start"><Input id="r-start" name="startTime" type="time" step={900} /></Field>
                  <Field label="Minutes" htmlFor="r-dur"><Input id="r-dur" name="durationMin" type="number" defaultValue={15} min={5} max={240} /></Field>
                  <Field label="Type" htmlFor="r-kind">
                    <Select id="r-kind" name="kind" defaultValue="task">
                      <option value="task">Task</option>
                      <option value="money_review">Money review</option>
                      <option value="budget_setup">Budget setup</option>
                      <option value="briefing">Briefing</option>
                      <option value="plan_review">Plan review</option>
                    </Select>
                  </Field>
                </div>
              </ActionForm>
            </div>
          </details>
        </Card>
        <Card>
          <CardHeader title="Habits" subtitle="Weekly targets, not daily perfection" />
          <ul className="mb-4 divide-y divide-border">
            {hs.map((h) => (
              <li key={h.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
                <div><p className="font-medium">{h.title}</p><p className="text-xs text-muted">{h.targetPerWeek}× a week</p></div>
                <ActionButton action={archiveHabitAction.bind(null, h.id)} variant="ghost">Archive</ActionButton>
              </li>
            ))}
          </ul>
          <ActionForm action={createHabitAction} submitLabel="Add habit" resetOnSuccess>
            <Field label="Habit" htmlFor="h-title"><Input id="h-title" name="title" placeholder="e.g. Read one business story" required /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Times per week" htmlFor="h-target"><Input id="h-target" name="targetPerWeek" type="number" min={1} max={7} defaultValue={4} /></Field>
              <Field label="Skill path" htmlFor="h-skill">
                <Select id="h-skill" name="skill" defaultValue="discipline">
                  <option value="discipline">Personal Discipline</option>
                  <option value="money">Money Management</option>
                  <option value="investing">Investing Knowledge</option>
                  <option value="business">Business Awareness</option>
                </Select>
              </Field>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
