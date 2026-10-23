import { describe, expect, it } from "vitest";
import { computeStreak, levelFromXp, XP_RULES, xpForLevel } from "@/lib/gamification/rules";

describe("levels", () => {
  it("has a monotonic curve", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(300).level).toBe(3);
  });
});

describe("rules never reward risk, volume or returns", () => {
  it("has no actions tied to trading, spending amount or returns", () => {
    for (const action of Object.keys(XP_RULES)) {
      expect(action).not.toMatch(/trade|buy|sell|return|profit|spend_amount|risk/);
    }
  });
});

describe("flexible streaks", () => {
  const days = (...d: string[]) => new Set(d);
  it("does not break because today is not over yet", () => {
    const s = computeStreak(days("2026-10-20", "2026-10-21", "2026-10-22"), "2026-10-23");
    expect(s.current).toBe(3);
    expect(s.activeToday).toBe(false);
  });
  it("forgives one rest day per week", () => {
    // Mon 19 active, Tue 20 missed, Wed 21 active, Thu 22 active, Fri 23 today active
    const s = computeStreak(days("2026-10-19", "2026-10-21", "2026-10-22", "2026-10-23"), "2026-10-23", 1);
    expect(s.current).toBe(4);
    expect(s.restDaysLeftThisWeek).toBe(0);
  });
  it("breaks after more misses than rest days, without going negative", () => {
    const s = computeStreak(days("2026-10-17", "2026-10-23"), "2026-10-23", 1);
    expect(s.current).toBe(1);
  });
  it("is zero with no activity", () => {
    expect(computeStreak(new Set(), "2026-10-23").current).toBe(0);
  });
});
