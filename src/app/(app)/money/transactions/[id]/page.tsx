import { notFound } from "next/navigation";
import { getContext } from "@/server/context";
import { loadAccounts, loadCategories, loadTransactions } from "@/server/finance";
import { PageHeader } from "@/components/ui";
import { TxnForm } from "@/components/txn-form";
import { addDays, formatShortDate } from "@/lib/dates";
import { formatINR, paiseToDecimalString } from "@/lib/money";

export const metadata = { title: "Edit transaction" };

export default async function EditTxnPage({ params }: PageProps<"/money/transactions/[id]">) {
  const { id } = await params;
  const ctx = await getContext();
  const [accounts, cats, all] = await Promise.all([loadAccounts(ctx.db, ctx.user.id), loadCategories(ctx.db, ctx.user.id), loadTransactions(ctx.db, ctx.user.id)]);
  const t = all.find((x) => x.id === id);
  if (!t) notFound();
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Edit transaction" subtitle={t.importBatchId ? "Imported from CSV" : undefined} />
      <TxnForm
        initial={{
          id: t.id,
          type: t.type,
          date: t.date,
          amount: paiseToDecimalString(t.amount),
          accountId: t.accountId,
          toAccountId: t.toAccountId,
          description: t.description,
          notes: t.notes,
          tags: t.tags.join(", "),
          paymentMethod: t.paymentMethod,
          refundOfId: t.refundOfId,
          splits: t.splits.length ? t.splits.map((s) => ({ categoryId: s.categoryId, amount: paiseToDecimalString(s.amount) })) : [{ categoryId: null, amount: "" }],
        }}
        accounts={accounts.filter((a) => !a.archived || a.id === t.accountId || a.id === t.toAccountId).map((a) => ({ id: a.id, name: a.name }))}
        categories={cats}
        recentExpenses={all.filter((x) => x.type === "expense" && x.date >= addDays(ctx.today, -120)).slice(0, 60).map((x) => ({ id: x.id, label: `${formatShortDate(x.date)} · ${x.description} · ${formatINR(x.amount, { whole: true })}`, categoryId: x.splits[0]?.categoryId ?? null }))}
      />
    </div>
  );
}
