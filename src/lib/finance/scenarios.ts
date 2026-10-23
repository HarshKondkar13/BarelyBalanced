/**
 * Educational projection scenarios. Every rate here is a user-editable ASSUMPTION used
 * to illustrate a range of outcomes. None is a forecast of market returns.
 */
import type { Paise } from "@/lib/money";

export type Mix = { equity: number; debt: number; gold: number; cash: number }; // fractions summing to 1

export type ReturnAssumptions = { pessimistic: Mix; base: Mix; optimistic: Mix };

/** Default annual nominal returns per asset class (assumptions, editable in the UI). */
export const DEFAULT_RETURNS: ReturnAssumptions = {
  pessimistic: { equity: 0.04, debt: 0.05, gold: 0.02, cash: 0.03 },
  base: { equity: 0.10, debt: 0.065, gold: 0.06, cash: 0.04 },
  optimistic: { equity: 0.13, debt: 0.075, gold: 0.09, cash: 0.05 },
};

export type ScenarioInputs = {
  initial: Paise;
  monthly: Paise;
  years: number;
  mix: Mix;
  returns: ReturnAssumptions;
  annualFee: number; // e.g. 0.005 = 0.5% a year (expense ratio)
  inflation: number; // e.g. 0.05
  taxOnGains: number; // flat illustrative rate applied to gains at the end, e.g. 0.125
  annualStepUp: number; // increase in monthly contribution each year, e.g. 0.05
};

export type ScenarioName = "pessimistic" | "base" | "optimistic";

export type ScenarioResult = {
  name: ScenarioName;
  annualReturnBeforeFees: number;
  finalNominal: Paise;
  contributed: Paise;
  gains: Paise;
  feesPaid: Paise;
  taxOnGains: Paise;
  finalAfterTax: Paise;
  finalAfterTaxReal: Paise; // in today's rupees
  yearly: Array<{ year: number; value: Paise; contributed: Paise }>;
};

export function blendedReturn(mix: Mix, r: Mix): number {
  return mix.equity * r.equity + mix.debt * r.debt + mix.gold * r.gold + mix.cash * r.cash;
}

export function validateMix(mix: Mix): boolean {
  const s = mix.equity + mix.debt + mix.gold + mix.cash;
  return Object.values(mix).every((x) => x >= 0 && x <= 1) && Math.abs(s - 1) < 1e-6;
}

/**
 * Month-by-month simulation. Contributions are made at the start of each month; growth
 * and fees accrue monthly. Fees are tracked separately so their cost is visible.
 */
export function runScenario(name: ScenarioName, i: ScenarioInputs): ScenarioResult {
  const gross = blendedReturn(i.mix, i.returns[name]);
  const mGrowth = Math.pow(1 + gross, 1 / 12) - 1;
  const mFee = Math.pow(1 + i.annualFee, 1 / 12) - 1;
  let value = i.initial;
  let contributed = i.initial;
  let fees = 0;
  let monthly = i.monthly;
  const yearly: ScenarioResult["yearly"] = [{ year: 0, value: Math.round(value), contributed: Math.round(contributed) }];
  const months = Math.round(i.years * 12);
  for (let m = 1; m <= months; m++) {
    value += monthly;
    contributed += monthly;
    value *= 1 + mGrowth;
    const fee = value * mFee;
    fees += fee;
    value -= fee;
    if (m % 12 === 0) {
      yearly.push({ year: m / 12, value: Math.round(value), contributed: Math.round(contributed) });
      monthly = monthly * (1 + i.annualStepUp);
    }
  }
  const gains = Math.max(0, value - contributed);
  const tax = gains * i.taxOnGains;
  const afterTax = value - tax;
  const real = afterTax / Math.pow(1 + i.inflation, i.years);
  return {
    name,
    annualReturnBeforeFees: gross,
    finalNominal: Math.round(value),
    contributed: Math.round(contributed),
    gains: Math.round(value - contributed),
    feesPaid: Math.round(fees),
    taxOnGains: Math.round(tax),
    finalAfterTax: Math.round(afterTax),
    finalAfterTaxReal: Math.round(real),
    yearly,
  };
}

export function runAllScenarios(i: ScenarioInputs) {
  return (["pessimistic", "base", "optimistic"] as const).map((n) => runScenario(n, i));
}

/** Monthly amount needed to reach `target` (today's rupees) in `years` under a given annual real-ish return. */
export function requiredMonthly(target: Paise, years: number, annualReturn: number, existing: Paise = 0): Paise {
  const n = Math.round(years * 12);
  if (n <= 0) return Math.max(0, target - existing);
  const r = Math.pow(1 + annualReturn, 1 / 12) - 1;
  const fvExisting = existing * Math.pow(1 + r, n);
  const remaining = target - fvExisting;
  if (remaining <= 0) return 0;
  if (r === 0) return Math.ceil(remaining / n);
  // Annuity-due (contribution at start of month)
  return Math.ceil(remaining / (((Math.pow(1 + r, n) - 1) / r) * (1 + r)));
}
