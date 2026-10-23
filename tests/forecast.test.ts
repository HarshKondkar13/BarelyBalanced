import { describe, expect, it } from "vitest";
import { monthlyEquivalent, occurrencesBetween, projectCash, type RecurringLike } from "@/lib/finance/forecast";

const base: Omit<RecurringLike, "id" | "name" | "amount" | "nextDueDate" | "direction"> = {
  kind: "bill", frequency: "monthly", essential: true, active: true,
};

describe("forecast", () => {
  it("keeps month-end anchors (31st) across short months", () => {
    const occ = occurrencesBetween([{ ...base, id: "r", name: "Rent", direction: "outflow", amount: 100, nextDueDate: "2026-01-31" }], "2026-01-01", "2026-04-30");
    expect(occ.map((o) => o.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("detects the first shortfall from known commitments", () => {
    const items: RecurringLike[] = [
      { ...base, id: "rent", name: "Rent", direction: "outflow", amount: 18_000_00, nextDueDate: "2026-11-01" },
      { ...base, id: "card", name: "Card bill", direction: "outflow", amount: 9_000_00, nextDueDate: "2026-11-05" },
      { ...base, id: "sal", name: "Stipend", direction: "inflow", kind: "income", amount: 30_000_00, nextDueDate: "2026-11-07" },
    ];
    const r = projectCash(25_000_00, items, "2026-10-24", 30);
    expect(r.shortfall?.date).toBe("2026-11-05");
    expect(r.shortfall?.balance).toBe(-2_000_00);
    expect(r.lowestPoint.balance).toBe(-2_000_00);
  });

  it("treats overdue commitments as due today", () => {
    const r = projectCash(1_000_00, [{ ...base, id: "x", name: "Late bill", direction: "outflow", amount: 2_000_00, nextDueDate: "2026-10-01" }], "2026-10-24", 5);
    expect(r.shortfall?.date).toBe("2026-10-24");
  });

  it("normalises frequencies to a monthly equivalent", () => {
    expect(monthlyEquivalent({ amount: 1200_00, frequency: "yearly" })).toBe(100_00);
    expect(monthlyEquivalent({ amount: 300_00, frequency: "quarterly" })).toBe(100_00);
  });
});
