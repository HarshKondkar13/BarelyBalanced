import "server-only";
import { and, eq, gte, inArray, isNotNull, lte, ne } from "drizzle-orm";
import type { DB } from "@/db";
import { calendarPublications, externalEvents, integrations, tasks } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/integrations/crypto";
import { contentHash, parseGoogleEvent, planPublish, SCOPES, type EventBody, type GoogleEvent, type PublishPlan, type PublishableTask } from "@/lib/integrations/calendar";
import { addDays, localDateTimeToInstant, type LocalDate } from "@/lib/dates";
import { log } from "@/server/log";

/*
 * Google Calendar integration over the official REST API (v3) and OAuth 2.0 endpoints.
 * - Read-only scope first; the narrower "app.created" scope is requested only when the
 *   user enables publishing, so the app can only ever touch calendars it created.
 * - Refresh tokens are encrypted at rest and never sent to the browser or logged.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";
export const APP_CALENDAR_NAME = `${process.env.NEXT_PUBLIC_APP_NAME || "Paisa & Purpose"} – time blocks`;

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.BETTER_AUTH_URL);
export const redirectUri = () => `${process.env.BETTER_AUTH_URL}/api/integrations/google/callback`;

export class CalendarError extends Error {
  constructor(
    message: string,
    public kind: "revoked" | "rate_limited" | "not_found" | "conflict" | "forbidden" | "network" | "unknown",
    public status?: number,
  ) {
    super(message);
  }
}

export type CalendarSettings = {
  selectedCalendarIds?: string[];
  appCalendarId?: string | null;
  publishingEnabled?: boolean;
  calendars?: Array<{ id: string; summary: string; primary?: boolean; accessRole?: string }>;
};

export function buildAuthUrl(opts: { state: string; codeChallenge: string; scopes: string[] }) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: opts.scopes.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${p}`;
}

type FetchLike = typeof fetch;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Minimal REST client: token refresh on 401, exponential backoff on rate limits and 5xx,
 * typed errors for revoked access. `fetchImpl` and `sleepImpl` are injectable for tests.
 */
export class GoogleCalendarClient {
  constructor(
    private tokens: { getAccessToken: () => Promise<string>; forceRefresh: () => Promise<string> },
    private fetchImpl: FetchLike = fetch,
    private sleepImpl: (ms: number) => Promise<void> = sleep,
    private maxRetries = 4,
  ) {}

  async request<T>(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<T | null> {
    let token = await this.tokens.getAccessToken();
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      const url = `${API}${path}${query ? `?${new URLSearchParams(query)}` : ""}`;
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch {
        if (attempt < this.maxRetries) {
          await this.sleepImpl(500 * 2 ** attempt);
          continue;
        }
        throw new CalendarError("Could not reach Google Calendar", "network");
      }
      if (res.ok) return res.status === 204 ? null : ((await res.json()) as T);
      const err = (await res.json().catch(() => ({}))) as { error?: { errors?: Array<{ reason?: string }>; message?: string } };
      const reason = err.error?.errors?.[0]?.reason ?? "";
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        token = await this.tokens.forceRefresh();
        continue;
      }
      const rateLimited = res.status === 429 || (res.status === 403 && /rateLimitExceeded|userRateLimitExceeded/.test(reason));
      if ((rateLimited || res.status >= 500) && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await this.sleepImpl(retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt + Math.floor(Math.random() * 250));
        continue;
      }
      if (rateLimited) throw new CalendarError("Google Calendar rate limit reached. Try again in a few minutes.", "rate_limited", res.status);
      if (res.status === 401) throw new CalendarError("Calendar access was revoked or expired. Reconnect to continue.", "revoked", 401);
      if (res.status === 404 || res.status === 410) throw new CalendarError("Not found", "not_found", res.status);
      if (res.status === 409) throw new CalendarError("Already exists", "conflict", 409);
      if (res.status === 403) throw new CalendarError("Google denied this request. The required permission may not be granted.", "forbidden", 403);
      throw new CalendarError(`Google Calendar error (${res.status})`, "unknown", res.status);
    }
  }

  async listCalendars() {
    const r = await this.request<{ items: Array<{ id: string; summary: string; primary?: boolean; accessRole: string }> }>("GET", "/users/me/calendarList", undefined, { maxResults: "250" });
    return r?.items ?? [];
  }

  async listEvents(calendarId: string, timeMin: Date, timeMax: Date): Promise<GoogleEvent[]> {
    const out: GoogleEvent[] = [];
    let pageToken: string | undefined;
    do {
      const q: Record<string, string> = { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" };
      if (pageToken) q.pageToken = pageToken;
      const r = await this.request<{ items: GoogleEvent[]; nextPageToken?: string }>("GET", `/calendars/${encodeURIComponent(calendarId)}/events`, undefined, q);
      out.push(...(r?.items ?? []));
      pageToken = r?.nextPageToken;
    } while (pageToken && out.length < 2500);
    return out;
  }

  async createCalendar(summary: string, timeZone: string) {
    return (await this.request<{ id: string }>("POST", "/calendars", { summary, timeZone, description: "Time blocks published from your planner. Safe to delete." }))!;
  }

  /** Idempotent upsert by deterministic id: insert, and on 409 (already exists) update in place. */
  async upsertEvent(calendarId: string, body: EventBody) {
    try {
      await this.request("POST", `/calendars/${encodeURIComponent(calendarId)}/events`, body);
      return "created" as const;
    } catch (e) {
      if (e instanceof CalendarError && e.kind === "conflict") {
        await this.request("PUT", `/calendars/${encodeURIComponent(calendarId)}/events/${body.id}`, { ...body, status: "confirmed" });
        return "updated" as const;
      }
      throw e;
    }
  }

  /** Deleting something already gone counts as success, so retries are safe. */
  async deleteEvent(calendarId: string, eventId: string) {
    try {
      await this.request("DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`);
    } catch (e) {
      if (e instanceof CalendarError && e.kind === "not_found") return;
      throw e;
    }
  }
}

/* ---------------- Token handling ---------------- */

export async function exchangeCode(code: string, codeVerifier: string, fetchImpl: FetchLike = fetch) {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, code_verifier: codeVerifier, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  if (!res.ok) throw new CalendarError("Google did not accept the authorisation code. Please try connecting again.", "unknown", res.status);
  return (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string; scope: string };
}

async function refreshAccessToken(refreshToken: string, fetchImpl: FetchLike = fetch) {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, grant_type: "refresh_token" }),
  });
  if (res.status === 400 || res.status === 401) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (body.error === "invalid_grant") throw new CalendarError("Calendar access was revoked or expired. Reconnect to continue.", "revoked", res.status);
  }
  if (!res.ok) throw new CalendarError("Could not refresh calendar access", "unknown", res.status);
  return (await res.json()) as { access_token: string; expires_in: number; scope?: string };
}

export async function getIntegration(db: DB, userId: string) {
  const [row] = await db.select().from(integrations).where(and(eq(integrations.userId, userId), eq(integrations.provider, "google_calendar")));
  return row ?? null;
}

/** Build a client for a user, transparently refreshing and persisting access tokens. */
export async function clientFor(db: DB, userId: string, fetchImpl: FetchLike = fetch): Promise<GoogleCalendarClient> {
  const row = await getIntegration(db, userId);
  if (!row || row.status !== "connected" || !row.encryptedRefreshToken) throw new CalendarError("Google Calendar is not connected", "revoked");
  const refreshToken = decryptSecret(row.encryptedRefreshToken);
  let access = row.encryptedAccessToken && row.accessTokenExpiresAt && row.accessTokenExpiresAt.getTime() > Date.now() + 60_000 ? decryptSecret(row.encryptedAccessToken) : null;
  const doRefresh = async () => {
    try {
      const t = await refreshAccessToken(refreshToken, fetchImpl);
      access = t.access_token;
      await db.update(integrations).set({ encryptedAccessToken: encryptSecret(t.access_token), accessTokenExpiresAt: new Date(Date.now() + t.expires_in * 1000) }).where(eq(integrations.id, row.id));
      return access;
    } catch (e) {
      if (e instanceof CalendarError && e.kind === "revoked") await markRevoked(db, row.id);
      throw e;
    }
  };
  return new GoogleCalendarClient({ getAccessToken: async () => access ?? (await doRefresh()), forceRefresh: doRefresh }, fetchImpl);
}

async function markRevoked(db: DB, integrationId: string) {
  await db.update(integrations).set({ status: "revoked", encryptedAccessToken: null, lastError: "Access was revoked in your Google account or expired. Reconnect to resume syncing." }).where(eq(integrations.id, integrationId));
}

export async function saveConnection(db: DB, userId: string, tokens: { access_token: string; expires_in: number; refresh_token?: string; scope: string }) {
  const existing = await getIntegration(db, userId);
  const refresh = tokens.refresh_token ? encryptSecret(tokens.refresh_token) : existing?.encryptedRefreshToken;
  if (!refresh) throw new CalendarError("Google did not return offline access. Remove the app's access in your Google account settings and connect again.", "unknown");
  const scopes = [...new Set([...(existing?.scopes ?? []), ...tokens.scope.split(" ")])];
  const values = {
    userId,
    provider: "google_calendar" as const,
    status: "connected" as const,
    scopes,
    encryptedRefreshToken: refresh,
    encryptedAccessToken: encryptSecret(tokens.access_token),
    accessTokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    lastError: null,
    settings: { ...((existing?.settings as CalendarSettings) ?? {}), publishingEnabled: scopes.includes(SCOPES.publish) },
  };
  await db.insert(integrations).values(values).onConflictDoUpdate({ target: [integrations.userId, integrations.provider], set: values });
}

/* ---------------- Sync (read) ---------------- */

/**
 * Refresh events for selected calendars within a window. Recurring events are expanded
 * by Google (singleEvents=true). Rows for events no longer present in the window are removed.
 */
export async function syncCalendars(db: DB, userId: string, tz: string, today: LocalDate, fetchImpl: FetchLike = fetch) {
  const row = await getIntegration(db, userId);
  if (!row || row.status !== "connected") return { synced: 0, skipped: true };
  const settings = (row.settings ?? {}) as CalendarSettings;
  try {
    const client = await clientFor(db, userId, fetchImpl);
    const calendars = await client.listCalendars();
    const selected = (settings.selectedCalendarIds?.length ? settings.selectedCalendarIds : calendars.filter((c) => c.primary).map((c) => c.id)).filter((id) => id !== settings.appCalendarId);
    const timeMin = localDateTimeToInstant(addDays(today, -1), "00:00", tz);
    const timeMax = localDateTimeToInstant(addDays(today, 15), "00:00", tz);
    let count = 0;
    for (const calendarId of selected) {
      const events = await client.listEvents(calendarId, timeMin, timeMax);
      const parsed = events.map(parseGoogleEvent).filter((e): e is NonNullable<typeof e> => e !== null && e.status !== "cancelled");
      await db.transaction(async (tx) => {
        // Replace this calendar's window atomically.
        await tx.delete(externalEvents).where(and(eq(externalEvents.userId, userId), eq(externalEvents.calendarId, calendarId)));
        if (parsed.length) {
          await tx.insert(externalEvents).values(parsed.map((e) => ({ userId, calendarId, eventId: e.eventId, title: e.title, startAt: e.startAt, endAt: e.endAt, allDayDate: e.allDayDate, allDayEndDate: e.allDayEndDate, status: e.status }))).onConflictDoNothing();
        }
      });
      count += parsed.length;
    }
    // Calendars that were deselected: forget their cached events.
    const cachedIds = (await db.selectDistinct({ c: externalEvents.calendarId }).from(externalEvents).where(eq(externalEvents.userId, userId))).map((r) => r.c);
    const stale = cachedIds.filter((c) => !selected.includes(c));
    if (stale.length) await db.delete(externalEvents).where(and(eq(externalEvents.userId, userId), inArray(externalEvents.calendarId, stale)));
    await db
      .update(integrations)
      .set({ lastSyncAt: new Date(), lastError: null, settings: { ...settings, calendars: calendars.map((c) => ({ id: c.id, summary: c.summary, primary: c.primary, accessRole: c.accessRole })) } })
      .where(eq(integrations.id, row.id));
    return { synced: count, skipped: false };
  } catch (e) {
    const msg = e instanceof CalendarError ? e.message : "Sync failed unexpectedly";
    log.warn("calendar.sync_failed", { userId, kind: e instanceof CalendarError ? e.kind : "unknown" });
    await db.update(integrations).set({ lastError: msg }).where(eq(integrations.id, row.id));
    throw e;
  }
}

/* ---------------- Publish (write, opt-in, previewed) ---------------- */

async function publishCandidates(db: DB, userId: string, today: LocalDate): Promise<PublishableTask[]> {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.publishToCalendar, true), ne(tasks.status, "skipped"), isNotNull(tasks.planDate), gte(tasks.planDate, today), lte(tasks.planDate, addDays(today, 30))));
  return rows.map((t) => ({ id: t.id, title: t.title, planDate: t.planDate!, startTime: t.startTime, durationMin: t.durationMin, notes: t.notes }));
}

export async function previewPublish(db: DB, userId: string, tz: string, today: LocalDate): Promise<PublishPlan> {
  const [wanted, pubs] = await Promise.all([publishCandidates(db, userId, today), db.select().from(calendarPublications).where(eq(calendarPublications.userId, userId))]);
  return planPublish(userId, wanted, pubs, tz);
}

/** Apply a publish plan. Each step records its result so a retry resumes safely. */
export async function applyPublish(db: DB, userId: string, tz: string, today: LocalDate, fetchImpl: FetchLike = fetch) {
  const row = await getIntegration(db, userId);
  const settings = (row?.settings ?? {}) as CalendarSettings;
  if (!row || row.status !== "connected" || !row.scopes.includes(SCOPES.publish)) throw new CalendarError("Publishing is not enabled. Grant publishing access first.", "forbidden");
  const client = await clientFor(db, userId, fetchImpl);
  let calendarId = settings.appCalendarId ?? null;
  if (!calendarId) {
    calendarId = (await client.createCalendar(APP_CALENDAR_NAME, tz)).id;
    await db.update(integrations).set({ settings: { ...settings, appCalendarId: calendarId } }).where(eq(integrations.id, row.id));
  }
  const plan = await previewPublish(db, userId, tz, today);
  const results = { created: 0, updated: 0, removed: 0, failed: 0 };
  for (const item of [...plan.create, ...plan.update]) {
    try {
      const r = await client.upsertEvent(calendarId, item.body);
      results[r === "created" ? "created" : "updated"]++;
      const values = { userId, taskId: item.task.id, calendarId, eventId: item.body.id, contentHash: contentHash(item.body), status: "published" as const, lastError: null };
      await db.insert(calendarPublications).values(values).onConflictDoUpdate({ target: [calendarPublications.userId, calendarPublications.taskId], set: values });
    } catch (e) {
      results.failed++;
      if (e instanceof CalendarError && (e.kind === "revoked" || e.kind === "rate_limited")) throw e;
    }
  }
  for (const r of plan.remove) {
    try {
      await client.deleteEvent(calendarId, r.eventId);
      await db.update(calendarPublications).set({ status: "deleted" }).where(and(eq(calendarPublications.userId, userId), eq(calendarPublications.taskId, r.taskId)));
      results.removed++;
    } catch {
      results.failed++;
    }
  }
  await db.update(integrations).set({ lastSyncAt: new Date(), lastError: results.failed ? `${results.failed} change(s) failed and will be retried on the next publish.` : null }).where(eq(integrations.id, row.id));
  return results;
}

/**
 * Disconnect: optionally delete events this app published (only on its own calendar),
 * revoke the token with Google, and erase stored credentials and cached events.
 */
export async function disconnectGoogleCalendar(db: DB, userId: string, opts: { deletePublishedEvents: boolean }, fetchImpl: FetchLike = fetch) {
  const row = await getIntegration(db, userId);
  if (!row) return;
  const settings = (row.settings ?? {}) as CalendarSettings;
  if (opts.deletePublishedEvents && row.status === "connected" && settings.appCalendarId) {
    try {
      const client = await clientFor(db, userId, fetchImpl);
      const pubs = await db.select().from(calendarPublications).where(and(eq(calendarPublications.userId, userId), eq(calendarPublications.status, "published")));
      for (const p of pubs) await client.deleteEvent(settings.appCalendarId, p.eventId);
    } catch (e) {
      log.warn("calendar.disconnect_cleanup_failed", { userId, kind: e instanceof CalendarError ? e.kind : "unknown" });
    }
  }
  if (row.encryptedRefreshToken) {
    try {
      await fetchImpl(`${REVOKE_URL}?token=${encodeURIComponent(decryptSecret(row.encryptedRefreshToken))}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    } catch {
      log.warn("calendar.revoke_failed", { userId });
    }
  }
  await db.delete(externalEvents).where(eq(externalEvents.userId, userId));
  await db.delete(calendarPublications).where(eq(calendarPublications.userId, userId));
  await db.update(integrations).set({ status: "disconnected", encryptedRefreshToken: null, encryptedAccessToken: null, accessTokenExpiresAt: null, scopes: [], lastError: null, settings: {} }).where(eq(integrations.id, row.id));
}
