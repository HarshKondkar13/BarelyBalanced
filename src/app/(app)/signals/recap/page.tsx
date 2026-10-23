import Link from "next/link";
import { getContext } from "@/server/context";
import { loadStories } from "@/server/news";
import { conceptById } from "@/lib/news/concepts";
import { formatShortDate, toLocalDate } from "@/lib/dates";
import { Badge, Card, CardHeader, PageHeader, SubNav } from "@/components/ui";
import { SIGNAL_TABS, TOPICS } from "../tabs";

export const metadata = { title: "Recaps" };

export default async function RecapPage() {
  const ctx = await getContext();
  const [week, month] = await Promise.all([loadStories(ctx.db, { sinceDays: 7, limit: 100 }), loadStories(ctx.db, { sinceDays: 30, limit: 200 })]);
  // Connect related developments via shared concepts.
  const threads = new Map<string, typeof week.stories>();
  for (const s of week.stories) for (const c of s.explainer?.conceptIds ?? []) threads.set(c, [...(threads.get(c) ?? []), s]);
  const connected = [...threads.entries()].filter(([, v]) => v.length >= 2).sort((a, b) => b[1].length - a[1].length);
  const byTopic = new Map<string, typeof month.stories>();
  for (const s of month.stories) byTopic.set(s.topic, [...(byTopic.get(s.topic) ?? []), s]);
  const themes = [...byTopic.entries()].sort((a, b) => b[1].length - a[1].length);
  return (
    <>
      <PageHeader title="Weekly & monthly" subtitle="How the week's developments connect" />
      <SubNav items={SIGNAL_TABS} active="/signals/recap" />
      {week.usingDemo ? <p className="mb-3"><Badge tone="accent">Based on demonstration stories</Badge></p> : null}
      <Card className="mb-4">
        <CardHeader title="This week's threads" subtitle="Stories linked by a shared concept" />
        {connected.length ? (
          <ul className="space-y-4">
            {connected.map(([cid, stories]) => (
              <li key={cid}>
                <p className="font-semibold">{conceptById(cid)?.title ?? cid}</p>
                <p className="text-xs text-muted">{conceptById(cid)?.short}</p>
                <ul className="mt-1 space-y-1 text-sm">{stories.map((s) => <li key={s.id}><Link className="hover:underline" href={`/signals/${s.id}`}>{s.title}</Link></li>)}</ul>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Not enough related stories this week to draw threads.</p>}
      </Card>
      <Card>
        <CardHeader title="Monthly themes" subtitle="Last 30 days by topic, oldest to newest" />
        <div className="space-y-5">
          {themes.map(([topic, stories]) => (
            <section key={topic}>
              <h3 className="font-semibold">{TOPICS[topic] ?? topic} <span className="text-xs font-normal text-muted">· {stories.length} stories</span></h3>
              <ol className="mt-2 border-l-2 border-border pl-4">
                {[...stories].reverse().map((s) => (
                  <li key={s.id} className="relative pb-2 text-sm">
                    <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" aria-hidden />
                    <span className="text-xs text-subtle">{formatShortDate(toLocalDate(s.publishedAt, ctx.tz))}</span> · <Link href={`/signals/${s.id}`} className="hover:underline">{s.title}</Link>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </Card>
    </>
  );
}
