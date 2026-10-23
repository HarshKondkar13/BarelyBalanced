import { describe, expect, it } from "vitest";
import { contentHash, eventIdForTask, localDateTimeString, parseGoogleEvent, planPublish, toEventBody } from "@/lib/integrations/calendar";
import { decryptSecret, encryptSecret } from "@/lib/integrations/crypto";

describe("calendar identity and dedupe", () => {
  it("derives stable, Google-valid event ids", () => {
    const a = eventIdForTask("u1", "t1");
    expect(a).toBe(eventIdForTask("u1", "t1"));
    expect(a).not.toBe(eventIdForTask("u2", "t1"));
    expect(a).toMatch(/^[a-v0-9]{5,1024}$/);
  });
  it("plans creates, updates, removals and leaves unchanged events alone", () => {
    const t = { id: "t1", title: "Weekly review", planDate: "2026-10-25", startTime: "18:00", durationMin: 20 };
    const body = toEventBody("u", t, "Asia/Kolkata");
    const first = planPublish("u", [t], [], "Asia/Kolkata");
    expect(first.create).toHaveLength(1);
    const pubs = [{ taskId: "t1", eventId: body.id, contentHash: contentHash(body), status: "published" as const }];
    const again = planPublish("u", [t], pubs, "Asia/Kolkata");
    expect(again.create).toHaveLength(0);
    expect(again.unchanged).toBe(1);
    const moved = planPublish("u", [{ ...t, startTime: "19:00" }], pubs, "Asia/Kolkata");
    expect(moved.update).toHaveLength(1);
    const removed = planPublish("u", [], pubs, "Asia/Kolkata");
    expect(removed.remove.map((r) => r.eventId)).toEqual([body.id]);
  });
  it("never plans removal of events it did not publish", () => {
    expect(planPublish("u", [], [], "Asia/Kolkata").remove).toHaveLength(0);
  });
});

describe("timezones and all-day events", () => {
  it("writes IST offsets explicitly", () => {
    expect(localDateTimeString("2026-10-25", "18:00", "Asia/Kolkata")).toBe("2026-10-25T18:00:00+05:30");
  });
  it("handles DST zones", () => {
    expect(localDateTimeString("2026-07-01", "09:00", "America/New_York")).toBe("2026-07-01T09:00:00-04:00");
    expect(localDateTimeString("2026-12-01", "09:00", "America/New_York")).toBe("2026-12-01T09:00:00-05:00");
  });
  it("rolls past midnight to the next day", () => {
    const b = toEventBody("u", { id: "t", title: "Late", planDate: "2026-10-25", startTime: "23:30", durationMin: 60 }, "Asia/Kolkata");
    expect(b.end.dateTime).toBe("2026-10-26T00:30:00+05:30");
  });
  it("maps untimed tasks to non-blocking all-day events with exclusive end", () => {
    const b = toEventBody("u", { id: "t", title: "Pay bill", planDate: "2026-10-31", startTime: null, durationMin: 10 }, "Asia/Kolkata");
    expect(b.start.date).toBe("2026-10-31");
    expect(b.end.date).toBe("2026-11-01");
    expect(b.transparency).toBe("transparent");
  });
  it("parses timed and all-day Google events", () => {
    const timed = parseGoogleEvent({ id: "e1", start: { dateTime: "2026-10-25T10:00:00+05:30" }, end: { dateTime: "2026-10-25T11:00:00+05:30" } });
    expect(timed?.startAt?.toISOString()).toBe("2026-10-25T04:30:00.000Z");
    const allDay = parseGoogleEvent({ id: "e2", start: { date: "2026-10-25" }, end: { date: "2026-10-27" } });
    expect(allDay?.allDayDate).toBe("2026-10-25");
    expect(allDay?.allDayEndDate).toBe("2026-10-26");
    expect(parseGoogleEvent({ id: "e3", status: "cancelled" })).toBeNull();
  });
});

describe("credential encryption", () => {
  it("round-trips and detects tampering", () => {
    const enc = encryptSecret("refresh-token-value");
    expect(enc).not.toContain("refresh-token-value");
    expect(decryptSecret(enc)).toBe("refresh-token-value");
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});
