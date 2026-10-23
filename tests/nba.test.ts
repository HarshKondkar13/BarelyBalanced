import { describe, expect, it } from "vitest";
import { nextBestAction, type NBAInput } from "@/lib/next-best-action";

const base: NBAInput = { hour: 9, dow: 3, overdue: [], dueSoon: [], insights: [], morningPlanned: true, eveningReviewed: false, weeklyReviewDone: false, nextPriority: null, loggedToday: true, hasAccounts: true, onboardingDone: true };

describe("next best action", () => {
  it("puts overdue bills above planning", () => {
    expect(nextBestAction({ ...base, morningPlanned: false, overdue: [{ id: "x", name: "Rent", amount: 100 }] }).id).toBe("overdue:x");
  });
  it("suggests morning planning before 2pm", () => {
    expect(nextBestAction({ ...base, morningPlanned: false }).id).toBe("morning");
    expect(nextBestAction({ ...base, morningPlanned: false, hour: 15 }).id).not.toBe("morning");
  });
  it("suggests the weekly review on weekends only", () => {
    expect(nextBestAction({ ...base, dow: 0 }).id).toBe("weekly");
    expect(nextBestAction({ ...base, dow: 3 }).id).not.toBe("weekly");
  });
  it("falls back to rest rather than inventing work", () => {
    expect(nextBestAction(base).id).toBe("rest");
  });
});
