"use client";

import Link from "next/link";
import { AlertTriangle, Info, ThumbsUp, X } from "lucide-react";
import type { Insight } from "@/lib/finance/insights";
import { Badge, Card } from "@/components/ui";
import { ActionButton } from "@/components/toast";
import { dismissInsightAction, scheduleInsightAction } from "@/app/(app)/_actions/progress";
import { cn } from "@/lib/cn";

const icon = { attention: AlertTriangle, info: Info, positive: ThumbsUp };
const toneLabel = { attention: "Needs attention", info: "Worth knowing", positive: "Going well" };

/** What happened → why it matters → what to do next, with figures from the ledger. */
export function InsightCard({ insight, compact = false }: { insight: Insight; compact?: boolean }) {
  const Icon = icon[insight.severity];
  return (
    <Card className={cn("relative", insight.severity === "attention" && "border-attention/40")}>
      <div className="flex items-start gap-3 pr-8">
        <span
          className={cn(
            "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full",
            insight.severity === "attention" ? "bg-attention-soft text-attention" : insight.severity === "positive" ? "bg-positive-soft text-positive" : "bg-info-soft text-info",
          )}
        >
          <Icon size={16} aria-hidden />
        </span>
        <div className="min-w-0">
          <Badge tone={insight.severity === "attention" ? "attention" : insight.severity === "positive" ? "positive" : "info"}>{toneLabel[insight.severity]}</Badge>
          <h3 className="mt-1 font-semibold leading-snug">{insight.title}</h3>
        </div>
      </div>
      <ActionButton action={() => dismissInsightAction(insight.key)} variant="ghost" className="absolute right-2 top-2 !min-h-9 !px-2" label={`Dismiss: ${insight.title}`}>
        <X size={16} aria-hidden />
      </ActionButton>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-subtle">What happened</dt>
          <dd className="text-text">{insight.what}</dd>
        </div>
        {!compact ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-subtle">Why it matters</dt>
            <dd className="text-muted">{insight.why}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-subtle">What you can do</dt>
          <dd className="text-muted">{insight.next}</dd>
        </div>
      </dl>
      {compact ? (
        <details className="mt-2 text-sm">
          <summary className="inline-flex min-h-8 items-center text-[13px] font-medium text-primary">Why it matters</summary>
          <p className="mt-1 text-muted">{insight.why}</p>
        </details>
      ) : null}
      {insight.evidence.length ? (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Figures behind this insight">
          {insight.evidence.map((e) => (
            <li key={e.label} className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs">
              <span className="text-muted">{e.label}: </span>
              <span className="num font-semibold">{e.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {insight.actions.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {insight.actions.map((a, i) =>
            a.type === "link" ? (
              <Link key={i} href={a.href} className="inline-flex min-h-9 items-center rounded-xl border border-border-strong px-3 text-[13px] font-semibold hover:bg-surface-2">
                {a.label}
              </Link>
            ) : (
              <ActionButton key={i} action={() => scheduleInsightAction(insight.key, i)} variant={i === 0 ? "primary" : "soft"}>
                {a.label}
              </ActionButton>
            ),
          )}
        </div>
      ) : null}
      <p className="mt-3 text-[11px] text-subtle">Calculated from your recorded transactions and commitments.</p>
    </Card>
  );
}
