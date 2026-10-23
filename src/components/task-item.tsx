"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Check, MoreHorizontal, Star } from "lucide-react";
import { toast } from "@/components/toast";
import { Badge } from "@/components/ui";
import { carryForwardAction, deleteTaskAction, parkTaskAction, skipTaskAction, toggleTaskAction, updateTaskAction } from "@/app/(app)/_actions/schedule";
import { cn } from "@/lib/cn";
import { formatTime12 } from "@/lib/dates";

export type TaskView = {
  id: string;
  title: string;
  status: "todo" | "done" | "skipped";
  isTopPriority: boolean;
  startTime: string | null;
  durationMin: number;
  kind: string;
  carryCount: number;
  planDate: string | null;
  linkRef?: string | null;
};

const KIND_LABEL: Record<string, string> = { money_review: "Money", bill: "Bill", budget_setup: "Budget", briefing: "Briefing", plan_review: "Plan", focus: "Focus" };

export function TaskItem({ task, tomorrow, conflict }: { task: TaskView; tomorrow: string; conflict?: boolean }) {
  const [pending, start] = useTransition();
  const done = task.status === "done";
  const run = (fn: () => Promise<Parameters<typeof toast>[0]>) => start(async () => toast(await fn()));
  return (
    <li className={cn("flex min-h-14 items-center gap-3 py-2", pending && "opacity-60")}>
      <button
        type="button"
        onClick={() => run(() => toggleTaskAction(task.id))}
        disabled={pending}
        aria-pressed={done}
        aria-label={done ? `Mark "${task.title}" as not done` : `Complete "${task.title}"`}
        className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors", done ? "border-positive bg-positive text-white" : "border-border-strong hover:border-primary")}
      >
        {done ? <Check size={16} strokeWidth={3} aria-hidden /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[15px] font-medium", done && "text-subtle line-through", task.status === "skipped" && "text-subtle")}>{task.title}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          {task.startTime ? <span className="num">{formatTime12(task.startTime)}</span> : <span>Anytime</span>}
          <span>· {task.durationMin} min</span>
          {task.isTopPriority ? <Badge tone="accent"><Star size={10} aria-hidden /> Priority</Badge> : null}
          {KIND_LABEL[task.kind] ? <Badge tone="primary">{KIND_LABEL[task.kind]}</Badge> : null}
          {task.carryCount >= 2 ? <Badge tone="attention">moved {task.carryCount}×</Badge> : null}
          {conflict ? <Badge tone="danger">Overlaps</Badge> : null}
          {task.status === "skipped" ? <Badge>Let go</Badge> : null}
        </p>
      </div>
      {task.kind === "focus" || (!done && task.durationMin >= 15) ? (
        <Link href={`/schedule/focus?task=${task.id}`} className="hidden min-h-9 items-center rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary-soft sm:inline-flex">Focus</Link>
      ) : null}
      <details className="relative">
        <summary className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2" aria-label={`More actions for "${task.title}"`}>
          <MoreHorizontal size={18} aria-hidden />
        </summary>
        <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-border bg-surface p-1 text-sm shadow-lg">
          {[
            { label: task.isTopPriority ? "Remove priority" : "Make a top priority", fn: () => updateTaskAction(task.id, { isTopPriority: !task.isTopPriority }) },
            { label: "Move to tomorrow", fn: () => carryForwardAction([task.id], tomorrow) },
            { label: "Move to inbox", fn: () => parkTaskAction(task.id) },
            { label: "Let it go today", fn: () => skipTaskAction(task.id) },
            { label: "Delete", fn: () => deleteTaskAction(task.id) },
          ].map((a) => (
            <button key={a.label} type="button" className="block min-h-10 w-full rounded-lg px-3 text-left hover:bg-surface-2" onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; run(a.fn); }}>
              {a.label}
            </button>
          ))}
          <Link href={`/schedule/focus?task=${task.id}`} className="block min-h-10 rounded-lg px-3 py-2.5 hover:bg-surface-2">Start focus session</Link>
        </div>
      </details>
    </li>
  );
}
