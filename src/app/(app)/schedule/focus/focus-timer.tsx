"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Select } from "@/components/ui";
import { toast } from "@/components/toast";
import { finishFocusAction, startFocusAction } from "@/app/(app)/_actions/schedule";

/**
 * Focus timer. The server records the start time, so the XP check uses server time;
 * the visible countdown is only a convenience and keeps working if the tab sleeps.
 */
export function FocusTimer({ tasks, initialTaskId, active }: { tasks: Array<{ id: string; title: string }>; initialTaskId: string | null; active: { id: string; plannedMin: number; startedAt: string; taskTitle: string | null } | null }) {
  const [taskId, setTaskId] = useState(initialTaskId ?? "");
  const [minutes, setMinutes] = useState(25);
  const [session, setSession] = useState(active);
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session]);

  if (session) {
    const end = new Date(session.startedAt).getTime() + session.plannedMin * 60000;
    const left = Math.max(0, end - now);
    const mm = Math.floor(left / 60000);
    const ss = Math.floor((left % 60000) / 1000);
    const done = left === 0;
    return (
      <div className="text-center">
        <p className="text-sm text-muted">{session.taskTitle ?? "Open focus session"}</p>
        <p className="num my-6 text-6xl font-bold tracking-tight" role="timer" aria-live="off">{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</p>
        <p className="sr-only" aria-live="polite">{done ? "Time is up." : ""}</p>
        <div className="flex justify-center gap-2">
          <Button disabled={pending} onClick={() => start(async () => { const r = await finishFocusAction(session.id, true); toast(r); setSession(null); })}>{done ? "Finish session" : "I'm done"}</Button>
          <Button variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await finishFocusAction(session.id, false); toast(r); setSession(null); })}>Stop early</Button>
        </div>
        <p className="mt-4 text-xs text-subtle">Sessions of 15–90 minutes that run for most of their planned time count toward the weekly quest. Stopping early is fine and is not penalised.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium">
        Work on
        <Select className="mt-1.5" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
          <option value="">No specific task</option>
          {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </Select>
      </label>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Length</legend>
        <div className="grid grid-cols-4 gap-2">
          {[15, 25, 45, 60].map((m) => (
            <button key={m} type="button" aria-pressed={minutes === m} onClick={() => setMinutes(m)} className={`min-h-11 rounded-xl text-sm font-semibold ${minutes === m ? "bg-primary text-primary-fg" : "bg-surface-2"}`}>{m} min</button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">Pick a length you can realistically finish. 25 minutes is a good default.</p>
      </fieldset>
      <Button className="w-full" disabled={pending} onClick={() => start(async () => {
        const r = await startFocusAction(taskId || null, minutes);
        if (!r.ok) return toast(r);
        setSession({ id: r.id, plannedMin: minutes, startedAt: new Date().toISOString(), taskTitle: tasks.find((t) => t.id === taskId)?.title ?? null });
      })}>Start focus</Button>
    </div>
  );
}
