# Data Architecture

How data moves from each retailer's API to the screen, and why it's shaped
the way it is. Covers Phase 1 (the [Next.js migration](ai/AGENTS.md), static
JSON only), Phase 2 (the first real per-user mutable state: preferences +
thumbs-up/down feedback, backed by Postgres), Phase 3 (LLM-picked deals
emailed daily, reading the data Phase 2 collected), and multi-retailer
support (Best Buy alongside LCBO).

**Status note**: Best Buy support, email verification, and Phase 3 are all
written and described below as the intended design, but are **parked** —
uncommitted, not deployed, not verified against the real APIs. See
[`docs/roadmap.md`](roadmap.md) for exactly what's live vs. parked; don't
assume anything Best-Buy-related in this doc is actually running in
production.

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
                                              |
                          scripts/notify.mjs (last step of the same job -- see Phase 3 section below)
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
    premature) plus `email`, the one **verified** address Phase 3 will send
    picks to. No `users` table and no accounts — this is still explicitly a
    single-user tool, so there's deliberately nothing to key user data by
    beyond this one row.
  - `deal_feedback` — `sku` (primary key), `vote` (`'up' | 'down'`),
    `created_at`. Voting again on the same deal overwrites via
    `ON CONFLICT`; voting the same way twice clears it (toggle-off), the
    same UX `lib/favorites.ts` already uses for favorited categories.
- `email` is only ever set by a magic-link verification flow, never
  directly from the `/preferences` form — see "Email verification" below.
  This applies every time the email is changed, not just once: a
  newly-typed address only becomes active after its owner clicks the link
  sent to it, and the previously-verified address stays authoritative until
  then.
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

## Email verification

`preferences.email` is never written directly from the `/preferences` form
— a typed address only becomes the active `email` after its owner clicks a
magic link sent to it. This applies on every change, not just the first
time: the previously-verified address stays authoritative until a new one
is confirmed, so a typo or an unauthorized edit can't silently redirect
notifications to the wrong inbox.

```
app/preferences/page.tsx (PUT /api/preferences)
  -> pending_email + verification_token + verification_expires_at set, email unchanged
  -> Resend sends a link to app/api/preferences/verify/route.ts
  -> clicking it: valid + unexpired token -> email = pending_email, pending cleared
```

- `app/api/preferences/route.ts`'s `PUT` handler: if the submitted email
  equals the current verified `email`, nothing email-related changes (just a
  notes update — avoids sending a verification email on every unrelated
  save). If it's submitted empty, `email` clears immediately — removing a
  notification target needs no verification, only adding/changing one does.
  Otherwise it sets `pending_email` + a fresh `verification_token`
  (`crypto.randomUUID()`) + a 24h expiry, and emails the link — the verified
  `email` column isn't touched until the link is actually clicked.
- `app/api/preferences/verify/route.ts` is a `GET` handler (it's reached by
  clicking a link from an email client, which only ever issues `GET`) that
  validates the token, applies the pending email if valid/unexpired, and
  redirects back to `/preferences` with a `verified=1` or `verifyError=...`
  query param the page reads to show a banner.
- The verification link is built from Vercel's `VERCEL_PROJECT_PRODUCTION_URL`
  system env var, not `VERCEL_URL` — `VERCEL_URL` is itself gated by Vercel
  Authentication and would produce a link the recipient can't use, while
  `VERCEL_PROJECT_PRODUCTION_URL` is Vercel's documented way to build
  production links under Deployment Protection.
- This sends real email from the **Vercel-hosted** app itself (unlike
  `notify.mjs` below, which runs in GitHub Actions), so `RESEND_API_KEY`/
  `RESEND_FROM` need to be set as Vercel project environment variables, not
  just GitHub Actions secrets — even though the values can be the same.
- Not covered by the Vitest suite: this logic is inherently DB- and
  network-coupled (token lookup, expiry check, sending email), the same
  category `docs/ai/AGENTS.md` already carves out as not needing
  `*.test.ts` coverage. Verified manually instead.

## LLM picks + email (Phase 3, `scripts/notify.mjs` — currently parked)

Written but not yet wired up with real API keys, not committed, and not
running in production. Parked while deciding on LLM billing (OpenAI API
access is billed separately from any ChatGPT subscription — no way to pay
for it via a Plus/Pro plan). Documented here as the intended design once
resumed.

```
public/data/lcbo-deals.json + preferences/deal_feedback (Postgres)
  -> scripts/notify.mjs    (last step of .github/workflows/fetch-deals.yml, plain fetch() to both APIs)
  -> OpenAI (pick/rank)  -> Resend (send)
```

Written before Best Buy support landed — still only reads
`lcbo-deals.json`. Extending it to `bestbuy-deals.json` too is a follow-up
once Phase 3 is actually resumed, not done speculatively while it's parked.

- Runs as the **last** step in the same daily GitHub Actions job as the LCBO
  fetch, after that data is fetched *and committed* — a failure here (API
  outage, bad key) can never block or risk today's deals data from being
  published.
- Reads Postgres **directly** (same `neon()` pattern as
  `scripts/db/migrate.mjs`), not through `app/api/*`. Those routes sit behind
  Vercel Authentication, which would block this script's automated request —
  so this bypasses Vercel/Next.js entirely for both the DB read and the
  OpenAI/Resend calls. Plain `fetch()`, no SDKs, matching every other script
  in `scripts/`.
- No-ops cleanly (exit 0, not a failure) in two cases: no notification email
  set yet, or the LLM decides nothing is worth picking that day. Never sends
  an empty or padded-for-the-sake-of-it email.
- The prompt only ever contains fields actually present in `lcbo-deals.json`
  (not yet extended to `bestbuy-deals.json`, see above), trimmed to what
  picking needs (`trimDealForPrompt` in `notify.mjs` — drops
  `inStockStoreIds`, which can run 80+ entries per deal, plus
  `thumbnailUrl`/`saleCategories`). Same "never fabricate" rule as the
  regular-price/discount logic in `fetch-lcbo-deals.mjs`.
- `OPENAI_MODEL` has no hardcoded fallback — required env var, set explicitly
  at setup time rather than risk silently running against a wrong or
  deprecated model name.
- The email's only link is back to the DealRadar site itself — there's no
  per-product deep link available. `api.lcbo.dev` exposes no product
  URL/slug (confirmed via GraphQL introspection), and guessing at lcbo.com's
  own URL scheme from the sku proved unreliable in practice.
- The pure, non-network parts (`trimDealForPrompt`, `buildPrompt`,
  `shouldSkip`, `buildEmailHtml`) are exported and covered by
  `scripts/notify.test.mjs` — same "test the core logic" bar as `lib/*.test.ts`.

## Why this shape, and where it stops being enough

Phase 1 shipped with almost no interactivity — the only "write" anywhere was
favorited categories in `localStorage`, so static JSON + a client-side fetch
was the simplest thing that actually worked.

Phase 2 crossed that line: preferences and feedback are real per-user state
that needs to persist across devices/sessions and feed an LLM call, so a
database and API routes became necessary.

Between Phase 2 and Phase 3, email verification closed a real gap: nothing
previously confirmed a typed email was legitimate before it became the
active notification target. Phase 3, once resumed, closes the loop by
reading what Phase 2 collected to actually do something with it. Separately,
working through Best Buy support designed out the per-retailer-file pattern
the `adding-a-retailer` skill had only proposed before — though Best Buy
itself is parked (blocked on their developer signup, see `docs/roadmap.md`),
not yet run against the real API. What's still not here: no accounts/
multi-user support (a deliberate non-goal — see the `preferences` note
above), no in-app UI for reviewing past picks, no retry/alerting if a daily
run fails silently beyond GitHub Actions' own run history, no per-store
inventory for Best Buy.

## Directory map

- `scripts/` — data pipeline (Node ESM, no framework)
  - `fetch-lcbo-stores.mjs`, `fetch-lcbo-deals.mjs` — LCBO entry points, run
    daily by CI, no npm dependencies
  - `lib/lcbo-client.mjs` — shared GraphQL client + pagination helper (LCBO only)
  - `fetch-bestbuy-deals.mjs` — Best Buy entry point, run daily by CI, no
    npm dependencies; no shared client file yet (only one Best Buy script)
  - `db/migrate.mjs` — schema source of truth for `preferences`/`deal_feedback`
    and their columns, including the email-verification ones
  - `notify.mjs`, `notify.test.mjs` — Phase 3's LLM-pick + email step (currently
    parked, see above), would run last in the same daily CI job; uses
    `@neondatabase/serverless`, otherwise plain `fetch()`
- `public/data/` — pipeline output; the frontend's read-only data source.
  `lcbo-*.json` and `bestbuy-deals.json` are independent files, merged
  client-side (see above), not one shared file.
- `lib/` — framework-free TypeScript: `deals.ts` (types + pure logic,
  including the `Retailer` type and per-retailer filtering),
  `favorites.ts` (localStorage helpers), `db.ts` (Postgres client)
- `app/` — Next.js App Router
  - `deal-radar.tsx` — the main client component holding all deals-page UI
    state, including the retailer filter
  - `preferences/page.tsx` — preferences editor, including email verification status
  - `api/preferences/`, `api/preferences/verify/`, `api/feedback/` — Route
    Handlers backing preferences (+ its verification flow) and feedback
  - `components/` — presentational subcomponents
  - `layout.tsx`, `page.tsx`, `globals.css` — App Router boilerplate
