/**
 * Forecasts from known commitments. Forecasts are always kept separate from actual
 * transactions and are labelled as projections in the UI.
 */
import { addDays, addMonths, diffDays, type LocalDate } from "@/lib/dates";
import type { Paise } from "@/lib/money";

export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly";

export type RecurringLike = {
  id: string;
  name: string;
  direction: "outflow" | "inflow";
  kind: string;
  amount: Paise;
  frequency: Frequency;
  nextDueDate: LocalDate;
  accountId?: string | null;
  essential: boolean;
  active: boolean;
};

export function advanceDueDate(d: LocalDate, f: Frequency, anchorDay?: number): LocalDate {
  switch (f) {
    case "weekly":
      return addDays(d, 7);
    case "monthly":
      return addMonths(d, 1, anchorDay);
    case "quarterly":
      return addMonths(d, 3, anchorDay);
    case "yearly":
      return addMonths(d, 12, anchorDay);
  }
}

export type Occurrence = { itemId: string; name: string; date: LocalDate; amount: Paise; direction: "outflow" | "inflow"; essential: boolean; kind: string; accountId?: string | null };

/** All occurrences of active items within [from, to]. */
export function occurrencesBetween(items: RecurringLike[], from: LocalDate, to: LocalDate): Occurrence[] {
  const out: Occurrence[] = [];
  for (const it of items) {
    if (!it.active) continue;
    const anchor = Number(it.nextDueDate.slice(8));
    let d = it.nextDueDate;
    let guard = 0;
    while (d <= to && guard++ < 500) {
      if (d >= from) {
        out.push({ itemId: it.id, name: it.name, date: d, amount: it.amount, direction: it.direction, essential: it.essential, kind: it.kind, accountId: it.accountId });
      }
      d = advanceDueDate(d, it.frequency, anchor);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/** Monthly-equivalent cost of a recurring item (yearly / 12, weekly * 52 / 12). */
export function monthlyEquivalent(it: Pick<RecurringLike, "amount" | "frequency">): Paise {
  switch (it.frequency) {
    case "weekly":
      return Math.round((it.amount * 52) / 12);
    case "monthly":
      return it.amount;
    case "quarterly":
      return Math.round(it.amount / 3);
    case "yearly":
      return Math.round(it.amount / 12);
  }
}

export type ShortfallResult = {
  startingCash: Paise;
  lowestPoint: { date: LocalDate; balance: Paise };
  shortfall: { date: LocalDate; balance: Paise; trigger: Occurrence } | null;
  timeline: Array<{ date: LocalDate; balance: Paise; occurrence: Occurrence }>;
};

/**
 * Walk known commitments forward from today's liquid cash. Reports the first date the
 * projected balance would fall below `floor`. Only known commitments are used; everyday
 * spending is not guessed, which the UI must state.
 */
export function projectCash(
  liquidCash: Paise,
  items: RecurringLike[],
  today: LocalDate,
  horizonDays = 30,
  floor: Paise = 0,
): ShortfallResult {
  const occ = occurrencesBetween(items, today, addDays(today, horizonDays));
  // Unpaid overdue commitments are assumed to be paid today.
  for (const it of overdue(items, today)) {
    occ.push({ itemId: it.id, name: it.name, date: today, amount: it.amount, direction: it.direction, essential: it.essential, kind: it.kind, accountId: it.accountId });
  }
  let bal = liquidCash;
  let lowest = { date: today, balance: bal };
  let shortfall: ShortfallResult["shortfall"] = null;
  const timeline: ShortfallResult["timeline"] = [];
  // Inflows and outflows on the same day: apply outflows first (conservative).
  const sorted = [...occ].sort((a, b) => a.date.localeCompare(b.date) || (a.direction === "outflow" ? -1 : 1));
  for (const o of sorted) {
    bal += o.direction === "inflow" ? o.amount : -o.amount;
    timeline.push({ date: o.date, balance: bal, occurrence: o });
    if (bal < lowest.balance) lowest = { date: o.date, balance: bal };
    if (!shortfall && bal < floor) shortfall = { date: o.date, balance: bal, trigger: o };
  }
  return { startingCash: liquidCash, lowestPoint: lowest, shortfall, timeline };
}

export function dueSoon(items: RecurringLike[], today: LocalDate, withinDays: number) {
  return occurrencesBetween(items, today, addDays(today, withinDays))
    .filter((o) => o.direction === "outflow")
    .map((o) => ({ ...o, daysAway: diffDays(o.date, today) }));
}

/** Items past their due date that have not been marked paid / advanced. */
export function overdue(items: RecurringLike[], today: LocalDate) {
  return items.filter((i) => i.active && i.direction === "outflow" && i.nextDueDate < today);
}
