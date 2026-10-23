"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import { toast } from "@/components/toast";
import { saveBudgetsAction } from "@/app/(app)/_actions/money";
import { formatINR, tryParseRupees } from "@/lib/money";

type Row = { categoryId: string; name: string; essential: boolean; budget: string; spent: number; lastMonth: number; avg3: number };

export function BudgetEditor({ month, rows, income }: { month: string; rows: Row[]; income: number | null }) {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(rows.map((r) => [r.categoryId, r.budget])));
  const [pending, start] = useTransition();
  const total = Object.values(values).reduce((a, v) => a + (tryParseRupees(v || "0") ?? 0), 0);
  return (
    <div>
      <div className="sticky top-0 z-10 -mx-4 mb-3 flex items-center justify-between gap-3 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur">
        <div>
          <p className="text-xs text-muted">Total budgeted</p>
          <p className="num font-semibold">{formatINR(total, { whole: true })}{income ? <span className="text-xs font-normal text-muted"> of ~{formatINR(income, { whole: true })} income</span> : null}</p>
        </div>
        <Button
          disabled={pending}
          onClick={() => start(async () => toast(await saveBudgetsAction(month, Object.entries(values).map(([categoryId, amount]) => ({ categoryId, amount })))))}
        >
          {pending ? "Saving…" : "Save budgets"}
        </Button>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.categoryId} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
            <div className="min-w-0 flex-1">
              <label htmlFor={`b-${r.categoryId}`} className="block truncate font-medium">{r.name}</label>
              <p className="num text-xs text-muted">
                This month {formatINR(r.spent, { whole: true })} · last month {formatINR(r.lastMonth, { whole: true })} · 3-mo avg {formatINR(r.avg3, { whole: true })}
              </p>
              {!values[r.categoryId] && r.avg3 > 0 ? (
                <button type="button" className="mt-1 min-h-7 text-xs font-semibold text-primary" onClick={() => setValues((v) => ({ ...v, [r.categoryId]: String(Math.ceil(r.avg3 / 100 / 100) * 100) }))}>
                  Use {formatINR(Math.ceil(r.avg3 / 100 / 100) * 100 * 100, { whole: true })} (3-month average, rounded)
                </button>
              ) : null}
            </div>
            <Input id={`b-${r.categoryId}`} inputMode="decimal" placeholder="No budget" className="num w-32 text-right" value={values[r.categoryId] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [r.categoryId]: e.target.value }))} />
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-subtle">Leave a field empty for no budget. Refunds reduce the amount counted against a budget.</p>
    </div>
  );
}
