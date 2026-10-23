import Link from "next/link";
import { Plus } from "lucide-react";
import { getContext } from "@/server/context";
import { loadFinanceSnapshot } from "@/server/views";
import { buildPlan } from "@/server/plan";
import { addContributionAction } from "@/app/(app)/_actions/money";
import { ActionForm } from "@/components/action-form";
import { Badge, ButtonLink, Card, EmptyState, Input, PageHeader, Progress, SubNav } from "@/components/ui";
import { formatShortDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { PLAN_TABS } from "../tabs";
import { PlanDisclaimer } from "../disclaimer";

export const metadata = { title: "Goals" };

export default async function GoalsPage() {
  const ctx = await getContext();
  const fin = await loadFinanceSnapshot(ctx);
  const { goalsWithPace } = buildPlan(ctx, fin);
  return (
    <>
      <PageHeader title="Goals" action={<ButtonLink href="/plan/goals/new" size="sm"><Plus size={16} aria-hidden /> Add</ButtonLink>} />
      <SubNav items={PLAN_TABS} active="/plan/goals" />
      {goalsWithPace.length === 0 ? (
        <EmptyState title="No goals yet" body="Start with an emergency fund. Then add things you're saving for, with a date if there is one." action={<ButtonLink href="/plan/goals/new">Add a goal</ButtonLink>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {goalsWithPace.map((g) => (
            <Card key={g.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/plan/goals/${g.id}`} className="font-semibold hover:underline">{g.name}</Link>
                  <p className="text-xs text-muted">{g.kind === "emergency" ? "Emergency fund" : g.kind} · priority {g.priority === 1 ? "high" : g.priority === 2 ? "medium" : "low"}</p>
                </div>
                {g.progress >= 1 ? <Badge tone="positive">Reached</Badge> : !g.onTrack ? <Badge tone="attention">Behind pace</Badge> : <Badge tone="primary">On track</Badge>}
              </div>
              <p className="num mt-3 text-xl font-bold">{formatINR(g.saved, { whole: true })} <span className="text-sm font-normal text-muted">of {formatINR(g.targetAmount, { whole: true })}</span></p>
              <Progress className="mt-2" value={g.progress} label={`${g.name} progress`} tone={g.progress >= 1 ? "positive" : "primary"} />
              <p className="mt-2 text-xs text-muted">
                {g.targetDate ? <>Target {formatShortDate(g.targetDate)} ({g.monthsLeft} months) · needs about {formatINR(g.neededMonthly ?? 0, { whole: true })}/month</> : "No target date"}
                {g.plannedMonthly ? <> · you plan {formatINR(g.plannedMonthly, { whole: true })}/month</> : null}
              </p>
              <details className="mt-3">
                <summary className="min-h-9 text-sm font-semibold text-primary">Record a contribution</summary>
                <div className="mt-2">
                  <ActionForm action={addContributionAction.bind(null, g.id)} submitLabel="Record" resetOnSuccess submitVariant="soft" className="flex flex-wrap items-end gap-2">
                    <label className="flex-1 text-xs font-medium">Amount (₹, negative for withdrawal)<Input name="amount" inputMode="decimal" className="num mt-1" required /></label>
                    <label className="text-xs font-medium">Date<Input name="date" type="date" className="mt-1" /></label>
                  </ActionForm>
                  <p className="mt-1 text-xs text-subtle">Records money set aside for this goal. Any amount earns the same small progress, once a month per goal.</p>
                </div>
              </details>
            </Card>
          ))}
        </div>
      )}
      <PlanDisclaimer />
    </>
  );
}
