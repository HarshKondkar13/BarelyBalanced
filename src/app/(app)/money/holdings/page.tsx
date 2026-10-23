import Link from "next/link";
import { Plus } from "lucide-react";
import { getContext } from "@/server/context";
import { loadHoldings } from "@/server/finance";
import { Badge, ButtonLink, Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { diffDays, formatShortDate } from "@/lib/dates";
import { formatINR, formatPercent } from "@/lib/money";
import { MoneyNav } from "../money-nav";

export const metadata = { title: "Holdings" };

const CLASS: Record<string, string> = { equity: "Equity", debt: "Debt", gold: "Gold", cash: "Cash-like", real_estate: "Real estate", other: "Other" };

export default async function HoldingsPage() {
  const { db, user, today } = await getContext();
  const rows = await loadHoldings(db, user.id);
  const total = rows.reduce((a, h) => a + h.value, 0);
  const byClass = new Map<string, number>();
  for (const h of rows) byClass.set(h.assetClass, (byClass.get(h.assetClass) ?? 0) + h.value);
  return (
    <>
      <PageHeader title="Holdings" action={<ButtonLink href="/money/holdings/new" size="sm"><Plus size={16} aria-hidden /> Add</ButtonLink>} />
      <MoneyNav active="/money/holdings" />
      <Notice tone="info" className="mb-4">Values are what you entered, as of the date shown. They are not live prices. Update them from your statements, e.g. monthly.</Notice>
      {rows.length === 0 ? (
        <EmptyState title="No holdings yet" body="Add mutual funds, EPF, PPF, FDs or gold with their latest statement value. Used for net worth and educational allocation views only." action={<ButtonLink href="/money/holdings/new">Add holding</ButtonLink>} />
      ) : (
        <>
          <Card className="mb-4">
            <p className="text-xs text-muted">Total recorded value</p>
            <p className="num text-2xl font-bold">{formatINR(total, { whole: true })}</p>
            <ul className="mt-3 flex flex-wrap gap-2 text-xs">
              {[...byClass.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <li key={k} className="rounded-lg bg-surface-2 px-2.5 py-1">{CLASS[k]}: <span className="num font-semibold">{formatPercent(v / total)}</span></li>
              ))}
            </ul>
          </Card>
          <Card className="py-0">
            <ul>
              {rows.map((h) => {
                const age = diffDays(today, h.valuationDate);
                return (
                  <li key={h.id} className="border-b border-border last:border-b-0">
                    <Link href={`/money/holdings/${h.id}`} className="flex min-h-16 items-center justify-between gap-3 py-3">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{h.name}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          {CLASS[h.assetClass]} · valued {formatShortDate(h.valuationDate)}
                          {age > 45 ? <Badge tone="attention">{age} days old</Badge> : null}
                          {!h.includeInNetWorth ? <Badge>Not in net worth</Badge> : null}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="num block font-semibold">{formatINR(h.value, { whole: true })}</span>
                        {h.costBasis ? <span className="num text-xs text-subtle">invested {formatINR(h.costBasis, { whole: true })}</span> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
