# AGENTS.md

This is the canonical onboarding file for any AI coding agent working in this repository.
If another agent-specific file exists (for example `CLAUDE.md`), treat this file as source of truth.

## Mission

Track deals for LCBO today, built so it can grow into a general multi-retailer
tracker later, without breaking the static-data contract the frontend depends on.

## First 5 Minutes

1. Read this file fully.
2. Skim [README.md](../../README.md) for product and data-sourcing context.
3. Read [`docs/data-architecture.md`](../data-architecture.md) for the full
   data flow — pipeline, storage, and how the app consumes it. Read it before
   touching `scripts/`, `lib/deals.ts`, or `app/deal-radar.tsx`.
4. Note the shape of the project: Next.js (App Router, TypeScript) frontend
   under `app/`, entirely client-rendered. Deal/store data is static JSON
   from `public/data/`; preferences and thumbs-up/down feedback are the one
   piece of real server state, backed by Postgres via `lib/db.ts` and
   `app/api/*` Route Handlers.
5. `public/data/*.json` is generated output, not hand-authored — see Ground Rules.

## Ground Rules

- `public/data/*.json` (`deals.json`, `stores.json`, `price-history.json`) is
  generated output — never hand-edit it. Change the generating script instead
  (`scripts/fetch-deals.mjs`, `scripts/fetch-stores.mjs`) and re-run it.
- Never fabricate a "regular price" or discount. LCBO.dev doesn't expose one —
  discounts must be derived from an observed prior price recorded in
  `public/data/price-history.json`. See the comment block at the top of
  `scripts/fetch-deals.mjs` for why.
- Respect api.lcbo.dev's rate limit (60 req/60s) and fair-use terms (personal
  use, daily polling) — see the README's Data section. The same expectation
  applies to any future retailer API.
- Keep changes scoped; don't refactor unrelated areas.
- Pure logic (filtering, sorting, category-tree building, distance calc)
  lives in `lib/deals.ts` as framework-free functions — keep new logic there
  rather than inline in components, so it stays easy to reason about and test.
- Never hand-edit the Postgres schema in the Neon/Vercel dashboard. Change
  `scripts/db/migrate.mjs` (the schema's source of truth) and re-run
  `npm run db:migrate`.
- Never commit a real `DATABASE_URL` or any other secret. `.env*.local` is
  gitignored; `.env.example` documents required vars with empty placeholders.

## Repo Facts

- Frontend: Next.js App Router + TypeScript + React, mostly client-rendered
  (`app/deal-radar.tsx` and `app/preferences/page.tsx` are `"use client"`
  component trees). Styling is one global stylesheet (`app/globals.css`,
  ported from the pre-Next.js static site) using plain CSS custom
  properties, not Tailwind.
- Backend: two Next.js Route Handlers (`app/api/preferences/route.ts`,
  `app/api/feedback/route.ts`) backed by Postgres (Neon, provisioned via
  Vercel's Storage tab) through `lib/db.ts`. Raw SQL, no ORM. No other
  server logic or auth beyond that — Vercel Authentication gates the whole
  production deployment.
- Package manager: npm.
- Main commands: `npm run dev`, `npm run build`, `npm run typecheck`,
  `npm run db:migrate` (applies `scripts/db/migrate.mjs` against
  `DATABASE_URL` from `.env.local`).
- Data fetchers: plain Node ESM scripts under `scripts/`, no npm dependencies
  of their own. Run directly with `node scripts/fetch-stores.mjs`,
  `node scripts/fetch-deals.mjs`.
- `scripts/lib/lcbo-client.mjs` is the shared GraphQL client + pagination
  helper both fetch scripts depend on.
- Scheduled by `.github/workflows/fetch-deals.yml` (daily cron +
  `workflow_dispatch`), which runs both scripts and commits any resulting
  `public/data/*.json` diff back to `main`. That push auto-deploys via Vercel.
- Hosting: Vercel, gated by Vercel Authentication (Hobby-tier, zero-code —
  restricts the live URL to the owning Vercel account since this is a
  single-user tool, not a public product).
- No test suite, no lint config in this repo currently.

## Running Locally

- `npm install`, then `npm run dev` and open `http://localhost:3000`.
- To test the data fetchers locally: `node scripts/fetch-stores.mjs` then
  `node scripts/fetch-deals.mjs`. This will modify `public/data/*.json` in
  your working tree — don't commit a test run unless it's an intentional
  refresh.
- To use `/preferences` or the thumbs up/down buttons locally: copy
  `.env.example` to `.env.local`, fill in `DATABASE_URL` from the Vercel
  dashboard's Storage tab, then run `npm run db:migrate` once.

## High-Impact Paths

See [`docs/data-architecture.md`](../data-architecture.md) for the full
picture; the short version:

- `public/data/*.json` — the frontend's only data source, with no schema
  validation. A shape change here breaks the UI silently; keep it in sync
  with the `Deal`/`Store` types in `lib/deals.ts`.
- `lib/deals.ts` — shared types and all pure filter/sort/category-tree/
  distance logic; both `app/deal-radar.tsx` and its child components depend
  on it.
- `scripts/lib/lcbo-client.mjs` — shared by both fetch scripts; a bug here
  breaks both.
- `.github/workflows/fetch-deals.yml` — the only thing keeping data fresh in
  production. A broken script here means stale data with no alerting.

## Change Workflow

1. Understand the request and impacted files.
2. Edit only the necessary files.
3. If touching `scripts/`, run the relevant script locally and confirm
   `public/data/*.json` still looks sane.
4. If touching `app/` or `lib/`, run `npm run dev` and manually exercise the
   changed flow in a browser — there's no test suite to lean on.
5. Run `npm run typecheck` before considering a change done.
6. Report: what changed, why, and what was validated.

## Skills Folder

- `docs/ai/skills/<skill-name>/SKILL.md` is the entrypoint convention for a
  reusable playbook.
- Available skills:
  - [`docs/ai/skills/adding-a-retailer/SKILL.md`](./skills/adding-a-retailer/SKILL.md)
    — playbook for extending DealRadar to a new retailer beyond LCBO.

## Agent-Specific Files

- `CLAUDE.md` may exist for Claude-specific bootstrapping.
- If guidance conflicts, follow this file (`AGENTS.md`) unless a human
  explicitly instructs otherwise.
