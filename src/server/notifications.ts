import "server-only";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { notifications, preferences, pushSubscriptions, type NotificationPrefs } from "@/db/schema";
import { minutesUntilQuietEnds } from "@/lib/notify";
import { localDateTimeToInstant, toLocalTime, todayLocal } from "@/lib/dates";
import { DEFAULT_NOTIFICATION_PREFS } from "./setup";
import { log } from "./log";

/**
 * Queue a notification for a user, respecting their preferences, quiet hours and daily cap.
 * Deduplicated by (user, dedupeKey), so repeated job runs never notify twice.
 */
export async function queueNotification(
  db: DB,
  userId: string,
  n: { kind: "bill" | "weekly_review" | "briefing" | "system"; title: string; body: string; href?: string; dedupeKey: string },
  now = new Date(),
): Promise<"queued" | "duplicate" | "disabled" | "capped"> {
  const [p] = await db.select({ n: preferences.notifications, tz: preferences.timezone }).from(preferences).where(eq(preferences.userId, userId));
  const prefs: NotificationPrefs = p?.n ?? DEFAULT_NOTIFICATION_PREFS;
  const tz = p?.tz ?? "Asia/Kolkata";
  if (!prefs.inApp && !prefs.browserPush) return "disabled";
  if (n.kind === "bill" && !prefs.billReminders) return "disabled";
  if (n.kind === "weekly_review" && !prefs.weeklyReview) return "disabled";
  if (n.kind === "briefing" && !prefs.dailyBriefing) return "disabled";
  const today = todayLocal(tz, now);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), gte(notifications.createdAt, localDateTimeToInstant(today, "00:00", tz))));
  if (count >= prefs.maxPerDay) return "capped";
  const wait = minutesUntilQuietEnds(toLocalTime(now, tz), prefs.quietStart, prefs.quietEnd);
  const res = await db
    .insert(notifications)
    .values({ userId, ...n, deliverAfter: new Date(now.getTime() + wait * 60_000) })
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  return res.length ? "queued" : "duplicate";
}

/** Send due, not-yet-pushed notifications to users who enabled push. Requires VAPID keys. */
export async function deliverPush(db: DB) {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return { sent: 0, skipped: "not_configured" };
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
  const due = await db
    .select({ n: notifications, prefs: preferences.notifications })
    .from(notifications)
    .innerJoin(preferences, eq(preferences.userId, notifications.userId))
    .where(and(isNull(notifications.pushedAt), isNull(notifications.readAt), lte(notifications.deliverAfter, new Date())))
    .limit(200);
  let sent = 0;
  for (const { n, prefs } of due) {
    if (!prefs?.browserPush) {
      await db.update(notifications).set({ pushedAt: new Date(0) }).where(eq(notifications.id, n.id)); // mark handled, in-app only
      continue;
    }
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, n.userId));
    for (const s of subs) {
      try {
        // Payload is short and generic-safe: no amounts beyond what the title says.
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify({ title: n.title, body: n.body, href: n.href ?? "/notifications" }), { TTL: 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        else log.warn("push.failed", { status: code ?? "unknown" });
      }
    }
    await db.update(notifications).set({ pushedAt: new Date() }).where(eq(notifications.id, n.id));
  }
  return { sent };
}
