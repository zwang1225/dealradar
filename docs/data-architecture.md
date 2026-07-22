# Data Architecture

How data moves from each retailer's API to the screen, and why it's shaped
the way it is. Covers Phase 1 (the [Next.js migration](ai/AGENTS.md), static
JSON only), Phase 2 (the first real per-user mutable state: preferences +
thumbs-up/down feedback, backed by Postgres), and multi-retailer support
(Best Buy alongside LCBO).

**Status note**: Best Buy support is written and described below as the
intended design, but is **parked** — uncommitted, not deployed, not
verified against the real API. See [`docs/roadmap.md`](roadmap.md) for
exactly what's live vs. parked; don't assume anything Best-Buy-related in
this doc is actually running in production. Email verification and a
Phase 3 LLM-picked-deals-by-email feature were designed and built but have
since been removed entirely (see roadmap's "Removed" section) — neither is
described below anymore.

## The pipeline (outside the Next.js app)

```
api.lcbo.dev (GraphQL)          api.bestbuy.com (REST)
  -> scripts/fetch-lcbo-stores.mjs, fetch-lcbo-deals.mjs     -> scripts/fetch-bestbuy-deals.mjs
  -> public/data/lcbo-*.json                                 -> public/data/bestbuy-deals.json
                        \_______________  committed to git  _______________/
                                              |
                          .github/workflows/fetch-deals.yml (daily cron, commits + pushes)
                                              |
                                Vercel (auto-deploys on every push to main)
```

- `scripts/` is deliberately **not** part of the Next.js app — no API routes,
  no server actions. It's standalone Node scripts, each retailer with its
  own (LCBO's share `scripts/lib/lcbo-client.mjs`; Best Buy has no shared
  client yet since there's only one Best Buy script so far), run once a day
  by GitHub Actions. There's no reason for this to be reachable over HTTP,
  so it isn't.
- `public/data/*.json` is the **only** data store in the whole project. Not
  a database — plain JSON files, committed straight into the repo, served
  by Next.js as static assets. A new day's data is just a new git commit.
- **Per-retailer files, not one shared file**: `lcbo-deals.json` and
  `bestbuy-deals.json` are written independently by their own scripts, each
  doing a full overwrite. Sharing one `deals.json` between them was
  considered and rejected — whichever script ran second in the CI job would
  silently destroy the other's data. The frontend merges them into one list
  at fetch time instead (see below) — same end-user experience, no
  clobbering risk, and each fetch script stays fully independent.
- The `deals`/`stores` array shapes these scripts write are documented at the
  top of each script, and must be kept in sync by hand with the `Deal`/
  `Store` types in `lib/deals.ts` — the scripts are plain JS with no import
  relationship to the TypeScript app, so nothing enforces this automatically.
- Best Buy exposes real `regularPrice`/`salePrice`/`percentSavings` directly
  (unlike LCBO, which needs the self-derived price-history workaround in
  `fetch-lcbo-deals.mjs`), and Best Buy's `onSale=true` query filter finds
  its sale items the way LCBO's sale/clearance category search does.
  Per-store inventory (`inStockStoreIds`) is intentionally left `[]` for
  Best Buy — scoped out to avoid per-SKU-per-store rate-limit complexity;
  the API supports it if this gets revisited.

## The app (inside Next.js)

```
public/data/lcbo-deals.json, public/data/bestbuy-deals.json, public/data/lcbo-stores.json
  -> app/deal-radar.tsx        ("use client", fetch() at runtime in the browser, Promise.allSettled across deal sources)
  -> lib/deals.ts               (framework-free types + pure filter/sort/tree/distance logic)
  -> app/components/*           (presentational rendering)
```

- `app/deal-radar.tsx` is a single `"use client"` component holding all UI
  state (search, sort, selected category, selected retailer, geolocation,
  radius). It fetches the JSON files with the browser's `fetch()` at
  runtime — not server-rendered, not build-time embedded. Functionally this
  page behaves like a classic client-side SPA; it just happens to be
  shipped via Next.js's build tooling rather than a bare React setup.
- The two deal sources are fetched via `Promise.allSettled`, not
  `Promise.all` — one retailer's file being temporarily missing (e.g.
  before its first CI run) shrinks the merged list rather than breaking the
  page; only both failing shows the "couldn't load" error state.
- `Deal.retailer` (`"lcbo" | "bestbuy"`) is the only thing that
  distinguishes a merged deal's source; `getVisibleDeals` filters on it
  exactly like the existing category/search filters. `buildCategoryTree`
  needed no changes — it already works generically off the `category`
  string regardless of which retailer wrote it.
- `lib/deals.ts` holds every piece of pure logic (category tree building,
  filtering, sorting, distance calculation, bottle-info formatting) as
  framework-free functions, so it stays easy to reason about independent of
  React. `lib/favorites.ts` is the one bit of actual client-side "write"
  state today — favorited categories in `localStorage`.
- `app/components/` are presentational only; they take data and callbacks as
  props and don't know where either comes from.

## Preferences + feedback (Phase 2, Postgres)

The first real per-user mutable state, and the first database in this
project — added because per-user notes and voting need to persist across
devices/sessions, and `localStorage` can't be read server-side or across
devices.

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
    freeform `notes` text only — structured columns per category/brand/price
    would be premature. No `users` table and no accounts — this is still
    explicitly a single-user tool, so there's deliberately nothing to key
    user data by beyond this one row.
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
that needs to persist across devices/sessions, so a database and API routes
became necessary.

Working through Best Buy support designed out the per-retailer-file pattern
the `adding-a-retailer` skill had only proposed before — though Best Buy
itself is parked (blocked on their developer signup, see `docs/roadmap.md`),
not yet run against the real API. What's still not here: no accounts/
multi-user support (a deliberate non-goal — see the `preferences` note
above), no per-store inventory for Best Buy.

## Directory map

- `scripts/` — data pipeline (Node ESM, no framework)
  - `fetch-lcbo-stores.mjs`, `fetch-lcbo-deals.mjs` — LCBO entry points, run
    daily by CI, no npm dependencies
  - `lib/lcbo-client.mjs` — shared GraphQL client + pagination helper (LCBO only)
  - `fetch-bestbuy-deals.mjs` — Best Buy entry point, run daily by CI, no
    npm dependencies; no shared client file yet (only one Best Buy script)
  - `db/migrate.mjs` — schema source of truth for `preferences`/`deal_feedback`
    and their columns
- `public/data/` — pipeline output; the frontend's read-only data source.
  `lcbo-*.json` and `bestbuy-deals.json` are independent files, merged
  client-side (see above), not one shared file.
- `lib/` — framework-free TypeScript: `deals.ts` (types + pure logic,
  including the `Retailer` type and per-retailer filtering),
  `favorites.ts` (localStorage helpers), `db.ts` (Postgres client)
- `app/` — Next.js App Router
  - `deal-radar.tsx` — the main client component holding all deals-page UI
    state, including the retailer filter
  - `preferences/page.tsx` — notes-only preferences editor
  - `api/preferences/`, `api/feedback/` — Route Handlers backing
    preferences and feedback
  - `components/` — presentational subcomponents
  - `layout.tsx`, `page.tsx`, `globals.css` — App Router boilerplate
