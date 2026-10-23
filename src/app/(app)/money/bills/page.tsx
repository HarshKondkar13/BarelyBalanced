import Link from "next/link";
import { Plus } from "lucide-react";
import { getContext } from "@/server/context";
import { loadFinanceSnapshot } from "@/server/views";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { ActionButton } from "@/components/toast";
import { reviewSubscriptionAction } from "@/app/(app)/_actions/money";
import { diffDays, formatShortDate, relativeDayLabel } from "@/lib/dates";
import { monthlyEquivalent } from "@/lib/finance/forecast";
import { formatINR, formatPercent } from "@/lib/money";
import { MoneyNav } from "../money-nav";
import { MarkPaid } from "./mark-paid";

export const metadata = { title: "Bills & subscriptions" };

const FREQ: Record<string, string> = { weekly: "weekly", monthly: "monthly", quarterly: "quarterly", yearly: "yearly" };

export default async function BillsPage() {
  const ctx = await getContext();
  const fin = await loadFinanceSnapshot(ctx);
  const rows = fin.recurringRows;
  const accounts = fin.accounts.filter((a) => !a.archived && a.type !== "credit_card").map((a) => ({ id: a.id, name: a.name }));
  const cards = fin.accounts.filter((a) => !a.archived && a.type === "credit_card").map((a) => ({ id: a.id, name: a.name }));
  const outflows = rows.filter((r) => r.active && r.direction === "outflow" && r.kind !== "subscription");
  const subs = rows.filter((r) => r.kind === "subscription");
  const inflows = rows.filter((r) => r.active && r.direction === "inflow");
  const subMonthly = subs.filter((s) => s.active).reduce((a, s) => a + monthlyEquivalent(s), 0);
  const commitMonthly = rows.filter((r) => r.active && r.direction === "outflow").reduce((a, r) => a + monthlyEquivalent(r), 0);

  const Item = ({ r }: { r: (typeof rows)[number] }) => {
    const days = diffDays(r.nextDueDate, ctx.today);
    return (
      <li className="flex flex-wrap items-center gap-3 border-b border-border py-3 last:border-b-0">
        <Link href={`/money/bills/${r.id}`} className="min-w-0 flex-1">
          <span className="block truncate font-medium">{r.name}</span>
          <span className="text-xs text-muted">
            {formatINR(r.amount, { whole: true })} {FREQ[r.frequency]} · {days < 0 ? <span className="font-semibold text-danger">overdue since {formatShortDate(r.nextDueDate)}</span> : <>due {relativeDayLabel(r.nextDueDate, ctx.today).toLowerCase()}</>}
          </span>
        </Link>
        {r.active ? <MarkPaid id={r.id} name={r.name} defaultAccountId={r.accountId} accounts={accounts} cards={cards} inflow={r.direction === "inflow"} /> : <Badge>Inactive</Badge>}
      </li>
    );
  };

  return (
    <>
      <PageHeader title="Bills & subscriptions" action={<ButtonLink href="/money/bills/new" size="sm"><Plus size={16} aria-hidden /> Add</ButtonLink>} />
      <MoneyNav active="/money/bills" />
      {rows.length === 0 ? (
        <EmptyState title="Nothing recurring yet" body="Add rent, utilities, card bills, subscriptions, EMIs and your salary. They power reminders, the 30-day cash projection and the weekly plan." action={<ButtonLink href="/money/bills/new">Add a recurring item</ButtonLink>} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card><p className="text-xs text-muted">Recurring outflows</p><p className="num text-xl font-semibold">{formatINR(commitMonthly, { whole: true })}<span className="text-sm font-normal text-muted">/mo</span></p></Card>
            <Card><p className="text-xs text-muted">Subscriptions</p><p className="num text-xl font-semibold">{formatINR(subMonthly, { whole: true })}<span className="text-sm font-normal text-muted">/mo</span></p><p className="text-xs text-subtle">{formatINR(subMonthly * 12, { whole: true })} a year</p></Card>
            <Card><p className="text-xs text-muted">Subscription burden</p><p className="num text-xl font-semibold">{fin.monthlyIncomeEstimate ? formatPercent(subMonthly / fin.monthlyIncomeEstimate, 1) : "—"}</p><p className="text-xs text-subtle">of estimated monthly income</p></Card>
          </div>
          <p className="mt-2 text-xs text-subtle">Monthly figures convert yearly and quarterly items to a monthly equivalent (e.g. ₹1,499/year ≈ ₹125/month).</p>
          {outflows.length ? (<><SectionTitle>Bills & commitments</SectionTitle><Card className="py-0"><ul>{outflows.map((r) => <Item key={r.id} r={r} />)}</ul></Card></>) : null}
          {subs.length ? (
            <>
              <SectionTitle>Subscriptions</SectionTitle>
              <Card>
                <CardHeader as="h3" title="Review on purpose" subtitle="Keep what you use. Reviewing one earns progress once per quarter." />
                <ul>
                  {subs.map((r) => {
                    const stale = !r.lastReviewedAt || diffDays(ctx.today, r.lastReviewedAt.toISOString().slice(0, 10)) > 90;
                    return (
                      <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-border py-3 last:border-b-0">
                        <Link href={`/money/bills/${r.id}`} className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{r.name} {!r.active ? <Badge>Cancelled</Badge> : stale ? <Badge tone="attention">Review due</Badge> : <Badge tone="positive">Reviewed</Badge>}</span>
                          <span className="text-xs text-muted">{formatINR(r.amount, { whole: true })} {FREQ[r.frequency]} · ≈{formatINR(monthlyEquivalent(r), { whole: true })}/mo</span>
                        </Link>
                        {r.active ? (
                          <div className="flex gap-1.5">
                            <ActionButton action={reviewSubscriptionAction.bind(null, r.id, "keep")} variant="soft">Keep</ActionButton>
                            <ActionButton action={reviewSubscriptionAction.bind(null, r.id, "cancel")} variant="ghost" confirm={`Mark ${r.name} as cancelled? This only updates your records; cancel with the provider too.`}>Cancelled</ActionButton>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </>
          ) : null}
          {inflows.length ? (<><SectionTitle>Expected income</SectionTitle><Card className="py-0"><ul>{inflows.map((r) => <Item key={r.id} r={r} />)}</ul></Card></>) : null}
          <p className="mt-4 text-xs text-subtle">Recurring items are forecasts until you record them. Recording creates a real transaction and moves the due date forward.</p>
        </>
      )}
    </>
  );
}
