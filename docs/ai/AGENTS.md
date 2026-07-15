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
   [`docs/roadmap.md`](../roadmap.md) for what's shipped vs. parked — some
   code in this tree (Best Buy support, email verification, `notify.mjs`) is
   written but not committed or deployed yet.
4. Note the shape of the project: Next.js (App Router, TypeScript) frontend
   under `app/`, entirely client-rendered. Deal/store data is static JSON
   from `public/data/`, one file per retailer per data type (`lcbo-deals.json`
   live; `bestbuy-deals.json` written but parked, see Ground Rules), merged
   client-side in `app/deal-radar.tsx`. Preferences and thumbs-up/down feedback are real
   server state, backed by Postgres via `lib/db.ts` and `app/api/*` Route
   Handlers. `preferences.email` is only ever set via magic-link
   verification (`app/api/preferences/verify/route.ts`), never written
   directly. `scripts/notify.mjs` (currently parked, uncommitted) would
   close the loop daily: picks/ranks deals with an LLM using that data, and
   emails the picks -- outside Next.js entirely, run by GitHub Actions.
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
  and build, but are uncommitted and have never actually been run against
  the real Best Buy API. Blocked on their developer signup rejecting free
  email providers. Don't assume `bestbuy-deals.json` exists or that the
  fetch script actually works end-to-end until this is unblocked and
  verified — see `docs/roadmap.md`.
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
- `scripts/notify.mjs` reads Postgres directly and calls OpenAI/Resend via
  plain `fetch()` — it must stay dependency-free like the rest of `scripts/`
  beyond `@neondatabase/serverless` (already used by `db/migrate.mjs`). Don't
  route it through `app/api/*`; those sit behind Vercel Authentication, which
  blocks this script's automated requests.
- `OPENAI_MODEL` has no hardcoded fallback in `notify.mjs` — required env
  var, set explicitly rather than silently guessed. Don't add a default.
- The LLM prompt in `notify.mjs` must only ever contain fields actually
  present in `lcbo-deals.json` — same "never fabricate" rule as the
  regular-price/discount logic in `fetch-lcbo-deals.mjs`.
- `notify.mjs` is currently **parked**: written and tested, but not
  committed, not wired up with real API keys, not running anywhere. Don't
  assume it's live in production just because it exists in the tree.
- Never write to `preferences.email` directly from `PUT
  /api/preferences` — only `app/api/preferences/verify/route.ts` may set
  it (after validating a token), or the `PUT` handler clearing it to `''`
  outright. Changing it always goes through `pending_email` +
  `verification_token` first.

## Repo Facts

- Frontend: Next.js App Router + TypeScript + React, mostly client-rendered
  (`app/deal-radar.tsx` and `app/preferences/page.tsx` are `"use client"`
  component trees). Styling is one global stylesheet (`app/globals.css`,
  ported from the pre-Next.js static site) using plain CSS custom
  properties, not Tailwind.
- Backend: three Next.js Route Handlers (`app/api/preferences/route.ts`,
  `app/api/preferences/verify/route.ts`, `app/api/feedback/route.ts`) backed
  by Postgres (Neon, provisioned via Vercel's Storage tab) through
  `lib/db.ts`. Raw SQL, no ORM. `app/api/preferences/route.ts`'s `PUT` also
  calls Resend directly (plain `fetch()`, no SDK) to send verification
  emails — needs `RESEND_API_KEY`/`RESEND_FROM` as **Vercel** env vars (not
  just GitHub Actions secrets). No other server logic or auth beyond that —
  Vercel Authentication gates the whole production deployment.
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
- `scripts/notify.mjs`: LLM-picks + email — **currently parked**,
  uncommitted, not deployed. Once resumed: run daily by CI as the last step
  (after data is fetched and committed), reading Postgres directly via
  `@neondatabase/serverless`, calling OpenAI + Resend via plain `fetch()`.
  Still only reads `lcbo-deals.json` — extending it to Best Buy is a
  follow-up, not done speculatively while parked. Full design in
  `docs/data-architecture.md`'s "LLM picks + email" section.
- `.github/workflows/fetch-deals.yml`'s **committed/live** version schedules
  just the two LCBO fetches → commit + push (daily cron +
  `workflow_dispatch`), which auto-deploys via Vercel. The working tree's
  uncommitted version also adds a Best Buy fetch step and the `notify.mjs`
  step — neither is live in CI until Best Buy and Phase 3 are unparked and
  this file is actually committed.
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
- To test email verification locally: also set `RESEND_API_KEY`/
  `RESEND_FROM` in `.env.local` (in production these are Vercel project env
  vars, set separately from the GitHub Actions secrets of the same name
  planned for `notify.mjs`). Saving a new email on `/preferences` sends a
  real verification email — there's no dry-run mode.
- To test `scripts/notify.mjs` locally: also set `OPENAI_API_KEY`,
  `OPENAI_MODEL`, `RESEND_API_KEY`, `RESEND_FROM` in `.env.local`, set a
  notification email on `/preferences` (it no-ops without one), then
  `node --env-file=.env.local scripts/notify.mjs`. This sends a real email
  if it doesn't no-op — there's no dry-run mode.

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
