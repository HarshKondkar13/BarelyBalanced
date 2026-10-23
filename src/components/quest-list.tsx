"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import type { QuestView } from "@/lib/gamification/quests";
import { claimQuestAction } from "@/app/(app)/_actions/progress";
import { toast } from "@/components/toast";
import { Badge, Button, Progress } from "@/components/ui";

type Q = QuestView;

export function QuestList({ quests, reduced }: { quests: Q[]; reduced?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <ul className="divide-y divide-border">
      {quests.map((q) => (
        <li key={q.id} className="flex min-h-14 items-center gap-3 py-2.5">
          <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full ${q.complete ? "bg-positive text-white" : "bg-surface-2 text-subtle"}`} aria-hidden>
            {q.complete ? <Check size={14} strokeWidth={3} /> : null}
          </span>
          <div className="min-w-0 flex-1">
            <Link href={q.href} className="block truncate text-sm font-medium hover:underline">{q.title}</Link>
            <p className="truncate text-xs text-muted">{q.description}</p>
            {!q.complete && q.target > 1 ? <Progress value={q.current / q.target} label={q.title} className="mt-1" /> : null}
          </div>
          <span className="shrink-0">
            {q.claimed ? <Badge tone="positive">Done</Badge> : q.complete ? (
              <Button size="sm" disabled={pending} onClick={() => start(async () => toast(await claimQuestAction(q.id)))}>{reduced ? "Mark done" : `Collect +${q.bonusXp}`}</Button>
            ) : <Badge>{q.period === "daily" ? "Today" : "This week"}</Badge>}
          </span>
        </li>
      ))}
    </ul>
  );
}
