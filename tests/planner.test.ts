import { describe, expect, it } from "vitest";
import { dayCapacity, findConflicts, findFreeSlot, slipSuggestions, type Block } from "@/lib/schedule/planner";

const b = (id: string, start: string, durationMin: number, source: Block["source"] = "task"): Block => ({ id, title: id, start, durationMin, source });

describe("planner", () => {
  it("finds overlapping blocks", () => {
    const c = findConflicts([b("a", "09:00", 60), b("b", "09:30", 30, "calendar"), b("c", "10:00", 30)]);
    expect(c).toHaveLength(1);
    expect(c[0].overlapMin).toBe(30);
  });
  it("includes a buffer in capacity and flags overcommitment", () => {
    const cap = dayCapacity([b("class", "09:00", 360)], [120, 120, 90], { start: "08:00", end: "18:00" });
    expect(cap.bufferMin).toBe(Math.round((360 + 330) * 0.2));
    expect(cap.overcommitted).toBe(true);
  });
  it("finds a free slot with gaps around existing blocks", () => {
    expect(findFreeSlot([b("a", "08:00", 60)], 30, { start: "08:00", end: "21:00" })).toBe("09:15");
  });
  it("suggests scope or time changes for repeatedly slipped tasks", () => {
    const s = slipSuggestions([
      { id: "1", title: "Read annual report", carryCount: 3, durationMin: 90, startTime: null },
      { id: "2", title: "Call bank", carryCount: 1, durationMin: 10, startTime: null },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].suggestion).toBe("reduce_scope");
  });
});
