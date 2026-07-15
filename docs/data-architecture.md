# Data Architecture

How data moves from LCBO's API to the screen, and why it's shaped the way it
is. Covers Phase 1 (the [Next.js migration](ai/AGENTS.md), static JSON only)
and Phase 2 (the first real per-user mutable state: preferences + thumbs-up/
down feedback, backed by Postgres).

## The pipeline (outside the Next.js app)

```
api.lcbo.dev (GraphQL)
  -> scripts/fetch-stores.mjs, scripts/fetch-deals.mjs   (plain Node ESM, no deps)
  -> public/data/*.json                                  (committed to git)
  -> .github/workflows/fetch-deals.yml                   (daily cron, commits + pushes)
  -> Vercel                                               (auto-deploys on every push to main)
```

- `scripts/` is deliberately **not** part of the Next.js app — no API routes,
  no server actions. It's two standalone Node scripts plus a shared client
  (`scripts/lib/lcbo-client.mjs`), run once a day by GitHub Actions. There's
  no reason for this to be reachable over HTTP, so it isn't.
- `public/data/*.json` (`deals.json`, `stores.json`, `price-history.json`) is
  the **only** data store in the whole project. Not a database — plain JSON
  files, committed straight into the repo, served by Next.js as static
  assets. A new day's data is just a new git commit.
- The `deals`/`stores` array shapes these scripts write are documented at the
  top of each script, and must be kept in sync by hand with the `Deal`/
  `Store` types in `lib/deals.ts` — the scripts are plain JS with no import
  relationship to the TypeScript app, so nothing enforces this automatically.

## The app (inside Next.js)

```
public/data/deals.json, public/data/stores.json
  -> app/deal-radar.tsx        ("use client", fetch() at runtime in the browser)
  -> lib/deals.ts               (framework-free types + pure filter/sort/tree/distance logic)
  -> app/components/*           (presentational rendering)
```

- `app/deal-radar.tsx` is a single `"use client"` component holding all UI
  state (search, sort, selected category, geolocation, radius). It fetches
  the JSON files with the browser's `fetch()` at runtime — not
  server-rendered, not build-time embedded. Functionally this page behaves
  like a classic client-side SPA; it just happens to be shipped via Next.js's
  build tooling rather than a bare React setup.
- `lib/deals.ts` holds every piece of pure logic (category tree building,
  filtering, sorting, distance calculation, bottle-info formatting) as
  framework-free functions, so it stays easy to reason about independent of
  React. `lib/favorites.ts` is the one bit of actual client-side "write"
  state today — favorited categories in `localStorage`.
- `app/components/` are presentational only; they take data and callbacks as
  props and don't know where either comes from.

## Preferences + feedback (Phase 2, Postgres)

The first real per-user mutable state, and the first database in this
project — added because Phase 3 (LLM-picked deals + email) needs actual data
to read, and `localStorage` can't be read server-side or across devices.

```
Neon Postgres (provisioned via Vercel's Storage tab)
  -> lib/db.ts                    (neon() tagged-template client, reads DATABASE_URL)
  -> app/api/preferences/route.ts, app/api/feedback/route.ts   (Next.js Route Handlers)
  -> app/preferences/page.tsx, app/components/ThumbButtons.tsx  (UI)
```

- Two tables, both created/managed by `scripts/db/migrate.mjs` (the schema's
  source of truth — idempotent, safe to re-run, **never hand-edit the schema
  in the Neon/Vercel dashboard**):
  - `preferences` — a single row (`id` pinned to `1` via a CHECK constraint):
    freeform `notes` text (feeds an LLM prompt in Phase 3, not a strict
    filter — structured columns per category/brand/price would be
    premature) plus `email`, the one address Phase 3 will send picks to.
    No `users` table and no accounts — this is still explicitly a
    single-user tool, so there's deliberately nothing to key user data by
    beyond this one row.
  - `deal_feedback` — `sku` (primary key), `vote` (`'up' | 'down'`),
    `created_at`. Voting again on the same deal overwrites via
    `ON CONFLICT`; voting the same way twice clears it (toggle-off), the
    same UX `lib/favorites.ts` already uses for favorited categories.
- `lib/db.ts` exports a single `sql` client (`@neondatabase/serverless`'s
  `neon()`, an HTTP driver — no connection pooling to manage, safe to
  instantiate once at module scope). Both API routes import it; nothing
  else needs direct DB access.
- No auth code in the API routes: Vercel Authentication already gates the
  *entire* production deployment (set up in Phase 1), so `/api/*` is
  automatically behind that same single-user gate. Local dev
  (`npm run dev`) has no such gate — accepted as-is for a single-user tool.
- Local dev and the migration script need `DATABASE_URL` in a gitignored
  `.env.local` (see `.env.example`); production gets it auto-injected by
  Vercel's Postgres integration.

## Why this shape, and where it stops being enough

Phase 1 shipped with almost no interactivity — the only "write" anywhere was
favorited categories in `localStorage`, so static JSON + a client-side fetch
was the simplest thing that actually worked.

Phase 2 crossed that line: preferences and feedback are real per-user state
that needs to persist across devices/sessions and feed an LLM call, so a
database and API routes became necessary — see the section above.

What's still *not* here: no LLM calls, no email, no auth beyond Vercel
Authentication gating the whole deployment. That's Phase 3, which reads the
`preferences`/`deal_feedback` tables added in this phase.

## Directory map

- `scripts/` — data pipeline (Node ESM, no framework, no npm dependencies)
  - `fetch-stores.mjs`, `fetch-deals.mjs` — entry points, run daily by CI
  - `lib/lcbo-client.mjs` — shared GraphQL client + pagination helper
  - `db/migrate.mjs` — schema source of truth for `preferences`/`deal_feedback`
- `public/data/` — pipeline output; the frontend's read-only data source
- `lib/` — framework-free TypeScript: `deals.ts` (types + pure logic),
  `favorites.ts` (localStorage helpers), `db.ts` (Postgres client)
- `app/` — Next.js App Router
  - `deal-radar.tsx` — the main client component holding all deals-page UI state
  - `preferences/page.tsx` — preferences editor
  - `api/preferences/`, `api/feedback/` — Route Handlers backing the two tables
  - `components/` — presentational subcomponents
  - `layout.tsx`, `page.tsx`, `globals.css` — App Router boilerplate
