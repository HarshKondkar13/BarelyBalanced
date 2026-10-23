/** Deduplication helpers for overlapping coverage of the same story. */
import { createHash } from "node:crypto";

const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "and", "as", "at", "by", "with", "is", "are", "its", "from", "after", "over", "amid", "says", "said", "report", "reports", "demo"]);

export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|cmp$|src$)/i.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw.trim();
  }
}

export const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

export function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Jaccard similarity of title tokens: 0 (unrelated) to 1 (identical). */
export function titleSimilarity(a: string, b: string): number {
  const A = new Set(titleTokens(a));
  const B = new Set(titleTokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Assign each item a cluster key: items whose titles are similar (>= threshold) within
 * a 48-hour window share the first item's key. O(n²) is fine for a daily batch.
 */
export function clusterItems<T extends { title: string; publishedAt: Date }>(items: T[], threshold = 0.5): Array<T & { clusterKey: string }> {
  const out: Array<T & { clusterKey: string }> = [];
  for (const it of items) {
    const match = out.find((o) => Math.abs(o.publishedAt.getTime() - it.publishedAt.getTime()) < 48 * 3600e3 && titleSimilarity(o.title, it.title) >= threshold);
    out.push({ ...it, clusterKey: match ? match.clusterKey : sha(titleTokens(it.title).sort().join(" ")) });
  }
  return out;
}
