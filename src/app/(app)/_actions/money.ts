"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import {
  ACCOUNT_TYPES,
  budgets,
  categories,
  finAccounts,
  goalContributions,
  goals,
  holdings,
  ASSET_CLASSES,
  recurringItems,
  transactions,
  TXN_TYPES,
} from "@/db/schema";
import { addMonthsToKey, isLocalDate, monthKey } from "@/lib/dates";
import { LedgerValidationError } from "@/lib/finance/ledger";
import { advanceDueDate } from "@/lib/finance/forecast";
import { quarterOf, xpKey } from "@/lib/gamification/rules";
import { MoneyParseError, parseRupeesToPaise } from "@/lib/money";
import { getContext } from "@/server/context";
import { createTransaction, deleteTransaction, OwnershipError, updateTransaction, type TxnInput } from "@/server/finance";
import { awardXp, revokeXp } from "@/server/xp";
import type { ActionResult } from "./schedule";

const rupees = z.string().transform((s, ctx) => {
  try {
    return parseRupeesToPaise(s);
  } catch (e) {
    ctx.addIssue({ code: "custom", message: e instanceof MoneyParseError ? e.message : "Invalid amount" });
    return z.NEVER;
  }
});
const positiveRupees = rupees.refine((v) => v > 0, "Enter an amount greater than zero");
const localDate = z.string().refine(isLocalDate, "Enter a valid date");

function handleError(e: unknown): ActionResult {
  if (e instanceof LedgerValidationError) return { ok: false, error: e.message };
  if (e instanceof OwnershipError) return { ok: false, error: "That item could not be found" };
  throw e;
}

/* ---------------- Transactions ---------------- */

const txnSchema = z.object({
  type: z.enum(TXN_TYPES),
  date: localDate,
  amount: positiveRupees,
  accountId: z.string().uuid("Choose an account"),
  toAccountId: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1, "Add a short description").max(200),
  notes: z.string().trim().max(2000).optional().nullable(),
  tags: z.string().max(300).optional().nullable(),
  paymentMethod: z.string().max(30).optional().nullable(),
  refundOfId: z.string().uuid().optional().nullable(),
  splits: z
    .array(z.object({ categoryId: z.string().uuid().nullable(), amount: positiveRupees }))
    .max(10)
    .default([]),
});

export type TxnFormInput = z.input<typeof txnSchema>;

function toTxnInput(d: z.infer<typeof txnSchema>): TxnInput {
  let splits = d.splits;
  if (d.type === "transfer") splits = [];
  else if (splits.length === 0) splits = [{ categoryId: null, amount: d.amount }];
  else if (splits.length === 1) splits = [{ categoryId: splits[0].categoryId, amount: d.amount }];
  return {
    type: d.type,
    date: d.date,
    amount: d.amount,
    accountId: d.accountId,
    toAccountId: d.toAccountId ?? null,
    description: d.description,
    notes: d.notes ?? null,
    tags: (d.tags ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 10),
    paymentMethod: d.paymentMethod ?? null,
    refundOfId: d.refundOfId ?? null,
    splits,
  };
}

export async function saveTransactionAction(id: string | null, input: TxnFormInput): Promise<ActionResult & { id?: string }> {
  const { db, user, today } = await getContext();
  const parsed = txnSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    let savedId = id;
    if (id) await updateTransaction(db, user.id, id, toTxnInput(parsed.data));
    else savedId = await createTransaction(db, user.id, toTxnInput(parsed.data));
    let xp = 0;
    // One award per day for keeping the ledger current, regardless of how many or how large.
    if (!id && parsed.data.date === today) xp = (await awardXp(db, user.id, "daily_log", xpKey.dailyLog(today), today)).xp;
    refresh();
    return { ok: true, id: savedId ?? undefined, xp, message: id ? "Saved" : "Added" };
  } catch (e) {
    return handleError(e);
  }
}

export async function deleteTransactionAction(id: string): Promise<ActionResult> {
  const { db, user, today } = await getContext();
  const [t] = await db.select({ date: transactions.date, createdAt: transactions.createdAt }).from(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, user.id)));
  const ok = await deleteTransaction(db, user.id, id);
  if (!ok) return { ok: false, error: "Transaction not found" };
  // If this was the only entry logged today, the daily-log award no longer applies.
  if (t?.date === today) {
    const remaining = await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.userId, user.id), eq(transactions.date, today)));
    if (remaining.length === 0) await revokeXp(db, user.id, xpKey.dailyLog(today));
  }
  refresh();
  return { ok: true, message: "Deleted" };
}

/** "No spending today" still counts as keeping the ledger current. */
export async function confirmNoSpendAction(): Promise<ActionResult> {
  const { db, user, today } = await getContext();
  const r = await awardXp(db, user.id, "daily_log", xpKey.dailyLog(today), today);
  refresh();
  return { ok: true, xp: r.xp, message: "Noted: no spending today" };
}

export async function categorizeAction(txnId: string, categoryId: string): Promise<ActionResult> {
  const { db, user } = await getContext();
  const [cat] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, categoryId), eq(categories.userId, user.id)));
  if (!cat) return { ok: false, error: "Category not found" };
  const { loadTransactions } = await import("@/server/finance");
  const [t] = (await loadTransactions(db, user.id)).filter((x) => x.id === txnId);
  if (!t || t.type === "transfer") return { ok: false, error: "Transaction not found" };
  try {
    await updateTransaction(db, user.id, t.id, {
      ...t,
      toAccountId: null,
      splits: [{ categoryId, amount: t.amount }],
    });
  } catch (e) {
    return handleError(e);
  }
  refresh();
  return { ok: true };
}

/* ---------------- Accounts ---------------- */

const accountSchema = z.object({
  name: z.string().trim().min(1, "Name the account").max(80),
  type: z.enum(ACCOUNT_TYPES),
  institution: z.string().trim().max(80).optional().nullable(),
  openingBalance: rupees,
  openingDate: localDate,
  includeInNetWorth: z.boolean(),
  creditLimit: rupees.optional().nullable(),
});

export async function saveAccountAction(id: string | null, _: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { db, user } = await getContext();
  const raw = Object.fromEntries(form);
  const parsed = accountSchema.safeParse({
    ...raw,
    openingBalance: raw.openingBalance || "0",
    creditLimit: raw.creditLimit || undefined,
    includeInNetWorth: form.get("includeInNetWorth") === "on",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (id) {
    const res = await db.update(finAccounts).set(parsed.data).where(and(eq(finAccounts.id, id), eq(finAccounts.userId, user.id))).returning({ id: finAccounts.id });
    if (!res.length) return { ok: false, error: "Account not found" };
  } else {
    await db.insert(finAccounts).values({ ...parsed.data, userId: user.id });
  }
  redirect("/money/accounts");
}

export async function archiveAccountAction(id: string, archived: boolean): Promise<ActionResult> {
  const { db, user } = await getContext();
  await db.update(finAccounts).set({ archived }).where(and(eq(finAccounts.id, id), eq(finAccounts.userId, user.id)));
  refresh();
  return { ok: true };
}

/* ---------------- Categories ---------------- */

export async function saveCategoryAction(_: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { db, user } = await getContext();
  const parsed = z
    .object({ name: z.string().trim().min(1).max(60), kind: z.enum(["expense", "income"]), essential: z.boolean() })
    .safeParse({ name: form.get("name"), kind: form.get("kind"), essential: form.get("essential") === "on" });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const res = await db.insert(categories).values({ ...parsed.data, userId: user.id }).onConflictDoNothing().returning({ id: categories.id });
  if (!res.length) return { ok: false, error: "A category with that name already exists" };
  refresh();
  return { ok: true, message: "Category added" };
}

export async function updateCategoryAction(id: string, patch: { essential?: boolean; archived?: boolean; name?: string }): Promise<ActionResult> {
  const { db, user } = await getContext();
  const parsed = z.object({ essential: z.boolean().optional(), archived: z.boolean().optional(), name: z.string().trim().min(1).max(60).optional() }).safeParse(patch);
  if (!parsed.success) return { ok: false, error: "Invalid change" };
  await db.update(categories).set(parsed.data).where(and(eq(categories.id, id), eq(categories.userId, user.id)));
  refresh();
  return { ok: true };
}

/* ---------------- Budgets ---------------- */

export async function saveBudgetsAction(month: string, entries: Array<{ categoryId: string; amount: string }>): Promise<ActionResult> {
  const { db, user, today } = await getContext();
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "Invalid month" };
  const owned = new Set((await db.select({ id: categories.id }).from(categories).where(eq(categories.userId, user.id))).map((c) => c.id));
  let saved = 0;
  for (const e of entries) {
    if (!owned.has(e.categoryId)) return { ok: false, error: "Category not found" };
    if (!e.amount?.trim()) {
      await db.delete(budgets).where(and(eq(budgets.userId, user.id), eq(budgets.categoryId, e.categoryId), eq(budgets.month, month)));
      continue;
    }
    let amount: number;
    try {
      amount = parseRupeesToPaise(e.amount);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Invalid amount" };
    }
    if (amount < 0) return { ok: false, error: "Budgets cannot be negative" };
    await db
      .insert(budgets)
      .values({ userId: user.id, categoryId: e.categoryId, month, amount })
      .onConflictDoUpdate({ target: [budgets.userId, budgets.categoryId, budgets.month], set: { amount } });
    saved++;
  }
  let xp = 0;
  if (saved > 0 && (month === monthKey(today) || month === addMonthsToKey(monthKey(today), 1))) {
    xp = (await awardXp(db, user.id, "budget_set", xpKey.budgetSet(month), today)).xp;
  }
  refresh();
  return { ok: true, xp, message: "Budgets saved" };
}

export async function copyBudgetsFromPreviousAction(month: string): Promise<ActionResult> {
  const { db, user } = await getContext();
  const prev = addMonthsToKey(month, -1);
  const rows = await db.select().from(budgets).where(and(eq(budgets.userId, user.id), eq(budgets.month, prev)));
  if (!rows.length) return { ok: false, error: "No budgets last month to copy" };
  await db
    .insert(budgets)
    .values(rows.map((r) => ({ userId: user.id, categoryId: r.categoryId, month, amount: r.amount })))
    .onConflictDoNothing();
  refresh();
  return { ok: true, message: `Copied ${rows.length} budgets` };
}

/* ---------------- Recurring items: bills, subscriptions, income ---------------- */

const recurringSchema = z.object({
  name: z.string().trim().min(1).max(80),
  direction: z.enum(["outflow", "inflow"]),
  kind: z.enum(["bill", "subscription", "income", "emi", "investment", "other"]),
  amount: positiveRupees,
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  nextDueDate: localDate,
  categoryId: z.string().uuid().optional().nullable(),
  accountId: z.string().uuid().optional().nullable(),
  remindDaysBefore: z.coerce.number().int().min(0).max(30).default(2),
  essential: z.boolean(),
});

export async function saveRecurringAction(id: string | null, _: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { db, user } = await getContext();
  const raw = Object.fromEntries(form);
  const parsed = recurringSchema.safeParse({
    ...raw,
    categoryId: raw.categoryId || null,
    accountId: raw.accountId || null,
    essential: form.get("essential") === "on",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { assertAccountsOwned, assertCategoriesOwned } = await import("@/server/finance");
  try {
    await assertAccountsOwned(db, user.id, [parsed.data.accountId]);
    await assertCategoriesOwned(db, user.id, [parsed.data.categoryId]);
  } catch (e) {
    return handleError(e);
  }
  if (id) {
    await db.update(recurringItems).set(parsed.data).where(and(eq(recurringItems.id, id), eq(recurringItems.userId, user.id)));
  } else {
    await db.insert(recurringItems).values({ ...parsed.data, userId: user.id });
  }
  redirect("/money/bills");
}

/**
 * Mark a commitment as paid: records the actual transaction (or transfer for card bills
 * paid from a bank) and advances the due date. Idempotent per due date via the linkRef task index.
 */
export async function markRecurringPaidAction(id: string, opts: { amount?: string; fromAccountId?: string; toAccountId?: string | null }): Promise<ActionResult> {
  const { db, user, today } = await getContext();
  const [r] = await db.select().from(recurringItems).where(and(eq(recurringItems.id, id), eq(recurringItems.userId, user.id)));
  if (!r) return { ok: false, error: "Not found" };
  let amount = r.amount;
  if (opts.amount) {
    try {
      amount = parseRupeesToPaise(opts.amount);
    } catch {
      return { ok: false, error: "Invalid amount" };
    }
  }
  const accountId = opts.fromAccountId || r.accountId;
  if (!accountId) return { ok: false, error: "Choose which account paid this" };
  try {
    if (opts.toAccountId) {
      await createTransaction(db, user.id, { type: "transfer", date: today, amount, accountId, toAccountId: opts.toAccountId, description: r.name, splits: [], recurringId: r.id });
    } else {
      await createTransaction(db, user.id, {
        type: r.direction === "inflow" ? "income" : "expense",
        date: today,
        amount,
        accountId,
        description: r.name,
        splits: [{ categoryId: r.categoryId, amount }],
        recurringId: r.id,
      });
    }
  } catch (e) {
    return handleError(e);
  }
  const anchor = Number(r.nextDueDate.slice(8));
  await db.update(recurringItems).set({ nextDueDate: advanceDueDate(r.nextDueDate, r.frequency, anchor) }).where(eq(recurringItems.id, r.id));
  const xp = (await awardXp(db, user.id, "daily_log", xpKey.dailyLog(today), today)).xp;
  refresh();
  return { ok: true, xp, message: `Recorded ${r.name}` };
}

export async function skipRecurringOccurrenceAction(id: string): Promise<ActionResult> {
  const { db, user } = await getContext();
  const [r] = await db.select().from(recurringItems).where(and(eq(recurringItems.id, id), eq(recurringItems.userId, user.id)));
  if (!r) return { ok: false, error: "Not found" };
  await db.update(recurringItems).set({ nextDueDate: advanceDueDate(r.nextDueDate, r.frequency, Number(r.nextDueDate.slice(8))) }).where(eq(recurringItems.id, r.id));
  refresh();
  return { ok: true, message: "Skipped this occurrence" };
}

/** Deliberate subscription review: keep, or pause/cancel. Earns XP once per item per quarter. */
export async function reviewSubscriptionAction(id: string, decision: "keep" | "cancel"): Promise<ActionResult> {
  const { db, user, today } = await getContext();
  const res = await db
    .update(recurringItems)
    .set({ lastReviewedAt: new Date(), ...(decision === "cancel" ? { active: false } : {}) })
    .where(and(eq(recurringItems.id, id), eq(recurringItems.userId, user.id)))
    .returning({ id: recurringItems.id });
  if (!res.length) return { ok: false, error: "Not found" };
  const xp = (await awardXp(db, user.id, "subscription_review", xpKey.subscriptionReview(id, quarterOf(today)), today)).xp;
  refresh();
  return { ok: true, xp, message: decision === "cancel" ? "Marked as cancelled. Remember to cancel with the provider too." : "Kept: reviewed" };
}

export async function deleteRecurringAction(id: string): Promise<ActionResult> {
  const { db, user } = await getContext();
  await db.delete(recurringItems).where(and(eq(recurringItems.id, id), eq(recurringItems.userId, user.id)));
  refresh();
  return { ok: true };
}

/* ---------------- Goals ---------------- */

const goalSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["emergency", "purchase", "education", "travel", "retirement", "other"]),
  targetAmount: positiveRupees,
  targetDate: localDate.optional().nullable(),
  priority: z.coerce.number().int().min(1).max(3),
  plannedMonthly: rupees.optional().nullable(),
});

export async function saveGoalAction(id: string | null, _: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { db, user } = await getContext();
  const raw = Object.fromEntries(form);
  const parsed = goalSchema.safeParse({ ...raw, targetDate: raw.targetDate || null, plannedMonthly: raw.plannedMonthly || null });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (id) await db.update(goals).set(parsed.data).where(and(eq(goals.id, id), eq(goals.userId, user.id)));
  else await db.insert(goals).values({ ...parsed.data, userId: user.id });
  redirect("/plan/goals");
}

/** Contributions earn the same XP regardless of amount, once per goal per month. */
export async function addContributionAction(goalId: string, _: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { db, user, today } = await getContext();
  const [g] = await db.select({ id: goals.id }).from(goals).where(and(eq(goals.id, goalId), eq(goals.userId, user.id)));
  if (!g) return { ok: false, error: "Goal not found" };
  const parsed = z.object({ amount: rupees.refine((v) => v !== 0, "Enter an amount"), date: localDate, note: z.string().max(200).optional() }).safeParse({ amount: form.get("amount"), date: form.get("date") || today, note: form.get("note") || undefined });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  await db.insert(goalContributions).values({ userId: user.id, goalId: g.id, ...parsed.data });
  let xp = 0;
  if (parsed.data.amount > 0) xp = (await awardXp(db, user.id, "goal_contribution", xpKey.goalContribution(g.id, monthKey(parsed.data.date)), today)).xp;
  refresh();
  return { ok: true, xp, message: parsed.data.amount > 0 ? "Contribution recorded" : "Withdrawal recorded" };
}

export async function archiveGoalAction(id: string): Promise<ActionResult> {
  const { db, user } = await getContext();
  await db.update(goals).set({ archived: true }).where(and(eq(goals.id, id), eq(goals.userId, user.id)));
  refresh();
  return { ok: true };
}

/* ---------------- Holdings ---------------- */

const holdingSchema = z.object({
  name: z.string().trim().min(1).max(100),
  assetClass: z.enum(ASSET_CLASSES),
  value: rupees.refine((v) => v >= 0, "Value cannot be negative"),
  valuationDate: localDate,
  costBasis: rupees.optional().nullable(),
  monthlyContribution: rupees.optional().nullable(),
  includeInNetWorth: z.boolean(),
  notes: z.string().max(500).optional().nullable(),
});

export async function saveHoldingAction(id: string | null, _: ActionResult | undefined, form: FormData): Promise<ActionResult> {
  const { db, user, today } = await getContext();
  const raw = Object.fromEntries(form);
  const parsed = holdingSchema.safeParse({
    ...raw,
    costBasis: raw.costBasis || null,
    monthlyContribution: raw.monthlyContribution || null,
    notes: raw.notes || null,
    includeInNetWorth: form.get("includeInNetWorth") === "on",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (parsed.data.valuationDate > today) return { ok: false, error: "Valuation date cannot be in the future" };
  if (id) await db.update(holdings).set(parsed.data).where(and(eq(holdings.id, id), eq(holdings.userId, user.id)));
  else await db.insert(holdings).values({ ...parsed.data, userId: user.id });
  redirect("/money/holdings");
}

export async function deleteHoldingAction(id: string): Promise<ActionResult> {
  const { db, user } = await getContext();
  await db.delete(holdings).where(and(eq(holdings.id, id), eq(holdings.userId, user.id)));
  refresh();
  return { ok: true };
}
