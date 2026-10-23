/**
 * Weekly plan engine: is there investable surplus after essentials, debt, existing plans
 * and reserves? Outcomes deliberately include "continue the existing plan" and
 * "build cash reserves first", so the app never forces a new investment every week.
 */
import { formatINR, type Paise } from "@/lib/money";

export type PlanOutcome = "insufficient_info" | "no_surplus" | "build_reserves" | "fund_near_term" | "continue_plan" | "room_to_increase";

export type SurplusInputs = {
  monthlyIncome: Paise | null;
  monthlyEssentials: Paise | null;
  avgDiscretionary: Paise; // last ~3 months actual
  monthlyDebtPayments: Paise; // EMIs not already counted in essentials
  existingPlannedContributions: Paise; // SIPs + goal plans per month
  emergencyBalance: Paise | null;
  incomeStability: "stable" | "variable" | "irregular" | "none" | null;
  nearTermNeed: { amount: Paise; withinMonths: number; fundedSoFar: Paise } | null;
};

export type ContributionLine = { target: string; monthly: Paise; rationale: string };

export type PlanResult = {
  outcome: PlanOutcome;
  headline: string;
  explanation: string;
  monthlySurplus: Paise | null;
  emergencyTarget: Paise | null;
  emergencyMonthsCovered: number | null;
  schedule: ContributionLine[];
  assumptions: string[];
  risks: string[];
  alternatives: string[];
};

export function emergencyMonthsTarget(stability: SurplusInputs["incomeStability"]): number {
  return stability === "stable" ? 3 : 6;
}

export function computePlan(i: SurplusInputs): PlanResult {
  const assumptions = [
    "Income and essential expenses use your onboarding answers where given, otherwise averages from recorded transactions.",
    "Discretionary spending uses your last three months' average.",
    "10% of any surplus is left unallocated as a buffer.",
  ];
  const risks = ["Income could change (job change, delayed stipend).", "Irregular annual expenses (insurance, fees, travel) can absorb surplus.", "Investment values can fall, especially over short periods."];
  if (i.monthlyIncome === null || i.monthlyEssentials === null) {
    return {
      outcome: "insufficient_info",
      headline: "Not enough information for a plan yet",
      explanation: "Income and essential expenses are needed to work out whether anything is left over after commitments. Add them in your profile, or record a month of transactions.",
      monthlySurplus: null,
      emergencyTarget: null,
      emergencyMonthsCovered: null,
      schedule: [],
      assumptions,
      risks,
      alternatives: ["Answer the income and expenses questions in Plan → Profile."],
    };
  }
  const surplus = i.monthlyIncome - i.monthlyEssentials - i.avgDiscretionary - i.monthlyDebtPayments - i.existingPlannedContributions;
  const targetMonths = emergencyMonthsTarget(i.incomeStability);
  const emergencyTarget = i.monthlyEssentials * targetMonths;
  const covered = i.emergencyBalance !== null && i.monthlyEssentials > 0 ? i.emergencyBalance / i.monthlyEssentials : null;
  const usable = Math.floor(surplus * 0.9);
  const base = { monthlySurplus: surplus, emergencyTarget, emergencyMonthsCovered: covered, assumptions, risks };

  if (surplus <= 0) {
    return {
      ...base,
      outcome: "no_surplus",
      headline: "No investable surplus right now",
      explanation: `After essentials, typical discretionary spending, debt payments and existing plans, the month comes out at ${formatINR(surplus, { whole: true })}. Keep existing commitments if they're affordable, and look at the largest discretionary categories first.`,
      schedule: [],
      alternatives: ["Trim one discretionary category by a realistic amount.", "Pause or reduce a planned contribution temporarily rather than borrowing.", "Review subscriptions."],
    };
  }
  if (i.emergencyBalance === null || i.emergencyBalance < emergencyTarget) {
    const gap = emergencyTarget - (i.emergencyBalance ?? 0);
    const monthly = Math.min(usable, gap);
    const months = monthly > 0 ? Math.ceil(gap / monthly) : null;
    return {
      ...base,
      outcome: "build_reserves",
      headline: "Build cash reserves first",
      explanation: `${i.emergencyBalance === null ? "Your emergency savings are unknown, so the plan stays cautious." : `Your emergency fund covers ${covered!.toFixed(1)} months of essentials; the target used here is ${targetMonths} months (${formatINR(emergencyTarget, { whole: true })}).`} Directing ${formatINR(monthly, { whole: true })} a month would close the gap in about ${months ?? "—"} months. Investing more before then would risk selling investments in an emergency.`,
      schedule: [{ target: "Emergency fund (savings account, sweep FD or liquid fund)", monthly, rationale: "Liquidity first: a reserve stops a surprise expense from becoming debt." }],
      alternatives: ["Keep any existing SIP running while building reserves if both fit.", "Use a smaller target (3 months) if income is very stable, but understand the trade-off."],
    };
  }
  if (i.nearTermNeed && i.nearTermNeed.withinMonths <= 36 && i.nearTermNeed.fundedSoFar < i.nearTermNeed.amount) {
    const gap = i.nearTermNeed.amount - i.nearTermNeed.fundedSoFar;
    const needed = Math.ceil(gap / Math.max(1, i.nearTermNeed.withinMonths));
    const monthly = Math.min(usable, needed);
    const rest = usable - monthly;
    const schedule: ContributionLine[] = [{ target: "Near-term goal (stable assets: RD, FD, short-term debt)", monthly, rationale: `About ${formatINR(needed, { whole: true })}/month funds it on time.` }];
    if (rest > 0) schedule.push({ target: "Long-term investing (per your illustrative mix)", monthly: rest, rationale: "What's left after the near-term goal." });
    return {
      ...base,
      outcome: "fund_near_term",
      headline: "Prioritise your upcoming expense",
      explanation: `You expect ${formatINR(i.nearTermNeed.amount, { whole: true })} of spending within ${i.nearTermNeed.withinMonths} months. Money needed that soon is usually kept out of volatile assets.`,
      schedule,
      alternatives: ["Delay or resize the expense.", "Split the surplus differently if the date is flexible."],
    };
  }
  if (usable < i.monthlyIncome * 0.05) {
    return {
      ...base,
      outcome: "continue_plan",
      headline: "Continue your existing plan",
      explanation: `Reserves are in place and your current contributions already use most of the surplus (${formatINR(surplus, { whole: true })} left). No change needed this week.`,
      schedule: [],
      alternatives: ["Revisit when income changes.", "Consider a small annual step-up in SIPs when your salary rises."],
    };
  }
  return {
    ...base,
    outcome: "room_to_increase",
    headline: "There's room to put more to work",
    explanation: `Reserves are covered and about ${formatINR(surplus, { whole: true })} a month appears unallocated. You could direct part of it to goals or long-term investing; continuing as you are is also valid.`,
    schedule: [{ target: "Long-term investing (per your illustrative mix)", monthly: usable, rationale: "Surplus after essentials, reserves, existing plans and a 10% buffer." }],
    alternatives: ["Prepay high-interest debt first if you have any.", "Fund a specific goal instead of general investing.", "Keep it as cash until you've reviewed for a few weeks."],
  };
}
