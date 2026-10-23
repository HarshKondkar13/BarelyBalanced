import Link from "next/link";
import { Plus } from "lucide-react";
import { getContext } from "@/server/context";
import { loadFinanceSnapshot } from "@/server/views";
import { addMonthsToKey, formatMonth, formatShortDate, relativeDayLabel } from "@/lib/dates";
import { monthlySeries, UNCATEGORISED } from "@/lib/finance/ledger";
import { occurrencesBetween, projectCash } from "@/lib/finance/forecast";
import { formatINR, formatPercent } from "@/lib/money";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, Explain, Money, PageHeader, Progress, SectionTitle, Stat } from "@/components/ui";
import { CashProjectionChart, IncomeSpendingChart } from "@/components/charts";
import { InsightCard } from "@/components/insight-card";
import { MoneyNav } from "./money-nav";
import { addDays } from "@/lib/dates";

export const metadata = { title: "Money" };

export default async function MoneyPage() {
  const ctx = await getContext();
  const fin = await loadFinanceSnapshot(ctx);
  const { monthSummary: s, variance, netWorth, categories } = fin;
  const catName = (id: string) => (id === UNCATEGORISED ? "Uncategorised" : (categories.find((c) => c.id === id)?.name ?? "Uncategorised"));
  const byCat = [...s.byCategory.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const maxCat = byCat[0]?.[1] ?? 1;

  const months = Array.from({ length: 6 }, (_, i) => addMonthsToKey(fin.month, i - 5));
  const series = monthlySeries(fin.txns, months).map((m) => ({ ...m, label: formatMonth(m.month).slice(0, 3) }));
  const hasHistory = series.some((m) => m.income || m.spending);
  const avgSpend = Math.round(series.slice(0, 5).reduce((a, m) => a + m.spending, 0) / Math.max(1, series.slice(0, 5).filter((m) => m.spending > 0).length));

  const proj = projectCash(fin.liquidCash, fin.recurring, ctx.today, 30);
  const projData = [{ label: "Today", balance: fin.liquidCash }, ...proj.timeline.map((p) => ({ label: formatShortDate(p.date), balance: p.balance }))];
  const upcoming = occurrencesBetween(fin.recurring, ctx.today, addDays(ctx.today, 30)).slice(0, 8);

  if (fin.accounts.length === 0) {
    return (
      <>
        <PageHeader title="Money" />
        <MoneyNav active="/money" />
        <EmptyState
          title="Add your first account"
          body="Start with the account your salary or stipend lands in. Add its current balance as the opening balance. That is a starting point, not income."
          action={<ButtonLink href="/money/accounts/new">Add an account</ButtonLink>}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Money" subtitle={formatMonth(fin.month)} action={<ButtonLink href="/money/transactions/new" size="sm"><Plus size={16} aria-hidden /> Add</ButtonLink>} />
      <MoneyNav active="/money" />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="This month so far" subtitle={`${s.txnCount} transactions recorded`} />
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Income" value={<Money paise={s.income} />} />
            <Stat label="Spending" value={<Money paise={s.spending} />} hint={s.refunds ? `after ${formatINR(s.refunds, { whole: true })} refunds` : undefined} />
            <Stat label="Net cash flow" value={<Money paise={s.netCashFlow} signed />} />
            <Stat label="Savings rate" value={formatPercent(s.savingsRate)} />
          </div>
          <Explain>
            <p><strong>Spending</strong> is expenses minus refunds. <strong>Transfers</strong> between your accounts, including credit-card bill payments and SIP transfers, are not spending; card purchases count when you make them.</p>
            <p className="mt-2"><strong>Savings rate</strong> = (income − spending) ÷ income for the period. Money moved to savings or investments counts as saved. It shows &ldquo;—&rdquo; when no income is recorded yet.</p>
          </Explain>
        </Card>

        <Card>
          <CardHeader title="Budgets" subtitle={variance.lines.length ? `${formatINR(Math.max(0, variance.totalRemaining), { whole: true })} left across budgeted categories` : "No budgets this month"} action={<Link href="/money/budgets" className="text-sm font-semibold text-primary">Edit</Link>} />
          {variance.lines.length === 0 ? (
            <p className="text-sm text-muted">Set budgets for two or three categories to get pace alerts. <Link className="font-semibold text-primary" href="/money/budgets">Set budgets</Link></p>
          ) : (
            <ul className="space-y-3">
              {variance.lines.sort((a, b) => (b.usedRatio ?? 0) - (a.usedRatio ?? 0)).slice(0, 5).map((l) => (
                <li key={l.categoryId}>
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span className="truncate">{catName(l.categoryId)}</span>
                    <span className="num shrink-0 text-muted">
                      <Money paise={l.spent} /> / <Money paise={l.budget} />
                    </span>
                  </div>
                  <Progress value={l.usedRatio ?? 0} tone={l.status === "over" ? "danger" : l.status === "near" ? "attention" : "primary"} label={`${catName(l.categoryId)} budget used`} />
                  {l.status !== "under" ? <p className={`mt-1 text-xs ${l.status === "over" ? "text-danger" : "text-attention"}`}>{l.status === "over" ? `Over by ${formatINR(-l.remaining, { whole: true })}` : "Spending is ahead of the month's pace"}</p> : null}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-subtle">{formatPercent(fin.elapsed)} of the month has passed.</p>
        </Card>
      </div>

      {fin.insights.length ? (
        <>
          <SectionTitle>Insights</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {fin.insights.slice(0, 4).map((i) => (
              <InsightCard key={i.key} insight={i} />
            ))}
          </div>
        </>
      ) : null}

      <SectionTitle>Where the money went</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Spending by category" subtitle="This month, refunds applied" />
          {byCat.length === 0 ? (
            <p className="text-sm text-muted">No spending recorded this month yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {byCat.slice(0, 8).map(([id, v]) => (
                <li key={id}>
                  <div className="flex justify-between gap-2 text-sm">
                    <Link href={id === UNCATEGORISED ? "/money/transactions?uncategorised=1" : `/money/transactions?category=${id}`} className="truncate hover:underline">
                      {catName(id)}
                    </Link>
                    <span className="num shrink-0 font-medium">
                      <Money paise={v} /> <span className="text-xs font-normal text-subtle">{formatPercent(v / Math.max(1, s.spending))}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-3" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(v / maxCat) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-subtle">
            Essentials {formatINR(s.essentialSpending, { whole: true })} · Discretionary {formatINR(s.discretionarySpending, { whole: true })}
          </p>
        </Card>

        <Card>
          <CardHeader title="Income vs spending" subtitle="Last 6 months" />
          {hasHistory ? (
            <>
              <IncomeSpendingChart data={series} />
              <p className="mt-2 text-sm text-muted">
                This month&apos;s spending so far is {formatINR(s.spending, { whole: true })}
                {avgSpend > 0 ? <> against a 5-month average of {formatINR(avgSpend, { whole: true })} per full month.</> : "."}
              </p>
              <details className="mt-2 text-sm">
                <summary className="text-[13px] font-medium text-primary">Show as table</summary>
                <table className="num mt-2 w-full text-left text-xs">
                  <thead className="text-subtle">
                    <tr><th className="py-1 font-medium">Month</th><th className="font-medium">Income</th><th className="font-medium">Spending</th><th className="font-medium">Net</th></tr>
                  </thead>
                  <tbody>
                    {series.map((m) => (
                      <tr key={m.month} className="border-t border-border">
                        <td className="py-1">{formatMonth(m.month)}</td>
                        <td>{formatINR(m.income, { whole: true })}</td>
                        <td>{formatINR(m.spending, { whole: true })}</td>
                        <td>{formatINR(m.net, { whole: true, signed: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <p className="text-sm text-muted">Trends appear once you have a month or more of transactions.</p>
          )}
        </Card>
      </div>

      <SectionTitle>Balances and commitments</SectionTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Net worth" subtitle="Assets minus what you owe" action={<Link href="/money/accounts" className="text-sm font-semibold text-primary">Accounts</Link>} />
          <p className="num text-3xl font-bold tracking-tight">{formatINR(netWorth.total, { whole: true })}</p>
          <p className="num mt-1 text-sm text-muted">
            Assets {formatINR(netWorth.assets, { whole: true })} · Owed {formatINR(netWorth.liabilities, { whole: true })}
          </p>
          <Explain summary="What's included?">
            <ul className="space-y-1">
              {netWorth.included.map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <span>{i.name}{i.asOf ? <span className="text-subtle"> (valued {formatShortDate(i.asOf)})</span> : null}</span>
                  <span className="num">{formatINR(i.value, { whole: true })}</span>
                </li>
              ))}
            </ul>
            {netWorth.excluded.length ? (
              <>
                <p className="mt-2 font-semibold">Not included (your choice, editable per account):</p>
                <ul>
                  {netWorth.excluded.map((i) => (
                    <li key={i.id} className="flex justify-between gap-2">
                      <span>{i.name}</span>
                      <span className="num">{formatINR(i.value, { whole: true })}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <p className="mt-2">Holdings are manual valuations, not live prices. Investment cash-flow accounts are excluded by default so the same money is not counted twice.</p>
          </Explain>
        </Card>

        <Card>
          <CardHeader title="Next 30 days" subtitle="Projected from known bills and income only" action={<Link href="/money/bills" className="text-sm font-semibold text-primary">Bills</Link>} />
          {upcoming.length ? (
            <>
              <CashProjectionChart data={projData} />
              <p className="mt-2 text-sm text-muted">
                Liquid cash today: {formatINR(fin.liquidCash, { whole: true })}. Lowest projected point: {formatINR(proj.lowestPoint.balance, { whole: true })} on {formatShortDate(proj.lowestPoint.date)}.
                {proj.shortfall ? <strong className="text-danger"> A shortfall is projected on {formatShortDate(proj.shortfall.date)}.</strong> : null}
              </p>
              <ul className="mt-3 divide-y divide-border text-sm">
                {upcoming.map((o) => (
                  <li key={`${o.itemId}-${o.date}`} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate">
                      {o.name} <span className="text-subtle">· {relativeDayLabel(o.date, ctx.today)}</span>
                    </span>
                    <span className={`num shrink-0 ${o.direction === "inflow" ? "text-positive" : ""}`}>{o.direction === "inflow" ? "+" : "−"}{formatINR(o.amount, { whole: true })}</span>
                  </li>
                ))}
              </ul>
              <Badge tone="neutral" className="mt-2">Forecast · not actual transactions</Badge>
            </>
          ) : (
            <p className="text-sm text-muted">Add your rent, bills, subscriptions and salary under Bills to see what&apos;s coming up and spot cash shortfalls early.</p>
          )}
        </Card>
      </div>
    </>
  );
}
