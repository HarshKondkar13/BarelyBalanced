/**
 * Money helpers. All amounts are integers in paise (1 INR = 100 paise).
 * Parsing is string-based so "0.1 + 0.2" style float errors cannot enter the ledger.
 */

export type Paise = number;

export class MoneyParseError extends Error {}

/**
 * Parse a user- or CSV-supplied rupee amount into paise.
 * Accepts "1,23,456.78", "₹ 1,200", "1200.5", "-45", "(45.00)", "Rs. 99", "1.2e3" is rejected.
 * Rounds half away from zero beyond two decimals is NOT done: more than 2 decimals is an error,
 * because silently rounding imported money hides data problems.
 */
export function parseRupeesToPaise(input: string | number): Paise {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new MoneyParseError("Amount is not a finite number");
    input = input.toString();
    if (/e/i.test(input)) throw new MoneyParseError("Amount is out of range");
  }
  let s = input.trim();
  if (!s) throw new MoneyParseError("Amount is empty");
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^(₹|rs\.?|inr)\s*/i, "").replace(/\s*(cr|dr)$/i, (m) => {
    if (/dr/i.test(m)) negative = !negative;
    return "";
  });
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }
  s = s.replace(/^(₹|rs\.?|inr)\s*/i, "");
  // Remove grouping commas and spaces (Indian or Western grouping).
  s = s.replace(/[,\s]/g, "");
  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) {
    if (/^\d+\.\d{3,}$/.test(s)) throw new MoneyParseError("Amount has more than two decimal places");
    throw new MoneyParseError(`"${input}" is not a valid amount`);
  }
  const rupees = m[1].replace(/^0+(?=\d)/, "");
  const fraction = (m[2] ?? "").padEnd(2, "0");
  if (rupees.length > 13) throw new MoneyParseError("Amount is too large");
  const paise = Number(rupees) * 100 + Number(fraction);
  return negative ? -paise : paise;
}

/** Safe variant for forms: returns null instead of throwing. */
export function tryParseRupees(input: string): Paise | null {
  try {
    return parseRupeesToPaise(input);
  } catch {
    return null;
  }
}

const inrFull = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** "₹1,23,456.78". Uses Indian digit grouping. */
export function formatINR(paise: Paise, opts: { whole?: boolean; signed?: boolean } = {}): string {
  const rupees = paise / 100;
  const abs = Math.abs(rupees);
  const body = opts.whole ? inrWhole.format(Math.round(abs)) : inrFull.format(abs);
  if (paise < 0) return `−${body}`;
  if (opts.signed && paise > 0) return `+${body}`;
  return body;
}

/** "₹1.2L", "₹3.4Cr", "₹950" for compact displays and chart axes. */
export function formatINRCompact(paise: Paise): string {
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? "−" : "";
  if (rupees >= 1e7) return `${sign}₹${trim(rupees / 1e7)}Cr`;
  if (rupees >= 1e5) return `${sign}₹${trim(rupees / 1e5)}L`;
  if (rupees >= 1e3) return `${sign}₹${trim(rupees / 1e3)}K`;
  return `${sign}₹${Math.round(rupees)}`;
}

function trim(n: number) {
  return n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, "");
}

/** Paise -> plain decimal string "1234.50" for inputs and CSV export. */
export function paiseToDecimalString(paise: Paise): string {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

export function sum(values: Paise[]): Paise {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/**
 * Split an amount into parts proportional to weights, distributing the remainder paise
 * so the parts always sum exactly to the original (largest-remainder method).
 */
export function allocate(amount: Paise, weights: number[]): Paise[] {
  if (weights.length === 0) return [];
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) {
    const out = weights.map(() => 0);
    out[0] = amount;
    return out;
  }
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  const raw = weights.map((w) => (abs * w) / totalWeight);
  const floors = raw.map(Math.floor);
  let remainder = abs - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors.map((f) => f * sign);
}

/** Percentage helper that returns null when the denominator is zero. */
export function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

export function formatPercent(r: number | null, digits = 0): string {
  if (r === null || !Number.isFinite(r)) return "—";
  return `${(r * 100).toFixed(digits)}%`;
}
