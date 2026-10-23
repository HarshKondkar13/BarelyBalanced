"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { integrations, tasks } from "@/db/schema";
import { and } from "drizzle-orm";
import { getContext } from "@/server/context";
import { applyPublish, CalendarError, disconnectGoogleCalendar, getIntegration, syncCalendars, type CalendarSettings } from "@/server/integrations/google-calendar";
import type { ActionResult } from "./schedule";

const friendly = (e: unknown): ActionResult => ({ ok: false, error: e instanceof CalendarError ? e.message : "Something went wrong talking to Google Calendar" });

export async function syncCalendarNowAction(): Promise<ActionResult> {
  const { db, user, tz, today } = await getContext();
  try {
    const r = await syncCalendars(db, user.id, tz, today);
    refresh();
    return { ok: true, message: r.skipped ? "Not connected" : `Synced ${r.synced} events` };
  } catch (e) {
    refresh();
    return friendly(e);
  }
}

export async function setSelectedCalendarsAction(ids: string[]): Promise<ActionResult> {
  const { db, user } = await getContext();
  const parsed = z.array(z.string().max(300)).max(50).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "Invalid selection" };
  const row = await getIntegration(db, user.id);
  if (!row) return { ok: false, error: "Not connected" };
  const settings = (row.settings ?? {}) as CalendarSettings;
  const known = new Set((settings.calendars ?? []).map((c) => c.id));
  await db.update(integrations).set({ settings: { ...settings, selectedCalendarIds: parsed.data.filter((id) => known.has(id)) } }).where(eq(integrations.id, row.id));
  refresh();
  return { ok: true, message: "Calendars updated. Syncing will use this selection." };
}

export async function setTaskPublishAction(taskId: string, publish: boolean): Promise<ActionResult> {
  const { db, user } = await getContext();
  const res = await db.update(tasks).set({ publishToCalendar: publish }).where(and(eq(tasks.id, taskId), eq(tasks.userId, user.id))).returning({ id: tasks.id });
  if (!res.length) return { ok: false, error: "Task not found" };
  refresh();
  return { ok: true, message: publish ? "Marked for publishing (preview before it's written)" : "Will be removed from the app calendar on next publish" };
}

export async function applyPublishAction(): Promise<ActionResult> {
  const { db, user, tz, today } = await getContext();
  try {
    const r = await applyPublish(db, user.id, tz, today);
    refresh();
    return { ok: true, message: `Published: ${r.created} created, ${r.updated} updated, ${r.removed} removed${r.failed ? `, ${r.failed} failed` : ""}` };
  } catch (e) {
    refresh();
    return friendly(e);
  }
}

export async function disconnectCalendarAction(deletePublishedEvents: boolean): Promise<ActionResult> {
  const { db, user } = await getContext();
  await disconnectGoogleCalendar(db, user.id, { deletePublishedEvents });
  refresh();
  return { ok: true, message: "Disconnected. Access revoked and stored credentials erased." };
}
