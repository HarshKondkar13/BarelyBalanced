import { describe, expect, it } from "vitest";
import { CalendarError, GoogleCalendarClient } from "@/server/integrations/google-calendar";
import { toEventBody } from "@/lib/integrations/calendar";
import { inQuietHours, minutesUntilQuietEnds } from "@/lib/notify";

type Call = { method: string; url: string };
function fakeFetch(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>, calls: Call[]) {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url });
    const r = responses.shift() ?? { status: 200, body: {} };
    return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status, headers: r.headers });
  }) as unknown as typeof fetch;
}
const tokens = (refreshes: { n: number }) => ({ getAccessToken: async () => "a", forceRefresh: async () => { refreshes.n++; return "b"; } });
const noSleep = async () => undefined;
const body = toEventBody("u", { id: "t1", title: "Review", planDate: "2026-10-25", startTime: "18:00", durationMin: 20 }, "Asia/Kolkata");

describe("Google Calendar client", () => {
  it("retries rate limits with backoff, then succeeds", async () => {
    const calls: Call[] = [];
    const c = new GoogleCalendarClient(tokens({ n: 0 }), fakeFetch([{ status: 429 }, { status: 403, body: { error: { errors: [{ reason: "rateLimitExceeded" }] } } }, { status: 200, body: { items: [] } }], calls), noSleep);
    expect(await c.listCalendars()).toEqual([]);
    expect(calls).toHaveLength(3);
  });
  it("refreshes an expired access token once on 401", async () => {
    const r = { n: 0 };
    const c = new GoogleCalendarClient(tokens(r), fakeFetch([{ status: 401 }, { status: 200, body: { items: [] } }], []), noSleep);
    await c.listCalendars();
    expect(r.n).toBe(1);
  });
  it("reports revoked access clearly when refresh doesn't help", async () => {
    const c = new GoogleCalendarClient(tokens({ n: 0 }), fakeFetch([{ status: 401 }, { status: 401 }], []), noSleep);
    await expect(c.listCalendars()).rejects.toMatchObject({ kind: "revoked" });
  });
  it("makes inserts idempotent: a 409 on retry becomes an update of the same event id", async () => {
    const calls: Call[] = [];
    const c = new GoogleCalendarClient(tokens({ n: 0 }), fakeFetch([{ status: 409 }, { status: 200, body: { id: body.id } }], calls), noSleep);
    expect(await c.upsertEvent("cal1", body)).toBe("updated");
    expect(calls.map((x) => x.method)).toEqual(["POST", "PUT"]);
    expect(calls[1].url).toContain(`/events/${body.id}`);
  });
  it("treats deleting an already-deleted event as success", async () => {
    const c = new GoogleCalendarClient(tokens({ n: 0 }), fakeFetch([{ status: 410 }], []), noSleep);
    await expect(c.deleteEvent("cal1", body.id)).resolves.toBeUndefined();
  });
  it("gives up after the retry limit with a rate-limit error", async () => {
    const c = new GoogleCalendarClient(tokens({ n: 0 }), fakeFetch(Array.from({ length: 6 }, () => ({ status: 429 })), []), noSleep);
    const err = await c.listCalendars().catch((e) => e);
    expect(err).toBeInstanceOf(CalendarError);
    expect(err.kind).toBe("rate_limited");
  });
});

describe("quiet hours", () => {
  it("handles windows that cross midnight", () => {
    expect(inQuietHours("23:00", "22:00", "07:30")).toBe(true);
    expect(inQuietHours("06:00", "22:00", "07:30")).toBe(true);
    expect(inQuietHours("12:00", "22:00", "07:30")).toBe(false);
    expect(minutesUntilQuietEnds("23:00", "22:00", "07:30")).toBe(510);
  });
});
