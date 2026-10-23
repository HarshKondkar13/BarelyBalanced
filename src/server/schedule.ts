import "server-only";
import { and, eq, lt } from "drizzle-orm";
import type { DB } from "@/db";
import { routines, tasks } from "@/db/schema";
import { routineOccursOn } from "@/lib/schedule/planner";

/**
 * Create today's tasks from active routines. Idempotent thanks to the unique
 * (user, routine, planDate) index, so it is safe to call on every page load or job run.
 */
export async function materializeRoutines(userId: string, date: string, db: DB) {
  const rs = await db.select().from(routines).where(and(eq(routines.userId, userId), eq(routines.active, true)));
  const due = rs.filter((r) => routineOccursOn(r.daysOfWeek, date));
  if (!due.length) return 0;
  const inserted = await db
    .insert(tasks)
    .values(due.map((r) => ({ userId, title: r.title, kind: r.kind, planDate: date, startTime: r.startTime, durationMin: r.durationMin, routineId: r.id })))
    .onConflictDoNothing()
    .returning({ id: tasks.id });
  return inserted.length;
}

/** Housekeeping: tasks left from previous days stay where they are until the user decides. */
export async function staleTaskIds(userId: string, today: string, db: DB) {
  const rows = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.userId, userId), eq(tasks.status, "todo"), lt(tasks.planDate, today)));
  return rows.map((r) => r.id);
}
