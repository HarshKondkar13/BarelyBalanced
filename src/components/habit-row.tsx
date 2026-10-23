"use client";

import { useTransition } from "react";
import { toggleHabitAction } from "@/app/(app)/_actions/schedule";
import { toast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { formatWeekday } from "@/lib/dates";

export function HabitRow({ habit, days, doneDates }: { habit: { id: string; title: string; targetPerWeek: number }; days: string[]; doneDates: string[] }) {
  const [pending, start] = useTransition();
  const done = new Set(doneDates);
  const count = days.filter((d) => done.has(d)).length;
  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-medium">{habit.title}</p>
        <p className="num shrink-0 text-xs text-muted">{count}/{habit.targetPerWeek} this week</p>
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1">
        {days.map((d) => (
          <button
            key={d}
            type="button"
            disabled={pending}
            onClick={() => start(async () => toast(await toggleHabitAction(habit.id, d)))}
            aria-pressed={done.has(d)}
            aria-label={`${habit.title} on ${formatWeekday(d)}`}
            className={cn("min-h-9 rounded-lg text-[11px] font-semibold", done.has(d) ? "bg-positive text-white" : "bg-surface-2 text-muted hover:bg-surface-3")}
          >
            {formatWeekday(d).slice(0, 1)}
          </button>
        ))}
      </div>
    </li>
  );
}
