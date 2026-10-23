import "server-only";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { ingestionRuns, integrations, newsItems, preferences, recurringItems, user } from "@/db/schema";
import { addDays, dayOfWeek, diffDays, formatShortDate, todayLocal, toLocalTime } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { canonicalUrl, clusterItems, sha } from "@/lib/news/dedupe";
import { parseFeed, parseFeedConfig } from "@/lib/news/feed";
import { explainNews } from "@/server/ai";
import { syncCalendars } from "@/server/integrations/google-calendar";
import { materializeRoutines } from "@/server/schedule";
import { queueNotification } from "@/server/notifications";
import { log } from "@/server/log";

/** Fetch configured feeds, store new items (deduplicated by canonical URL), cluster overlapping coverage. */
export async function ingestNews(db: DB, fetchImpl: typeof fetch = fetch) {
  const feeds = parseFeedConfig(process.env.NEWS_RSS_FEEDS);
  if (!feeds.length) return { fetched: 0, inserted: 0, skipped: "no_feeds" };
  const [run] = await db.insert(ingestionRuns).values({ provider: "rss" }).returning({ id: ingestionRuns.id });
  let fetched = 0;
  let inserted = 0;
  const errors: string[] = [];
  try {
    const all: Array<{ topic: string; source: string; title: string; url: string; publishedAt: Date; summary: string | null }> = [];
    for (const f of feeds) {
      try {
        const res = await fetchImpl(f.url, { headers: { "User-Agent": "PaisaPurpose/1.0 (personal news reader)", Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9" }, signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const items = parseFeed((await res.text()).slice(0, 3_000_000));
        fetched += items.length;
        const source = new URL(f.url).hostname.replace(/^www\./, "");
        all.push(...items.map((i) => ({ ...i, topic: f.topic, source })));
      } catch (e) {
        errors.push(`${new URL(f.url).hostname}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    const recentCutoff = new Date(Date.now() - 3 * 86400e3);
    const existing = await db.select({ title: newsItems.title, publishedAt: newsItems.publishedAt, clusterKey: newsItems.clusterKey }).from(newsItems).where(and(eq(newsItems.isDemo, false), sql`${newsItems.publishedAt} > ${recentCutoff}`));
    const clustered = clusterItems([...existing.map((e) => ({ ...e, existing: true as const })), ...all.map((a) => ({ ...a, existing: false as const }))]);
    for (const item of clustered) {
      if (item.existing) continue;
      const a = item as unknown as (typeof all)[number] & { clusterKey: string };
      const url = canonicalUrl(a.url);
      const res = await db
        .insert(newsItems)
        .values({ provider: "rss", isDemo: false, sourceName: a.source, url, urlHash: sha(url), clusterKey: item.clusterKey, title: a.title, summary: a.summary, topic: a.topic, publishedAt: a.publishedAt })
        .onConflictDoNothing()
        .returning({ id: newsItems.id, title: newsItems.title, summary: newsItems.summary, sourceName: newsItems.sourceName });
      if (res.length) {
        inserted++;
        if (process.env.NEWS_AI_EXPLAINERS === "true") {
          const ex = await explainNews({ title: res[0].title, summary: res[0].summary, source: res[0].sourceName });
          if (ex) await db.update(newsItems).set({ explainer: ex as unknown as Record<string, unknown>, explainerSource: "ai" }).where(eq(newsItems.id, res[0].id));
        }
      }
    }
    await db.update(ingestionRuns).set({ finishedAt: new Date(), status: errors.length && !inserted && !fetched ? "error" : "ok", fetched, inserted, error: errors.length ? errors.join("; ").slice(0, 500) : null }).where(eq(ingestionRuns.id, run.id));
    return { fetched, inserted, errors: errors.length };
  } catch (e) {
    await db.update(ingestionRuns).set({ finishedAt: new Date(), status: "error", fetched, inserted, error: e instanceof Error ? e.message.slice(0, 500) : "failed" }).where(eq(ingestionRuns.id, run.id));
    throw e;
  }
}

/** Hourly per-user housekeeping in each user's own timezone: routines, bill and review reminders. */
export async function hourlyUserTick(db: DB, now = new Date()) {
  const users = await db.select({ id: user.id, tz: preferences.timezone }).from(user).innerJoin(preferences, eq(preferences.userId, user.id));
  let reminders = 0;
  for (const u of users) {
    const today = todayLocal(u.tz, now);
    const hour = Number(toLocalTime(now, u.tz).slice(0, 2));
    await materializeRoutines(u.id, today, db);
    await materializeRoutines(u.id, addDays(today, 1), db);
    if (hour >= 8) {
      const items = await db.select().from(recurringItems).where(and(eq(recurringItems.userId, u.id), eq(recurringItems.active, true), eq(recurringItems.direction, "outflow")));
      for (const r of items) {
        const days = diffDays(r.nextDueDate, today);
        if (days < 0 || days > r.remindDaysBefore) continue;
        const res = await queueNotification(db, u.id, { kind: "bill", title: `${r.name} due ${days === 0 ? "today" : days === 1 ? "tomorrow" : formatShortDate(r.nextDueDate)}`, body: `${formatINR(r.amount, { whole: true })}. Record it once paid to keep your forecast accurate.`, href: "/money/bills", dedupeKey: `bill:${r.id}:${r.nextDueDate}` }, now);
        if (res === "queued") reminders++;
      }
    }
    if (dayOfWeek(today) === 0 && hour >= 17) {
      const res = await queueNotification(db, u.id, { kind: "weekly_review", title: "Weekly money review", body: "Fifteen minutes to look back and plan next week. Continuing your plan is a fine outcome.", href: "/plan/review", dedupeKey: `weekly:${today}` }, now);
      if (res === "queued") reminders++;
    }
  }
  return { users: users.length, reminders };
}

export async function syncAllCalendars(db: DB, now = new Date()) {
  const rows = await db.select({ userId: integrations.userId, tz: preferences.timezone }).from(integrations).innerJoin(preferences, eq(preferences.userId, integrations.userId)).where(and(eq(integrations.provider, "google_calendar"), eq(integrations.status, "connected")));
  let ok = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      await syncCalendars(db, r.userId, r.tz, todayLocal(r.tz, now));
      ok++;
    } catch {
      failed++; // error is recorded on the integration row and shown in Settings
    }
  }
  return { ok, failed };
}

/** Demo accounts are temporary: remove those older than 7 days (cascade deletes their data). */
export async function cleanupDemoUsers(db: DB) {
  const old = await db.select({ id: user.id }).from(user).where(and(eq(user.isDemo, true), lt(user.createdAt, new Date(Date.now() - 7 * 86400e3))));
  if (old.length) await db.delete(user).where(inArray(user.id, old.map((o) => o.id)));
  log.info("demo.cleanup", { removed: old.length });
  return { removed: old.length };
}
