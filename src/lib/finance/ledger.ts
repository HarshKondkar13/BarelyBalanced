/**
 * Deterministic ledger calculations. Pure functions over plain data so they are
 * easy to test and are the single source of truth for every figure in the UI.
 *
 * Accounting rules
 * - Opening balances are not income. They set the starting point of an account.
 * - Transfers (including credit-card bill payments) move money between accounts and
 *   are never income or spending.
 * - An expense on a credit card is spending when it happens. Paying the card later is
 *   a transfer, so the purchase is never counted twice.
 * - Refunds reduce spending in the categories they are allocated to, in the period
 *   the refund is dated.
 * - Liability accounts (credit_card, loan) are tracked internally as negative balances
 *   (money owed); `owed` is exposed for display.
 */
import type { AccountType, TxnType } from "@/db/schema";
import { endOfMonth, type LocalDate } from "@/lib/dates";
import type { Paise } from "@/lib/money";

export const LIABILITY_TYPES: AccountType[] = ["credit_card", "loan"];
export const isLiability = (t: AccountType) => LIABILITY_TYPES.includes(t);

export type LedgerAccount = {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: Paise; // for liabilities: amount owed on openingDate (positive)
  openingDate: LocalDate;
  includeInNetWorth: boolean;
  archived?: boolean;
};

export type LedgerSplit = { categoryId: string | null; amount: Paise };

export type LedgerTxn = {
  id: string;
  type: TxnType;
  date: LocalDate;
  amount: Paise; // always positive
  accountId: string;
  toAccountId?: string | null;
  splits: LedgerSplit[];
};

export type LedgerCategory = { id: string; name: string; kind: "expense" | "income"; essential: boolean };

export class LedgerValidationError extends Error {}

/** Validate a transaction's internal consistency before it is stored. */
export function validateTxn(t: Omit<LedgerTxn, "id">): void {
  if (!Number.isInteger(t.amount) || t.amount <= 0) {
    throw new LedgerValidationError("Amount must be a positive value");
  }
  if (t.type === "transfer") {
    if (!t.toAccountId) throw new LedgerValidationError("A transfer needs a destination account");
    if (t.toAccountId === t.accountId) throw new LedgerValidationError("Choose two different accounts");
    if (t.splits.length > 0) throw new LedgerValidationError("Transfers do not have categories");
    return;
  }
  if (t.toAccountId) throw new LedgerValidationError("Only transfers have a destination account");
  if (t.splits.length === 0) throw new LedgerValidationError("Choose a category");
  for (const s of t.splits) {
    if (!Number.isInteger(s.amount) || s.amount <= 0) {
      throw new LedgerValidationError("Each split must be a positive amount");
    }
  }
  const total = t.splits.reduce((a, s) => a + s.amount, 0);
  if (total !== t.amount) {
    throw new LedgerValidationError("Split amounts must add up to the transaction amount");
  }
}

/**
 * Signed effect of a transaction on each account, in asset terms
 * (positive = more money / less owed).
 */
export function accountEffects(t: LedgerTxn): Array<{ accountId: string; delta: Paise }> {
  switch (t.type) {
    case "income":
    case "refund":
      return [{ accountId: t.accountId, delta: t.amount }];
    case "expense":
      return [{ accountId: t.accountId, delta: -t.amount }];
    case "transfer":
      return [
        { accountId: t.accountId, delta: -t.amount },
        { accountId: t.toAccountId!, delta: t.amount },
      ];
  }
}

export type AccountBalance = {
  accountId: string;
  /** Asset-signed balance: negative for money owed on liabilities. */
  balance: Paise;
  /** For liabilities: positive amount owed. Null for assets. */
  owed: Paise | null;
};

/**
 * Balances as of `asOf` (inclusive). Transactions dated before an account's opening date
 * are ignored for that account, because the opening balance already reflects them.
 */
export function computeBalances(
  accounts: LedgerAccount[],
  txns: LedgerTxn[],
  asOf?: LocalDate,
): Map<string, AccountBalance> {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const bal = new Map<string, Paise>();
  for (const a of accounts) bal.set(a.id, isLiability(a.type) ? 0 - a.openingBalance : a.openingBalance);
  for (const t of txns) {
    if (asOf && t.date > asOf) continue;
    for (const e of accountEffects(t)) {
      const acct = byId.get(e.accountId);
      if (!acct || t.date < acct.openingDate) continue;
      bal.set(e.accountId, (bal.get(e.accountId) ?? 0) + e.delta);
    }
  }
  const out = new Map<string, AccountBalance>();
  for (const a of accounts) {
    const b = bal.get(a.id) ?? 0;
    out.set(a.id, { accountId: a.id, balance: b, owed: isLiability(a.type) ? 0 - b : null });
  }
  return out;
}

export type HoldingValue = {
  id: string;
  name: string;
  value: Paise;
  valuationDate: LocalDate;
  includeInNetWorth: boolean;
};

export type NetWorth = {
  total: Paise;
  assets: Paise;
  liabilities: Paise; // positive amount owed
  included: Array<{ kind: "account" | "holding"; id: string; name: string; value: Paise; asOf?: LocalDate }>;
  excluded: Array<{ kind: "account" | "holding"; id: string; name: string; value: Paise }>;
  oldestValuationDate: LocalDate | null;
};

/** Net worth with an explicit list of what is included and excluded. */
export function computeNetWorth(
  accounts: LedgerAccount[],
  balances: Map<string, AccountBalance>,
  holdings: HoldingValue[],
): NetWorth {
  const nw: NetWorth = { total: 0, assets: 0, liabilities: 0, included: [], excluded: [], oldestValuationDate: null };
  for (const a of accounts) {
    if (a.archived) continue;
    const b = balances.get(a.id)?.balance ?? 0;
    if (!a.includeInNetWorth) {
      nw.excluded.push({ kind: "account", id: a.id, name: a.name, value: b });
      continue;
    }
    nw.included.push({ kind: "account", id: a.id, name: a.name, value: b });
    if (b >= 0) nw.assets += b;
    else nw.liabilities += -b;
  }
  for (const h of holdings) {
    if (!h.includeInNetWorth) {
      nw.excluded.push({ kind: "holding", id: h.id, name: h.name, value: h.value });
      continue;
    }
    nw.included.push({ kind: "holding", id: h.id, name: h.name, value: h.value, asOf: h.valuationDate });
    nw.assets += h.value;
    if (!nw.oldestValuationDate || h.valuationDate < nw.oldestValuationDate) nw.oldestValuationDate = h.valuationDate;
  }
  nw.total = nw.assets - nw.liabilities;
  return nw;
}

export type PeriodSummary = {
  from: LocalDate;
  to: LocalDate;
  income: Paise;
  /** Gross expenses before refunds. */
  grossSpending: Paise;
  refunds: Paise;
  /** grossSpending - refunds. This is "spending" everywhere in the app. */
  spending: Paise;
  netCashFlow: Paise; // income - spending
  /**
   * Savings rate = (income - spending) / income. Transfers into savings or investment
   * accounts are not spending, so they count as saved. Null when there is no income.
   */
  savingsRate: number | null;
  byCategory: Map<string, Paise>; // net spending per expense category (null id -> "uncategorised")
  incomeByCategory: Map<string, Paise>;
  essentialSpending: Paise;
  discretionarySpending: Paise;
  txnCount: number;
};

export const UNCATEGORISED = "__uncategorised__";

export function summarizePeriod(
  txns: LedgerTxn[],
  from: LocalDate,
  to: LocalDate,
  categories: LedgerCategory[] = [],
): PeriodSummary {
  const catById = new Map(categories.map((c) => [c.id, c]));
  const s: PeriodSummary = {
    from,
    to,
    income: 0,
    grossSpending: 0,
    refunds: 0,
    spending: 0,
    netCashFlow: 0,
    savingsRate: null,
    byCategory: new Map(),
    incomeByCategory: new Map(),
    essentialSpending: 0,
    discretionarySpending: 0,
    txnCount: 0,
  };
  const addCat = (m: Map<string, Paise>, k: string | null, v: Paise) => {
    const key = k ?? UNCATEGORISED;
    m.set(key, (m.get(key) ?? 0) + v);
  };
  for (const t of txns) {
    if (t.date < from || t.date > to) continue;
    s.txnCount++;
    if (t.type === "income") {
      s.income += t.amount;
      for (const sp of t.splits) addCat(s.incomeByCategory, sp.categoryId, sp.amount);
    } else if (t.type === "expense") {
      s.grossSpending += t.amount;
      for (const sp of t.splits) addCat(s.byCategory, sp.categoryId, sp.amount);
    } else if (t.type === "refund") {
      s.refunds += t.amount;
      for (const sp of t.splits) addCat(s.byCategory, sp.categoryId, -sp.amount);
    }
  }
  s.spending = s.grossSpending - s.refunds;
  s.netCashFlow = s.income - s.spending;
  s.savingsRate = s.income > 0 ? s.netCashFlow / s.income : null;
  for (const [catId, amt] of s.byCategory) {
    if (catById.get(catId)?.essential) s.essentialSpending += amt;
    else s.discretionarySpending += amt;
  }
  return s;
}

export type BudgetLine = {
  categoryId: string;
  budget: Paise;
  spent: Paise;
  remaining: Paise; // negative when over
  usedRatio: number | null;
  status: "under" | "near" | "over";
};

/**
 * Budget variance for a month. `elapsedRatio` (0-1) lets the UI judge pace:
 * "near" means spending is ahead of how far through the month we are.
 */
export function budgetVariance(
  budgets: Array<{ categoryId: string; amount: Paise }>,
  summary: PeriodSummary,
  elapsedRatio = 1,
): { lines: BudgetLine[]; totalBudget: Paise; totalSpentInBudgeted: Paise; totalRemaining: Paise } {
  const lines: BudgetLine[] = budgets.map((b) => {
    const spent = Math.max(0, summary.byCategory.get(b.categoryId) ?? 0);
    const remaining = b.amount - spent;
    const usedRatio = b.amount > 0 ? spent / b.amount : null;
    let status: BudgetLine["status"] = "under";
    if (spent > b.amount) status = "over";
    else if (usedRatio !== null && usedRatio >= 0.85 && usedRatio > elapsedRatio + 0.1) status = "near";
    return { categoryId: b.categoryId, budget: b.amount, spent, remaining, usedRatio, status };
  });
  const totalBudget = lines.reduce((a, l) => a + l.budget, 0);
  const totalSpentInBudgeted = lines.reduce((a, l) => a + l.spent, 0);
  return { lines, totalBudget, totalSpentInBudgeted, totalRemaining: totalBudget - totalSpentInBudgeted };
}

/** Monthly series of income and spending for trend charts. */
export function monthlySeries(
  txns: LedgerTxn[],
  months: string[],
): Array<{ month: string; income: Paise; spending: Paise; net: Paise }> {
  return months.map((m) => {
    const from = `${m}-01`;
    const to = endOfMonth(m);
    const s = summarizePeriod(txns, from, to);
    return { month: m, income: s.income, spending: s.spending, net: s.netCashFlow };
  });
}

/** Default refund allocation: mirror the original expense's splits proportionally. */
export function refundSplitsFromOriginal(original: LedgerTxn, refundAmount: Paise, alloc: (a: Paise, w: number[]) => Paise[]): LedgerSplit[] {
  if (original.splits.length === 0) return [{ categoryId: null, amount: refundAmount }];
  const parts = alloc(refundAmount, original.splits.map((s) => s.amount));
  return original.splits.map((s, i) => ({ categoryId: s.categoryId, amount: parts[i] })).filter((s) => s.amount > 0);
}
