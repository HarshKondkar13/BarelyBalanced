"use server";

import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { preferences, user as userTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getContext } from "@/server/context";
import { disconnectGoogleCalendar } from "@/server/integrations/google-calendar";
import type { ActionResult } from "./schedule";

const TZ_OK = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const prefSchema = z.object({
  displayName: z.string().trim().max(60).optional(),
  timezone: z.string().refine(TZ_OK, "Unknown timezone").optional(),
  theme: z.enum(["neon", "system", "light", "dark"]).optional(),
  weekStartsOn: z.coerce.number().int().min(0).max(1).optional(),
  restDaysPerWeek: z.coerce.number().int().min(0).max(3).optional(),
  aiDataUse: z.enum(["off", "aggregates", "explanations"]).optional(),
  newsTopics: z.array(z.enum(["economy", "business", "banking", "markets", "technology"])).optional(),
  followedEntities: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
});

export async function savePreferencesAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { db, user } = await getContext();
  const raw: Record<string, unknown> = {};
  for (const k of ["displayName", "timezone", "theme", "weekStartsOn", "restDaysPerWeek", "aiDataUse"]) if (form.has(k)) raw[k] = form.get(k);
  if (form.has("topicsPresent")) raw.newsTopics = form.getAll("newsTopics");
  if (form.has("followedEntities")) raw.followedEntities = String(form.get("followedEntities")).split(",").map((s) => s.trim()).filter(Boolean);
  const parsed = prefSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  await db.update(preferences).set(parsed.data).where(eq(preferences.userId, user.id));
  if (parsed.data.theme) {
    const jar = await cookies();
    if (parsed.data.theme === "neon") jar.delete("pp_theme");
    else jar.set("pp_theme", parsed.data.theme, { path: "/", maxAge: 31536000, sameSite: "lax" });
  }
  refresh();
  return { ok: true, message: "Settings saved" };
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export async function saveNotificationPrefsAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { db, user } = await getContext();
  const parsed = z
    .object({ inApp: z.boolean(), browserPush: z.boolean(), billReminders: z.boolean(), weeklyReview: z.boolean(), dailyBriefing: z.boolean(), quietStart: hhmm, quietEnd: hhmm, maxPerDay: z.coerce.number().int().min(0).max(10) })
    .safeParse({
      inApp: form.get("inApp") === "on",
      browserPush: form.get("browserPush") === "on",
      billReminders: form.get("billReminders") === "on",
      weeklyReview: form.get("weeklyReview") === "on",
      dailyBriefing: form.get("dailyBriefing") === "on",
      quietStart: form.get("quietStart"),
      quietEnd: form.get("quietEnd"),
      maxPerDay: form.get("maxPerDay"),
    });
  if (!parsed.success) return { ok: false, error: "Check the times and limits" };
  await db.update(preferences).set({ notifications: parsed.data }).where(eq(preferences.userId, user.id));
  refresh();
  return { ok: true, message: "Notification settings saved" };
}

/**
 * Permanently delete the account and all data (cascade). Integration tokens are revoked
 * with the provider first, so access stops immediately.
 */
export async function deleteAccountAction(confirmText: string): Promise<ActionResult> {
  const { db, user } = await getContext();
  if (confirmText !== "DELETE") return { ok: false, error: 'Type DELETE to confirm' };
  await disconnectGoogleCalendar(db, user.id, { deletePublishedEvents: false }).catch(() => undefined);
  await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
  await db.delete(userTable).where(eq(userTable.id, user.id));
  redirect("/?deleted=1");
}

export async function leaveDemoAction(): Promise<void> {
  const { db, user } = await getContext();
  await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
  if (user.isDemo) await db.delete(userTable).where(eq(userTable.id, user.id));
  redirect("/sign-up");
}
