import { describe, expect, it } from "vitest";
import { addMonths, isoWeekId, localDateTimeToInstant, startOfWeek, toLocalDate, toLocalTime } from "@/lib/dates";

describe("dates", () => {
  it("resolves the IST calendar day, not the server day", () => {
    // 20:00 UTC on 23 Oct is 01:30 IST on 24 Oct.
    expect(toLocalDate(new Date("2026-10-23T20:00:00Z"), "Asia/Kolkata")).toBe("2026-10-24");
    expect(toLocalTime(new Date("2026-10-23T20:00:00Z"), "Asia/Kolkata")).toBe("01:30");
  });
  it("converts local wall time to an instant", () => {
    expect(localDateTimeToInstant("2026-10-24", "09:30", "Asia/Kolkata").toISOString()).toBe("2026-10-24T04:00:00.000Z");
    // DST zone: New York in July is UTC-4
    expect(localDateTimeToInstant("2026-07-01", "09:00", "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z");
  });
  it("clamps month arithmetic to month end", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-02-28", 1, 31)).toBe("2026-03-31");
  });
  it("computes week starts and ISO weeks", () => {
    expect(startOfWeek("2026-10-23", 1)).toBe("2026-10-19"); // Friday -> Monday
    expect(startOfWeek("2026-10-25", 1)).toBe("2026-10-19"); // Sunday -> Monday
    expect(isoWeekId("2026-10-23")).toBe("2026-W43");
    expect(isoWeekId("2027-01-01")).toBe("2026-W53");
  });
});
