"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardHeader, Field, Notice, Select } from "@/components/ui";
import { toast } from "@/components/toast";
import { analyzeCsvAction, commitImportAction, previewImportAction } from "@/app/(app)/_actions/import";
import type { Mapping, RowResult } from "@/lib/csv/import";
import { formatINR } from "@/lib/money";
import { formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/cn";

type Acct = { id: string; name: string; type: string };

export function Importer({ accounts }: { accounts: Acct[] }) {
  const router = useRouter();
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sample, setSample] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [include, setInclude] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cards = accounts.filter((a) => a.type === "credit_card");
  const set = <K extends keyof Mapping>(k: K, v: Mapping[K]) => { setMapping((m) => (m ? { ...m, [k]: v } : m)); setResults(null); };
  const counts = useMemo(() => {
    const c = { ok: 0, error: 0, duplicate: 0, possible_duplicate: 0 };
    for (const r of results ?? []) c[r.status]++;
    return c;
  }, [results]);

  async function onFile(f: File) {
    setError(null);
    setResults(null);
    if (f.size > 2 * 1024 * 1024) return setError("File must be under 2 MB");
    const t = await f.text();
    setText(t);
    setFileName(f.name);
    start(async () => {
      const r = await analyzeCsvAction(t);
      if (!r.ok) return setError(r.error);
      setHeaders(r.headers);
      setSample(r.sample);
      setMapping({ ...r.mapping, transferAccountId: cards[0]?.id ?? null });
      if (r.truncated) setError("Only the first 5,000 rows will be used.");
    });
  }

  const col = (k: keyof Mapping, label: string, optional = true) => (
    <Field label={label} htmlFor={`m-${k}`}>
      <Select id={`m-${k}`} value={(mapping?.[k] as string | null) ?? ""} onChange={(e) => set(k, (e.target.value || null) as never)}>
        {optional ? <option value="">Not in file</option> : null}
        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
      </Select>
    </Field>
  );

  return (
    <div className="space-y-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Card>
        <CardHeader title="1 · Choose a file" subtitle="A CSV statement you downloaded from your bank or card. Processed on your server, never shared." />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="CSV file" htmlFor="file"><input id="file" type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-primary-soft file:px-4 file:font-semibold file:text-primary" /></Field>
          <Field label="Import into account" htmlFor="acct">
            <Select id="acct" value={accountId} onChange={(e) => { setAccountId(e.target.value); setResults(null); }}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      {mapping ? (
        <Card>
          <CardHeader title="2 · Map columns" subtitle="We guessed from the headers. Check them against the sample below." />
          <div className="grid gap-3 sm:grid-cols-3">
            {col("date", "Date", false)}
            <Field label="Date format" htmlFor="df">
              <Select id="df" value={mapping.dateFormat} onChange={(e) => set("dateFormat", e.target.value as Mapping["dateFormat"])}>
                {["DD/MM/YYYY", "DD/MM/YY", "DD-MMM-YYYY", "YYYY-MM-DD", "MM/DD/YYYY"].map((f) => <option key={f}>{f}</option>)}
              </Select>
            </Field>
            {col("description", "Description", false)}
            {col("amount", "Single amount column")}
            {col("debit", "Debit / withdrawal")}
            {col("credit", "Credit / deposit")}
            {col("category", "Category (optional)")}
            {col("notes", "Notes (optional)")}
            {mapping.amount ? (
              <Field label="In the amount column…" htmlFor="neg">
                <Select id="neg" value={mapping.negativeIsExpense ? "neg" : "pos"} onChange={(e) => set("negativeIsExpense", e.target.value === "neg")}>
                  <option value="neg">Negative = money out</option>
                  <option value="pos">Positive = money out (card statements)</option>
                </Select>
              </Field>
            ) : null}
          </div>
          {cards.length ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Treat card bill payments as transfers to" htmlFor="tacct" hint="Avoids double-counting: the purchases are already on the card.">
                <Select id="tacct" value={mapping.transferAccountId ?? ""} onChange={(e) => set("transferAccountId", e.target.value || null)}>
                  <option value="">Don&apos;t convert</option>
                  {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="…when the description contains" htmlFor="tp" hint="Separate alternatives with |"><input id="tp" className="min-h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-sm" value={mapping.transferPattern ?? ""} onChange={(e) => set("transferPattern", e.target.value)} /></Field>
            </div>
          ) : null}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="text-subtle"><tr>{headers.map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>{sample.map((r, i) => <tr key={i} className="border-t border-border">{headers.map((h) => <td key={h} className="py-1 pr-3">{r[h]}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <Button className="mt-4" disabled={pending || !accountId} onClick={() => start(async () => {
            setError(null);
            const r = await previewImportAction(text!, mapping, accountId);
            if (!r.ok) return setError(r.error);
            setResults(r.results);
            setInclude(new Set());
          })}>Preview import</Button>
        </Card>
      ) : null}

      {results ? (
        <Card>
          <CardHeader title="3 · Review" subtitle="Nothing is saved until you confirm" />
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <Badge tone="positive">{counts.ok} ready</Badge>
            <Badge tone="attention">{counts.possible_duplicate} possible duplicates</Badge>
            <Badge>{counts.duplicate} already imported</Badge>
            <Badge tone="danger">{counts.error} with errors</Badge>
          </div>
          <div className="max-h-[420px] overflow-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface-2 text-subtle"><tr><th className="p-2">#</th><th>Date</th><th>Description</th><th className="text-right">Amount</th><th className="p-2">Status</th></tr></thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.index} className={cn("border-t border-border", r.status === "error" && "bg-danger-soft/50")}>
                    <td className="p-2 text-subtle">{r.index}</td>
                    <td className="whitespace-nowrap">{r.txn ? formatShortDate(r.txn.date) : "—"}</td>
                    <td className="max-w-[220px] truncate">{r.txn?.description ?? ""}</td>
                    <td className={cn("num whitespace-nowrap text-right", r.txn?.type === "income" && "text-positive")}>{r.txn ? `${r.txn.type === "income" ? "+" : r.txn.type === "transfer" ? "⇄ " : "−"}${formatINR(r.txn.amount)}` : ""}</td>
                    <td className="p-2">
                      {r.status === "ok" ? <span className="text-positive">{r.note ?? "OK"}</span> : null}
                      {r.status === "duplicate" ? <span className="text-subtle">Skipped: {r.note}</span> : null}
                      {r.status === "error" ? <span className="text-danger">{r.errors.join("; ")}</span> : null}
                      {r.status === "possible_duplicate" ? (
                        <label className="flex items-center gap-1.5 text-attention"><input type="checkbox" checked={include.has(r.index)} onChange={(e) => setInclude((s) => { const n = new Set(s); if (e.target.checked) n.add(r.index); else n.delete(r.index); return n; })} /> Import anyway? ({r.note})</label>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button className="mt-4" disabled={pending || counts.ok + include.size === 0} onClick={() => start(async () => {
            const r = await commitImportAction(text!, mapping, accountId, fileName, [...include]);
            if (!r.ok) return setError(r.error);
            toast(r);
            router.push("/money/transactions?uncategorised=1");
          })}>Import {counts.ok + include.size} transactions</Button>
          <p className="mt-2 text-xs text-subtle">Imported rows are tagged &ldquo;imported&rdquo; and can be undone as a batch. Uncategorised rows will be listed next so you can categorise them.</p>
        </Card>
      ) : null}
    </div>
  );
}
