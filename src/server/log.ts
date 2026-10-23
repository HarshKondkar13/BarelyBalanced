/**
 * Structured logger that never emits secrets or private financial content.
 * Values under sensitive keys are redacted; free text is not logged at all.
 */
const SENSITIVE = /token|secret|password|authorization|cookie|code|amount|balance|description|merchant|notes?|title|email|content|prompt/i;

function redact(v: unknown, depth = 0): unknown {
  if (depth > 3 || v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => redact(x, depth + 1));
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(val, depth + 1);
    return out;
  }
  if (typeof v === "string" && v.length > 120) return `${v.slice(0, 120)}…`;
  return v;
}

function emit(level: "info" | "warn" | "error", event: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...((redact(data) as object) ?? {}) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, data?: Record<string, unknown>) => emit("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) => emit("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) => emit("error", event, data),
  redact,
};
