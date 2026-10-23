import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getContext } from "@/server/context";
import { loadFinanceSnapshot } from "@/server/views";
import { buildPlan } from "@/server/plan";
import { weeklyReviews } from "@/db/schema";
import { formatINR } from "@/lib/money";
import { formatShortDate } from "@/lib/dates";
import { illustrativeMix } from "@/lib/finance/allocation";
import { SKIP_IMPACT } from "@/lib/finance/profile";
import { Badge, ButtonLink, Card, CardHeader, Explain, Notice, PageHeader, Progress, SubNav } from "@/components/ui";
import { PLAN_TABS } from "./tabs";
import { PlanDisclaimer } from "./disclaimer";

export const metadata = { title: "Plan" };

const OUTCOME_TONE = { insufficient_info: "neutral", no_surplus: "attention", build_reserves: "info", fund_near_term: "info", continue_plan: "positive", room_to_increase: "positive" } as const;

export default async function PlanPage() {
  const ctx = await getContext();
  const fin = await loadFinanceSnapshot(ctx);
  const { plan, risk, goalsWithPace, profile, inputs } = buildPlan(ctx, fin);
  const [lastReview] = await ctx.db.select().from(weeklyReviews).where(and(eq(weeklyReviews.userId, ctx.user.id))).orderBy(desc(weeklyReviews.weekStart)).limit(1);
  const longMix = illustrativeMix(10, risk.level);
  const skipped = profile?.skipped ?? [];

  return (
    <>
      <PageHeader title="Plan" subtitle="Goals, reserves and a weekly decision" action={<ButtonLink href="/plan/review" size="sm">Weekly review</ButtonLink>} />
      <SubNav items={PLAN_TABS} active="/plan" />
      {!profile ? <Notice tone="info" className="mb-4" title="Your plan needs a few answers">Answer the setup questions (all optional) to get a tailored plan. <Link href="/onboarding" className="font-semibold underline">Start setup</Link></Notice> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="This week's plan" subtitle="Calculated from your records; no new investment is forced" />
          <Badge tone={OUTCOME_TONE[plan.outcome]}>{plan.headline}</Badge>
          <p className="mt-2 text-sm text-muted">{plan.explanation}</p>
          {plan.monthlySurplus !== null ? (
            <dl className="num mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-surface-2 p-2"><dt className="text-xs text-muted">Income (est.)</dt><dd className="font-semibold">{formatINR(inputs.monthlyIncome ?? 0, { whole: true })}</dd></div>
              <div className="rounded-lg bg-surface-2 p-2"><dt className="text-xs text-muted">Essentials</dt><dd className="font-semibold">{formatINR(inputs.monthlyEssentials ?? 0, { whole: true })}</dd></div>
              <div className="rounded-lg bg-surface-2 p-2"><dt className="text-xs text-muted">Discretionary (3-mo avg)</dt><dd className="font-semibold">{formatINR(inputs.avgDiscretionary, { whole: true })}</dd></div>
              <div className="rounded-lg bg-surface-2 p-2"><dt className="text-xs text-muted">Existing plans + EMIs</dt><dd className="font-semibold">{formatINR(inputs.existingPlannedContributions + inputs.monthlyDebtPayments, { whole: true })}</dd></div>
              <div className="col-span-2 rounded-lg bg-primary-soft p-2 text-primary"><dt className="text-xs">Monthly surplus after all of the above</dt><dd className="text-lg font-bold">{formatINR(plan.monthlySurplus, { whole: true, signed: true })}</dd></div>
            </dl>
          ) : null}
          <Explain summary="How is this calculated?">
            <p>Surplus = income − essential expenses − average discretionary spending − loan payments − contributions you already plan (SIPs, goal plans). Reserves are checked before any investing is suggested.</p>
            <ul className="mt-2 list-disc pl-5">{plan.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
          </Explain>
        </Card>

        <Card>
          <CardHeader title="Safety net" subtitle="Reserves come before investing" />
          {plan.emergencyTarget !== null ? (
            <>
              <p className="num text-2xl font-bold">{plan.emergencyMonthsCovered !== null ? `${plan.emergencyMonthsCovered.toFixed(1)} months` : "Unknown"}</p>
              <p className="text-sm text-muted">of essential expenses covered · target {formatINR(plan.emergencyTarget, { whole: true })} ({profile?.incomeStability === "stable" ? "3" : "6"} months{profile?.incomeStability === "stable" ? ", stable income" : ", income not marked stable"})</p>
              <Progress className="mt-3" value={(fin.emergencyFundBalance ?? 0) / Math.max(1, plan.emergencyTarget)} label="Emergency fund progress" tone={(fin.emergencyFundBalance ?? 0) >= plan.emergencyTarget ? "positive" : "primary"} />
            </>
          ) : <p className="text-sm text-muted">Add essential expenses to set a reserve target.</p>}
          <h3 className="mt-4 text-sm font-semibold">Risk profile</h3>
          <p className="text-sm text-muted">
            Tolerance: <strong className="text-text">{profile?.riskTolerance ?? "not given"}</strong> · Capacity: <strong className="text-text">{profile?.riskCapacity ?? "not given"}</strong>
            {risk.level ? <> · Plan uses <strong className="text-text">{risk.level}</strong>{risk.limitedBy && risk.limitedBy !== "both" ? ` (limited by ${risk.limitedBy})` : ""}</> : null}
          </p>
          {skipped.length ? (
            <Explain summary={`${skipped.length} question${skipped.length > 1 ? "s" : ""} skipped: what that limits`}>
              <ul className="list-disc pl-5">{skipped.map((s) => SKIP_IMPACT[s]).filter(Boolean).map((t) => <li key={t}>{t}</li>)}</ul>
              <Link href="/onboarding" className="mt-2 inline-block font-semibold text-primary">Update answers</Link>
            </Explain>
          ) : <Link href="/onboarding" className="mt-2 inline-flex min-h-9 items-center text-sm font-semibold text-primary">Update profile answers</Link>}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Goals" action={<Link href="/plan/goals" className="text-sm font-semibold text-primary">All goals</Link>} />
          {goalsWithPace.length ? (
            <ul className="space-y-4">
              {goalsWithPace.slice(0, 4).map((g) => (
                <li key={g.id}>
                  <div className="flex justify-between gap-2 text-sm"><span className="truncate font-medium">{g.name}</span><span className="num text-muted">{formatINR(g.saved, { whole: true })} / {formatINR(g.targetAmount, { whole: true })}</span></div>
                  <Progress className="mt-1" value={g.progress} label={`${g.name} progress`} tone={g.progress >= 1 ? "positive" : "primary"} />
                  <p className="mt-1 text-xs text-muted">
                    {g.targetDate ? `By ${formatShortDate(g.targetDate)} · needs ~${formatINR(g.neededMonthly ?? 0, { whole: true })}/mo` : "No target date"}
                    {g.plannedMonthly ? ` · planned ${formatINR(g.plannedMonthly, { whole: true })}/mo` : ""}
                    {!g.onTrack ? <span className="font-semibold text-attention"> · behind pace</span> : null}
                  </p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No goals yet. <Link href="/plan/goals/new" className="font-semibold text-primary">Add one</Link>.</p>}
        </Card>
        <Card>
          <CardHeader title="Long-term illustration" subtitle="Asset-class mix for a 10+ year horizon at your effective risk level" action={<Link href="/plan/scenarios" className="text-sm font-semibold text-primary">Explore</Link>} />
          <ul className="space-y-2 text-sm">
            {(["equity", "debt", "gold", "cash"] as const).map((k) => (
              <li key={k} className="flex items-center gap-3">
                <span className="w-16 capitalize">{k}</span>
                <span className="h-2 flex-1 rounded-full bg-surface-3"><span className="block h-full rounded-full bg-primary" style={{ width: `${longMix.mix[k] * 100}%` }} /></span>
                <span className="num w-10 text-right">{Math.round(longMix.mix[k] * 100)}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">{longMix.note} Rule-of-thumb illustration, not a recommendation.</p>
        </Card>
      </div>
      {lastReview ? <p className="mt-4 text-sm text-muted">Last weekly review: week of {formatShortDate(lastReview.weekStart)}{lastReview.outcome ? ` · decision: ${lastReview.outcome.replaceAll("_", " ")}` : ""}.</p> : null}
      <PlanDisclaimer />
    </>
  );
}
