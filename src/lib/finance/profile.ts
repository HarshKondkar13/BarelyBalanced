/**
 * Risk profiling helpers. Tolerance (how you feel about losses) and capacity
 * (how much loss your finances can absorb) are kept separate; the plan uses the
 * LOWER of the two, and says so.
 */
import type { Paise } from "@/lib/money";

export type Level = "low" | "medium" | "high";
const rank: Record<Level, number> = { low: 0, medium: 1, high: 2 };
const byRank: Level[] = ["low", "medium", "high"];

/** Three-question tolerance quiz; answers are 0-2 each. */
export function toleranceFromQuiz(answers: number[]): Level {
  const s = answers.reduce((a, b) => a + b, 0);
  return s <= 2 ? "low" : s <= 4 ? "medium" : "high";
}

export type CapacityInputs = {
  incomeStability: "stable" | "variable" | "irregular" | "none" | null;
  monthlyEssentials: Paise | null;
  emergencySavings: Paise | null;
  monthlyIncome: Paise | null;
  monthlyDebtPayments: Paise | null;
  shortestGoalMonths: number | null; // horizon of the nearest goal the investments are for
};

/** Deterministic capacity estimate with the reasons that drove it. */
export function estimateCapacity(i: CapacityInputs): { level: Level | null; reasons: string[]; missing: string[] } {
  const missing: string[] = [];
  const reasons: string[] = [];
  let score = 2;
  if (i.incomeStability === null) missing.push("income stability");
  else if (i.incomeStability === "irregular" || i.incomeStability === "none") { score -= 1; reasons.push("Income is irregular or absent, so losses would be harder to recover from."); }
  else if (i.incomeStability === "stable") reasons.push("Income is stable.");
  if (i.monthlyEssentials === null || i.emergencySavings === null) missing.push("emergency savings and essential expenses");
  else {
    const months = i.monthlyEssentials > 0 ? i.emergencySavings / i.monthlyEssentials : 0;
    if (months < 3) { score -= 1; reasons.push(`Emergency savings cover ${months.toFixed(1)} months of essentials (under 3).`); }
    else reasons.push(`Emergency savings cover ${months.toFixed(1)} months of essentials.`);
  }
  if (i.monthlyIncome && i.monthlyDebtPayments !== null) {
    const ratio = i.monthlyDebtPayments / i.monthlyIncome;
    if (ratio > 0.35) { score -= 1; reasons.push(`Debt payments take ${(ratio * 100).toFixed(0)}% of income.`); }
  } else missing.push("income and debt payments");
  if (i.shortestGoalMonths !== null && i.shortestGoalMonths < 36) { score -= 1; reasons.push("Your nearest goal is under 3 years away; short horizons leave little time to recover from falls."); }
  if (missing.length >= 2) return { level: null, reasons, missing };
  return { level: byRank[Math.max(0, Math.min(2, score))], reasons, missing };
}

/** The profile the plan actually uses: the more conservative of tolerance and capacity. */
export function effectiveRisk(tolerance: Level | null, capacity: Level | null): { level: Level | null; limitedBy: "tolerance" | "capacity" | "both" | null } {
  if (!tolerance && !capacity) return { level: null, limitedBy: null };
  if (!tolerance) return { level: capacity, limitedBy: "capacity" };
  if (!capacity) return { level: tolerance, limitedBy: "tolerance" };
  if (rank[tolerance] === rank[capacity]) return { level: tolerance, limitedBy: "both" };
  return rank[tolerance] < rank[capacity] ? { level: tolerance, limitedBy: "tolerance" } : { level: capacity, limitedBy: "capacity" };
}

/** Human explanations of what each skipped onboarding field limits. */
export const SKIP_IMPACT: Record<string, string> = {
  monthlyIncome: "Without income, savings rate and investable-surplus estimates rely on recorded transactions only.",
  incomeStability: "Without income stability, the plan assumes a cautious emergency-fund target (6 months).",
  monthlyEssentials: "Without essential expenses, the emergency-fund target and surplus calculation use your recorded essential categories.",
  monthlyDebtPayments: "Without debt payments, the plan cannot check whether paying down debt should come first.",
  emergencySavings: "Without emergency savings, the plan cannot tell whether reserves are adequate, so it will not suggest investing beyond reserves.",
  riskTolerance: "Without risk tolerance, scenarios default to a conservative illustration.",
  riskCapacity: "Without risk capacity, the plan uses tolerance alone and flags that capacity is unknown.",
  liquidity: "Without upcoming large expenses, money you'll need soon could be counted as investable.",
};
