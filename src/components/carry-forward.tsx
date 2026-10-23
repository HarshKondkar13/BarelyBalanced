"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { toast } from "@/components/toast";
import { carryForwardAction, skipTaskAction } from "@/app/(app)/_actions/schedule";
import { formatShortDate } from "@/lib/dates";

/** Unfinished tasks from earlier days. Nothing moves until the user chooses. */
export function CarryForward({ tasks, today }: { tasks: Array<{ id: string; title: string; planDate: string; carryCount: number }>; today: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(tasks.map((t) => t.id)));
  const [pending, start] = useTransition();
  if (!tasks.length) return null;
  return (
    <div className="rounded-[var(--radius)] border border-border bg-surface p-4">
      <p className="font-semibold">{tasks.length} unfinished from earlier</p>
      <p className="text-sm text-muted">Bring the ones that still matter into today. The rest can be let go; that is a decision, not a failure.</p>
      <ul className="mt-3 space-y-1">
        {tasks.map((t) => (
          <li key={t.id}>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={selected.has(t.id)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n; })} />
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="shrink-0 text-xs text-subtle">{formatShortDate(t.planDate)}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={pending || selected.size === 0} onClick={() => start(async () => toast(await carryForwardAction([...selected], today)))}>Bring {selected.size} to today</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { for (const t of tasks.filter((x) => !selected.has(x.id))) await skipTaskAction(t.id); toast({ ok: true, message: "Let the rest go" }); })}>Let go of unselected</Button>
      </div>
    </div>
  );
}
