/**
 * Date helpers. "Local dates" are YYYY-MM-DD strings in the user's timezone
 * (default Asia/Kolkata). Arithmetic on local dates is done in UTC so DST and
 * server timezone never shift a calendar day.
 */

export const DEFAULT_TZ = "Asia/Kolkata";

export type LocalDate = string; // YYYY-MM-DD

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(s: string): s is LocalDate {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** The calendar date of `instant` in `tz`. */
export function toLocalDate(instant: Date, tz: string = DEFAULT_TZ): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function todayLocal(tz: string = DEFAULT_TZ, now: Date = new Date()): LocalDate {
  return toLocalDate(now, tz);
}

/** "HH:MM" wall-clock time of `instant` in `tz`. */
export function toLocalTime(instant: Date, tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

/** Minutes east of UTC for `tz` at `instant` (e.g. +330 for Asia/Kolkata). */
export function tzOffsetMinutes(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** Convert a local date + "HH:MM" in `tz` to a UTC instant. */
export function localDateTimeToInstant(date: LocalDate, time: string, tz: string = DEFAULT_TZ): Date {
  const [h, m] = time.split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m);
  // Two passes handle offsets that change across the guessed instant (DST zones).
  let offset = tzOffsetMinutes(new Date(guess), tz);
  let instant = guess - offset * 60000;
  const offset2 = tzOffsetMinutes(new Date(instant), tz);
  if (offset2 !== offset) {
    offset = offset2;
    instant = guess - offset * 60000;
  }
  return new Date(instant);
}

function toUtc(d: LocalDate): Date {
  return new Date(`${d}T00:00:00Z`);
}
function fromUtc(d: Date): LocalDate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: LocalDate, n: number): LocalDate {
  const x = toUtc(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUtc(x);
}

/** Add months, clamping to the last day of the target month (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: LocalDate, n: number, anchorDay?: number): LocalDate {
  const [y, m, day] = d.split("-").map(Number);
  const targetIndex = y * 12 + (m - 1) + n;
  const ty = Math.floor(targetIndex / 12);
  const tm = targetIndex % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const dd = Math.min(anchorDay ?? day, last);
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtc(a).getTime() - toUtc(b).getTime()) / 86400000);
}

/** 0 = Sunday ... 6 = Saturday */
export function dayOfWeek(d: LocalDate): number {
  return toUtc(d).getUTCDay();
}

/** Start of the week containing d. weekStartsOn: 0 = Sunday, 1 = Monday. */
export function startOfWeek(d: LocalDate, weekStartsOn = 1): LocalDate {
  const dow = dayOfWeek(d);
  const delta = (dow - weekStartsOn + 7) % 7;
  return addDays(d, -delta);
}

export function monthKey(d: LocalDate): string {
  return d.slice(0, 7);
}

export function startOfMonth(month: string): LocalDate {
  return `${month}-01`;
}

export function endOfMonth(month: string): LocalDate {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

export function addMonthsToKey(month: string, n: number): string {
  return addMonths(`${month}-01`, n).slice(0, 7);
}

export function daysInMonth(month: string): number {
  return Number(endOfMonth(month).slice(8));
}

export function eachDay(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** ISO-8601 week id, e.g. "2026-W43". Used for idempotency keys. */
export function isoWeekId(d: LocalDate): string {
  const date = toUtc(d);
  const dow = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - dow + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const dateFmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(key: string, opts: Intl.DateTimeFormatOptions) {
  let f = dateFmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: "UTC" });
    dateFmtCache.set(key, f);
  }
  return f;
}

/** "23 Oct" */
export function formatShortDate(d: LocalDate): string {
  return fmt("short", { day: "numeric", month: "short" }).format(toUtc(d));
}
/** "Fri, 23 Oct 2026" */
export function formatLongDate(d: LocalDate): string {
  return fmt("long", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(toUtc(d));
}
/** "October 2026" */
export function formatMonth(month: string): string {
  return fmt("month", { month: "long", year: "numeric" }).format(toUtc(`${month}-01`));
}
export function formatWeekday(d: LocalDate): string {
  return fmt("weekday", { weekday: "long" }).format(toUtc(d));
}

export function relativeDayLabel(d: LocalDate, today: LocalDate): string {
  const diff = diffDays(d, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  if (diff < -1 && diff > -7) return `${-diff} days ago`;
  return formatShortDate(d);
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
/** "9:30 am" */
export function formatTime12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}
