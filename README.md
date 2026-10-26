# Barely Balanced

> Understand your money, make informed decisions, and follow through every day.

A mobile-first personal app (installable PWA) combining money tracking, weekly planning, business news and daily
scheduling, with gentle gamification. Built for an individual in India (INR, Indian digit grouping, Asia/Kolkata),
with a multi-user data model.

**Status and continuity:** see [`PROJECT_STATUS.md`](PROJECT_STATUS.md). **Design:** see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS v4 · PostgreSQL 16 + Drizzle ORM · Better Auth (email/password, optional Google sign-in) ·
Recharts · Zod · pg-boss (jobs) · Vitest + Playwright · optional Anthropic SDK for explanations · web-push.

## Run locally

Requirements: Node 22+, Git, and PostgreSQL 16 (installed directly, or via Docker).

### Windows (no Docker needed)

1. Install PostgreSQL 16 from https://www.postgresql.org/download/windows/ (the EDB installer). Keep port **5432**,
   remember the password you set for the `postgres` user, and skip Stack Builder at the end.
2. In PowerShell:
   ```powershell
   git clone https://github.com/HarshKondkar13/BarelyBalanced.git
   cd BarelyBalanced
   npm ci
   npm run setup -- --admin-url=postgres://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/postgres
   npm run db:migrate
   npm run dev
   ```
3. Open http://localhost:3000 and choose **Explore with sample data**, or create an account.

`npm run setup` creates `.env` with fresh secrets, creates the `paisa` database user plus the `paisa_dev` and `paisa_test`
databases, and checks the connection. It is safe to run again.

### macOS / Linux (or Windows with Docker Desktop)

```bash
npm ci                               # installs exactly what package-lock.json lists (doesn't modify it)
docker compose up -d                 # Postgres with paisa_dev and paisa_test
npm run setup                        # creates .env with fresh secrets and checks the database
npm run db:migrate
npm run dev                          # http://localhost:3000
```

Optional, in a second terminal: `npm run worker` runs background jobs (reminders, news, calendar sync).

### Checks

```bash
npm run typecheck      # route types + tsc
npm run lint
npm run db:migrate:test && npm test   # unit + database integration tests (uses paisa_test)
npm run build && npm start
npm run e2e            # with the app running: browser smoke test of every page (screenshots/)
node scripts/e2e-journey.mjs     # full sign-up → money → budget → insight → plan → XP → weekly review journey
node scripts/check-overflow.mjs  # no horizontal scrolling at 360px
```

Playwright uses the system Chromium if `CHROMIUM_PATH` is set; otherwise run `npx playwright install chromium` once.

## Configuration

All settings are environment variables; see [`.env.example`](.env.example). Nothing secret is committed.

| Variable | Needed for |
|---|---|
| `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `INTEGRATION_ENCRYPTION_KEY` | Always |
| `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_SHORT_NAME`, `NEXT_PUBLIC_APP_TAGLINE` | Renaming the app |
| `DEMO_MODE_ENABLED` | `true` shows "Explore with sample data". Set `false` in production. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in and Google Calendar |
| `NEWS_RSS_FEEDS`, `NEWS_AI_EXPLAINERS` | Real news (otherwise labelled demo stories) |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | Optional AI explanations (default model `claude-opus-5-5`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Optional browser push (`npx web-push generate-vapid-keys`) |

### Google Calendar setup

1. Google Cloud Console → new project → enable **Google Calendar API**.
2. OAuth consent screen (External). While in *Testing*, add your Google account as a test user.
3. Scopes: `https://www.googleapis.com/auth/calendar.readonly` and `https://www.googleapis.com/auth/calendar.app.created`.
4. Credentials → OAuth client ID → *Web application*. Authorised redirect URI: `{BETTER_AUTH_URL}/api/integrations/google/callback`
   (e.g. `http://localhost:3000/api/integrations/google/callback`). For Google sign-in also add `{BETTER_AUTH_URL}/api/auth/callback/google`.
5. Put the client ID and secret in `.env`, restart, then Settings → Integrations → Connect.

Behaviour: read-only first; publishing asks separately for `calendar.app.created`, which only allows the app to manage calendars it
created, so it cannot touch your other events. Changes are previewed before writing; event IDs are derived from task IDs so
retries never duplicate. Disconnect revokes the token and lets you keep or delete published events.
Caveat: apps in *Testing* status get refresh tokens that expire after 7 days, so you'd reconnect weekly until the app is verified.

### News provider

Set `NEWS_RSS_FEEDS="economy|https://…,banking|https://…"` with feeds whose terms permit your use (personal reading, with
headline, short summary and a link back to the original). The app stores only title, link, date and a short snippet, links to the
source, and deduplicates overlapping coverage. Without feeds, clearly labelled fictional demonstration stories are shown.
`NEWS_AI_EXPLAINERS=true` (with an Anthropic key) generates explainers from public headline and summary text only. Users see them only if they opt in.

## Hosting requirements (read this before relying on reminders)

- The **web app** can run anywhere Node 22 runs (a VM, Render, Railway, Fly.io, or Vercel for the web part).
- The **worker** (`npm run worker`) must run as an **always-on process** next to the database. Scheduled jobs (bill
  reminders, weekly review nudges, news ingestion, calendar sync, routine creation, push delivery, demo cleanup) only
  happen while it runs. A closed laptop, a sleeping dev server or a serverless function that spins down **cannot** run them.
  Jobs are timezone-aware (Asia/Kolkata schedules; per-user timezone for reminders), retried with backoff, recorded in
  `job_run`, and idempotent per time slot.
- Use managed Postgres with encryption at rest and TLS (`?sslmode=require`), serve the app over HTTPS, set `DEMO_MODE_ENABLED=false`,
  and keep `.env` out of version control.
- Nothing is deployed, no paid services are called, and no notifications are sent to anyone unless you configure them.

## What this app will not do

No bank logins or scraping · no trades or money movement · no specific securities or products recommended (asset-class
education only) · no invented prices, returns or tax rules (all assumptions are editable and labelled) · no XP for spending,
trading, risk or returns · no public leaderboards.
