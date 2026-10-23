import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { jobRuns } from "@/db/schema";
import { log } from "@/server/log";

/**
 * Run a unit of scheduled work exactly once per (job, runKey).
 * - A completed run is skipped on redelivery (idempotent).
 * - A failed or crashed run is retried; attempts are counted.
 * - Every run is recorded in job_run for observability.
 */
export async function runOnce<T extends Record<string, unknown>>(db: DB, job: string, runKey: string, fn: () => Promise<T>): Promise<{ skipped: boolean; result?: T }> {
  const inserted = await db.insert(jobRuns).values({ job, runKey, status: "running" }).onConflictDoNothing().returning({ id: jobRuns.id });
  if (!inserted.length) {
    const [row] = await db.select().from(jobRuns).where(and(eq(jobRuns.job, job), eq(jobRuns.runKey, runKey)));
    if (row?.status === "ok") return { skipped: true };
    // A run "running" for over 15 minutes is presumed crashed and may be retried.
    if (row?.status === "running" && Date.now() - row.startedAt.getTime() < 15 * 60_000) return { skipped: true };
    await db.update(jobRuns).set({ status: "running", attempts: sql`${jobRuns.attempts} + 1`, startedAt: new Date(), error: null }).where(eq(jobRuns.id, row!.id));
  }
  const started = Date.now();
  try {
    const result = await fn();
    await db.update(jobRuns).set({ status: "ok", finishedAt: new Date(), detail: result }).where(and(eq(jobRuns.job, job), eq(jobRuns.runKey, runKey)));
    log.info("job.ok", { job, runKey, ms: Date.now() - started });
    return { skipped: false, result };
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "unknown error";
    await db.update(jobRuns).set({ status: "error", finishedAt: new Date(), error: msg }).where(and(eq(jobRuns.job, job), eq(jobRuns.runKey, runKey)));
    log.error("job.failed", { job, runKey, ms: Date.now() - started, reason: msg });
    throw e;
  }
}
