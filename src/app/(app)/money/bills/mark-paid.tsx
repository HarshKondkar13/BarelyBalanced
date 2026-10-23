"use client";

import { useState, useTransition } from "react";
import { Button, Select } from "@/components/ui";
import { toast } from "@/components/toast";
import { markRecurringPaidAction, skipRecurringOccurrenceAction } from "@/app/(app)/_actions/money";

/** Record a payment. Card bills become transfers (bank → card) so purchases aren't double-counted. */
export function MarkPaid({ id, name, defaultAccountId, accounts, cards, inflow }: { id: string; name: string; defaultAccountId: string | null; accounts: Array<{ id: string; name: string }>; cards: Array<{ id: string; name: string }>; inflow: boolean }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const looksLikeCard = /credit card|card bill/i.test(name);
  const [to, setTo] = useState<string>(looksLikeCard ? (cards[0]?.id ?? "") : "");
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <div className="flex gap-1.5">
        <Button size="sm" variant="soft" onClick={() => setOpen(true)}>{inflow ? "Received" : "Mark paid"}</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => toast(await skipRecurringOccurrenceAction(id)))}>Skip</Button>
      </div>
    );
  }
  return (
    <div className="mt-2 w-full space-y-2 rounded-xl bg-surface-2 p-3">
      <label className="block text-xs font-medium">
        {inflow ? "Into account" : "Paid from"}
        <Select value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1">
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
      </label>
      {!inflow && cards.length ? (
        <label className="block text-xs font-medium">
          Is this a credit-card bill payment?
          <Select value={to} onChange={(e) => setTo(e.target.value)} className="mt-1">
            <option value="">No, it&apos;s an expense</option>
            {cards.map((c) => <option key={c.id} value={c.id}>Yes, pays off {c.name} (transfer)</option>)}
          </Select>
        </label>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await markRecurringPaidAction(id, { fromAccountId: from, toAccountId: to || null }); toast(r); if (r.ok) setOpen(false); })}>Record</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
