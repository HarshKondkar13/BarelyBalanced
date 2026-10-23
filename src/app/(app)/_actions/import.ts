"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { categories, importBatches, transactions } from "@/db/schema";
import { MAX_CSV_BYTES, parseCsv, suggestMapping, validateRows, type Mapping, type RowResult } from "@/lib/csv/import";
import { getContext } from "@/server/context";
import { assertAccountsOwned, createTransaction, loadTransactions, OwnershipError } from "@/server/finance";

const mappingSchema = z.object({
  date: z.string().max(100),
  description: z.string().max(100),
  amount: z.string().max(100).nullable().optional(),
  debit: z.string().max(100).nullable().optional(),
  credit: z.string().max(100).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  notes: z.string().max(100).nullable().optional(),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "DD-MMM-YYYY", "DD/MM/YY"]),
  negativeIsExpense: z.boolean(),
  transferPattern: z.string().max(200).nullable().optional(),
  transferAccountId: z.string().uuid().nullable().optional(),
});

type AnalyzeResult = { ok: true; headers: string[]; sample: Record<string, string>[]; mapping: Mapping; rowCount: number; truncated: boolean } | { ok: false; error: string };

export async function analyzeCsvAction(text: string): Promise<AnalyzeResult> {
  await getContext();
  if (typeof text !== "string" || text.length > MAX_CSV_BYTES) return { ok: false, error: "File must be a CSV under 2 MB" };
  try {
    const p = parseCsv(text);
    return { ok: true, headers: p.headers, sample: p.rows.slice(0, 5), mapping: suggestMapping(p), rowCount: p.rows.length, truncated: p.truncated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't read this file" };
  }
}

async function runValidation(text: string, mappingInput: unknown, accountId: string) {
  const ctx = await getContext();
  const mapping = mappingSchema.parse(mappingInput) as Mapping;
  await assertAccountsOwned(ctx.db, ctx.user.id, [accountId, mapping.transferAccountId]);
  const p = parseCsv(text);
  for (const col of [mapping.date, mapping.description, mapping.amount, mapping.debit, mapping.credit, mapping.category, mapping.notes]) {
    if (col && !p.headers.includes(col)) throw new Error(`Column "${col}" isn't in this file`);
  }
  if (!mapping.amount && !(mapping.debit || mapping.credit)) throw new Error("Map an amount column, or debit/credit columns");
  const existing = (await loadTransactions(ctx.db, ctx.user.id)).filter((t) => t.accountId === accountId);
  const ex = existing.map((t) => ({ date: t.date, signedAmount: t.type === "expense" || t.type === "transfer" ? -t.amount : t.amount, description: t.description, fingerprint: null as string | null }));
  const fps = await ctx.db.select({ fp: transactions.fingerprint, date: transactions.date, amount: transactions.amount, type: transactions.type, description: transactions.description }).from(transactions).where(and(eq(transactions.userId, ctx.user.id), eq(transactions.accountId, accountId)));
  for (const f of fps) if (f.fp) ex.push({ date: f.date, signedAmount: f.type === "income" || f.type === "refund" ? f.amount : -f.amount, description: f.description, fingerprint: f.fp });
  return { ctx, mapping, p, results: validateRows(p, mapping, accountId, ex) };
}

export async function previewImportAction(text: string, mapping: unknown, accountId: string): Promise<{ ok: true; results: RowResult[] } | { ok: false; error: string }> {
  try {
    const { results } = await runValidation(text, mapping, accountId);
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e instanceof OwnershipError ? "Account not found" : e instanceof Error ? e.message : "Couldn't validate the file" };
  }
}

/**
 * Commit: re-validates server-side. Imports "ok" rows plus any possible duplicates the user
 * explicitly included. Exact duplicates and invalid rows are never imported.
 */
export async function commitImportAction(text: string, mapping: unknown, accountId: string, fileName: string, includePossibleDuplicates: number[]): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const { ctx, results, p } = await runValidation(text, mapping, accountId);
    const include = new Set(z.array(z.number().int()).max(5000).parse(includePossibleDuplicates));
    const cats = await ctx.db.select().from(categories).where(eq(categories.userId, ctx.user.id));
    const catByName = new Map(cats.map((c) => [`${c.kind}:${c.name.toLowerCase()}`, c.id]));
    const toImport = results.filter((r) => r.txn && (r.status === "ok" || (r.status === "possible_duplicate" && include.has(r.index))));
    const [batch] = await ctx.db
      .insert(importBatches)
      .values({ userId: ctx.user.id, fileName: fileName.slice(0, 200), accountId, rowCount: p.rows.length, importedCount: toImport.length, skippedDuplicates: results.filter((r) => r.status === "duplicate").length })
      .returning({ id: importBatches.id });
    for (const r of toImport) {
      const t = r.txn!;
      const catId = t.categoryName ? (catByName.get(`${t.type === "income" ? "income" : "expense"}:${t.categoryName.toLowerCase()}`) ?? null) : null;
      await createTransaction(ctx.db, ctx.user.id, {
        type: t.type,
        date: t.date,
        amount: t.amount,
        accountId,
        toAccountId: t.toAccountId,
        description: t.description,
        notes: t.notes,
        tags: ["imported"],
        splits: t.type === "transfer" ? [] : [{ categoryId: catId, amount: t.amount }],
        importBatchId: batch.id,
        fingerprint: t.fingerprint,
      });
    }
    refresh();
    const skipped = results.length - toImport.length;
    return { ok: true, message: `Imported ${toImport.length} transaction${toImport.length === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}` };
  } catch (e) {
    return { ok: false, error: e instanceof OwnershipError ? "Account not found" : e instanceof Error ? e.message : "Import failed" };
  }
}

export async function undoImportAction(batchId: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const { db, user } = await getContext();
  const [b] = await db.select().from(importBatches).where(and(eq(importBatches.id, batchId), eq(importBatches.userId, user.id)));
  if (!b) return { ok: false, error: "Import not found" };
  const del = await db.delete(transactions).where(and(eq(transactions.userId, user.id), eq(transactions.importBatchId, b.id))).returning({ id: transactions.id });
  await db.delete(importBatches).where(eq(importBatches.id, b.id));
  refresh();
  return { ok: true, message: `Removed ${del.length} imported transactions` };
}
