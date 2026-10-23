import { and, eq, isNull } from "drizzle-orm";
import { getContext } from "@/server/context";
import { tasks } from "@/db/schema";
import { Card, EmptyState, PageHeader, SubNav } from "@/components/ui";
import { TaskItem } from "@/components/task-item";
import { AddTask } from "@/components/add-task";
import { addDays } from "@/lib/dates";
import { SCHEDULE_TABS } from "../tabs";

export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const { db, user, today } = await getContext();
  const rows = await db.select().from(tasks).where(and(eq(tasks.userId, user.id), isNull(tasks.planDate), eq(tasks.status, "todo")));
  return (
    <>
      <PageHeader title="Inbox" subtitle="Tasks without a day. Pick a day when you're ready." />
      <SubNav items={SCHEDULE_TABS} active="/schedule/inbox" />
      <Card>
        {rows.length ? <ul className="divide-y divide-border">{rows.map((t) => <TaskItem key={t.id} task={t} tomorrow={addDays(today, 1)} />)}</ul> : <EmptyState title="Inbox is empty" body="Parked tasks land here." />}
        <div className="mt-3"><AddTask date={null} /></div>
      </Card>
    </>
  );
}
