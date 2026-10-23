/**
 * Provider-neutral calendar logic (pure, testable): event identity, body mapping,
 * parsing of provider events, and publish planning (preview before any write).
 */
import { createHash } from "node:crypto";
import { addDays, localDateTimeToInstant, timeToMinutes, minutesToTime, type LocalDate } from "@/lib/dates";

export const SCOPES = {
  /** Read events and calendar list. */
  read: "https://www.googleapis.com/auth/calendar.readonly",
  /** Create secondary calendars and manage events ONLY on calendars this app created. */
  publish: "https://www.googleapis.com/auth/calendar.app.created",
} as const;

/**
 * Deterministic event id for a task. Google requires base32hex characters (a-v, 0-9),
 * 5-1024 long; hex digits are a subset. The same task always maps to the same id,
 * so a retried insert can never create a duplicate event.
 */
export function eventIdForTask(userId: string, taskId: string): string {
  return "pp" + createHash("sha256").update(`${userId}:${taskId}`).digest("hex").slice(0, 40);
}

export type PublishableTask = { id: string; title: string; planDate: LocalDate; startTime: string | null; durationMin: number; notes?: string | null };

export type EventBody = {
  id: string;
  summary: string;
  description: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  extendedProperties: { private: { ppTaskId: string } };
  reminders: { useDefault: boolean };
  transparency: "opaque" | "transparent";
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Local wall-clock dateTime string with explicit offset, e.g. 2026-10-24T09:30:00+05:30 */
export function localDateTimeString(date: LocalDate, time: string, tz: string): string {
  const instant = localDateTimeToInstant(date, time, tz);
  const [y, m, d] = date.split("-");
  const offsetMin = Math.round((Date.UTC(+y, +m - 1, +d, ...(time.split(":").map(Number) as [number, number])) - instant.getTime()) / 60000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return `${date}T${time}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function toEventBody(userId: string, t: PublishableTask, tz: string): EventBody {
  const base = {
    id: eventIdForTask(userId, t.id),
    summary: t.title.slice(0, 250),
    description: `Time block from your planner.${t.notes ? `\n\n${t.notes.slice(0, 1000)}` : ""}`,
    extendedProperties: { private: { ppTaskId: t.id } },
    reminders: { useDefault: true },
  };
  if (!t.startTime) {
    // Untimed tasks become all-day, non-blocking events. Google's end date is exclusive.
    return { ...base, start: { date: t.planDate }, end: { date: addDays(t.planDate, 1) }, transparency: "transparent" };
  }
  const endMin = timeToMinutes(t.startTime) + t.durationMin;
  const endDate = endMin >= 1440 ? addDays(t.planDate, 1) : t.planDate;
  const endTime = minutesToTime(endMin % 1440);
  return {
    ...base,
    start: { dateTime: localDateTimeString(t.planDate, t.startTime, tz), timeZone: tz },
    end: { dateTime: localDateTimeString(endDate, endTime, tz), timeZone: tz },
    transparency: "opaque",
  };
}

export function contentHash(body: EventBody): string {
  return createHash("sha256").update(JSON.stringify([body.summary, body.description, body.start, body.end, body.transparency])).digest("hex").slice(0, 24);
}

/** Subset of Google's Event resource that we read. */
export type GoogleEvent = {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  transparency?: string;
};

export type ParsedEvent = {
  eventId: string;
  title: string | null;
  status: string;
  startAt: Date | null;
  endAt: Date | null;
  allDayDate: LocalDate | null;
  allDayEndDate: LocalDate | null; // inclusive
};

/** Normalise timed vs all-day events. dateTime strings carry their own offset. */
export function parseGoogleEvent(e: GoogleEvent): ParsedEvent | null {
  if (!e.id || !e.start || !e.end) return null;
  const base = { eventId: e.id, title: e.summary ?? null, status: e.status ?? "confirmed" };
  if (e.start.date) {
    return { ...base, startAt: null, endAt: null, allDayDate: e.start.date, allDayEndDate: addDays(e.end.date ?? e.start.date, -1) };
  }
  if (!e.start.dateTime || !e.end.dateTime) return null;
  const s = new Date(e.start.dateTime);
  const en = new Date(e.end.dateTime);
  if (Number.isNaN(s.getTime()) || Number.isNaN(en.getTime())) return null;
  return { ...base, startAt: s, endAt: en, allDayDate: null, allDayEndDate: null };
}

export type Publication = { taskId: string; eventId: string; contentHash: string; status: "published" | "pending_delete" | "deleted" | "error" };

export type PublishPlan = {
  create: Array<{ task: PublishableTask; body: EventBody }>;
  update: Array<{ task: PublishableTask; body: EventBody }>;
  remove: Array<{ taskId: string; eventId: string; reason: string }>;
  unchanged: number;
};

/**
 * Diff the tasks the user wants published against what was published before.
 * Only events recorded in `publications` (i.e. created by this app) can ever be removed.
 */
export function planPublish(userId: string, wanted: PublishableTask[], publications: Publication[], tz: string): PublishPlan {
  const plan: PublishPlan = { create: [], update: [], remove: [], unchanged: 0 };
  const byTask = new Map(publications.map((p) => [p.taskId, p]));
  const wantedIds = new Set(wanted.map((t) => t.id));
  for (const t of wanted) {
    const body = toEventBody(userId, t, tz);
    const pub = byTask.get(t.id);
    if (!pub || pub.status === "deleted") plan.create.push({ task: t, body });
    else if (pub.contentHash !== contentHash(body) || pub.status === "error") plan.update.push({ task: t, body });
    else plan.unchanged++;
  }
  for (const p of publications) {
    if ((p.status === "published" || p.status === "pending_delete" || p.status === "error") && !wantedIds.has(p.taskId)) {
      plan.remove.push({ taskId: p.taskId, eventId: p.eventId, reason: p.status === "pending_delete" ? "Task deleted" : "No longer marked for publishing" });
    }
  }
  return plan;
}
