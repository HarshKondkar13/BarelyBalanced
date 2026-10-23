import { describe, expect, it } from "vitest";
import { parseFeed, parseFeedConfig } from "@/lib/news/feed";
import { canonicalUrl, clusterItems, titleSimilarity } from "@/lib/news/dedupe";
import { relevanceNotes } from "@/lib/news/relevance";
import { NewsExplainerSchema } from "@/lib/ai/contracts";
import { DEMO_STORIES } from "@/lib/news/demo";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>X</title>
<item><title>RBI keeps repo rate unchanged at policy meeting</title><link>https://example.com/a?utm_source=rss</link><pubDate>Fri, 23 Oct 2026 10:00:00 +0530</pubDate><description><![CDATA[<p>The committee <b>held</b> rates.</p><script>alert(1)</script>]]></description></item>
<item><title>No link item</title></item>
</channel></rss>`;
const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom story</title><link rel="alternate" href="https://example.org/b"/><updated>2026-10-23T05:00:00Z</updated><summary>Short</summary></entry></feed>`;

describe("news ingestion", () => {
  it("parses RSS, strips HTML/scripts and drops items without links", () => {
    const items = parseFeed(RSS);
    expect(items).toHaveLength(1);
    expect(items[0].summary).toBe("The committee held rates.");
    expect(items[0].publishedAt.toISOString()).toBe("2026-10-23T04:30:00.000Z");
  });
  it("parses Atom", () => {
    expect(parseFeed(ATOM)[0]).toMatchObject({ title: "Atom story", url: "https://example.org/b" });
  });
  it("canonicalises URLs for dedupe", () => {
    expect(canonicalUrl("https://www.example.com/a/?utm_source=rss&id=2#top")).toBe("https://example.com/a/?id=2");
  });
  it("clusters overlapping coverage of the same event", () => {
    const now = new Date();
    const c = clusterItems([
      { title: "RBI keeps repo rate unchanged at 6.5%", publishedAt: now },
      { title: "Repo rate unchanged: RBI keeps policy steady", publishedAt: now },
      { title: "Tech major reports quarterly results", publishedAt: now },
    ]);
    expect(c[0].clusterKey).toBe(c[1].clusterKey);
    expect(c[2].clusterKey).not.toBe(c[0].clusterKey);
    expect(titleSimilarity("a b c", "x y z")).toBe(0);
  });
  it("only accepts https feeds and known topics", () => {
    expect(parseFeedConfig("economy|https://a.example/rss, http://insecure.example/rss, bogus|https://b.example/rss")).toEqual([
      { topic: "economy", url: "https://a.example/rss" },
      { topic: "business", url: "https://b.example/rss" },
    ]);
  });
  it("demo stories satisfy the explainer contract and are labelled", () => {
    for (const s of DEMO_STORIES) {
      expect(NewsExplainerSchema.safeParse(s.explainer).success).toBe(true);
      expect(s.title.startsWith("Demo:")).toBe(true);
    }
  });
  it("adds personal relevance only when data supports it", () => {
    const none = { hasEquityHoldings: false, hasDebtHoldings: false, hasGoldHoldings: false, hasSip: false, hasLoanPayments: false, datedGoals: 0, hasEmergencyGoal: false };
    expect(relevanceNotes(["repo-rate"], none)).toEqual([]);
    expect(relevanceNotes(["repo-rate"], { ...none, hasLoanPayments: true })).toHaveLength(1);
  });
});
