import { describe, expect, it } from "vitest";
import { DEFAULT_RETURNS, requiredMonthly, runAllScenarios, runScenario, validateMix, type ScenarioInputs } from "@/lib/finance/scenarios";
import { computePlan, type SurplusInputs } from "@/lib/finance/surplus";
import { illustrativeMix } from "@/lib/finance/allocation";

const zero = { equity: 0, debt: 0, gold: 0, cash: 0 };
const base: ScenarioInputs = { initial: 0, monthly: 1000_00, years: 10, mix: { equity: 1, debt: 0, gold: 0, cash: 0 }, returns: DEFAULT_RETURNS, annualFee: 0, inflation: 0, taxOnGains: 0, annualStepUp: 0 };

describe("scenario arithmetic", () => {
  it("with zero return, value equals contributions", () => {
    const r = runScenario("base", { ...base, returns: { pessimistic: zero, base: zero, optimistic: zero } });
    expect(r.finalNominal).toBe(120 * 1000_00);
    expect(r.gains).toBe(0);
  });
  it("matches the annuity-due closed form", () => {
    const annual = 0.12;
    const r = runScenario("base", { ...base, returns: { ...DEFAULT_RETURNS, base: { equity: annual, debt: 0, gold: 0, cash: 0 } } });
    const m = Math.pow(1 + annual, 1 / 12) - 1;
    const expected = 1000_00 * ((Math.pow(1 + m, 120) - 1) / m) * (1 + m);
    expect(Math.abs(r.finalNominal - expected)).toBeLessThan(2);
  });
  it("orders pessimistic < base < optimistic and fees/tax/inflation reduce outcomes", () => {
    const [p, b, o] = runAllScenarios(base);
    expect(p.finalNominal).toBeLessThan(b.finalNominal);
    expect(b.finalNominal).toBeLessThan(o.finalNominal);
    const withCosts = runScenario("base", { ...base, annualFee: 0.01, taxOnGains: 0.125, inflation: 0.05 });
    expect(withCosts.feesPaid).toBeGreaterThan(0);
    expect(withCosts.finalAfterTax).toBeLessThan(withCosts.finalNominal);
    expect(withCosts.finalAfterTaxReal).toBeLessThan(withCosts.finalAfterTax);
    expect(withCosts.finalNominal).toBeLessThan(b.finalNominal);
  });
  it("required monthly reaches the target", () => {
    const need = requiredMonthly(10_00_000_00, 5, 0.07);
    const r = runScenario("base", { ...base, monthly: need, years: 5, returns: { ...DEFAULT_RETURNS, base: { equity: 0.07, debt: 0, gold: 0, cash: 0 } } });
    expect(r.finalNominal).toBeGreaterThanOrEqual(10_00_000_00 - 100);
  });
  it("validates mixes", () => {
    expect(validateMix({ equity: 0.6, debt: 0.3, gold: 0.1, cash: 0 })).toBe(true);
    expect(validateMix({ equity: 0.6, debt: 0.6, gold: 0, cash: 0 })).toBe(false);
  });
});

describe("weekly plan outcomes", () => {
  const inp: SurplusInputs = { monthlyIncome: 90_000_00, monthlyEssentials: 40_000_00, avgDiscretionary: 15_000_00, monthlyDebtPayments: 0, existingPlannedContributions: 10_000_00, emergencyBalance: 2_00_000_00, incomeStability: "stable", nearTermNeed: null };
  it("builds reserves first when the emergency fund is short", () => {
    const r = computePlan({ ...inp, emergencyBalance: 50_000_00 });
    expect(r.outcome).toBe("build_reserves");
    expect(r.schedule[0].monthly).toBeLessThanOrEqual(Math.floor(25_000_00 * 0.9));
  });
  it("can say continue the existing plan", () => {
    expect(computePlan({ ...inp, existingPlannedContributions: 33_000_00 }).outcome).toBe("continue_plan");
  });
  it("reports no surplus honestly", () => {
    expect(computePlan({ ...inp, avgDiscretionary: 45_000_00 }).outcome).toBe("no_surplus");
  });
  it("needs income and essentials", () => {
    expect(computePlan({ ...inp, monthlyIncome: null }).outcome).toBe("insufficient_info");
  });
  it("prioritises near-term needs", () => {
    expect(computePlan({ ...inp, nearTermNeed: { amount: 1_00_000_00, withinMonths: 10, fundedSoFar: 0 } }).outcome).toBe("fund_near_term");
  });
});

describe("illustrative mixes", () => {
  it("keeps short horizons conservative even for high risk", () => {
    expect(illustrativeMix(2, "high").mix.equity).toBeLessThanOrEqual(0.15);
  });
  it("falls back to conservative when risk is unknown", () => {
    expect(illustrativeMix(10, null).risk).toBe("low");
  });
  it("every mix sums to 1", () => {
    for (const y of [1, 5, 10]) for (const r of ["low", "medium", "high"] as const) expect(validateMix(illustrativeMix(y, r).mix)).toBe(true);
  });
});
