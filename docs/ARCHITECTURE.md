# Architecture

One Next.js 16 app (App Router, server components + server actions) plus one background
worker process, both talking to one PostgreSQL database. No microservices.

```
Browser (PWA) ──► Next.js server ──► PostgreSQL
                     │   ▲
                     │   └── pg-boss queue (same database)
                     ▼        ▲
        Google / RSS / Anthropic   worker process (npm run worker)
```

## Layers (and where they live)

| Concern | Location | Notes |
|---|---|---|
| Financial calculations | `src/lib/finance/*` | Pure, deterministic, unit-tested. Ledger, forecasts, insights, surplus/plan, scenarios, allocation, risk profile. |
| Other domain logic | `src/lib/{schedule,gamification,csv,news,integrations}` | Pure functions: planner, XP rules/quests/streaks, CSV import, feed parsing/dedupe, calendar mapping. |
| AI explanations | `src/server/ai.ts`, contracts in `src/lib/ai/contracts.ts` | Optional. Validated structured output. Never supplies figures. |
| External integrations | `src/server/integrations/google-calendar.ts`, `src/server/jobs/tasks.ts` (RSS) | Provider clients with injectable `fetch` for tests. |
| Background jobs | `src/worker/index.ts`, `src/server/jobs/*` | pg-boss schedules + `runOnce` idempotency ledger (`job_run`). |
| Data access + authorization | `src/server/*.ts` | Every query filters by `userId`; referenced ids are ownership-checked. |
| Mutations | `src/app/(app)/_actions/*.ts` | Server actions; zod-validated; call `getContext()` (verified session) first. |
| UI | `src/app/**`, `src/components/**` | Tailwind v4 tokens in `globals.css`; Recharts for charts. |
| User data & preferences | `preferences`, `financial_profile` tables | Timezone, theme, gamification mode, AI data use, notification prefs. |

## Data model (main tables)

- **Auth (Better Auth)**: `user` (+`is_demo`), `session`, `account`, `verification`.
- **Money**: `fin_account` (opening balance + date; liabilities stored as amount owed), `category` (essential flag),
  `txn` (type income/expense/transfer/refund; amount > 0 in paise; `to_account_id` for transfers; `fingerprint` for import dedupe),
  `txn_split` (category allocations; sum = amount; none for transfers), `budget` (category × month),
  `recurring_item` (bills, subscriptions, EMIs, SIPs, income; forecasts only), `goal`, `goal_contribution` (actuals only; plans live on the goal),
  `holding` (manual value + valuation date), `import_batch`, `dismissed_insight`.
- **Schedule**: `task` (plan date, optional start time, duration, top priority, carry count, link ref), `routine` (materialises tasks idempotently),
  `habit`, `habit_log`, `focus_session`, `daily_review` (morning/evening), `weekly_review` (snapshot + decision).
- **Gamification**: `xp_event` (append-only ledger, unique per user+idempotency key, `revoked_at` for undo), `unlocked_cosmetic`.
- **Signals**: `news_item` (shared; `is_demo`, `url_hash` unique, `cluster_key`, validated `explainer`), `news_bookmark`, `ingestion_run`.
- **Integrations**: `integration` (encrypted tokens, scopes, settings), `external_event` (read cache), `calendar_publication` (task ↔ event id mapping).
- **Ops**: `notification` (dedupe key, `deliver_after` for quiet hours), `push_subscription`, `ai_usage` (no content), `job_run`.

## Money rules (enforced in `src/lib/finance/ledger.ts`)

- Money is integer paise end-to-end; input is parsed from strings (no floats).
- Opening balance ≠ income. Transfers (incl. card bill payments, SIP transfers) ≠ income or spending.
- Card purchases are spending when made; the later card payment is a transfer.
- Refunds reduce spending in their categories in the refund's period.
- Savings rate = (income − spending) ÷ income; null with no income.
- Net worth lists every included/excluded account and holding; holdings show valuation dates.
- Forecasts (recurring items, plans) are never mixed with actual transactions.

## Core loops

- **Daily**: Today shows one next best action (deterministic priority order) → morning plan (≤3 priorities, capacity with 20% buffer) →
  work/focus → log money (or confirm no-spend) → evening check-in (each unfinished task: tomorrow / inbox / let go).
- **Weekly**: insights + quests → weekly review (what changed, goals, next 14 days, surplus outcome, illustrative mix, contribution
  schedule, risks/assumptions/alternatives) → decision → accepted actions become tasks.

## Security notes

- `src/proxy.ts` only does an optimistic cookie redirect; real authorization is `requireUser()` on the server for every request.
- Calendar tokens: AES-256-GCM (`INTEGRATION_ENCRYPTION_KEY`), server only. OAuth uses PKCE + state bound to the session user.
- Logs go through `src/server/log.ts`, which redacts token/amount/description/notes/email fields.
- Untrusted text (CSV, feeds, model output) is sanitised, length-limited and schema-validated; CSV export guards against formula injection.
