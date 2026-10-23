"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { toast } from "@/components/toast";
import { saveTransactionAction, deleteTransactionAction } from "@/app/(app)/_actions/money";
import { formatINR, tryParseRupees } from "@/lib/money";
import { cn } from "@/lib/cn";

type Opt = { id: string; name: string };
type Cat = Opt & { kind: "expense" | "income" };
type TxnType = "expense" | "income" | "transfer" | "refund";

export type TxnFormValue = {
  id?: string;
  type: TxnType;
  date: string;
  amount: string;
  accountId: string;
  toAccountId?: string | null;
  description: string;
  notes?: string | null;
  tags?: string;
  paymentMethod?: string | null;
  refundOfId?: string | null;
  splits: Array<{ categoryId: string | null; amount: string }>;
};

const TYPES: Array<{ v: TxnType; label: string; hint: string }> = [
  { v: "expense", label: "Expense", hint: "Money spent, including card purchases." },
  { v: "income", label: "Income", hint: "Salary, stipend, freelance, interest. Not opening balances." },
  { v: "transfer", label: "Transfer", hint: "Between your own accounts, e.g. paying a card bill or moving money to savings. Never counted as income or spending." },
  { v: "refund", label: "Refund", hint: "Money returned for an earlier purchase. Reduces spending in that category." },
];

export function TxnForm({ initial, accounts, categories, recentExpenses }: { initial: TxnFormValue; accounts: Opt[]; categories: Cat[]; recentExpenses: Array<{ id: string; label: string; categoryId: string | null }> }) {
  const router = useRouter();
  const [v, setV] = useState<TxnFormValue>(initial);
  const [splitMode, setSplitMode] = useState(initial.splits.length > 1);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof TxnFormValue>(k: K, val: TxnFormValue[K]) => setV((x) => ({ ...x, [k]: val }));

  const catOptions = categories.filter((c) => (v.type === "income" ? c.kind === "income" : c.kind === "expense"));
  const total = tryParseRupees(v.amount || "0") ?? 0;
  const splitSum = useMemo(() => v.splits.reduce((a, s) => a + (tryParseRupees(s.amount || "0") ?? 0), 0), [v.splits]);
  const typeInfo = TYPES.find((t) => t.v === v.type)!;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const splits = v.type === "transfer" ? [] : splitMode ? v.splits.filter((s) => s.amount) : [{ categoryId: v.splits[0]?.categoryId ?? null, amount: v.amount }];
    start(async () => {
      const res = await saveTransactionAction(v.id ?? null, {
        type: v.type,
        date: v.date,
        amount: v.amount,
        accountId: v.accountId,
        toAccountId: v.type === "transfer" ? v.toAccountId : null,
        description: v.description,
        notes: v.notes || null,
        tags: v.tags || null,
        paymentMethod: v.paymentMethod || null,
        refundOfId: v.type === "refund" ? v.refundOfId || null : null,
        splits,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast(res);
      router.push("/money/transactions");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Type</legend>
        <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1" role="radiogroup">
          {TYPES.map((t) => (
            <label key={t.v} className={cn("flex min-h-10 cursor-pointer items-center justify-center rounded-lg text-[13px] font-semibold", v.type === t.v ? "bg-surface text-text shadow-sm" : "text-muted")}>
              <input type="radio" name="type" value={t.v} checked={v.type === t.v} onChange={() => setV((x) => ({ ...x, type: t.v, splits: [{ categoryId: null, amount: "" }] }))} className="sr-only" />
              {t.label}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">{typeInfo.hint}</p>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (₹)" htmlFor="amount">
          <Input id="amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={v.amount} onChange={(e) => set("amount", e.target.value)} className="num text-lg font-semibold" autoFocus={!v.id} required />
        </Field>
        <Field label="Date" htmlFor="date">
          <Input id="date" type="date" value={v.date} onChange={(e) => set("date", e.target.value)} required />
        </Field>
      </div>

      <Field label="Description" htmlFor="description">
        <Input id="description" value={v.description} onChange={(e) => set("description", e.target.value)} placeholder={v.type === "transfer" ? "e.g. Credit card bill payment" : "e.g. Swiggy order"} maxLength={200} required />
      </Field>

      <div className={cn("grid gap-3", v.type === "transfer" && "grid-cols-2")}>
        <Field label={v.type === "transfer" ? "From account" : v.type === "income" || v.type === "refund" ? "Into account" : "Paid from"} htmlFor="accountId">
          <Select id="accountId" value={v.accountId} onChange={(e) => set("accountId", e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
        {v.type === "transfer" ? (
          <Field label="To account" htmlFor="toAccountId">
            <Select id="toAccountId" value={v.toAccountId ?? ""} onChange={(e) => set("toAccountId", e.target.value)}>
              <option value="">Choose…</option>
              {accounts.filter((a) => a.id !== v.accountId).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      {v.type === "refund" ? (
        <Field label="Refund for (optional)" htmlFor="refundOfId" hint="Linking keeps the refund in the original purchase's category.">
          <Select
            id="refundOfId"
            value={v.refundOfId ?? ""}
            onChange={(e) => {
              const orig = recentExpenses.find((x) => x.id === e.target.value);
              setV((x) => ({ ...x, refundOfId: e.target.value || null, splits: orig ? [{ categoryId: orig.categoryId, amount: "" }] : x.splits }));
            }}
          >
            <option value="">Not linked</option>
            {recentExpenses.map((x) => (
              <option key={x.id} value={x.id}>{x.label}</option>
            ))}
          </Select>
        </Field>
      ) : null}

      {v.type !== "transfer" ? (
        <div>
          {!splitMode ? (
            <Field label="Category" htmlFor="category">
              <Select id="category" value={v.splits[0]?.categoryId ?? ""} onChange={(e) => set("splits", [{ categoryId: e.target.value || null, amount: v.amount }])}>
                <option value="">Uncategorised</option>
                {catOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Split between categories</legend>
              {v.splits.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <Select aria-label={`Split ${i + 1} category`} value={s.categoryId ?? ""} onChange={(e) => set("splits", v.splits.map((x, j) => (j === i ? { ...x, categoryId: e.target.value || null } : x)))} className="flex-1">
                    <option value="">Uncategorised</option>
                    {catOptions.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                  <Input aria-label={`Split ${i + 1} amount`} inputMode="decimal" className="num w-28" value={s.amount} placeholder="0.00" onChange={(e) => set("splits", v.splits.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                  <Button type="button" variant="ghost" className="!px-2" aria-label={`Remove split ${i + 1}`} onClick={() => set("splits", v.splits.filter((_, j) => j !== i))} disabled={v.splits.length <= 1}>
                    <Trash2 size={16} aria-hidden />
                  </Button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button type="button" variant="ghost" size="sm" onClick={() => set("splits", [...v.splits, { categoryId: null, amount: "" }])} disabled={v.splits.length >= 10}>
                  <Plus size={14} aria-hidden /> Add split
                </Button>
                <span className={cn("num text-xs", splitSum === total ? "text-positive" : "text-attention")} aria-live="polite">
                  {splitSum === total ? "Splits add up" : `${formatINR(total - splitSum)} left to allocate`}
                </span>
              </div>
            </fieldset>
          )}
          <button type="button" className="mt-2 min-h-8 text-[13px] font-medium text-primary" onClick={() => {
            setSplitMode((m) => !m);
            if (!splitMode) set("splits", [{ categoryId: v.splits[0]?.categoryId ?? null, amount: v.amount }, { categoryId: null, amount: "" }]);
            else set("splits", [v.splits[0] ?? { categoryId: null, amount: v.amount }]);
          }}>
            {splitMode ? "Use a single category" : "Split between categories"}
          </button>
        </div>
      ) : null}

      <details className="rounded-xl border border-border p-3">
        <summary className="text-sm font-medium">Notes, tags and payment method</summary>
        <div className="mt-3 space-y-3">
          <Field label="Payment method" htmlFor="pm">
            <Select id="pm" value={v.paymentMethod ?? ""} onChange={(e) => set("paymentMethod", e.target.value || null)}>
              <option value="">Not specified</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="cash">Cash</option>
              <option value="netbanking">Net banking / NEFT / IMPS</option>
              <option value="autodebit">Auto-debit / mandate</option>
            </Select>
          </Field>
          <Field label="Tags" htmlFor="tags" hint="Comma separated, e.g. trip-goa, work">
            <Input id="tags" value={v.tags ?? ""} onChange={(e) => set("tags", e.target.value)} />
          </Field>
          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" rows={2} value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
      </details>

      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={pending}>{pending ? "Saving…" : v.id ? "Save changes" : "Add transaction"}</Button>
        {v.id ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Delete this transaction? Any XP it earned today is corrected.")) return;
              start(async () => {
                const r = await deleteTransactionAction(v.id!);
                toast(r);
                if (r.ok) router.push("/money/transactions");
              });
            }}
          >
            Delete
          </Button>
        ) : null}
      </div>
    </form>
  );
}
