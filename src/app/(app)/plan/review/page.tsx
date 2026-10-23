import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getContext } from "@/server/context";
import { loadFinanceSnapshot } from "@/server/views";
import { buildWeeklyReview } from "@/server/review";
import { weeklyReviews } from "@/db/schema";
import { formatShortDate, relativeDayLabel } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { Badge, Card, CardHeader, Notice, PageHeader, Progress, SubNav } from "@/components/ui";
import { PLAN_TABS } from "../tabs";
import { PlanDisclaimer } from "../disclaimer";
import { ReviewForm } from "./review-form";

export const metadata = { title: "Weekly review" };

const SUGGEST: Record<string, string> = { insufficient_info: "no_decision", no_surplus: "adjust_plan", build_reserves: "build_reserves", fund_near_term: "adjust_plan", continue_plan: "continue_plan", room_to_increase: "continue_plan" };

export default async function ReviewPage() {
  const ctx = await getContext();
  const fin = await loadFinanceSnapshot(ctx);
  const r = await buildWeeklyReview(ctx, fin);
  const [existing] = await ctx.db.select().from(weeklyReviews).where(and(eq(weeklyReviews.userId, ctx.user.id), eq(weeklyReviews.weekStart, r.weekStart)));
  const { plan } = r.planData;
  const spendDelta = r.thisWeek.spending - r.prevWeek.spending;
  return (
    <>
      <PageHeader title="Weekly review" subtitle={`Week of ${formatShortDate(r.weekStart)} · about 15 minutes`} />
      <SubNav items={PLAN_TABS} active="/plan/review" />
      {existing?.completedAt ? <Notice tone="positive" className="mb-4">Completed this week ({existing.outcome?.replaceAll("_", " ")}). You can revisit and update it.</Notice> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="1 · What changed" subtitle="Last 7 days vs the 7 before" />
          <dl className="num grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-surface-2 p-2"><dt className="text-xs text-muted">Spending</dt><dd className="font-semibold">{formatINR(r.thisWeek.spending, { whole: true })}</dd><dd className={`text-xs ${spendDelta > 0 ? "text-attention" : "text-positive"}`}>{spendDelta >= 0 ? "+" : "−"}{formatINR(Math.abs(spendDelta), { whole: true })} vs previous</dd></div>
            <div className="rounded-lg bg-surface-2 p-2"><dt className="text-xs text-muted">Income</dt><dd className="font-semibold">{formatINR(r.thisWeek.income, { whole: true })}</dd></div>
            <div className="rounded-lg bg-surface-2 p-2"><dt className="text-xs text-muted">Cash & bank balances</dt><dd className="font-semibold">{formatINR(r.liquidDelta, { whole: true, signed: true })}</dd></div>
            <div className="rounded-lg bg-surface-2 p-2"><dt className="text-xs text-muted">Card balance owed</dt><dd className="font-semibold">{formatINR(r.cardOwedDelta, { whole: true, signed: true })}</dd></div>
          </dl>
          {r.changes.length ? (
            <ul className="mt-3 space-y-1 text-sm">
              {r.changes.map((c) => <li key={c.id} className="flex justify-between gap-2"><span>{c.name}</span><span className={`num ${c.delta > 0 ? "text-attention" : "text-positive"}`}>{c.delta > 0 ? "+" : "−"}{formatINR(Math.abs(c.delta), { whole: true })}</span></li>)}
            </ul>
          ) : <p className="mt-3 text-sm text-muted">No category moved by more than ₹500.</p>}
        </Card>

        <Card>
          <CardHeader title="2 · Goals" action={<Link href="/plan/goals" className="text-sm font-semibold text-primary">Goals</Link>} />
          {r.planData.goalsWithPace.length ? (
            <ul className="space-y-3">
              {r.planData.goalsWithPace.map((g) => (
                <li key={g.id}>
                  <div className="flex justify-between text-sm"><span>{g.name}</span><span className="num text-muted">{Math.round(g.progress * 100)}%</span></div>
                  <Progress value={g.progress} label={g.name} className="mt-1" />
                  {!g.onTrack ? <p className="mt-0.5 text-xs text-attention">Needs ~{formatINR(g.neededMonthly ?? 0, { whole: true })}/mo to hit {formatShortDate(g.targetDate!)}; planned {formatINR(g.plannedMonthly ?? 0, { whole: true })}.</p> : null}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No goals yet.</p>}
        </Card>

        <Card>
          <CardHeader title="3 · Next 14 days" subtitle={`${formatINR(r.upcomingTotal, { whole: true })} of known commitments`} />
          {r.upcoming.length ? (
            <ul className="divide-y divide-border text-sm">{r.upcoming.map((o) => <li key={o.itemId + o.date} className="flex justify-between py-1.5"><span>{o.name} <span className="text-xs text-subtle">· {relativeDayLabel(o.date, ctx.today)}</span></span><span className="num">{formatINR(o.amount, { whole: true })}</span></li>)}</ul>
          ) : <p className="text-sm text-muted">No bills or commitments recorded for the next two weeks.</p>}
        </Card>

        <Card>
          <CardHeader title="4 · Is there investable surplus?" />
          <Badge tone={plan.outcome === "no_surplus" ? "attention" : plan.outcome === "insufficient_info" ? "neutral" : "positive"}>{plan.headline}</Badge>
          <p className="mt-2 text-sm text-muted">{plan.explanation}</p>
        </Card>

        <Card>
          <CardHeader title="5 · Educational allocation scenario" subtitle={r.longestGoal ? `For a horizon like "${r.longestGoal.name}"` : "For a long horizon (10+ years)"} />
          <p className="text-sm">
            {(["equity", "debt", "gold", "cash"] as const).filter((k) => r.mix.mix[k] > 0).map((k) => `${Math.round(r.mix.mix[k] * 100)}% ${k}`).join(" · ")}
          </p>
          <p className="mt-1 text-xs text-muted">{r.mix.note} Asset classes only, with no products named. <Link href="/plan/scenarios" className="font-semibold text-primary">Explore pessimistic, base and optimistic illustrations</Link>.</p>
        </Card>

        <Card>
          <CardHeader title="6 · Suggested contribution schedule" />
          {plan.schedule.length ? (
            <ul className="space-y-2 text-sm">{plan.schedule.map((s) => <li key={s.target}><p className="font-medium">{formatINR(s.monthly, { whole: true })}/month → {s.target}</p><p className="text-xs text-muted">{s.rationale} Ideally scheduled a day or two after income arrives.</p></li>)}</ul>
          ) : <p className="text-sm text-muted">No new contributions suggested this week. Keep existing ones as they are.</p>}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="7 · Risks, assumptions and alternatives" />
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div><p className="font-semibold">Risks</p><ul className="mt-1 list-disc pl-5 text-muted">{plan.risks.map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div><p className="font-semibold">Assumptions</p><ul className="mt-1 list-disc pl-5 text-muted">{plan.assumptions.map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div><p className="font-semibold">Alternatives</p><ul className="mt-1 list-disc pl-5 text-muted">{plan.alternatives.map((x) => <li key={x}>{x}</li>)}</ul></div>
          </div>
          <p className="mt-3 text-sm text-muted">Time this week: {r.time.done} of {r.time.planned} planned tasks done · {r.time.habitChecks} habit check-ins.{r.time.slipped.length ? ` Slipping repeatedly: ${r.time.slipped.join(", ")}. Consider a smaller first step or a different time.` : ""}</p>
        </Card>
      </div>
      <div className="mt-4">
        <ReviewForm actions={r.actions.map(({ id, title, planDate, why }) => ({ id, title, planDate, why }))} suggested={SUGGEST[plan.outcome]} done={Boolean(existing?.completedAt)} />
      </div>
      <PlanDisclaimer />
    </>
  );
}
