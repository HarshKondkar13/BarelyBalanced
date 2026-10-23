/**
 * Background worker. Run as a separate long-lived process next to the web server:
 *   npm run worker
 * Scheduled work only happens while this process is running on an always-on host.
 */
import "dotenv/config";
import { PgBoss } from "pg-boss";
import { db, pool } from "@/db";
import { runOnce } from "@/server/jobs/run";
import { cleanupDemoUsers, hourlyUserTick, ingestNews, syncAllCalendars } from "@/server/jobs/tasks";
import { deliverPush } from "@/server/notifications";
import { log } from "@/server/log";

const TZ = "Asia/Kolkata";
const retry = { retryLimit: 4, retryDelay: 30, retryBackoff: true, expireInSeconds: 600 };

/** Run key = job name + the time slot it represents, so redelivered jobs are no-ops. */
const slot = (minutes: number) => new Date(Math.floor(Date.now() / (minutes * 60_000)) * minutes * 60_000).toISOString();

async function main() {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: "pgboss" });
  boss.on("error", (e) => log.error("boss.error", { reason: e.message }));
  await boss.start();

  const jobs: Array<{ name: string; cron: string; slotMin: number; fn: () => Promise<Record<string, unknown>> }> = [
    { name: "news-ingest", cron: "15 6,10,14,18 * * *", slotMin: 60, fn: () => ingestNews(db) },
    { name: "user-hourly", cron: "5 * * * *", slotMin: 60, fn: () => hourlyUserTick(db) },
    { name: "calendar-sync", cron: "*/30 * * * *", slotMin: 30, fn: () => syncAllCalendars(db) },
    { name: "push-deliver", cron: "*/5 * * * *", slotMin: 5, fn: () => deliverPush(db) },
    { name: "demo-cleanup", cron: "30 3 * * *", slotMin: 1440, fn: () => cleanupDemoUsers(db) },
  ];
  for (const j of jobs) {
    await boss.createQueue(j.name, { ...retry, policy: "singleton" }).catch(() => undefined);
    await boss.schedule(j.name, j.cron, null, { tz: TZ, ...retry });
    await boss.work<{ runKey?: string }>(j.name, async ([job]) => {
      // pg-boss retries failed jobs with backoff; runOnce makes each slot idempotent.
      await runOnce(db, j.name, job?.data?.runKey ?? slot(j.slotMin), j.fn);
    });
  }
  log.info("worker.started", { jobs: jobs.map((j) => j.name) });
  if (process.argv.includes("--run-now")) for (const j of jobs) await boss.send(j.name, { runKey: `manual:${new Date().toISOString()}` });

  const shutdown = async () => {
    log.info("worker.stopping");
    await boss.stop({ graceful: true });
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  log.error("worker.crashed", { reason: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
