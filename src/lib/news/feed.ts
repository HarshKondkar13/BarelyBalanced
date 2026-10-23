/** RSS 2.0 / Atom parsing into a neutral item shape. Feed content is untrusted. */
import { XMLParser } from "fast-xml-parser";
import { sanitizeUntrusted } from "@/lib/ai/contracts";

export type FeedItem = { title: string; url: string; publishedAt: Date; summary: string | null };

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", processEntities: true, htmlEntities: true });

const text = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) return String((v as Record<string, unknown>)["#text"]);
  return "";
};

export function stripHtml(s: string): string {
  return s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
}

export function parseFeed(xml: string, maxItems = 50): FeedItem[] {
  const doc = parser.parse(xml);
  const rssItems = doc?.rss?.channel?.item;
  const atomEntries = doc?.feed?.entry;
  const raw: unknown[] = rssItems ? (Array.isArray(rssItems) ? rssItems : [rssItems]) : atomEntries ? (Array.isArray(atomEntries) ? atomEntries : [atomEntries]) : [];
  const out: FeedItem[] = [];
  for (const r of raw.slice(0, maxItems) as Record<string, unknown>[]) {
    const title = sanitizeUntrusted(stripHtml(text(r.title)), 300);
    let url = text(r.link) || text(r.guid);
    if (!url && r.link && typeof r.link === "object") {
      const links = Array.isArray(r.link) ? r.link : [r.link];
      const alt = (links as Record<string, string>[]).find((l) => !l["@_rel"] || l["@_rel"] === "alternate");
      url = alt?.["@_href"] ?? "";
    }
    const dateStr = text(r.pubDate) || text(r.published) || text(r.updated) || text(r["dc:date"]);
    const publishedAt = dateStr ? new Date(dateStr) : new Date();
    const summary = sanitizeUntrusted(stripHtml(text(r.description) || text(r.summary) || text(r["content:encoded"])), 600) || null;
    if (!title || !/^https?:\/\//.test(url) || Number.isNaN(publishedAt.getTime())) continue;
    out.push({ title, url, publishedAt, summary });
  }
  return out;
}

/** NEWS_RSS_FEEDS format: "topic|https://feed-url,topic|https://other". Topic defaults to "business". */
export function parseFeedConfig(raw: string | undefined): Array<{ topic: string; url: string }> {
  const topics = new Set(["economy", "business", "banking", "markets", "technology"]);
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [a, b] = s.includes("|") ? s.split("|", 2) : ["business", s];
      return { topic: topics.has(a.trim()) ? a.trim() : "business", url: b.trim() };
    })
    .filter((f) => /^https:\/\//.test(f.url));
}
