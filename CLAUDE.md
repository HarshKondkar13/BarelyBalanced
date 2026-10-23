@AGENTS.md

# Working on this repo

- Read `PROJECT_STATUS.md` first and update it at the end of a session (completed work, verification, gaps, blockers).
- Architecture and money rules: `docs/ARCHITECTURE.md`. Financial maths lives in pure functions under `src/lib/finance` with tests;
  never compute money in components or let AI output supply figures.
- Money is integer paise. Parse user input with `parseRupeesToPaise`, format with `formatINR`.
- Every server action starts with `getContext()` and filters by `user.id`; check ownership of any referenced id.
- Files with `"use server"` must export only actions. Put helpers in `src/server/*`.
- Checks: `npm run typecheck && npm run lint && npm test && npm run build`; browser checks in `scripts/` (set `CHROMIUM_PATH`).
- Local DB: Postgres 16, `paisa_dev` and `paisa_test` (`npm run db:migrate`, `npm run db:migrate:test`). After schema edits: `npm run db:generate`.
