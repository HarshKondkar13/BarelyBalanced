/**
 * Day planning logic: conflicts, realistic capacity with buffers, and gentle
 * suggestions when tasks keep slipping. Pure functions; times are local "HH:MM".
 */
import { minutesToTime, timeToMinutes, type LocalDate } from "@/lib/dates";

export type Block = {
  id: string;
  title: string;
  start: string; // HH:MM local
  durationMin: number;
  source: "task" | "calendar";
  allDay?: boolean;
};

export type Conflict = { a: Block; b: Block; overlapMin: number };

export function findConflicts(blocks: Block[]): Conflict[] {
  const timed = blocks.filter((b) => !b.allDay).sort((x, y) => timeToMinutes(x.start) - timeToMinutes(y.start));
  const out: Conflict[] = [];
  for (let i = 0; i < timed.length; i++) {
    const aStart = timeToMinutes(timed[i].start);
    const aEnd = aStart + timed[i].durationMin;
    for (let j = i + 1; j < timed.length; j++) {
      const bStart = timeToMinutes(timed[j].start);
      if (bStart >= aEnd) break;
      const bEnd = bStart + timed[j].durationMin;
      out.push({ a: timed[i], b: timed[j], overlapMin: Math.min(aEnd, bEnd) - bStart });
    }
  }
  return out;
}

export type Capacity = {
  windowMin: number;
  committedMin: number; // fixed calendar events + timed tasks
  flexibleMin: number; // untimed tasks
  bufferMin: number;
  freeMin: number; // may be negative = overcommitted
  overcommitted: boolean;
};

/**
 * Realistic capacity: the planning window minus commitments, minus a buffer (default 20%
 * of planned work) for transitions and the unexpected.
 */
export function dayCapacity(
  blocks: Block[],
  flexibleTaskMinutes: number[],
  window = { start: "08:00", end: "21:00" },
  bufferRatio = 0.2,
): Capacity {
  const windowMin = timeToMinutes(window.end) - timeToMinutes(window.start);
  const committedMin = mergedMinutes(blocks.filter((b) => !b.allDay), window);
  const flexibleMin = flexibleTaskMinutes.reduce((a, b) => a + b, 0);
  const bufferMin = Math.round((committedMin + flexibleMin) * bufferRatio);
  const freeMin = windowMin - committedMin - flexibleMin - bufferMin;
  return { windowMin, committedMin, flexibleMin, bufferMin, freeMin, overcommitted: freeMin < 0 };
}

function mergedMinutes(blocks: Block[], window: { start: string; end: string }) {
  const ws = timeToMinutes(window.start);
  const we = timeToMinutes(window.end);
  const ranges = blocks
    .map((b) => [Math.max(ws, timeToMinutes(b.start)), Math.min(we, timeToMinutes(b.start) + b.durationMin)] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const [s, e] of ranges) {
    if (!cur || s > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [s, e];
    } else cur[1] = Math.max(cur[1], e);
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

/** First free slot of `durationMin` after `after`, leaving `gapMin` around existing blocks. */
export function findFreeSlot(
  blocks: Block[],
  durationMin: number,
  window = { start: "08:00", end: "21:00" },
  after?: string,
  gapMin = 10,
): string | null {
  const ws = Math.max(timeToMinutes(window.start), after ? timeToMinutes(after) : 0);
  const we = timeToMinutes(window.end);
  const busy = blocks
    .filter((b) => !b.allDay)
    .map((b) => [timeToMinutes(b.start) - gapMin, timeToMinutes(b.start) + b.durationMin + gapMin] as const)
    .sort((a, b) => a[0] - b[0]);
  let cursor = Math.ceil(ws / 15) * 15;
  for (const [s, e] of busy) {
    if (cursor + durationMin <= s) return minutesToTime(cursor);
    if (e > cursor) cursor = Math.ceil(e / 15) * 15;
  }
  return cursor + durationMin <= we ? minutesToTime(cursor) : null;
}

export type SlipSuggestion = {
  taskId: string;
  title: string;
  carryCount: number;
  suggestion: "reduce_scope" | "move_time" | "drop_or_park";
  message: string;
};

/**
 * Suggest changes for tasks that keep getting carried forward. Wording is neutral:
 * the plan was unrealistic, not the person.
 */
export function slipSuggestions(
  tasks: Array<{ id: string; title: string; carryCount: number; durationMin: number; startTime: string | null }>,
): SlipSuggestion[] {
  const out: SlipSuggestion[] = [];
  for (const t of tasks) {
    if (t.carryCount < 2) continue;
    if (t.carryCount >= 4) {
      out.push({ taskId: t.id, title: t.title, carryCount: t.carryCount, suggestion: "drop_or_park", message: `"${t.title}" has moved ${t.carryCount} times. It may not be a priority right now. Park it in the inbox, or keep it and pick a specific day.` });
    } else if (t.durationMin >= 45) {
      out.push({ taskId: t.id, title: t.title, carryCount: t.carryCount, suggestion: "reduce_scope", message: `"${t.title}" keeps slipping. Try a ${Math.max(15, Math.round(t.durationMin / 3 / 5) * 5)}-minute first step instead of ${t.durationMin} minutes.` });
    } else {
      out.push({ taskId: t.id, title: t.title, carryCount: t.carryCount, suggestion: "move_time", message: `"${t.title}" has slipped ${t.carryCount} times${t.startTime ? ` at ${t.startTime}` : ""}. A different time of day might work better.` });
    }
  }
  return out;
}

/** Recurring routine occurrence check. daysOfWeek: 0 = Sunday. */
export function routineOccursOn(daysOfWeek: number[], date: LocalDate): boolean {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return daysOfWeek.includes(dow);
}
