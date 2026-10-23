"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, CardHeader, Field, Input, Notice, Textarea } from "@/components/ui";
import { toast } from "@/components/toast";
import { completeEveningReviewAction, completeMorningPlanAction } from "@/app/(app)/_actions/schedule";
import { confirmNoSpendAction } from "@/app/(app)/_actions/money";
import { cn } from "@/lib/cn";

type T = { id: string; title: string; isTopPriority: boolean; durationMin: number };

export function MorningPlan({ tasks, freeMinutes }: { tasks: T[]; freeMinutes: number }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(tasks.filter((t) => t.isTopPriority).map((t) => t.id).slice(0, 3));
  const [intention, setIntention] = useState("");
  const [pending, start] = useTransition();
  const plannedMin = tasks.filter((t) => picked.includes(t.id)).reduce((a, t) => a + t.durationMin, 0);
  return (
    <Card className="animate-rise">
      <CardHeader title="Morning plan" subtitle="Pick up to three things that would make today a good day" />
      {tasks.length === 0 ? <Notice tone="info">No tasks for today yet. Add a few on the Schedule tab, or just set an intention.</Notice> : (
        <ul className="space-y-1.5">
          {tasks.map((t) => {
            const on = picked.includes(t.id);
            return (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={!on && picked.length >= 3}
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== t.id) : [...p, t.id]))}
                  className={cn("flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border px-3 text-left text-sm disabled:opacity-40", on ? "border-primary bg-primary-soft font-semibold" : "border-border")}
                >
                  <span className="truncate">{t.title}</span>
                  <span className="shrink-0 text-xs text-muted">{t.durationMin} min</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className={cn("mt-2 text-xs", plannedMin > freeMinutes ? "text-attention" : "text-muted")}>
        Priorities: {Math.round(plannedMin / 6) / 10}h of about {Math.max(0, Math.round(freeMinutes / 6) / 10)}h realistically free.
        {plannedMin > freeMinutes ? " That's tight. Consider fewer, or a smaller first step." : ""}
      </p>
      <div className="mt-3">
        <Field label="Intention for today (optional)" htmlFor="intention">
          <Input id="intention" value={intention} onChange={(e) => setIntention(e.target.value)} maxLength={280} placeholder="e.g. Finish the case study before lunch" />
        </Field>
      </div>
      <div className="mt-4 flex gap-2">
        <Button disabled={pending} onClick={() => start(async () => { const r = await completeMorningPlanAction(picked, intention); toast(r); if (r.ok) router.push("/today"); })}>Start the day</Button>
        <Button variant="ghost" onClick={() => router.push("/today")}>Not now</Button>
      </div>
    </Card>
  );
}

export function EveningReview({ unfinished, loggedToday }: { unfinished: T[]; loggedToday: boolean }) {
  const router = useRouter();
  const [decisions, setDecisions] = useState<Record<string, "tomorrow" | "inbox" | "drop">>(Object.fromEntries(unfinished.map((t) => [t.id, "tomorrow"])));
  const [note, setNote] = useState("");
  const [energy, setEnergy] = useState<number | undefined>();
  const [pending, start] = useTransition();
  return (
    <Card className="animate-rise">
      <CardHeader title="Evening check-in" subtitle="Close the loop. Unfinished is normal; deciding is what counts." />
      {!loggedToday ? (
        <Notice tone="info" className="mb-3">
          Today&apos;s money isn&apos;t logged yet. <Link href="/money/transactions/new" className="font-semibold underline">Add transactions</Link> or{" "}
          <button type="button" className="font-semibold underline" onClick={() => start(async () => toast(await confirmNoSpendAction()))}>confirm a no-spend day</button>.
        </Notice>
      ) : null}
      {unfinished.length ? (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Still open</legend>
          {unfinished.map((t) => (
            <div key={t.id} className="rounded-xl border border-border p-2.5">
              <p className="truncate text-sm font-medium">{t.title}</p>
              <div className="mt-1.5 grid grid-cols-3 gap-1" role="radiogroup" aria-label={`What to do with ${t.title}`}>
                {(["tomorrow", "inbox", "drop"] as const).map((d) => (
                  <label key={d} className={cn("flex min-h-9 cursor-pointer items-center justify-center rounded-lg text-xs font-semibold", decisions[t.id] === d ? "bg-text text-bg" : "bg-surface-2 text-muted")}>
                    <input type="radio" className="sr-only" name={`d-${t.id}`} checked={decisions[t.id] === d} onChange={() => setDecisions((x) => ({ ...x, [t.id]: d }))} />
                    {d === "tomorrow" ? "Tomorrow" : d === "inbox" ? "Inbox" : "Let go"}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </fieldset>
      ) : <p className="text-sm text-muted">Everything planned for today is closed. Nice.</p>}
      <fieldset className="mt-3">
        <legend className="mb-1 text-sm font-medium">Energy today (optional)</legend>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={energy === n} onClick={() => setEnergy(n)} className={cn("min-h-10 flex-1 rounded-lg text-sm font-semibold", energy === n ? "bg-primary text-primary-fg" : "bg-surface-2")}>{n}</button>
          ))}
        </div>
      </fieldset>
      <div className="mt-3">
        <Field label="One line about today (optional, private)" htmlFor="note"><Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></Field>
      </div>
      <div className="mt-4 flex gap-2">
        <Button disabled={pending} onClick={() => start(async () => { const r = await completeEveningReviewAction({ decisions, note, energy }); toast(r); if (r.ok) router.push("/today"); })}>Close the day</Button>
        <Button variant="ghost" onClick={() => router.push("/today")}>Not now</Button>
      </div>
    </Card>
  );
}
