import { getContext } from "@/server/context";
import { loadAccounts, loadCategories, loadTransactions } from "@/server/finance";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { TxnForm } from "@/components/txn-form";
import { addDays, formatShortDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";

export const metadata = { title: "Add transaction" };

export default async function NewTxnPage({ searchParams }: PageProps<"/money/transactions/new">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const [accounts, cats, recent] = await Promise.all([
    loadAccounts(ctx.db, ctx.user.id),
    loadCategories(ctx.db, ctx.user.id),
    loadTransactions(ctx.db, ctx.user.id, { from: addDays(ctx.today, -90) }),
  ]);
  const active = accounts.filter((a) => !a.archived);
  if (!active.length) {
    return (
      <>
        <PageHeader title="Add transaction" />
        <EmptyState title="Add an account first" body="Transactions belong to an account such as your bank account, cash or a credit card." action={<ButtonLink href="/money/accounts/new">Add account</ButtonLink>} />
      </>
    );
  }
  const type = (["expense", "income", "transfer", "refund"] as const).find((t) => t === sp.type) ?? "expense";
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Add transaction" />
      <TxnForm
        initial={{ type, date: ctx.today, amount: "", accountId: active[0].id, description: "", splits: [{ categoryId: null, amount: "" }] }}
        accounts={active.map((a) => ({ id: a.id, name: a.name }))}
        categories={cats.filter((c) => !c.archived)}
        recentExpenses={recent.filter((t) => t.type === "expense").slice(0, 60).map((t) => ({ id: t.id, label: `${formatShortDate(t.date)} · ${t.description} · ${formatINR(t.amount, { whole: true })}`, categoryId: t.splits[0]?.categoryId ?? null }))}
      />
    </div>
  );
}
