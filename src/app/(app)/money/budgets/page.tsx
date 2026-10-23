import Link from "next/link";
import { getContext } from "@/server/context";
import { loadBudgets, loadCategories, loadTransactions } from "@/server/finance";
import { addMonthsToKey, endOfMonth, formatMonth, monthKey, startOfMonth } from "@/lib/dates";
import { summarizePeriod } from "@/lib/finance/ledger";
import { paiseToDecimalString } from "@/lib/money";
import { PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/toast";
import { copyBudgetsFromPreviousAction } from "@/app/(app)/_actions/money";
import { MoneyNav } from "../money-nav";
import { BudgetEditor } from "./budget-editor";
import { financialProfile } from "@/db/schema";
import { eq } from "drizzle-orm";

export const metadata = { title: "Budgets" };

export default async function BudgetsPage({ searchParams }: PageProps<"/money/budgets">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const current = monthKey(ctx.today);
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : current;
  const [cats, budgets, txns, [profile]] = await Promise.all([
    loadCategories(ctx.db, ctx.user.id),
    loadBudgets(ctx.db, ctx.user.id, month),
    loadTransactions(ctx.db, ctx.user.id, { from: startOfMonth(addMonthsToKey(month, -3)), to: endOfMonth(month) }),
    ctx.db.select().from(financialProfile).where(eq(financialProfile.userId, ctx.user.id)),
  ]);
  const sumFor = (m: string) => summarizePeriod(txns, startOfMonth(m), endOfMonth(m), cats);
  const thisM = sumFor(month);
  const last = sumFor(addMonthsToKey(month, -1));
  const prev3 = [1, 2, 3].map((i) => sumFor(addMonthsToKey(month, -i)));
  const rows = cats
    .filter((c) => c.kind === "expense" && !c.archived)
    .map((c) => {
      const b = budgets.find((x) => x.categoryId === c.id);
      return {
        categoryId: c.id,
        name: c.name,
        essential: c.essential,
        budget: b ? paiseToDecimalString(b.amount).replace(/\.00$/, "") : "",
        spent: Math.max(0, thisM.byCategory.get(c.id) ?? 0),
        lastMonth: Math.max(0, last.byCategory.get(c.id) ?? 0),
        avg3: Math.round(prev3.reduce((a, s) => a + Math.max(0, s.byCategory.get(c.id) ?? 0), 0) / 3),
      };
    })
    .sort((a, b) => b.avg3 - a.avg3);

  return (
    <>
      <PageHeader title="Budgets" subtitle={formatMonth(month)} />
      <MoneyNav active="/money/budgets" />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link className="min-h-9 rounded-full border border-border px-3 py-1.5" href={`/money/budgets?month=${addMonthsToKey(month, -1)}`}>← {formatMonth(addMonthsToKey(month, -1))}</Link>
        {month !== current ? <Link className="min-h-9 rounded-full border border-border px-3 py-1.5" href="/money/budgets">This month</Link> : null}
        <Link className="min-h-9 rounded-full border border-border px-3 py-1.5" href={`/money/budgets?month=${addMonthsToKey(month, 1)}`}>{formatMonth(addMonthsToKey(month, 1))} →</Link>
        {budgets.length === 0 ? <ActionButton action={copyBudgetsFromPreviousAction.bind(null, month)}>Copy last month&apos;s budgets</ActionButton> : null}
      </div>
      <BudgetEditor month={month} rows={rows} income={profile?.monthlyIncome ?? null} />
    </>
  );
}
