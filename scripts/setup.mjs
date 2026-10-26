// Cross-platform first-time setup (Windows, macOS, Linux).
//   npm run setup                       -> create .env with fresh secrets (if missing) and test the database
//   npm run setup -- --admin-url=URL    -> also create the "paisa" database user and the paisa_dev / paisa_test databases
//                                          using a Postgres superuser URL, e.g. postgres://postgres:YOUR_PASSWORD@localhost:5432/postgres
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";

const secret = () => randomBytes(32).toString("base64");
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
    fail(`could not connect with the admin URL (${e.message}). Check the postgres password you chose during installation.`);
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
  fail(`can't reach the database at ${new URL(dbUrl).host} (${e.message}).\n    Is PostgreSQL running? If this is a fresh install, run:\n    npm run setup -- --admin-url=postgres://postgres:YOUR_PASSWORD@localhost:5432/postgres`);
}

console.log("\nNext: npm run db:migrate   then   npm run dev   and open http://localhost:3000\n");
