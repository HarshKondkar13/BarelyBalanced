"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { dailyReviews, focusSessions, habitLogs, habits, routines, tasks, TASK_KINDS } from "@/db/schema";
import { addDays, isLocalDate } from "@/lib/dates";
import { xpKey } from "@/lib/gamification/rules";
import { getContext } from "@/server/context";
import { awardXp, revokeXp } from "@/server/xp";

const localDate = z.string().refine(isLocalDate, "Invalid date");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

const taskSchema = z.object({
  title: z.string().trim().min(1, "Give the task a name").max(200),
  notes: z.string().trim().max(2000).optional().nullable(),
  kind: z.enum(TASK_KINDS).default("task"),
  planDate: localDate.optional().nullable(),
  startTime: hhmm.optional().nullable().or(z.literal("").transform(() => null)),
  durationMin: z.coerce.number().int().min(5).max(600).default(30),
  deadline: localDate.optional().nullable().or(z.literal("").transform(() => null)),
  isTopPriority: z.coerce.boolean().default(false),
  linkRef: z.string().max(200).optional().nullable(),
});

export type ActionResult = { ok: true; message?: string; xp?: number } | { ok: false; error: string };

function formToObject(form: FormData) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) o[k] = v === "" ? undefined : v;
  return o;
}

export async function createTaskAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { db, user, today } = await getContext();
  const parsed = taskSchema.safeParse({ planDate: today, ...formToObject(form), isTopPriority: form.get("isTopPriority") === "on" });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (parsed.data.isTopPriority && parsed.data.planDate) {
    const tops = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.userId, user.id), eq(tasks.planDate, parsed.data.planDate), eq(tasks.isTopPriority, true), ne(tasks.status, "skipped")));
    if (tops.length >= 3) return { ok: false, error: "You already have three top priorities for that day. Swap one out first." };
  }
  await db.insert(tasks).values({ ...parsed.data, userId: user.id });
  refresh();
  return { ok: true, message: "Added" };
}

export async function updateTaskAction(taskId: string, patch: Partial<z.infer<typeof taskSchema>>): Promise<ActionResult> {
  const { db, user } = await getContext();
  const parsed = taskSchema.partial().safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const res = await db.update(tasks).set(parsed.data).where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id))).returning({ id: tasks.id });
  if (!res.length) return { ok: false, error: "Task not found" };
  refresh();
  return { ok: true };
}

export async function deleteTaskAction(taskId: string): Promise<ActionResult> {
  const { db, user } = await getContext();
  await db.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)));
  await revokeXp(db, user.id, xpKey.priorityDone(taskId));
  refresh();
  return { ok: true };
}

/** Toggle completion. Completing a top priority awards XP once; un-completing revokes it. */
export async function toggleTaskAction(taskId: string): Promise<ActionResult> {
  const { db, user, today } = await getContext();
  const [t] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)));
  if (!t) return { ok: false, error: "Task not found" };
  const done = t.status !== "done";
  await db.update(tasks).set({ status: done ? "done" : "todo", completedAt: done ? new Date() : null }).where(eq(tasks.id, t.id));
  let xp = 0;
  const meaningful = t.isTopPriority || t.kind !== "task";
  if (done && meaningful) {
    const r = await awardXp(db, user.id, "priority_done", xpKey.priorityDone(t.id), today);
    xp = r.xp;
  } else if (!done) {
    xp = -(await revokeXp(db, user.id, xpKey.priorityDone(t.id)));
  }
  refresh();
  return { ok: true, xp };
}

/** Move selected unfinished tasks to another day. The user chooses which; nothing moves automatically. */
export async function carryForwardAction(taskIds: string[], toDate: string): Promise<ActionResult> {
  const { db, user } = await getContext();
  if (!isLocalDate(toDate)) return { ok: false, error: "Invalid date" };
  const ids = z.array(z.string().uuid()).max(50).parse(taskIds);
  if (!ids.length) return { ok: true };
  const rows = await db.select().from(tasks).where(and(eq(tasks.userId, user.id), inArray(tasks.id, ids), eq(tasks.status, "todo")));
  for (const t of rows) {
    await db
      .update(tasks)
      .set({ planDate: toDate, carriedFromDate: t.planDate, carryCount: t.carryCount + 1, isTopPriority: false })
      .where(eq(tasks.id, t.id));
  }
  refresh();
  return { ok: true, message: `Moved ${rows.length} task${rows.length === 1 ? "" : "s"}` };
}

export async function parkTaskAction(taskId: string): Promise<ActionResult> {
  const { db, user } = await getContext();
  await db.update(tasks).set({ planDate: null, startTime: null, isTopPriority: false }).where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)));
  refresh();
  return { ok: true, message: "Moved to inbox" };
}

export async function skipTaskAction(taskId: string): Promise<ActionResult> {
  const { db, user } = await getContext();
  await db.update(tasks).set({ status: "skipped" }).where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)));
  refresh();
  return { ok: true, message: "Let go for today" };
}

/** Morning plan: choose up to three priorities and record the plan. */
export async function completeMorningPlanAction(priorityIds: string[], intention: string): Promise<ActionResult> {
  const { db, user, today } = await getContext();
  const ids = z.array(z.string().uuid()).max(3, "Pick at most three priorities").safeParse(priorityIds);
  if (!ids.success) return { ok: false, error: ids.error.issues[0].message };
  await db.update(tasks).set({ isTopPriority: false }).where(and(eq(tasks.userId, user.id), eq(tasks.planDate, today)));
  if (ids.data.length) {
    await db.update(tasks).set({ isTopPriority: true, planDate: today }).where(and(eq(tasks.userId, user.id), inArray(tasks.id, ids.data)));
  }
  await db
    .insert(dailyReviews)
    .values({ userId: user.id, date: today, kind: "morning", data: { priorities: ids.data, intention: intention.slice(0, 280) } })
    .onConflictDoUpdate({ target: [dailyReviews.userId, dailyReviews.date, dailyReviews.kind], set: { data: { priorities: ids.data, intention: intention.slice(0, 280) } } });
  const r = await awardXp(db, user.id, "morning_plan", xpKey.morningPlan(today), today);
  refresh();
  return { ok: true, xp: r.xp, message: "Day planned" };
}

/** Evening review: user decides per unfinished task: tomorrow, inbox, or let go. */
export async function completeEveningReviewAction(input: { decisions: Record<string, "tomorrow" | "inbox" | "drop">; note: string; energy?: number }): Promise<ActionResult> {
  const { db, user, today } = await getContext();
  const parsed = z
    .object({ decisions: z.record(z.string().uuid(), z.enum(["tomorrow", "inbox", "drop"])), note: z.string().max(1000), energy: z.number().int().min(1).max(5).optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid review" };
  const ids = Object.keys(parsed.data.decisions);
  const owned = ids.length ? await db.select().from(tasks).where(and(eq(tasks.userId, user.id), inArray(tasks.id, ids))) : [];
  for (const t of owned) {
    const d = parsed.data.decisions[t.id];
    if (d === "tomorrow") await db.update(tasks).set({ planDate: addDays(today, 1), carriedFromDate: t.planDate, carryCount: t.carryCount + 1, isTopPriority: false }).where(eq(tasks.id, t.id));
    if (d === "inbox") await db.update(tasks).set({ planDate: null, startTime: null, isTopPriority: false }).where(eq(tasks.id, t.id));
    if (d === "drop") await db.update(tasks).set({ status: "skipped" }).where(eq(tasks.id, t.id));
  }
  const data = { note: parsed.data.note, energy: parsed.data.energy, decisions: parsed.data.decisions };
  await db
    .insert(dailyReviews)
    .values({ userId: user.id, date: today, kind: "evening", data })
    .onConflictDoUpdate({ target: [dailyReviews.userId, dailyReviews.date, dailyReviews.kind], set: { data } });
  const r = await awardXp(db, user.id, "evening_review", xpKey.eveningReview(today), today);
  refresh();
  return { ok: true, xp: r.xp, message: "Day closed" };
}

/* ---------------- Habits ---------------- */

export async function createHabitAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { db, user } = await getContext();
  const parsed = z
    .object({ title: z.string().trim().min(1).max(120), targetPerWeek: z.coerce.number().int().min(1).max(7), skill: z.enum(["money", "investing", "business", "discipline"]) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  await db.insert(habits).values({ ...parsed.data, userId: user.id });
  refresh();
  return { ok: true, message: "Habit added" };
}

export async function toggleHabitAction(habitId: string, date: string): Promise<ActionResult> {
  const { db, user, today } = await getContext();
  if (!isLocalDate(date) || date > today || date < addDays(today, -6)) return { ok: false, error: "You can log habits for the past week only" };
  const [h] = await db.select().from(habits).where(and(eq(habits.id, habitId), eq(habits.userId, user.id)));
  if (!h) return { ok: false, error: "Habit not found" };
  const existing = await db.select().from(habitLogs).where(and(eq(habitLogs.habitId, h.id), eq(habitLogs.date, date)));
  if (existing.length) {
    await db.delete(habitLogs).where(and(eq(habitLogs.habitId, h.id), eq(habitLogs.date, date)));
    const removed = await revokeXp(db, user.id, xpKey.habitDone(h.id, date));
    refresh();
    return { ok: true, xp: -removed };
  }
  await db.insert(habitLogs).values({ habitId: h.id, userId: user.id, date }).onConflictDoNothing();
  const r = await awardXp(db, user.id, "habit_done", xpKey.habitDone(h.id, date), today, { skill: h.skill });
  refresh();
  return { ok: true, xp: r.xp };
}

export async function archiveHabitAction(habitId: string): Promise<ActionResult> {
  const { db, user } = await getContext();
  await db.update(habits).set({ archived: true }).where(and(eq(habits.id, habitId), eq(habits.userId, user.id)));
  refresh();
  return { ok: true };
}

/* ---------------- Routines ---------------- */

export async function createRoutineAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { db, user } = await getContext();
  const days = form.getAll("days").map(Number).filter((d) => d >= 0 && d <= 6);
  const parsed = z
    .object({ title: z.string().trim().min(1).max(120), startTime: hhmm.optional(), durationMin: z.coerce.number().int().min(5).max(240), kind: z.enum(TASK_KINDS).default("task") })
    .safeParse(formToObject(form));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!days.length) return { ok: false, error: "Pick at least one day" };
  await db.insert(routines).values({ ...parsed.data, daysOfWeek: days, userId: user.id });
  refresh();
  return { ok: true, message: "Routine added" };
}

export async function toggleRoutineAction(routineId: string): Promise<ActionResult> {
  const { db, user } = await getContext();
  const [r] = await db.select().from(routines).where(and(eq(routines.id, routineId), eq(routines.userId, user.id)));
  if (!r) return { ok: false, error: "Not found" };
  await db.update(routines).set({ active: !r.active }).where(eq(routines.id, r.id));
  refresh();
  return { ok: true };
}

/* ---------------- Focus sessions ---------------- */

export async function startFocusAction(taskId: string | null, plannedMin: number): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { db, user } = await getContext();
  const p = z.number().int().min(5).max(180).safeParse(plannedMin);
  if (!p.success) return { ok: false, error: "Choose 5–180 minutes" };
  if (taskId) {
    const [t] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id)));
    if (!t) return { ok: false, error: "Task not found" };
  }
  const [row] = await db.insert(focusSessions).values({ userId: user.id, taskId, plannedMin: p.data, startedAt: new Date() }).returning({ id: focusSessions.id });
  return { ok: true, id: row.id };
}

/**
 * Finish a focus session. XP only when the session actually lasted close to what was
 * planned (server-measured), so ending early or leaving a timer open does not farm XP.
 */
export async function finishFocusAction(sessionId: string, completed: boolean): Promise<ActionResult> {
  const { db, user, today } = await getContext();
  const [s] = await db.select().from(focusSessions).where(and(eq(focusSessions.id, sessionId), eq(focusSessions.userId, user.id)));
  if (!s) return { ok: false, error: "Session not found" };
  if (s.endedAt) return { ok: true, message: "Already finished" };
  const now = new Date();
  const elapsedMin = (now.getTime() - s.startedAt.getTime()) / 60000;
  const genuine = completed && elapsedMin >= s.plannedMin * 0.8;
  await db.update(focusSessions).set({ endedAt: now, completed: genuine }).where(eq(focusSessions.id, s.id));
  let xp = 0;
  if (genuine && s.plannedMin >= 15 && s.plannedMin <= 90) xp = (await awardXp(db, user.id, "focus_done", xpKey.focusDone(s.id), today)).xp;
  refresh();
  return { ok: true, xp, message: genuine ? "Session complete" : "Session ended. Partial sessions still count as practice." };
}

