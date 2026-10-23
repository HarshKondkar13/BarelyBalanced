import Link from "next/link";
import { Bookmark, Search } from "lucide-react";
import { getContext } from "@/server/context";
import { lastIngestion, loadStories, newsProviderConfigured } from "@/server/news";
import { bookmarks } from "@/server/signals-meta";
import { hasXpKey } from "@/server/xp";
import { xpKey } from "@/lib/gamification/rules";
import { relativeDayLabel, toLocalDate, toLocalTime, formatTime12 } from "@/lib/dates";
import { Badge, Card, Input, Notice, PageHeader, SubNav } from "@/components/ui";
import { ActionButton } from "@/components/toast";
import { markBriefingReadAction } from "@/app/(app)/_actions/signals";
import { SIGNAL_TABS, TOPICS } from "./tabs";
import { cn } from "@/lib/cn";

export const metadata = { title: "Signals" };

export default async function SignalsPage({ searchParams }: PageProps<"/signals">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const topic = typeof sp.topic === "string" && TOPICS[sp.topic] ? sp.topic : "";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const saved = sp.saved === "1";
  const marks = await bookmarks(ctx);
  const followed = ctx.prefs?.newsTopics?.length ? ctx.prefs.newsTopics : Object.keys(TOPICS);
  const { stories, usingDemo } = await loadStories(ctx.db, {
    topics: topic ? [topic] : saved ? undefined : followed,
    sinceDays: saved || q ? 60 : 3,
    q: q || undefined,
    ids: saved ? marks.map((m) => m.newsItemId) : undefined,
    limit: 30,
  });
  const markSet = new Set(marks.map((m) => m.newsItemId));
  const follows = (ctx.prefs?.followedEntities ?? []).map((f) => f.toLowerCase());
  const showAi = (ctx.prefs?.aiDataUse ?? "off") !== "off";
  const [run, readToday] = await Promise.all([lastIngestion(ctx.db), hasXpKey(ctx.db, ctx.user.id, xpKey.briefingRead(ctx.today))]);
  const configured = newsProviderConfigured();

  return (
    <>
      <PageHeader title="Signals" subtitle="Business and market news, explained" />
      <SubNav items={SIGNAL_TABS} active="/signals" />
      {usingDemo ? (
        <Notice tone="accent" className="mb-4" title="Demonstration stories">
          {configured ? "No stories have been ingested yet. Showing fictional demonstration stories until the first ingestion succeeds." : "No news provider is configured, so these are fictional stories written to show how the briefing works. They describe no real events. Configure licensed RSS feeds in .env (NEWS_RSS_FEEDS) to get real headlines."}
        </Notice>
      ) : null}
      <p className="mb-3 text-xs text-subtle">
        Freshness: {run ? `last ingestion ${run.status === "ok" ? "succeeded" : run.status === "error" ? "failed" : "running"} · ${relativeDayLabel(toLocalDate(run.startedAt, ctx.tz), ctx.today).toLowerCase()} at ${formatTime12(toLocalTime(run.startedAt, ctx.tz))}${run.status === "ok" ? ` · ${run.inserted} new of ${run.fetched} fetched` : ""}${run.error ? ` · ${run.error}` : ""}` : configured ? "no ingestion has run yet (it runs in the background worker)" : "provider not configured"}
      </p>
      <form className="mb-3 flex gap-2" role="search">
        <label className="relative flex-1">
          <span className="sr-only">Search stories</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Search stories" className="pl-9" />
        </label>
        <button className="min-h-11 rounded-xl bg-text px-4 text-sm font-semibold text-bg">Search</button>
      </form>
      <nav aria-label="Topics" className="-mx-4 mb-4 overflow-x-auto px-4">
        <ul className="flex gap-1.5 text-sm">
          {[["", "Followed"], ...Object.entries(TOPICS)].map(([k, label]) => (
            <li key={k}><Link href={k ? `/signals?topic=${k}` : "/signals"} aria-current={!saved && topic === k ? "page" : undefined} className={cn("inline-flex min-h-9 items-center whitespace-nowrap rounded-full border px-3", !saved && topic === k ? "border-text bg-text text-bg" : "border-border bg-surface text-muted")}>{label}</Link></li>
          ))}
          <li><Link href="/signals?saved=1" aria-current={saved ? "page" : undefined} className={cn("inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-full border px-3", saved ? "border-text bg-text text-bg" : "border-border bg-surface text-muted")}><Bookmark size={14} aria-hidden /> Saved</Link></li>
        </ul>
      </nav>

      {stories.length === 0 ? <Card><p className="text-sm text-muted">{saved ? "No saved stories yet." : "No stories match."}</p></Card> : (
        <ol className="space-y-3">
          {stories.map((s) => (
            <li key={s.id}>
              <Card className="p-0">
                <Link href={`/signals/${s.id}`} className="block p-4 hover:bg-surface-2">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    {s.isDemo ? <Badge tone="accent">Demo</Badge> : null}
                    <span>{TOPICS[s.topic] ?? s.topic}</span> · <span>{s.sourceName}</span> · <time dateTime={s.publishedAt.toISOString()}>{relativeDayLabel(toLocalDate(s.publishedAt, ctx.tz), ctx.today)}</time>
                    {s.alsoCoveredBy ? <span>· +{s.alsoCoveredBy} similar reports</span> : null}
                    {markSet.has(s.id) ? <Bookmark size={12} className="text-primary" aria-label="Saved" /> : null}
                    {follows.some((f) => s.title.toLowerCase().includes(f)) ? <Badge tone="primary">Following</Badge> : null}
                  </p>
                  <h2 className="mt-1 text-[17px] font-semibold leading-snug">{s.title}</h2>
                  {s.explainer && (s.explainerSource !== "ai" || showAi) ? <p className="mt-1 text-sm text-muted"><span className="font-semibold text-text">Why it matters: </span>{s.explainer.whyItMatters}</p> : s.summary ? <p className="mt-1 line-clamp-3 text-sm text-muted">{s.summary}</p> : null}
                </Link>
              </Card>
            </li>
          ))}
        </ol>
      )}
      {!saved && !q && stories.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {readToday ? <Badge tone="positive">Briefing read today</Badge> : <ActionButton action={markBriefingReadAction} variant="soft">I&apos;ve read today&apos;s briefing</ActionButton>}
          <span className="text-xs text-subtle">News is for understanding, not a signal to trade.</span>
        </div>
      ) : null}
    </>
  );
}
