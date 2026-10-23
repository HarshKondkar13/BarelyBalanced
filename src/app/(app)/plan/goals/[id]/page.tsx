import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getContext } from "@/server/context";
import { goalContributions, goals } from "@/db/schema";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/toast";
import { archiveGoalAction } from "@/app/(app)/_actions/money";
import { formatShortDate } from "@/lib/dates";
import { formatINR, paiseToDecimalString } from "@/lib/money";
import { GoalForm } from "../goal-form";

export const metadata = { title: "Edit goal" };

export default async function EditGoalPage({ params }: PageProps<"/plan/goals/[id]">) {
  const { id } = await params;
  const { db, user } = await getContext();
  const [g] = await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.userId, user.id)));
  if (!g) notFound();
  const history = await db.select().from(goalContributions).where(and(eq(goalContributions.goalId, g.id), eq(goalContributions.userId, user.id))).orderBy(desc(goalContributions.date));
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageHeader title={g.name} action={<ActionButton action={archiveGoalAction.bind(null, g.id)} confirm="Archive this goal? Its history is kept.">Archive</ActionButton>} />
      <GoalForm id={g.id} initial={{ name: g.name, kind: g.kind, targetAmount: paiseToDecimalString(g.targetAmount), targetDate: g.targetDate ?? "", priority: g.priority, plannedMonthly: g.plannedMonthly ? paiseToDecimalString(g.plannedMonthly) : "" }} />
      <Card>
        <CardHeader title="Contribution history" subtitle="Actual money set aside (withdrawals shown as negative)" />
        <ul className="divide-y divide-border text-sm">
          {history.map((c) => (
            <li key={c.id} className="flex justify-between py-2"><span>{formatShortDate(c.date)}{c.note ? ` · ${c.note}` : ""}</span><span className="num">{formatINR(c.amount, { whole: true, signed: true })}</span></li>
          ))}
          {history.length === 0 ? <li className="py-2 text-muted">None yet.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
