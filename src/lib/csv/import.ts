/**
 * CSV statement import: parsing, column mapping, validation and duplicate detection.
 * Pure functions; the server re-runs everything on commit and never trusts a client preview.
 */
import Papa from "papaparse";
import { createHash } from "node:crypto";
import { isLocalDate } from "@/lib/dates";
import { MoneyParseError, parseRupeesToPaise } from "@/lib/money";

export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 5000;

export type DateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD" | "DD-MMM-YYYY" | "DD/MM/YY";

export type Mapping = {
  date: string;
  description: string;
  /** Either a single signed amount column... */
  amount?: string | null;
  /** ...or separate debit (money out) and credit (money in) columns. */
  debit?: string | null;
  credit?: string | null;
  category?: string | null;
  notes?: string | null;
  dateFormat: DateFormat;
  /** For a single amount column: are expenses negative (default) or positive? */
  negativeIsExpense: boolean;
  /** Rows whose description matches this (case-insensitive) become transfers to transferAccountId. */
  transferPattern?: string | null;
  transferAccountId?: string | null;
};

export type ParsedCsv = { headers: string[]; rows: Record<string, string>[]; truncated: boolean };

export function parseCsv(text: string): ParsedCsv {
  if (text.length > MAX_CSV_BYTES) throw new Error("File is larger than 2 MB");
  // Strip BOM; some bank exports put title lines before the header row.
  const clean = text.replace(/^﻿/, "");
  const res = Papa.parse<Record<string, string>>(clean, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
  const headers = (res.meta.fields ?? []).filter((h) => h.length > 0);
  if (headers.length < 2) throw new Error("Couldn't find a header row with at least two columns");
  const rows = res.data.slice(0, MAX_ROWS).map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" ? v.trim() : ""])));
  return { headers, rows, truncated: res.data.length > MAX_ROWS };
}

const find = (headers: string[], ...patterns: RegExp[]) => headers.find((h) => patterns.some((p) => p.test(h))) ?? null;

/** Guess a mapping from common Indian bank / card statement headers. */
export function suggestMapping(p: ParsedCsv): Mapping {
  const h = p.headers;
  const date = find(h, /^(txn |transaction |value |posting )?date$/i, /date/i) ?? h[0];
  const description = find(h, /narration/i, /description/i, /particulars/i, /details/i, /remarks/i, /merchant/i) ?? h[1];
  const debit = find(h, /withdrawal/i, /debit/i, /^dr\b/i);
  const credit = find(h, /deposit/i, /credit/i, /^cr\b/i);
  const amount = debit && credit ? null : find(h, /amount/i, /amt/i);
  const sample = p.rows.slice(0, 20).map((r) => r[date] ?? "");
  return {
    date,
    description,
    amount,
    debit: amount ? null : debit,
    credit: amount ? null : credit,
    category: find(h, /category/i),
    notes: find(h, /^notes?$/i, /memo/i),
    dateFormat: detectDateFormat(sample),
    negativeIsExpense: true,
    transferPattern: "credit card|card payment|cc payment",
    transferAccountId: null,
  };
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function parseDate(raw: string, fmt: DateFormat): string | null {
  const s = raw.trim().replace(/\s+\d{1,2}:\d{2}(:\d{2})?.*$/, ""); // drop time part
  let y: number, m: number, d: number;
  let mt: RegExpExecArray | null;
  switch (fmt) {
    case "YYYY-MM-DD":
      if (!(mt = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s))) return null;
      [y, m, d] = [+mt[1], +mt[2], +mt[3]];
      break;
    case "DD/MM/YYYY":
      if (!(mt = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) return null;
      [d, m, y] = [+mt[1], +mt[2], +mt[3]];
      break;
    case "MM/DD/YYYY":
      if (!(mt = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) return null;
      [m, d, y] = [+mt[1], +mt[2], +mt[3]];
      break;
    case "DD/MM/YY":
      if (!(mt = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/.exec(s))) return null;
      [d, m, y] = [+mt[1], +mt[2], 2000 + +mt[3]];
      break;
    case "DD-MMM-YYYY":
      if (!(mt = /^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ,]+(\d{2,4})$/.exec(s))) return null;
      d = +mt[1];
      m = MONTHS[mt[2].toLowerCase()] ?? 0;
      y = mt[3].length === 2 ? 2000 + +mt[3] : +mt[3];
      break;
  }
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isLocalDate(iso) ? iso : null;
}

export function detectDateFormat(samples: string[]): DateFormat {
  const formats: DateFormat[] = ["DD/MM/YYYY", "YYYY-MM-DD", "DD-MMM-YYYY", "DD/MM/YY", "MM/DD/YYYY"];
  let best: DateFormat = "DD/MM/YYYY";
  let bestScore = -1;
  for (const f of formats) {
    const score = samples.filter((s) => s && parseDate(s, f)).length;
    if (score > bestScore) [best, bestScore] = [f, score];
  }
  return best;
}

export function normalizeDescription(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b\d{6,}\b/g, "#").trim();
}

/** Stable fingerprint for duplicate detection across re-imports of the same statement. */
export function fingerprint(accountId: string, date: string, signedAmount: number, description: string): string {
  return createHash("sha256").update(`${accountId}|${date}|${signedAmount}|${normalizeDescription(description)}`).digest("hex").slice(0, 32);
}

export type RowResult = {
  index: number; // 1-based data row number
  status: "ok" | "error" | "duplicate" | "possible_duplicate";
  errors: string[];
  note?: string;
  txn?: {
    type: "income" | "expense" | "transfer";
    date: string;
    amount: number;
    description: string;
    notes: string | null;
    categoryName: string | null;
    toAccountId: string | null;
    fingerprint: string;
  };
};

export type ExistingTxn = { date: string; signedAmount: number; description: string; fingerprint: string | null };

/**
 * Validate every row and classify duplicates:
 * - "duplicate": exact fingerprint match with an existing transaction (skipped by default)
 * - "possible_duplicate": same date and amount with a similar description, or repeated in the file
 */
export function validateRows(p: ParsedCsv, map: Mapping, accountId: string, existing: ExistingTxn[]): RowResult[] {
  const fps = new Set(existing.map((e) => e.fingerprint).filter(Boolean) as string[]);
  const byDateAmt = new Map<string, string[]>();
  for (const e of existing) {
    const k = `${e.date}|${e.signedAmount}`;
    byDateAmt.set(k, [...(byDateAmt.get(k) ?? []), normalizeDescription(e.description)]);
  }
  const seenInFile = new Map<string, number>();
  const transferRe = map.transferPattern && map.transferAccountId ? safeRegex(map.transferPattern) : null;

  return p.rows.map((r, i) => {
    const errors: string[] = [];
    const date = parseDate(r[map.date] ?? "", map.dateFormat);
    if (!date) errors.push(`Date "${r[map.date] ?? ""}" doesn't match ${map.dateFormat}`);
    const description = (r[map.description] ?? "").slice(0, 200);
    if (!description) errors.push("Description is empty");
    let signed: number | null = null;
    try {
      if (map.amount) {
        const v = parseRupeesToPaise(r[map.amount] ?? "");
        signed = map.negativeIsExpense ? v : -v;
      } else {
        const dr = r[map.debit ?? ""]?.trim() ? parseRupeesToPaise(r[map.debit!]) : 0;
        const cr = r[map.credit ?? ""]?.trim() ? parseRupeesToPaise(r[map.credit!]) : 0;
        if (dr && cr) errors.push("Both debit and credit have values");
        signed = cr - Math.abs(dr);
      }
    } catch (e) {
      errors.push(e instanceof MoneyParseError ? e.message : "Invalid amount");
    }
    if (signed === 0) errors.push("Amount is zero");
    if (errors.length || !date || signed === null) return { index: i + 1, status: "error" as const, errors };

    const isTransfer = Boolean(transferRe && signed < 0 && transferRe.test(description));
    const fp = fingerprint(accountId, date, signed, description);
    const txn = {
      type: isTransfer ? ("transfer" as const) : signed < 0 ? ("expense" as const) : ("income" as const),
      date,
      amount: Math.abs(signed),
      description,
      notes: map.notes ? (r[map.notes] || null) : null,
      categoryName: map.category ? (r[map.category] || null) : null,
      toAccountId: isTransfer ? map.transferAccountId! : null,
      fingerprint: fp,
    };
    if (fps.has(fp)) return { index: i + 1, status: "duplicate" as const, errors, note: "Already imported", txn };
    const near = byDateAmt.get(`${date}|${signed}`)?.some((d) => similarity(d, normalizeDescription(description)) >= 0.5);
    const repeat = seenInFile.get(fp);
    seenInFile.set(fp, i + 1);
    if (near) return { index: i + 1, status: "possible_duplicate" as const, errors, note: "Same date and amount as an existing transaction", txn };
    if (repeat) return { index: i + 1, status: "possible_duplicate" as const, errors, note: `Identical to row ${repeat} in this file`, txn };
    return { index: i + 1, status: "ok" as const, errors, note: isTransfer ? "Imported as a transfer (card payment)" : undefined, txn };
  });
}

function safeRegex(p: string): RegExp | null {
  try {
    return new RegExp(p.slice(0, 200), "i");
  } catch {
    return null;
  }
}

function similarity(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return a === b ? 1 : 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.min(A.size, B.size);
}

/** CSV export with a formula-injection guard for spreadsheet apps. */
export function toCsv(rows: Array<Record<string, string | number | null>>, columns: string[]): string {
  const esc = (v: string | number | null) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c] ?? null)).join(","))].join("\r\n");
}
