import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { preferences, xpEvents, type Skill } from "@/db/schema";
import { DAILY_CAPS, XP_RULES, levelFromXp, type XpAction } from "@/lib/gamification/rules";

export type AwardResult = { awarded: boolean; xp: number; reason?: "duplicate" | "daily_cap" | "disabled" };

/**
 * Award XP once per idempotency key. Safe under concurrent double-submits because the
 * unique index (user_id, idempotency_key) makes the second insert a no-op.
 * A previously revoked award (action undone) is reinstated when the action is redone.
 */
export async function awardXp(
  db: DB,
  userId: string,
  action: XpAction,
  key: string,
  localDate: string,
  override?: { xp?: number; skill?: Skill },
): Promise<AwardResult> {
  const [pref] = await db.select({ g: preferences.gamification }).from(preferences).where(eq(preferences.userId, userId));
  if (pref?.g === "off") return { awarded: false, xp: 0, reason: "disabled" };

  const rule = XP_RULES[action];
  const xp = override?.xp ?? rule.xp;
  const skill = override?.skill ?? rule.skill;

  const cap = DAILY_CAPS[action];
  if (cap !== undefined) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(xpEvents)
      .where(and(eq(xpEvents.userId, userId), eq(xpEvents.action, action), eq(xpEvents.localDate, localDate), isNull(xpEvents.revokedAt)));
    if (n >= cap) return { awarded: false, xp: 0, reason: "daily_cap" };
  }

  const inserted = await db
    .insert(xpEvents)
    .values({ userId, idempotencyKey: key, action, skill, xp, localDate })
    .onConflictDoNothing({ target: [xpEvents.userId, xpEvents.idempotencyKey] })
    .returning({ id: xpEvents.id });
  if (inserted.length > 0) return { awarded: true, xp };

  // Reinstate a revoked award (e.g. task un-done then re-done) without double counting.
  const reinstated = await db
    .update(xpEvents)
    .set({ revokedAt: null, localDate })
    .where(and(eq(xpEvents.userId, userId), eq(xpEvents.idempotencyKey, key), sql`${xpEvents.revokedAt} is not null`))
    .returning({ xp: xpEvents.xp });
  if (reinstated.length > 0) return { awarded: true, xp: reinstated[0].xp };
  return { awarded: false, xp: 0, reason: "duplicate" };
}

/** Revoke an award when the action is undone. Returns the XP removed. */
export async function revokeXp(db: DB, userId: string, key: string): Promise<number> {
  const rows = await db
    .update(xpEvents)
    .set({ revokedAt: new Date() })
    .where(and(eq(xpEvents.userId, userId), eq(xpEvents.idempotencyKey, key), isNull(xpEvents.revokedAt)))
    .returning({ xp: xpEvents.xp });
  return rows.reduce((a, r) => a + r.xp, 0);
}

export async function xpSummary(db: DB, userId: string) {
  const rows = await db
    .select({ skill: xpEvents.skill, xp: sql<number>`coalesce(sum(${xpEvents.xp}),0)::int` })
    .from(xpEvents)
    .where(and(eq(xpEvents.userId, userId), isNull(xpEvents.revokedAt)))
    .groupBy(xpEvents.skill);
  const bySkill: Record<Skill, number> = { money: 0, investing: 0, business: 0, discipline: 0 };
  for (const r of rows) bySkill[r.skill] = r.xp;
  const total = Object.values(bySkill).reduce((a, b) => a + b, 0);
  return { total, bySkill, ...levelFromXp(total) };
}

export async function activeDays(db: DB, userId: string, since: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ d: xpEvents.localDate })
    .from(xpEvents)
    .where(and(eq(xpEvents.userId, userId), isNull(xpEvents.revokedAt), sql`${xpEvents.localDate} >= ${since}`));
  return new Set(rows.map((r) => r.d));
}

export async function hasXpKey(db: DB, userId: string, key: string): Promise<boolean> {
  const rows = await db
    .select({ id: xpEvents.id })
    .from(xpEvents)
    .where(and(eq(xpEvents.userId, userId), eq(xpEvents.idempotencyKey, key), isNull(xpEvents.revokedAt)));
  return rows.length > 0;
}
