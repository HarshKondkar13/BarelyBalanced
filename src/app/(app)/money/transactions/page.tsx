import Link from "next/link";
import { ArrowLeftRight, Plus, RotateCcw, Search } from "lucide-react";
import { getContext } from "@/server/context";
import { loadAccounts, loadCategories, loadTransactions } from "@/server/finance";
import { Badge, ButtonLink, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { CategorizeSelect } from "@/components/categorize-select";
import { formatLongDate, monthKey, formatMonth } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { summarizePeriod } from "@/lib/finance/ledger";
import { MoneyNav } from "../money-nav";

export const metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: PageProps<"/money/transactions">) {
  const ctx = await getContext();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const category = typeof sp.category === "string" ? sp.category : "";
  const type = typeof sp.type === "string" ? sp.type : "";
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : "";
  const uncategorised = sp.uncategorised === "1";

  const [accounts, cats, all] = await Promise.all([loadAccounts(ctx.db, ctx.user.id), loadCategories(ctx.db, ctx.user.id), loadTransactions(ctx.db, ctx.user.id)]);
  const acct = new Map(accounts.map((a) => [a.id, a.name]));
  const cat = new Map(cats.map((c) => [c.id, c.name]));
  const filtered = all.filter((t) => {
    if (type && t.type !== type) return false;
    if (month && monthKey(t.date) !== month) return false;
    if (category && !t.splits.some((s) => s.categoryId === category)) return false;
    if (uncategorised && !(t.type !== "transfer" && t.splits.some((s) => s.categoryId === null))) return false;
    if (q) {
      const hay = `${t.description} ${t.merchant ?? ""} ${t.notes ?? ""} ${t.tags.join(" ")} ${t.splits.map((s) => cat.get(s.categoryId ?? "") ?? "").join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const shown = filtered.slice(0, 300);
  const groups = new Map<string, typeof shown>();
  for (const t of shown) groups.set(t.date, [...(groups.get(t.date) ?? []), t]);
  const sum = summarizePeriod(filtered, "0000-01-01", "9999-12-31");
  const months = [...new Set(all.map((t) => monthKey(t.date)))].slice(0, 12);
  const filtering = Boolean(q || category || type || month || uncategorised);

  return (
    <>
      <PageHeader title="Transactions" action={<ButtonLink href="/money/transactions/new" size="sm"><Plus size={16} aria-hidden /> Add</ButtonLink>} />
      <MoneyNav active="/money/transactions" />
      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto]" role="search">
        <label className="relative">
          <span className="sr-only">Search transactions</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Search description, notes, tags…" className="pl-9" />
        </label>
        <Select name="type" defaultValue={type} aria-label="Type">
          <option value="">All types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
          <option value="transfer">Transfers</option>
          <option value="refund">Refunds</option>
        </Select>
        <Select name="category" defaultValue={category} aria-label="Category">
          <option value="">All categories</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Select name="month" defaultValue={month} aria-label="Month">
          <option value="">All months</option>
          {months.map((m) => (
            <option key={m} value={m}>{formatMonth(m)}</option>
          ))}
        </Select>
        <button className="min-h-11 rounded-xl bg-text px-4 text-sm font-semibold text-bg">Filter</button>
        {uncategorised ? <input type="hidden" name="uncategorised" value="1" /> : null}
      </form>
      {filtering ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>{filtered.length} matching · spending {formatINR(sum.spending, { whole: true })} · income {formatINR(sum.income, { whole: true })}</span>
          {uncategorised ? <Badge tone="attention">Uncategorised only</Badge> : null}
          <Link href="/money/transactions" className="font-semibold text-primary">Clear filters</Link>
        </div>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState
          title={filtering ? "Nothing matches these filters" : "No transactions yet"}
          body={filtering ? "Try a different search or clear the filters." : "Add one manually, or import a CSV statement from your bank."}
          action={!filtering ? <div className="flex gap-2"><ButtonLink href="/money/transactions/new">Add transaction</ButtonLink><ButtonLink href="/money/import" variant="secondary">Import CSV</ButtonLink></div> : undefined}
        />
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([date, items]) => (
            <section key={date}>
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">{formatLongDate(date)}</h2>
              <ul className="rounded-[var(--radius)] border border-border bg-surface px-3">
                {items.map((t) => {
                  const isOut = t.type === "expense";
                  const sign = t.type === "transfer" ? "" : isOut ? "−" : "+";
                  const label = t.type === "transfer" ? `${acct.get(t.accountId)} → ${acct.get(t.toAccountId ?? "")}` : `${t.splits.map((s) => cat.get(s.categoryId ?? "") ?? "Uncategorised").join(" + ")} · ${acct.get(t.accountId)}`;
                  const needsCat = t.type !== "transfer" && t.splits.some((s) => s.categoryId === null);
                  return (
                    <li key={t.id} className="flex min-h-14 items-center gap-3 border-b border-border py-2 last:border-b-0">
                      <Link href={`/money/transactions/${t.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted" aria-hidden>
                          {t.type === "transfer" ? <ArrowLeftRight size={16} /> : t.type === "refund" ? <RotateCcw size={16} /> : <span className="text-xs font-bold">{t.description.slice(0, 1).toUpperCase()}</span>}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-medium">{t.description}</span>
                          <span className="block truncate text-xs text-muted">
                            {t.type === "refund" ? "Refund · " : t.type === "transfer" ? "Transfer · " : ""}
                            {label}
                            {t.tags.includes("sample") ? " · sample" : ""}
                          </span>
                        </span>
                      </Link>
                      {needsCat ? <CategorizeSelect txnId={t.id} categories={cats.filter((c) => c.kind === (t.type === "income" ? "income" : "expense") && !c.archived)} /> : null}
                      <span className={`num shrink-0 text-[15px] font-semibold ${t.type === "income" || t.type === "refund" ? "text-positive" : t.type === "transfer" ? "text-muted" : ""}`}>
                        {sign}{formatINR(t.amount)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {filtered.length > shown.length ? <p className="text-center text-sm text-muted">Showing the latest 300 of {filtered.length}. Narrow the filters to see older ones.</p> : null}
        </div>
      )}
    </>
  );
}
