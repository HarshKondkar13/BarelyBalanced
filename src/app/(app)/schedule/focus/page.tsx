import { and, desc, eq, isNull } from "drizzle-orm";
import { getContext } from "@/server/context";
import { focusSessions, tasks } from "@/db/schema";
import { Card, PageHeader, SubNav } from "@/components/ui";
import { SCHEDULE_TABS } from "../tabs";
import { FocusTimer } from "./focus-timer";

export const metadata = { title: "Focus" };

export default async function FocusPage({ searchParams }: PageProps<"/schedule/focus">) {
  const { db, user, today } = await getContext();
  const sp = await searchParams;
  const [todays, [active]] = await Promise.all([
    db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(and(eq(tasks.userId, user.id), eq(tasks.planDate, today), eq(tasks.status, "todo"))),
    db.select({ s: focusSessions, title: tasks.title }).from(focusSessions).leftJoin(tasks, eq(tasks.id, focusSessions.taskId)).where(and(eq(focusSessions.userId, user.id), isNull(focusSessions.endedAt))).orderBy(desc(focusSessions.startedAt)).limit(1),
  ]);
  const taskParam = typeof sp.task === "string" && todays.some((t) => t.id === sp.task) ? sp.task : null;
  return (
    <>
      <PageHeader title="Focus" subtitle="One thing, a realistic amount of time" />
      <SubNav items={SCHEDULE_TABS} active="/schedule/focus" />
      <Card className="mx-auto max-w-md">
        <FocusTimer tasks={todays} initialTaskId={taskParam} active={active ? { id: active.s.id, plannedMin: active.s.plannedMin, startedAt: active.s.startedAt.toISOString(), taskTitle: active.title } : null} />
      </Card>
    </>
  );
}
