import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { DB } from "@/db";
import {
  budgets,
  categories,
  finAccounts,
  holdings,
  recurringItems,
  transactionSplits,
  transactions,
  type TxnType,
} from "@/db/schema";
import { LedgerValidationError, validateTxn, type LedgerAccount, type LedgerCategory, type LedgerTxn } from "@/lib/finance/ledger";
import type { RecurringLike } from "@/lib/finance/forecast";

export class OwnershipError extends Error {
  constructor() {
    super("Not found");
  }
}

/* ---------------- Loading ---------------- */

export async function loadAccounts(db: DB, userId: string): Promise<(LedgerAccount & { institution: string | null; creditLimit: number | null })[]> {
  const rows = await db.select().from(finAccounts).where(eq(finAccounts.userId, userId)).orderBy(asc(finAccounts.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    openingBalance: r.openingBalance,
    openingDate: r.openingDate,
    includeInNetWorth: r.includeInNetWorth,
    archived: r.archived,
    institution: r.institution,
    creditLimit: r.creditLimit,
  }));
}

export async function loadCategories(db: DB, userId: string): Promise<(LedgerCategory & { color: string; archived: boolean })[]> {
  const rows = await db.select().from(categories).where(eq(categories.userId, userId)).orderBy(asc(categories.name));
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, essential: r.essential, color: r.color, archived: r.archived }));
}

export type TxnRow = LedgerTxn & {
  description: string;
  merchant: string | null;
  notes: string | null;
  tags: string[];
  paymentMethod: string | null;
  refundOfId: string | null;
  importBatchId: string | null;
  createdAt: Date;
};

/** Load transactions with their splits, optionally within a date range. */
export async function loadTransactions(
  db: DB,
  userId: string,
  range?: { from?: string; to?: string },
): Promise<TxnRow[]> {
  const conds = [eq(transactions.userId, userId)];
  if (range?.from) conds.push(gte(transactions.date, range.from));
  if (range?.to) conds.push(lte(transactions.date, range.to));
  const rows = await db
    .select()
    .from(transactions)
    .where(and(...conds))
    .orderBy(desc(transactions.date), desc(transactions.createdAt));
  if (rows.length === 0) return [];
  const splits = await db
    .select()
    .from(transactionSplits)
    .where(and(eq(transactionSplits.userId, userId), inArray(transactionSplits.transactionId, rows.map((r) => r.id))));
  const byTxn = new Map<string, { categoryId: string | null; amount: number }[]>();
  for (const s of splits) {
    const list = byTxn.get(s.transactionId) ?? [];
    list.push({ categoryId: s.categoryId, amount: s.amount });
    byTxn.set(s.transactionId, list);
  }
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    date: r.date,
    amount: r.amount,
    accountId: r.accountId,
    toAccountId: r.toAccountId,
    splits: byTxn.get(r.id) ?? [],
    description: r.description,
    merchant: r.merchant,
    notes: r.notes,
    tags: r.tags,
    paymentMethod: r.paymentMethod,
    refundOfId: r.refundOfId,
    importBatchId: r.importBatchId,
    createdAt: r.createdAt,
  }));
}

export async function loadBudgets(db: DB, userId: string, month: string) {
  return db.select().from(budgets).where(and(eq(budgets.userId, userId), eq(budgets.month, month)));
}

export async function loadRecurring(db: DB, userId: string) {
  const rows = await db.select().from(recurringItems).where(eq(recurringItems.userId, userId)).orderBy(asc(recurringItems.nextDueDate));
  return rows;
}

export function toRecurringLike(rows: Awaited<ReturnType<typeof loadRecurring>>): RecurringLike[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    direction: r.direction,
    kind: r.kind,
    amount: r.amount,
    frequency: r.frequency,
    nextDueDate: r.nextDueDate,
    accountId: r.accountId,
    essential: r.essential,
    active: r.active,
  }));
}

export async function loadHoldings(db: DB, userId: string) {
  return db.select().from(holdings).where(eq(holdings.userId, userId)).orderBy(desc(holdings.value));
}

/* ---------------- Ownership checks ---------------- */

/** Throws unless every referenced account belongs to the user. */
export async function assertAccountsOwned(db: DB, userId: string, ids: (string | null | undefined)[]) {
  const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (wanted.length === 0) return;
  const found = await db
    .select({ id: finAccounts.id })
    .from(finAccounts)
    .where(and(eq(finAccounts.userId, userId), inArray(finAccounts.id, wanted)));
  if (found.length !== wanted.length) throw new OwnershipError();
}

export async function assertCategoriesOwned(db: DB, userId: string, ids: (string | null | undefined)[]) {
  const wanted = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (wanted.length === 0) return;
  const found = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), inArray(categories.id, wanted)));
  if (found.length !== wanted.length) throw new OwnershipError();
}

/* ---------------- Mutations ---------------- */

export type TxnInput = {
  type: TxnType;
  date: string;
  amount: number;
  accountId: string;
  toAccountId?: string | null;
  description: string;
  merchant?: string | null;
  notes?: string | null;
  tags?: string[];
  paymentMethod?: string | null;
  refundOfId?: string | null;
  splits: { categoryId: string | null; amount: number }[];
  importBatchId?: string | null;
  fingerprint?: string | null;
  recurringId?: string | null;
};

export async function createTransaction(db: DB, userId: string, input: TxnInput): Promise<string> {
  validateTxn(input);
  await assertAccountsOwned(db, userId, [input.accountId, input.toAccountId]);
  await assertCategoriesOwned(db, userId, input.splits.map((s) => s.categoryId));
  if (input.refundOfId) {
    const [orig] = await db
      .select({ id: transactions.id, type: transactions.type })
      .from(transactions)
      .where(and(eq(transactions.id, input.refundOfId), eq(transactions.userId, userId)));
    if (!orig) throw new OwnershipError();
    if (orig.type !== "expense") throw new LedgerValidationError("Refunds can only be linked to expenses");
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(transactions)
      .values({
        userId,
        type: input.type,
        date: input.date,
        amount: input.amount,
        accountId: input.accountId,
        toAccountId: input.type === "transfer" ? input.toAccountId : null,
        description: input.description,
        merchant: input.merchant ?? null,
        notes: input.notes ?? null,
        tags: input.tags ?? [],
        paymentMethod: input.paymentMethod ?? null,
        refundOfId: input.refundOfId ?? null,
        importBatchId: input.importBatchId ?? null,
        fingerprint: input.fingerprint ?? null,
        recurringId: input.recurringId ?? null,
      })
      .returning({ id: transactions.id });
    if (input.type !== "transfer" && input.splits.length) {
      await tx.insert(transactionSplits).values(input.splits.map((s) => ({ transactionId: row.id, userId, categoryId: s.categoryId, amount: s.amount })));
    }
    return row.id;
  });
}

export async function updateTransaction(db: DB, userId: string, id: string, input: TxnInput): Promise<void> {
  validateTxn(input);
  const [existing] = await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  if (!existing) throw new OwnershipError();
  await assertAccountsOwned(db, userId, [input.accountId, input.toAccountId]);
  await assertCategoriesOwned(db, userId, input.splits.map((s) => s.categoryId));
  await db.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({
        type: input.type,
        date: input.date,
        amount: input.amount,
        accountId: input.accountId,
        toAccountId: input.type === "transfer" ? input.toAccountId : null,
        description: input.description,
        merchant: input.merchant ?? null,
        notes: input.notes ?? null,
        tags: input.tags ?? [],
        paymentMethod: input.paymentMethod ?? null,
      })
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
    await tx.delete(transactionSplits).where(and(eq(transactionSplits.transactionId, id), eq(transactionSplits.userId, userId)));
    if (input.type !== "transfer" && input.splits.length) {
      await tx.insert(transactionSplits).values(input.splits.map((s) => ({ transactionId: id, userId, categoryId: s.categoryId, amount: s.amount })));
    }
  });
}

export async function deleteTransaction(db: DB, userId: string, id: string): Promise<boolean> {
  const res = await db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId))).returning({ id: transactions.id });
  return res.length > 0;
}

/** Count of uncategorised expense splits in a date range (for the categorise quest). */
export async function countUncategorised(db: DB, userId: string, from: string, to: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactions.id, transactionSplits.transactionId))
    .where(
      and(
        eq(transactionSplits.userId, userId),
        sql`${transactionSplits.categoryId} is null`,
        gte(transactions.date, from),
        lte(transactions.date, to),
      ),
    );
  return r?.n ?? 0;
}
