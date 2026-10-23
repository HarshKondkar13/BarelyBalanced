"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { finAccounts, financialProfile, goalContributions, goals, preferences } from "@/db/schema";
import { isLocalDate } from "@/lib/dates";
import { xpKey } from "@/lib/gamification/rules";
import { parseRupeesToPaise } from "@/lib/money";
import { getContext } from "@/server/context";
import { awardXp } from "@/server/xp";
import type { ActionResult } from "./schedule";

const money = z
  .string()
  .optional()
  .nullable()
  .transform((s, ctx) => {
    if (!s || !s.trim()) return null;
    try {
      const v = parseRupeesToPaise(s);
      if (v < 0) throw new Error("Amounts cannot be negative");
      return v;
    } catch (e) {
      ctx.addIssue({ code: "custom", message: e instanceof Error ? e.message : "Invalid amount" });
      return z.NEVER;
    }
  });
const level = z.enum(["low", "medium", "high"]).nullable().optional();

const schema = z.object({
  displayName: z.string().trim().max(60).optional().nullable(),
  monthlyIncome: money,
  incomeStability: z.enum(["stable", "variable", "irregular", "none"]).nullable().optional(),
  monthlyEssentials: money,
  monthlyDebtPayments: money,
  emergencySavings: money,
  liquidityNeeds: z.string().trim().max(300).optional().nullable(),
  liquidityAmount: money,
  liquidityWithinMonths: z.coerce.number().int().min(1).max(120).nullable().optional(),
  riskTolerance: level,
  riskCapacity: level,
  investmentExperience: z.enum(["none", "some", "experienced"]).nullable().optional(),
  skipped: z.array(z.string().max(40)).max(20),
  account: z.object({ name: z.string().trim().min(1).max(80), type: z.enum(["bank", "cash", "wallet", "credit_card"]), openingBalance: money }).nullable().optional(),
  goal: z.object({ name: z.string().trim().min(1).max(80), kind: z.enum(["emergency", "purchase", "education", "travel", "retirement", "other"]), targetAmount: money, targetDate: z.string().refine(isLocalDate).nullable().optional() }).nullable().optional(),
});

export type OnboardingInput = z.input<typeof schema>;

export async function saveOnboardingAction(input: OnboardingInput): Promise<ActionResult> {
  const { db, user, today } = await getContext();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  const profile = {
    monthlyIncome: d.monthlyIncome,
    incomeStability: d.incomeStability ?? null,
    monthlyEssentials: d.monthlyEssentials,
    monthlyDebtPayments: d.monthlyDebtPayments,
    emergencySavings: d.emergencySavings,
    liquidityNeeds: d.liquidityNeeds ?? null,
    liquidityAmount: d.liquidityAmount,
    liquidityWithinMonths: d.liquidityWithinMonths ?? null,
    riskTolerance: d.riskTolerance ?? null,
    riskCapacity: d.riskCapacity ?? null,
    investmentExperience: d.investmentExperience ?? null,
    skipped: [...new Set(d.skipped)],
  };
  await db.insert(financialProfile).values({ userId: user.id, ...profile }).onConflictDoUpdate({ target: financialProfile.userId, set: profile });
  await db.update(preferences).set({ onboardingCompletedAt: new Date(), ...(d.displayName ? { displayName: d.displayName } : {}) }).where(eq(preferences.userId, user.id));
  if (d.account) {
    await db.insert(finAccounts).values({ userId: user.id, name: d.account.name, type: d.account.type, openingBalance: d.account.openingBalance ?? 0, openingDate: today });
  }
  if (d.goal && d.goal.targetAmount) {
    const [g] = await db.insert(goals).values({ userId: user.id, name: d.goal.name, kind: d.goal.kind, targetAmount: d.goal.targetAmount, targetDate: d.goal.targetDate ?? null, priority: 1 }).returning({ id: goals.id });
    // Existing emergency savings become the goal's starting point (recorded as a contribution, not income).
    if (d.goal.kind === "emergency" && d.emergencySavings) {
      await db.insert(goalContributions).values({ userId: user.id, goalId: g.id, date: today, amount: d.emergencySavings, note: "Existing emergency savings at setup" });
    }
  }
  const r = await awardXp(db, user.id, "onboarding_complete", xpKey.onboarding(), today);
  refresh();
  return { ok: true, xp: r.xp, message: "Plan set up" };
}
