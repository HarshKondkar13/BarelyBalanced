import "server-only";
import { and, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { ingestionRuns, newsItems } from "@/db/schema";
import { DEMO_STORIES } from "@/lib/news/demo";
import { NewsExplainerSchema, type NewsExplainer } from "@/lib/ai/contracts";

export const newsProviderConfigured = () => Boolean(process.env.NEWS_RSS_FEEDS?.trim());

/** Upsert demonstration stories, re-dated relative to today so the demo stays fresh. Idempotent. */
export async function ensureDemoNews(db: DB) {
  const [latest] = await db.select({ at: newsItems.ingestedAt }).from(newsItems).where(eq(newsItems.isDemo, true)).orderBy(desc(newsItems.ingestedAt)).limit(1);
  if (latest && Date.now() - latest.at.getTime() < 12 * 3600e3) return;
  const now = Date.now();
  for (const s of DEMO_STORIES) {
    const publishedAt = new Date(now - s.daysAgo * 86400e3 - 2 * 3600e3);
    const values = {
      provider: "demo",
      isDemo: true,
      sourceName: "Demonstration content",
      url: `/signals/demo/${s.slug}`,
      urlHash: `demo:${s.slug}`,
      clusterKey: `demo:${s.slug}`,
      title: s.title,
      summary: s.summary,
      topic: s.topic,
      publishedAt,
      eventDate: null,
      ingestedAt: new Date(),
      explainer: s.explainer as unknown as Record<string, unknown>,
      explainerSource: "editorial_demo" as const,
    };
    await db.insert(newsItems).values(values).onConflictDoUpdate({ target: newsItems.urlHash, set: { publishedAt, ingestedAt: values.ingestedAt, title: s.title, summary: s.summary, explainer: values.explainer } });
  }
}

export type NewsView = {
  id: string;
  title: string;
  summary: string | null;
  topic: string;
  sourceName: string;
  url: string;
  isDemo: boolean;
  publishedAt: Date;
  eventDate: string | null;
  explainer: NewsExplainer | null;
  explainerSource: "editorial_demo" | "ai" | "none";
  alsoCoveredBy: number;
};

function toView(r: typeof newsItems.$inferSelect, dupes = 0): NewsView {
  const parsed = r.explainer ? NewsExplainerSchema.safeParse(r.explainer) : null;
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    topic: r.topic,
    sourceName: r.sourceName,
    url: r.url,
    isDemo: r.isDemo,
    publishedAt: r.publishedAt,
    eventDate: r.eventDate,
    explainer: parsed?.success ? parsed.data : null,
    explainerSource: parsed?.success ? r.explainerSource : "none",
    alsoCoveredBy: dupes,
  };
}

/**
 * Latest stories, one per cluster (overlapping coverage collapsed). Real provider items
 * are preferred; demo items are shown only when no real items exist.
 */
export async function loadStories(db: DB, opts: { topics?: string[]; sinceDays?: number; limit?: number; q?: string; ids?: string[] } = {}): Promise<{ stories: NewsView[]; usingDemo: boolean }> {
  const since = new Date(Date.now() - (opts.sinceDays ?? 7) * 86400e3);
  const [{ n: realCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(newsItems).where(and(eq(newsItems.isDemo, false), gte(newsItems.publishedAt, since)));
  const usingDemo = realCount === 0;
  if (usingDemo) await ensureDemoNews(db);
  const conds = [eq(newsItems.isDemo, usingDemo), gte(newsItems.publishedAt, since)];
  if (opts.topics?.length) conds.push(inArray(newsItems.topic, opts.topics));
  if (opts.ids) conds.push(inArray(newsItems.id, opts.ids.length ? opts.ids : ["00000000-0000-0000-0000-000000000000"]));
  if (opts.q) conds.push(or(ilike(newsItems.title, `%${opts.q}%`), ilike(newsItems.summary, `%${opts.q}%`))!);
  const rows = await db.select().from(newsItems).where(and(...conds)).orderBy(desc(newsItems.publishedAt)).limit(300);
  const seen = new Map<string, number>();
  const out: NewsView[] = [];
  for (const r of rows) {
    if (seen.has(r.clusterKey)) {
      const idx = seen.get(r.clusterKey)!;
      out[idx].alsoCoveredBy++;
      continue;
    }
    seen.set(r.clusterKey, out.length);
    out.push(toView(r));
  }
  return { stories: out.slice(0, opts.limit ?? 50), usingDemo };
}

export async function loadStory(db: DB, id: string) {
  const [r] = await db.select().from(newsItems).where(eq(newsItems.id, id));
  return r ? toView(r) : null;
}

export async function lastIngestion(db: DB) {
  const [r] = await db.select().from(ingestionRuns).orderBy(desc(ingestionRuns.startedAt)).limit(1);
  return r ?? null;
}
