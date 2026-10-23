"use client";

import { useTransition } from "react";
import { categorizeAction } from "@/app/(app)/_actions/money";
import { toast } from "@/components/toast";

export function CategorizeSelect({ txnId, categories }: { txnId: string; categories: Array<{ id: string; name: string }> }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Choose a category"
      disabled={pending}
      defaultValue=""
      className="min-h-9 max-w-40 rounded-lg border border-attention/50 bg-attention-soft px-2 text-xs font-medium text-attention"
      onChange={(e) => {
        const id = e.target.value;
        if (id) start(async () => toast(await categorizeAction(txnId, id)));
      }}
    >
      <option value="">Categorise…</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}
