import { describe, expect, it } from "vitest";
import { effectiveRisk, estimateCapacity, toleranceFromQuiz } from "@/lib/finance/profile";

describe("risk profile", () => {
  it("scores tolerance from the quiz", () => {
    expect(toleranceFromQuiz([0, 0, 1])).toBe("low");
    expect(toleranceFromQuiz([2, 2, 2])).toBe("high");
  });
  it("keeps tolerance and capacity separate and uses the lower", () => {
    expect(effectiveRisk("high", "low")).toEqual({ level: "low", limitedBy: "capacity" });
    expect(effectiveRisk("low", "high")).toEqual({ level: "low", limitedBy: "tolerance" });
  });
  it("lowers capacity for thin reserves and short horizons", () => {
    const r = estimateCapacity({ incomeStability: "stable", monthlyEssentials: 40_000_00, emergencySavings: 40_000_00, monthlyIncome: 1_00_000_00, monthlyDebtPayments: 0, shortestGoalMonths: 12 });
    expect(r.level).toBe("low");
    expect(r.reasons.length).toBeGreaterThan(0);
  });
  it("returns unknown rather than guessing when most inputs are skipped", () => {
    expect(estimateCapacity({ incomeStability: null, monthlyEssentials: null, emergencySavings: null, monthlyIncome: null, monthlyDebtPayments: null, shortestGoalMonths: null }).level).toBeNull();
  });
});
