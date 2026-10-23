import { describe, expect, it } from "vitest";
import {
  budgetVariance,
  computeBalances,
  computeNetWorth,
  refundSplitsFromOriginal,
  summarizePeriod,
  validateTxn,
  type LedgerAccount,
  type LedgerTxn,
} from "@/lib/finance/ledger";
import { allocate } from "@/lib/money";

const accounts: LedgerAccount[] = [
  { id: "bank", name: "HDFC Savings", type: "bank", openingBalance: 50_000_00, openingDate: "2026-10-01", includeInNetWorth: true },
  { id: "card", name: "Credit card", type: "credit_card", openingBalance: 2_000_00, openingDate: "2026-10-01", includeInNetWorth: true },
  { id: "cash", name: "Cash", type: "cash", openingBalance: 1_000_00, openingDate: "2026-10-01", includeInNetWorth: false },
];

const t = (p: Partial<LedgerTxn> & Pick<LedgerTxn, "id" | "type" | "amount">): LedgerTxn => ({
  date: "2026-10-05",
  accountId: "bank",
  splits: p.type === "transfer" ? [] : [{ categoryId: p.type === "income" ? "salary" : "dining", amount: p.amount }],
  ...p,
});

describe("balances", () => {
  it("opening balance is a starting point, not income", () => {
    const s = summarizePeriod([], "2026-10-01", "2026-10-31");
    expect(s.income).toBe(0);
    const b = computeBalances(accounts, []);
    expect(b.get("bank")!.balance).toBe(50_000_00);
    expect(b.get("card")!.owed).toBe(2_000_00);
  });

  it("credit card purchase + bill payment counts spending once", () => {
    const txns = [
      t({ id: "1", type: "expense", amount: 3_000_00, accountId: "card" }),
      t({ id: "2", type: "transfer", amount: 5_000_00, accountId: "bank", toAccountId: "card", date: "2026-10-20" }),
    ];
    const s = summarizePeriod(txns, "2026-10-01", "2026-10-31");
    expect(s.spending).toBe(3_000_00); // the payment is not spending
    expect(s.income).toBe(0);
    const b = computeBalances(accounts, txns);
    expect(b.get("card")!.owed).toBe(0); // 2000 + 3000 - 5000
    expect(b.get("bank")!.balance).toBe(45_000_00);
  });

  it("transfers never change income, spending, or total net worth", () => {
    const txns = [t({ id: "1", type: "transfer", amount: 10_000_00, accountId: "bank", toAccountId: "cash" })];
    const s = summarizePeriod(txns, "2026-10-01", "2026-10-31");
    expect(s.income).toBe(0);
    expect(s.spending).toBe(0);
    const all = accounts.map((a) => ({ ...a, includeInNetWorth: true }));
    const before = computeNetWorth(all, computeBalances(all, []), []).total;
    const after = computeNetWorth(all, computeBalances(all, txns), []).total;
    expect(after).toBe(before);
  });

  it("ignores transactions dated before an account's opening date", () => {
    const b = computeBalances(accounts, [t({ id: "1", type: "expense", amount: 100_00, date: "2026-09-30" })]);
    expect(b.get("bank")!.balance).toBe(50_000_00);
  });

  it("respects asOf", () => {
    const txns = [t({ id: "1", type: "income", amount: 80_000_00, date: "2026-10-31" })];
    expect(computeBalances(accounts, txns, "2026-10-30").get("bank")!.balance).toBe(50_000_00);
    expect(computeBalances(accounts, txns, "2026-10-31").get("bank")!.balance).toBe(130_000_00);
  });
});

describe("refunds", () => {
  it("reduce spending in the refunded category, not count as income", () => {
    const txns = [
      t({ id: "1", type: "expense", amount: 2_000_00 }),
      t({ id: "2", type: "refund", amount: 500_00, date: "2026-10-07" }),
      t({ id: "3", type: "income", amount: 80_000_00 }),
    ];
    const s = summarizePeriod(txns, "2026-10-01", "2026-10-31");
    expect(s.grossSpending).toBe(2_000_00);
    expect(s.refunds).toBe(500_00);
    expect(s.spending).toBe(1_500_00);
    expect(s.income).toBe(80_000_00);
    expect(s.byCategory.get("dining")).toBe(1_500_00);
  });

  it("refund on a credit card reduces the amount owed", () => {
    const b = computeBalances(accounts, [t({ id: "1", type: "refund", amount: 500_00, accountId: "card" })]);
    expect(b.get("card")!.owed).toBe(1_500_00);
  });

  it("mirrors the original split proportionally and exactly", () => {
    const original = t({ id: "o", type: "expense", amount: 3_000_00, splits: [
      { categoryId: "groceries", amount: 2_000_00 },
      { categoryId: "household", amount: 1_000_00 },
    ] });
    const splits = refundSplitsFromOriginal(original, 1_000_01, allocate);
    expect(splits.reduce((a, s) => a + s.amount, 0)).toBe(1_000_01);
    expect(splits[0].categoryId).toBe("groceries");
  });
});

describe("validation", () => {
  it("requires splits to sum to the amount", () => {
    expect(() => validateTxn({ type: "expense", amount: 100, date: "2026-10-01", accountId: "bank", splits: [{ categoryId: "a", amount: 60 }] })).toThrow(/add up/);
  });
  it("rejects transfers to the same account and transfers with categories", () => {
    expect(() => validateTxn({ type: "transfer", amount: 100, date: "2026-10-01", accountId: "bank", toAccountId: "bank", splits: [] })).toThrow();
    expect(() => validateTxn({ type: "transfer", amount: 100, date: "2026-10-01", accountId: "bank", toAccountId: "card", splits: [{ categoryId: "x", amount: 100 }] })).toThrow();
  });
  it("rejects zero, negative and fractional paise", () => {
    expect(() => validateTxn({ type: "expense", amount: 0, date: "2026-10-01", accountId: "bank", splits: [] })).toThrow();
    expect(() => validateTxn({ type: "expense", amount: 10.5, date: "2026-10-01", accountId: "bank", splits: [{ categoryId: "a", amount: 10.5 }] })).toThrow();
  });
});

describe("savings rate and budgets", () => {
  it("defines savings rate as (income - spending) / income; transfers to savings are saved", () => {
    const txns = [
      t({ id: "1", type: "income", amount: 100_000_00 }),
      t({ id: "2", type: "expense", amount: 60_000_00 }),
      t({ id: "3", type: "transfer", amount: 20_000_00, accountId: "bank", toAccountId: "cash" }),
    ];
    const s = summarizePeriod(txns, "2026-10-01", "2026-10-31");
    expect(s.savingsRate).toBeCloseTo(0.4);
  });
  it("is null when there is no income", () => {
    expect(summarizePeriod([t({ id: "1", type: "expense", amount: 100 })], "2026-10-01", "2026-10-31").savingsRate).toBeNull();
  });
  it("computes budget variance with refunds applied", () => {
    const txns = [
      t({ id: "1", type: "expense", amount: 6_000_00 }),
      t({ id: "2", type: "refund", amount: 1_000_00 }),
    ];
    const s = summarizePeriod(txns, "2026-10-01", "2026-10-31");
    const v = budgetVariance([{ categoryId: "dining", amount: 4_000_00 }], s, 0.5);
    expect(v.lines[0].spent).toBe(5_000_00);
    expect(v.lines[0].remaining).toBe(-1_000_00);
    expect(v.lines[0].status).toBe("over");
  });
});

describe("net worth disclosure", () => {
  it("lists excluded accounts and includes dated holdings", () => {
    const b = computeBalances(accounts, []);
    const nw = computeNetWorth(accounts, b, [
      { id: "h1", name: "Index fund", value: 25_000_00, valuationDate: "2026-10-15", includeInNetWorth: true },
    ]);
    expect(nw.total).toBe(50_000_00 - 2_000_00 + 25_000_00);
    expect(nw.excluded.map((e) => e.id)).toEqual(["cash"]);
    expect(nw.oldestValuationDate).toBe("2026-10-15");
  });
});
