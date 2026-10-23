import { and, desc, eq, gte } from "drizzle-orm";
import { getContext } from "@/server/context";
import { loadFinanceSnapshot, loadProgress } from "@/server/views";
import { unlockedCosmetics, xpEvents } from "@/db/schema";
import { COSMETICS, SKILL_PATHS, XP_RULES, skillTier, type XpAction } from "@/lib/gamification/rules";
import { addDays, formatShortDate, formatWeekday } from "@/lib/dates";
import { Badge, Card, CardHeader, PageHeader, Progress } from "@/components/ui";
import { ActionButton } from "@/components/toast";
import { QuestList } from "@/components/quest-list";
import { toQuestView } from "@/lib/gamification/quests";
import { equipCosmeticAction, setGamificationModeAction } from "@/app/(app)/_actions/progress";
import { cn } from "@/lib/cn";

export const metadata = { title: "Progress" };

export default async function ProgressPage() {
  const ctx = await getContext();
  const fin = await loadFinanceSnapshot(ctx);
  const p = await loadProgress(ctx, fin);
  const [history, owned] = await Promise.all([
    ctx.db.select().from(xpEvents).where(and(eq(xpEvents.userId, ctx.user.id), gte(xpEvents.localDate, addDays(ctx.today, -14)))).orderBy(desc(xpEvents.createdAt)).limit(40),
    ctx.db.select().from(unlockedCosmetics).where(eq(unlockedCosmetics.userId, ctx.user.id)),
  ]);
  const mode = ctx.prefs?.gamification ?? "full";
  const quests = p.quests.map(toQuestView);
  const weekActions = new Map<string, number>();
  for (const h of history.filter((h) => !h.revokedAt && h.localDate >= p.weekStart)) weekActions.set(h.action, (weekActions.get(h.action) ?? 0) + 1);
  return (
    <>
      <PageHeader title="Progress" subtitle="Rewards for consistency, learning and follow-through, never for spending or risk" />
      <Card className="mb-4">
        <CardHeader title="Gamification mode" />
        <div className="grid grid-cols-3 gap-2">
          {(["full", "reduced", "off"] as const).map((m) => (
            <ActionButton key={m} action={setGamificationModeAction.bind(null, m)} variant={mode === m ? "primary" : "secondary"} className="w-full">{m === "full" ? "Full" : m === "reduced" ? "Reduced" : "Off"}</ActionButton>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Reduced hides levels and XP numbers and keeps quests as a simple checklist. Off removes XP, quests and streaks entirely.</p>
      </Card>
      {mode === "off" ? null : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader title={mode === "reduced" ? "Your rhythm" : `Level ${p.summary.level}`} subtitle={mode === "reduced" ? undefined : `${p.summary.total} XP · ${p.summary.xpForNext - p.summary.xpIntoLevel} XP to level ${p.summary.level + 1}`} />
            {mode !== "reduced" ? <Progress value={p.summary.progress} label="Level progress" /> : null}
            <h3 className="mt-4 text-sm font-semibold">Last 7 days</h3>
            <ol className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px]">
              {p.streak.lookback.map((d) => (
                <li key={d.date}>
                  <span className={cn("mx-auto flex size-9 items-center justify-center rounded-full font-semibold", d.state === "active" ? "bg-positive text-white" : d.state === "rest" ? "bg-info-soft text-info" : d.state === "today" ? "border-2 border-dashed border-border-strong text-muted" : "bg-surface-2 text-subtle")}>
                    {formatWeekday(d.date).slice(0, 1)}
                  </span>
                  <span className="mt-1 block text-subtle">{d.state === "rest" ? "rest" : d.state === "today" ? "today" : ""}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-sm text-muted">
              {p.streak.current > 0 ? `${p.streak.current}-day rhythm.` : "A fresh start: any meaningful action today begins a new rhythm."} Up to {ctx.prefs?.restDaysPerWeek ?? 1} rest day a week is built in ({p.streak.restDaysLeftThisWeek} left this week). Missing a day is not a failure.
            </p>
          </Card>
          <Card>
            <CardHeader title="This week" subtitle={mode === "reduced" ? undefined : `${p.xpThisWeek} XP`} />
            {weekActions.size ? (
              <ul className="space-y-1 text-sm">{[...weekActions.entries()].map(([a, n]) => <li key={a} className="flex justify-between"><span>{XP_RULES[a as XpAction]?.label ?? a}</span><span className="num text-muted">×{n}</span></li>)}</ul>
            ) : <p className="text-sm text-muted">Nothing yet this week.</p>}
          </Card>
          <Card className="md:col-span-2">
            <CardHeader title="Skill paths" />
            <div className="grid gap-4 sm:grid-cols-2">
              {(Object.keys(SKILL_PATHS) as Array<keyof typeof SKILL_PATHS>).map((s) => {
                const t = skillTier(s, p.summary.bySkill[s]);
                return (
                  <div key={s}>
                    <div className="flex justify-between text-sm"><span className="font-semibold">{SKILL_PATHS[s].name}</span><span className="text-muted">{t.title}</span></div>
                    <Progress className="mt-1" value={t.progress} label={`${SKILL_PATHS[s].name} progress`} />
                    <p className="mt-1 text-xs text-subtle">{t.nextTitle ? `${mode === "reduced" ? "Next" : `${t.xpToNext} XP to`} ${t.nextTitle}` : "Top tier"}</p>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader title="Quests" subtitle="Daily and weekly. Progress is measured from what you actually did." />
            <QuestList quests={quests} reduced={mode === "reduced"} />
          </Card>
          {mode === "full" ? (
            <Card>
              <CardHeader title="Cosmetics" subtitle="Optional, purely visual" />
              <ul className="space-y-2">
                {COSMETICS.map((c) => {
                  const unlocked = p.summary.level >= c.unlockLevel;
                  const equipped = owned.find((o) => o.cosmeticId === c.id)?.equipped;
                  return (
                    <li key={c.id} className="flex min-h-11 items-center justify-between gap-2 text-sm">
                      <span>{c.name} {!unlocked ? <Badge>Level {c.unlockLevel}</Badge> : null}</span>
                      {unlocked && c.kind === "accent" ? (equipped ? <Badge tone="positive">Equipped</Badge> : <ActionButton action={equipCosmeticAction.bind(null, c.id)}>Use</ActionButton>) : unlocked ? <Badge tone="primary">Unlocked</Badge> : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Recent activity" subtitle="Undone actions show as corrected" />
            <ul className="divide-y divide-border text-sm">
              {history.slice(0, 15).map((h) => (
                <li key={h.id} className="flex justify-between gap-2 py-1.5">
                  <span className={cn(h.revokedAt && "text-subtle line-through")}>{XP_RULES[h.action as XpAction]?.label ?? h.action}{h.revokedAt ? <span className="ml-1 text-xs no-underline">(corrected)</span> : null}</span>
                  <span className="num shrink-0 text-xs text-muted">{formatShortDate(h.localDate)}{mode === "full" ? ` · ${h.revokedAt ? 0 : h.xp} XP` : ""}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
      <p className="mt-6 text-xs text-subtle">No public leaderboards. XP never depends on how much you spend, invest or earn, how often you trade, or investment returns.</p>
    </>
  );
}
