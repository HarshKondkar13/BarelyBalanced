// Cross-platform: run migrations against the test database (TEST_DATABASE_URL, or paisa_test next to DATABASE_URL).
import "dotenv/config";
import { spawnSync } from "node:child_process";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL?.replace(/\/[^/?]+(\?|$)/, "/paisa_test$1");
if (!url) {
  console.error("Set DATABASE_URL or TEST_DATABASE_URL in .env first");
  process.exit(1);
}
const r = spawnSync("npx", ["drizzle-kit", "migrate"], { stdio: "inherit", shell: true, env: { ...process.env, DATABASE_URL: url } });
process.exit(r.status ?? 1);
