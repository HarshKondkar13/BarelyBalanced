/** Quiet-hours scheduling for notifications (pure). Times are local "HH:MM". */
import { timeToMinutes } from "@/lib/dates";

export function inQuietHours(localTime: string, quietStart: string, quietEnd: string): boolean {
  const t = timeToMinutes(localTime);
  const s = timeToMinutes(quietStart);
  const e = timeToMinutes(quietEnd);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e; // window may cross midnight
}

/** Minutes to wait until quiet hours end (0 if not in quiet hours). */
export function minutesUntilQuietEnds(localTime: string, quietStart: string, quietEnd: string): number {
  if (!inQuietHours(localTime, quietStart, quietEnd)) return 0;
  const t = timeToMinutes(localTime);
  const e = timeToMinutes(quietEnd);
  return (e - t + 1440) % 1440;
}
