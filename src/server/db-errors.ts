/**
 * Turn database failures into an actionable message. Drizzle wraps every driver error in a
 * generic "Failed query" error; the useful part (Postgres error code) is on `cause`.
 */
export type DbProblem = "no_tables" | "bad_password" | "not_running" | "no_database";

export const DB_PROBLEM_HELP: Record<DbProblem, string> = {
  no_tables: "The database has no tables yet. Stop the app, run `npm run db:migrate`, then start it again with `npm run dev`.",
  bad_password: "The database rejected the username or password in DATABASE_URL (.env). Run `npm run setup -- --admin-url=postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/postgres` to create the app's database user.",
  not_running: "Can't reach PostgreSQL. Make sure it is running (Windows: Services → postgresql-x64-16 → Start) and that DATABASE_URL in .env uses the right port.",
  no_database: "The database named in DATABASE_URL doesn't exist. Run `npm run setup -- --admin-url=postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/postgres`, then `npm run db:migrate`.",
};

export function classifyDbError(e: unknown): DbProblem | null {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const code = (cur as { code?: string }).code;
    if (code === "42P01") return "no_tables";
    if (code === "28P01" || code === "28000") return "bad_password";
    if (code === "3D000") return "no_database";
    if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT") return "not_running";
    cur = (cur as { cause?: unknown }).cause;
  }
  return null;
}
