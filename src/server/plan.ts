import "server-only";
import { addDays, addMonths, addMonthsToKey, diffDays, endOfMonth, startOfMonth } from "@/lib/dates";
import { summarizePeriod } from "@/lib/finance/ledger";
import { monthlyEquivalent } from "@/lib/finance/forecast";
import { computePlan, type SurplusInputs } from "@/lib/finance/surplus";
import { effectiveRisk } from "@/lib/finance/profile";
import type { AppContext } from "./context";
import type { FinanceSnapshot } from "./views";

/** Assemble deterministic plan inputs from the finance snapshot and profile. */
export function buildPlan(ctx: AppContext, fin: FinanceSnapshot) {
  const p = fin.profile;
  const months = [1, 2, 3].map((i) => addMonthsToKey(fin.month, -i));
  const sums = months.map((m) => summarizePeriod(fin.txns, startOfMonth(m), endOfMonth(m), fin.categories)).filter((s) => s.txnCount > 0);
  const avgDiscretionary = sums.length ? Math.round(sums.reduce((a, s) => a + s.discretionarySpending, 0) / sums.length) : 0;
  const sipMonthly = fin.recurring.filter((r) => r.active && r.kind === "investment").reduce((a, r) => a + monthlyEquivalent(r), 0);
  const goalPlans = fin.goals.reduce((a, g) => a + (g.plannedMonthly ?? 0), 0);
  let nearTermNeed: SurplusInputs["nearTermNeed"] = null;
  if (p?.liquidityAmount && p.liquidityWithinMonths) {
    const horizonEnd = addMonths(ctx.today, p.liquidityWithinMonths);
    const funded = fin.goals.filter((g) => g.kind !== "emergency" && g.targetDate && g.targetDate <= horizonEnd).reduce((a, g) => a + Math.max(0, g.saved), 0);
    nearTermNeed = { amount: p.liquidityAmount, withinMonths: p.liquidityWithinMonths, fundedSoFar: funded };
  }
  const inputs: SurplusInputs = {
    monthlyIncome: fin.monthlyIncomeEstimate,
    monthlyEssentials: fin.monthlyEssentialsEstimate,
    avgDiscretionary,
    monthlyDebtPayments: p?.monthlyDebtPayments ?? 0,
    existingPlannedContributions: sipMonthly + goalPlans,
    emergencyBalance: fin.emergencyFundBalance,
    incomeStability: p?.incomeStability ?? null,
    nearTermNeed,
  };
  const plan = computePlan(inputs);
  const risk = effectiveRisk(p?.riskTolerance ?? null, p?.riskCapacity ?? null);
  const goalsWithPace = fin.goals.map((g) => {
    const remaining = Math.max(0, g.targetAmount - g.saved);
    const monthsLeft = g.targetDate ? Math.max(1, Math.round(diffDays(g.targetDate, ctx.today) / 30.44)) : null;
    const neededMonthly = monthsLeft ? Math.ceil(remaining / monthsLeft) : null;
    const onTrack = neededMonthly === null || (g.plannedMonthly ?? 0) >= neededMonthly;
    return { ...g, remaining, monthsLeft, neededMonthly, onTrack };
  });
  return { inputs, plan, risk, sipMonthly, goalPlans, avgDiscretionary, goalsWithPace, profile: p, lastWeekStart: addDays(ctx.today, -7) };
}
