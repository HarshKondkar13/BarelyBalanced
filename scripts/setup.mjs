// Cross-platform first-time setup (Windows, macOS, Linux).
//   npm run setup                       -> create .env with fresh secrets (if missing) and test the database
//   npm run setup -- --admin-url=URL    -> also create the "paisa" database user and the paisa_dev / paisa_test databases
//                                          using a Postgres superuser URL, e.g. postgres://postgres:YOUR_PASSWORD@localhost:5432/postgres
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";

const secret = () => randomBytes(32).toString("base64");

/**
 * Plain-English reason for a failed connection. On Windows "localhost" resolves to both IPv6
 * and IPv4, so a refused connection arrives as an AggregateError with an EMPTY message;
 * the useful code is on the error or its inner errors.
 */
function explain(e, url) {
  const code = e?.code ?? e?.errors?.[0]?.code;
  const where = (() => { try { const u = new URL(url); return `${u.hostname}:${u.port || 5432}`; } catch { return "the database"; } })();
  switch (code) {
    case "ECONNREFUSED":
      return `nothing is accepting connections on ${where}. PostgreSQL isn't running, or it uses a different port.\n    Windows: press Win+R, type services.msc, find "postgresql-x64-<version>", and click Start.\n    If it's running, check its port in the installer summary or postgresql.conf, and use that port in the URL.`;
    case "28P01":
      return "wrong password. Use the password you chose for the postgres user during installation (special characters must be URL-encoded, e.g. ? as %3F).";
    case "3D000":
      return `the database in ${url.replace(/:[^:@/]*@/, ":***@")} doesn't exist.`;
    case "ENOTFOUND":
      return `the host in the URL (${where}) couldn't be found. Use localhost.`;
    case "ETIMEDOUT":
      return `connecting to ${where} timed out. Is a firewall blocking it?`;
    default:
      return e?.message || e?.errors?.[0]?.message || String(code ?? e);
  }
}
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { console.error(`  ✗ ${m}`); process.exit(1); };

console.log("\nSetting up Barely Balanced\n");

// 1. .env with generated secrets
if (existsSync(".env")) ok(".env already exists (left unchanged)");
else {
  const env = readFileSync(".env.example", "utf8")
    .replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${secret()}`)
    .replace(/^INTEGRATION_ENCRYPTION_KEY=.*$/m, `INTEGRATION_ENCRYPTION_KEY=${secret()}`);
  writeFileSync(".env", env);
  ok("created .env with freshly generated secrets");
}
const dbUrl = /^DATABASE_URL=(.*)$/m.exec(readFileSync(".env", "utf8"))?.[1]?.trim();
if (!dbUrl) fail("DATABASE_URL is missing from .env");

// 2. Optional: create role and databases with a superuser connection
const adminArg = process.argv.find((a) => a.startsWith("--admin-url="));
if (adminArg) {
  const admin = new pg.Client({ connectionString: adminArg.slice("--admin-url=".length) });
  try {
    await admin.connect();
  } catch (e) {
    fail(`could not connect with the admin URL: ${explain(e, adminArg.slice("--admin-url=".length))}`);
  }
  const target = new URL(dbUrl);
  const role = decodeURIComponent(target.username);
  const password = decodeURIComponent(target.password);
  const devDb = target.pathname.slice(1);
  const ident = (s) => `"${s.replace(/"/g, '""')}"`;
  const roleExists = (await admin.query("select 1 from pg_roles where rolname = $1", [role])).rowCount;
  if (roleExists) ok(`database user "${role}" already exists`);
  else {
    await admin.query(`create role ${ident(role)} with login createdb password '${password.replace(/'/g, "''")}'`);
    ok(`created database user "${role}"`);
  }
  for (const name of [devDb, "paisa_test"]) {
    const exists = (await admin.query("select 1 from pg_database where datname = $1", [name])).rowCount;
    if (exists) ok(`database "${name}" already exists`);
    else {
      await admin.query(`create database ${ident(name)} owner ${ident(role)}`);
      ok(`created database "${name}"`);
    }
  }
  await admin.end();
}

// 3. Check the app can reach its database
const client = new pg.Client({ connectionString: dbUrl });
try {
  await client.connect();
  await client.query("select 1");
  ok(`connected to ${new URL(dbUrl).pathname.slice(1)} on ${new URL(dbUrl).host}`);
  const { rows } = await client.query(`select to_regclass('public."user"') is not null as ready`);
  await client.end();
  if (rows[0].ready) ok("tables exist (migrations have been run)");
  else console.log("  ! tables not created yet. Run: npm run db:migrate");
} catch (e) {
  const reason = explain(e, dbUrl);
  const hint = ["28P01", "3D000"].includes(e?.code ?? e?.errors?.[0]?.code)
    ? "\n    If this is a fresh install, run: npm run setup -- --admin-url=postgres://postgres:YOUR_PASSWORD@localhost:5432/postgres"
    : "";
  fail(`can't connect to the app database: ${reason}${hint}`);
}

console.log("\nNext: npm run db:migrate   then   npm run dev   and open http://localhost:3000\n");
