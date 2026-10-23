"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { newsBookmarks, newsItems } from "@/db/schema";
import { conceptById } from "@/lib/news/concepts";
import { xpKey } from "@/lib/gamification/rules";
import { sanitizeUntrusted } from "@/lib/ai/contracts";
import { getContext } from "@/server/context";
import { awardXp } from "@/server/xp";
import type { ActionResult } from "./schedule";

export async function toggleBookmarkAction(newsId: string): Promise<ActionResult> {
  const { db, user } = await getContext();
  const id = z.string().uuid().parse(newsId);
  const [n] = await db.select({ id: newsItems.id }).from(newsItems).where(eq(newsItems.id, id));
  if (!n) return { ok: false, error: "Story not found" };
  const del = await db.delete(newsBookmarks).where(and(eq(newsBookmarks.userId, user.id), eq(newsBookmarks.newsItemId, id))).returning();
  if (!del.length) await db.insert(newsBookmarks).values({ userId: user.id, newsItemId: id });
  refresh();
  return { ok: true, message: del.length ? "Removed bookmark" : "Bookmarked" };
}

/** "Explain why it matters in your own words": a learning action, saved with the bookmark. */
export async function explainStoryAction(newsId: string, text: string): Promise<ActionResult> {
  const { db, user, today } = await getContext();
  const id = z.string().uuid().parse(newsId);
  const note = sanitizeUntrusted(text, 500);
  if (note.length < 20) return { ok: false, error: "Write at least a sentence (20+ characters) in your own words." };
  const [n] = await db.select({ id: newsItems.id }).from(newsItems).where(eq(newsItems.id, id));
  if (!n) return { ok: false, error: "Story not found" };
  await db.insert(newsBookmarks).values({ userId: user.id, newsItemId: id, note }).onConflictDoUpdate({ target: [newsBookmarks.userId, newsBookmarks.newsItemId], set: { note } });
  const r = await awardXp(db, user.id, "story_explained", xpKey.storyExplained(id), today);
  refresh();
  return { ok: true, xp: r.xp, message: "Saved your explanation" };
}

export async function markBriefingReadAction(): Promise<ActionResult> {
  const { db, user, today } = await getContext();
  const r = await awardXp(db, user.id, "briefing_read", xpKey.briefingRead(today), today);
  refresh();
  return { ok: true, xp: r.xp, message: r.awarded ? "Briefing done for today" : "Already marked today" };
}

export async function learnConceptAction(conceptId: string): Promise<ActionResult> {
  const { db, user, today } = await getContext();
  const c = conceptById(conceptId);
  if (!c) return { ok: false, error: "Unknown concept" };
  const r = await awardXp(db, user.id, "concept_learned", xpKey.conceptLearned(c.id), today);
  refresh();
  return { ok: true, xp: r.xp, message: r.awarded ? `Learned: ${c.title}` : r.reason === "daily_cap" ? "Noted. Today's learning XP is maxed out, so take a break." : "Already learned" };
}
