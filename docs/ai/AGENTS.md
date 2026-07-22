# AGENTS.md

This is the canonical onboarding file for any AI coding agent working in this repository.
If another agent-specific file exists (for example `CLAUDE.md`), treat this file as source of truth.

## Mission

Track deals across multiple Ontario retailers — LCBO live today, more
planned (Best Buy is built but parked, see below) — without breaking the
static-data contract the frontend depends on. Each retailer gets its own
fetch script and its own `public/data/<retailer>-*.json`, merged into one
list client-side — never a UI rewrite per retailer.

## First 5 Minutes

1. Read this file fully.
2. Skim [README.md](../../README.md) for product and data-sourcing context.
3. Read [`docs/data-architecture.md`](../data-architecture.md) for the full
   data flow — pipeline, storage, and how the app consumes it. Read it before
   touching `scripts/`, `lib/deals.ts`, or `app/deal-radar.tsx`. Check
   [`docs/roadmap.md`](../roadmap.md) for what's shipped vs. parked — Best
   Buy support is written but not committed or deployed yet.
4. Note the shape of the project: Next.js (App Router, TypeScript) frontend
   under `app/`, entirely client-rendered. Deal/store data is static JSON
   from `public/data/`, one file per retailer per data type (`lcbo-deals.json`
   live; `bestbuy-deals.json` written but parked, see Ground Rules), merged
   client-side in `app/deal-radar.tsx`. Preferences (freeform notes) and
   thumbs-up/down feedback are real server state, backed by Postgres via
   `lib/db.ts` and `app/api/*` Route Handlers.
5. `public/data/*.json` is generated output, not hand-authored — see Ground Rules.

## Ground Rules

- `public/data/*.json` is generated output — never hand-edit it. Change the
  generating script instead (`scripts/fetch-lcbo-deals.mjs`,
  `scripts/fetch-lcbo-stores.mjs`, `scripts/fetch-bestbuy-deals.mjs`) and
  re-run it.
- Never fabricate a "regular price" or discount. LCBO.dev doesn't expose one —
  discounts must be derived from an observed prior price recorded in
  `public/data/lcbo-price-history.json`. See the comment block at the top of
  `scripts/fetch-lcbo-deals.mjs` for why. (Best Buy is different: it exposes
  real `regularPrice`/`salePrice` directly, so `fetch-bestbuy-deals.mjs`
  uses those as-is — no self-derived tracking needed or wanted there.)
- Respect each retailer API's own rate limit and terms: api.lcbo.dev is
  60 req/60s, personal-use fair-use (see the README's Data section);
  Best Buy's developer API is 5 req/sec / 50k calls/day, no caching beyond
  72 hours, no redistribution/resale. The same "check before adding" bar
  applies to any future retailer API.
- Per-retailer data files (`public/data/<retailer>-deals.json`), never one
  shared `deals.json` — each fetch script does a full overwrite, so a
  shared file would let whichever script runs second in CI silently
  destroy the other's data. The frontend merges retailers client-side
  instead (`app/deal-radar.tsx`, `Promise.allSettled`).
- Best Buy support is currently **parked**: `scripts/fetch-bestbuy-deals.mjs`
  and all the `retailer`-field/merge/UI plumbing are written, type-check,
  build, and are committed locally (gated, see below) but have never
  actually been run against the real Best Buy API. Blocked on their
  developer signup rejecting free email providers. Don't assume
  `bestbuy-deals.json` exists or that the fetch script actually works
  end-to-end until this is unblocked and verified — see `docs/roadmap.md`.
- **Gating convention for blocked/parked features**: when a feature is
  written but blocked on a secret/credential you don't have (see Best Buy
  above), gate it so it's safe to commit and push without regressing
  anything currently working, rather than leaving it uncommitted
  indefinitely. Concretely: CI/workflow steps that need a not-yet-existing
  secret get `if: env.SECRET_NAME != ''` (skip, don't fail — a failed step
  aborts later steps in the same job; a skipped one doesn't) with the
  secret exposed via job-level `env:` first (`secrets.*` isn't a recognized
  named-value directly in step `if:` conditions). UI that depends on
  not-yet-existing data hides itself rather than showing an empty/broken
  state (see `availableRetailers` in `app/deal-radar.tsx`). Whether to
  actually push a gated feature is still a separate decision from
  committing it — ask first.
- Keep changes scoped; don't refactor unrelated areas.
- Pure logic (filtering, sorting, category-tree building, distance calc)
  lives in `lib/deals.ts` as framework-free functions — keep new logic there
  rather than inline in components, so it stays easy to reason about and test.
- New or changed logic in `lib/*.ts` should get a colocated `*.test.ts` (see
  `lib/deals.test.ts`, `lib/favorites.test.ts`). Not a hard requirement for
  UI/component code — the test suite is intentionally scoped to pure,
  framework-free logic, not component rendering or the API routes.
- Never hand-edit the Postgres schema in the Neon/Vercel dashboard. Change
  `scripts/db/migrate.mjs` (the schema's source of truth) and re-run
  `npm run db:migrate`.
- Never commit a real `DATABASE_URL` or any other secret. `.env*.local` is
  gitignored; `.env.example` documents required vars with empty placeholders.
- `preferences` is notes-only — there is no notification email field.
  Email verification and a daily LLM-picks-by-email feature (`scripts/notify.mjs`)
  were designed and built once but have been removed entirely; don't revive
  them from git history without re-deciding the design from scratch (see
  `docs/roadmap.md`'s "Removed" section for why they were cut).

## Repo Facts

- Frontend: Next.js App Router + TypeScript + React, mostly client-rendered
  (`app/deal-radar.tsx` and `app/preferences/page.tsx` are `"use client"`
  component trees). UI components (Button, Select, Popover, Card, Badge,
  TextField, TextArea, IconButton) come from **Radix Themes**
  (`@radix-ui/themes`) — a pre-styled kit, chosen specifically to avoid
  Tailwind's utility-class sprawl; styled via component props and CSS
  variables instead. Domain-specific visuals with no Radix equivalent
  (deals grid layout, discount/price-drop/all-time-low badge colors, the
  thumb-wrap white chip behind product images) stay in `app/globals.css`
  (plain CSS custom properties, ported from the pre-Next.js static site).
  Dark mode: the site follows the OS automatically (no manual toggle) —
  see the inline script in `app/layout.tsx` that sets a `.dark`/`.light`
  class from `prefers-color-scheme`, since Radix Themes' own dark-mode CSS
  is gated behind that ancestor class and won't follow the OS on its own.
- Backend: two Next.js Route Handlers (`app/api/preferences/route.ts`,
  `app/api/feedback/route.ts`) backed by Postgres (Neon, provisioned via
  Vercel's Storage tab) through `lib/db.ts`. Raw SQL, no ORM. No other
  server logic or auth beyond that — Vercel Authentication gates the whole
  production deployment.
- Package manager: npm.
- Main commands: `npm run dev`, `npm run build`, `npm run typecheck`,
  `npm test` (Vitest, colocated `lib/*.test.ts` — pure logic only, no
  component/route tests), `npm run db:migrate` (applies
  `scripts/db/migrate.mjs` against `DATABASE_URL` from `.env.local`).
- Data fetchers: plain Node ESM scripts under `scripts/`, no npm dependencies
  of their own. Live: `node scripts/fetch-lcbo-stores.mjs`,
  `node scripts/fetch-lcbo-deals.mjs`. Written but parked, never actually
  run against the real API yet: `node scripts/fetch-bestbuy-deals.mjs`
  (needs `BESTBUY_API_KEY`, which is itself blocked — see Ground Rules).
- `scripts/lib/lcbo-client.mjs` is the shared GraphQL client + pagination
  helper the two LCBO fetch scripts depend on. Best Buy has no shared
  client file yet — only one Best Buy script exists so far.
- `.github/workflows/fetch-deals.yml`'s **committed/live** version schedules
  just the two LCBO fetches → commit + push (daily cron +
  `workflow_dispatch`), which auto-deploys via Vercel. The working tree's
  uncommitted version also adds a Best Buy fetch step — not live in CI
  until Best Buy is unparked and this file is actually committed.
- Hosting: Vercel, gated by Vercel Authentication (Hobby-tier, zero-code —
  restricts the live URL to the owning Vercel account since this is a
  single-user tool, not a public product).
- Tests: Vitest, `lib/*.test.ts` colocated with the code they cover. No lint
  config in this repo currently.

## Running Locally

- `npm install`, then `npm run dev` and open `http://localhost:3000`.
- To test the LCBO fetchers locally: `node scripts/fetch-lcbo-stores.mjs`
  then `node scripts/fetch-lcbo-deals.mjs`. This will modify
  `public/data/lcbo-*.json` in your working tree — don't commit a test run
  unless it's an intentional refresh.
- To test the Best Buy fetcher locally (once unparked — see Ground Rules):
  set `BESTBUY_API_KEY` in `.env.local`, then
  `node --env-file=.env.local scripts/fetch-bestbuy-deals.mjs`. Modifies
  `public/data/bestbuy-deals.json`.
- To use `/preferences` or the thumbs up/down buttons locally: copy
  `.env.example` to `.env.local`, fill in `DATABASE_URL` from the Vercel
  dashboard's Storage tab, then run `npm run db:migrate` once.

## High-Impact Paths

See [`docs/data-architecture.md`](../data-architecture.md) for the full
picture; the short version:

- `public/data/*.json` — the frontend's only data source, with no schema
  validation. A shape change here breaks the UI silently; keep it in sync
  with the `Deal`/`Store` types in `lib/deals.ts`. One file per retailer per
  data type — see the Ground Rules entry on why, before ever considering a
  shared file.
- `lib/deals.ts` — shared types (including `Retailer`) and all pure filter/
  sort/category-tree/distance logic; both `app/deal-radar.tsx` and its
  child components depend on it.
- `scripts/lib/lcbo-client.mjs` — shared by the two LCBO fetch scripts; a
  bug here breaks both (but not Best Buy's, which is independent).
- `.github/workflows/fetch-deals.yml` — the only thing keeping data fresh in
  production. A broken script here means stale data with no alerting.

## Change Workflow

1. Understand the request and impacted files.
2. Edit only the necessary files.
3. If touching `scripts/`, run the relevant script locally and confirm
   `public/data/*.json` still looks sane.
4. If touching `app/` or `lib/`, run `npm run dev` and manually exercise the
   changed flow in a browser — `npm test` only covers pure logic, not
   components, routing, or the API routes.
5. Run `npm run typecheck` and `npm test` before considering a change done.
6. Report: what changed, why, and what was validated.

## Skills Folder

- `docs/ai/skills/<skill-name>/SKILL.md` is the entrypoint convention for a
  reusable playbook.
- Available skills:
  - [`docs/ai/skills/adding-a-retailer/SKILL.md`](./skills/adding-a-retailer/SKILL.md)
    — playbook for extending DealRadar to a new retailer beyond LCBO, worked
    through once for Best Buy (parked on their signup process, not yet
    verified against the real API — see `docs/roadmap.md`).

## Agent-Specific Files

- `CLAUDE.md` may exist for Claude-specific bootstrapping.
- If guidance conflicts, follow this file (`AGENTS.md`) unless a human
  explicitly instructs otherwise.
