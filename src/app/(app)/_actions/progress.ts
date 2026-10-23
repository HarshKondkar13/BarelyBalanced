"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { dismissedInsights, preferences, tasks, unlockedCosmetics, weeklyReviews } from "@/db/schema";
import { COSMETICS, levelFromXp, xpKey } from "@/lib/gamification/rules";
import { QUESTS } from "@/lib/gamification/quests";
import { getContext } from "@/server/context";
import { loadFinanceSnapshot, loadProgress } from "@/server/views";
import { awardXp, xpSummary } from "@/server/xp";
import type { ActionResult } from "./schedule";

/** Claim a quest bonus. Completion is re-verified on the server from real data. */
export async function claimQuestAction(questId: string): Promise<ActionResult> {
  const ctx = await getContext();
  const def = QUESTS.find((q) => q.id === questId);
  if (!def) return { ok: false, error: "Unknown quest" };
  const fin = await loadFinanceSnapshot(ctx);
  const progress = await loadProgress(ctx, fin);
  const q = progress.quests.find((x) => x.id === questId);
  if (!q?.complete) return { ok: false, error: "This quest is not complete yet" };
  const r = await awardXp(ctx.db, ctx.user.id, "quest_complete", `quest:${q.id}:${q.periodKey}`, ctx.today, { xp: def.bonusXp, skill: def.skill });
  refresh();
  return r.awarded ? { ok: true, xp: r.xp, message: `Quest complete: ${def.title}` } : { ok: true, message: "Already claimed" };
}

export async function dismissInsightAction(key: string): Promise<ActionResult> {
  const { db, user } = await getContext();
  const k = z.string().min(1).max(200).parse(key);
  await db.insert(dismissedInsights).values({ userId: user.id, insightKey: k }).onConflictDoNothing();
  refresh();
  return { ok: true, message: "Dismissed" };
}

/**
 * Turn an insight's suggested action into a scheduled task. The task is rebuilt from the
 * server-side insight (not from client input) and deduplicated by linkRef + date.
 */
export async function scheduleInsightAction(key: string, actionIndex: number): Promise<ActionResult> {
  const ctx = await getContext();
  const fin = await loadFinanceSnapshot(ctx);
  const insight = fin.insights.find((i) => i.key === key);
  const action = insight?.actions[actionIndex];
  if (!action || action.type !== "schedule_task") return { ok: false, error: "That suggestion is no longer current" };
  const inserted = await ctx.db
    .insert(tasks)
    .values({
      userId: ctx.user.id,
      title: action.task.title,
      kind: action.task.kind,
      durationMin: action.task.durationMin,
      planDate: action.task.planDate,
      startTime: action.task.startTime ?? null,
      linkRef: action.task.linkRef ?? `insight:${key}`,
    })
    .onConflictDoNothing()
    .returning({ id: tasks.id });
  refresh();
  return { ok: true, message: inserted.length ? `Scheduled for ${action.task.planDate}` : "Already on your schedule" };
}

export async function setGamificationModeAction(mode: "full" | "reduced" | "off"): Promise<ActionResult> {
  const { db, user } = await getContext();
  const m = z.enum(["full", "reduced", "off"]).parse(mode);
  await db.update(preferences).set({ gamification: m }).where(eq(preferences.userId, user.id));
  refresh();
  return { ok: true };
}

export async function equipCosmeticAction(cosmeticId: string): Promise<ActionResult> {
  const { db, user } = await getContext();
  const c = COSMETICS.find((x) => x.id === cosmeticId);
  if (!c) return { ok: false, error: "Unknown item" };
  const { total } = await xpSummary(db, user.id);
  if (levelFromXp(total).level < c.unlockLevel) return { ok: false, error: `Unlocks at level ${c.unlockLevel}` };
  await db.insert(unlockedCosmetics).values({ userId: user.id, cosmeticId: c.id }).onConflictDoNothing();
  if (c.kind === "accent") {
    await db.update(unlockedCosmetics).set({ equipped: false }).where(eq(unlockedCosmetics.userId, user.id));
    await db.update(unlockedCosmetics).set({ equipped: true }).where(and(eq(unlockedCosmetics.userId, user.id), eq(unlockedCosmetics.cosmeticId, c.id)));
    const jar = await cookies();
    const accent = c.id.replace("accent-", "");
    if (accent === "teal") jar.delete("pp_accent");
    else jar.set("pp_accent", accent, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  refresh();
  return { ok: true, message: `Equipped ${c.name}` };
}

/**
 * Complete the weekly review. Figures are recomputed on the server and stored as a
 * snapshot; accepted actions become tasks (deduplicated per action id).
 */
export async function completeWeeklyReviewAction(input: { outcome: string; reflection: string; accepted: string[] }): Promise<ActionResult> {
  const ctx = await getContext();
  const parsed = z
    .object({
      outcome: z.enum(["continue_plan", "build_reserves", "adjust_plan", "pay_down_debt", "no_decision"]),
      reflection: z.string().max(2000),
      accepted: z.array(z.string().max(300)).max(20),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a decision for this week" };
  const { buildWeeklyReview } = await import("@/server/review");
  const fin = await loadFinanceSnapshot(ctx);
  const review = await buildWeeklyReview(ctx, fin);
  const chosen = review.actions.filter((a) => parsed.data.accepted.includes(a.id));
  for (const a of chosen) {
    await ctx.db
      .insert(tasks)
      .values({ userId: ctx.user.id, title: a.title, kind: a.kind, planDate: a.planDate, durationMin: a.durationMin, linkRef: `review:${a.id}` })
      .onConflictDoNothing();
  }
  const values = { snapshot: review.snapshot, outcome: parsed.data.outcome, reflection: parsed.data.reflection || null, acceptedActions: chosen.map((a) => a.title), completedAt: new Date() };
  await ctx.db
    .insert(weeklyReviews)
    .values({ userId: ctx.user.id, weekStart: review.weekStart, ...values })
    .onConflictDoUpdate({ target: [weeklyReviews.userId, weeklyReviews.weekStart], set: values });
  const r = await awardXp(ctx.db, ctx.user.id, "weekly_review", xpKey.weeklyReview(review.weekStart), ctx.today);
  refresh();
  return { ok: true, xp: r.xp, message: chosen.length ? `Review saved · ${chosen.length} action${chosen.length > 1 ? "s" : ""} scheduled` : "Review saved" };
}
