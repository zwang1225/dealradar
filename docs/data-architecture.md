# Data Architecture

How data moves from LCBO's API to the screen, and why it's shaped the way it
is. Written after the [Next.js migration](ai/AGENTS.md) (Phase 1 of the
roadmap), before Phase 2 adds the first real per-user mutable state
(preferences + thumbs-up/down feedback).

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

## Why this shape, and where it stops being enough

This is a single-user tool with almost no interactivity yet — the only
"write" anywhere is favorited categories in `localStorage`. That's why there
is deliberately no database, no API routes, and no server actions: static
JSON + a client-side fetch is the simplest thing that actually works for
read-only data plus one piece of trivial local state.

That stops being true at Phase 2. Preferences and thumbs-up/down feedback are
real per-user mutable state that needs to persist across devices/sessions and
feed an LLM call — at that point a real database and API routes/server
actions become necessary, and this doc should be updated to describe that
layer once it exists.

## Directory map

- `scripts/` — data pipeline (Node ESM, no framework, no npm dependencies)
  - `fetch-stores.mjs`, `fetch-deals.mjs` — entry points, run daily by CI
  - `lib/lcbo-client.mjs` — shared GraphQL client + pagination helper
- `public/data/` — pipeline output; the frontend's only data source
- `lib/` — framework-free TypeScript: `deals.ts` (types + pure logic),
  `favorites.ts` (localStorage helpers)
- `app/` — Next.js App Router
  - `deal-radar.tsx` — the one client component holding all UI state
  - `components/` — presentational subcomponents
  - `layout.tsx`, `page.tsx`, `globals.css` — App Router boilerplate
