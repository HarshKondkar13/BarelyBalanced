import Link from "next/link";
import { Plus } from "lucide-react";
import { getContext } from "@/server/context";
import { loadFinanceSnapshot } from "@/server/views";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui";
import { formatINR } from "@/lib/money";
import { isLiability } from "@/lib/finance/ledger";
import { MoneyNav } from "../money-nav";

export const metadata = { title: "Accounts" };

const TYPE_LABEL: Record<string, string> = { bank: "Bank", cash: "Cash", wallet: "Wallet", credit_card: "Credit card", investment: "Investment cash flows", loan: "Loan" };

export default async function AccountsPage() {
  const ctx = await getContext();
  const fin = await loadFinanceSnapshot(ctx);
  const active = fin.accounts.filter((a) => !a.archived);
  const archived = fin.accounts.filter((a) => a.archived);
  return (
    <>
      <PageHeader title="Accounts" action={<ButtonLink href="/money/accounts/new" size="sm"><Plus size={16} aria-hidden /> Add</ButtonLink>} />
      <MoneyNav active="/money/accounts" />
      {active.length === 0 ? (
        <EmptyState title="No accounts yet" body="Add a bank account, cash, or credit card. The opening balance is where tracking starts; it is never counted as income." action={<ButtonLink href="/money/accounts/new">Add account</ButtonLink>} />
      ) : (
        <Card className="p-0">
          <ul>
            {active.map((a) => {
              const b = fin.balances.get(a.id)!;
              const liab = isLiability(a.type);
              return (
                <li key={a.id} className="border-b border-border last:border-b-0">
                  <Link href={`/money/accounts/${a.id}`} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{a.name}</span>
                      <span className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted">
                        {TYPE_LABEL[a.type]}
                        {!a.includeInNetWorth ? <Badge>Not in net worth</Badge> : null}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className={`num block font-semibold ${liab && (b.owed ?? 0) > 0 ? "text-danger" : ""}`}>{liab ? formatINR(b.owed ?? 0) : formatINR(b.balance)}</span>
                      <span className="text-xs text-subtle">{liab ? "owed" : "balance"}</span>
                      {liab && a.creditLimit ? <span className="block text-xs text-subtle">{Math.round(((b.owed ?? 0) / a.creditLimit) * 100)}% of limit used</span> : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <p className="mt-3 text-xs text-subtle">Balances = opening balance + transactions on or after the opening date, up to today. Future-dated entries are excluded.</p>
      {archived.length ? (
        <>
          <SectionTitle>Archived</SectionTitle>
          <ul className="text-sm text-muted">
            {archived.map((a) => (
              <li key={a.id}><Link className="underline" href={`/money/accounts/${a.id}`}>{a.name}</Link></li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
