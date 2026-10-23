"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, Field, Textarea } from "@/components/ui";
import { toast } from "@/components/toast";
import { completeWeeklyReviewAction } from "@/app/(app)/_actions/progress";
import { formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/cn";

const OUTCOMES = [
  { v: "continue_plan", label: "Continue the existing plan", hint: "Nothing needs changing. A perfectly good outcome." },
  { v: "build_reserves", label: "Build cash reserves first", hint: "Put spare money toward the emergency fund." },
  { v: "adjust_plan", label: "Adjust the plan", hint: "Change a budget, goal or contribution." },
  { v: "pay_down_debt", label: "Pay down debt", hint: "Prioritise high-interest balances." },
  { v: "no_decision", label: "Not ready to decide", hint: "Revisit next week." },
] as const;

export function ReviewForm({ actions, suggested, done }: { actions: Array<{ id: string; title: string; planDate: string; why: string }>; suggested: string; done: boolean }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<string>(suggested);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [reflection, setReflection] = useState("");
  const [pending, start] = useTransition();
  return (
    <Card>
      <CardHeader title="8 · Decide and schedule" subtitle="Accept only the actions you'll actually do. They go onto your schedule." />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">This week&apos;s decision</legend>
        <div className="space-y-1.5">
          {OUTCOMES.map((o) => (
            <label key={o.v} className={cn("flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm", outcome === o.v ? "border-primary bg-primary-soft" : "border-border")}>
              <input type="radio" name="outcome" className="mt-0.5 accent-[var(--primary)]" checked={outcome === o.v} onChange={() => setOutcome(o.v)} />
              <span><span className="font-semibold">{o.label}</span>{o.v === suggested ? <span className="ml-1 text-xs text-primary">(matches the calculation)</span> : null}<span className="block text-xs text-muted">{o.hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      {actions.length ? (
        <fieldset className="mt-4">
          <legend className="mb-1.5 text-sm font-medium">Suggested actions</legend>
          <ul className="space-y-1.5">
            {actions.map((a) => (
              <li key={a.id}>
                <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm">
                  <input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" checked={accepted.has(a.id)} onChange={(e) => setAccepted((s) => { const n = new Set(s); if (e.target.checked) n.add(a.id); else n.delete(a.id); return n; })} />
                  <span><span className="font-medium">{a.title}</span><span className="block text-xs text-muted">{formatShortDate(a.planDate)} · {a.why}</span></span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}
      <div className="mt-4">
        <Field label="Reflection (optional, private)" htmlFor="refl"><Textarea id="refl" rows={2} value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="What went well? What will you do differently?" /></Field>
      </div>
      <Button className="mt-4 w-full sm:w-auto" disabled={pending} onClick={() => start(async () => { const r = await completeWeeklyReviewAction({ outcome, reflection, accepted: [...accepted] }); toast(r); if (r.ok) router.push("/today"); })}>
        {pending ? "Saving…" : done ? "Update this week's review" : "Complete weekly review"}
      </Button>
    </Card>
  );
}
