# DealRadar

A deals/stock tracker spanning multiple Ontario retailers — hence the name
isn't liquor-specific, even though LCBO was the first source. Next.js (App
Router, TypeScript) frontend, mostly client-rendered, with a small
Postgres-backed API for preferences (freeform notes) and thumbs-up/down
feedback. Deployed on Vercel, gated by Vercel Authentication since this is a
single-user tool, not a public product.

**Today**: LCBO is live. Best Buy support is written but parked — see below.
The data layer (`scripts/`, `public/data/*.json`) is per-retailer — each
retailer gets its own fetch script and its own
`public/data/<retailer>-deals.json`, merged into one list client-side (see
`docs/data-architecture.md`) — so extending to another retailer means
adding its own fetch script + a shared/normalized deal shape, not a
rewrite of the UI. See
[`docs/ai/skills/adding-a-retailer/SKILL.md`](docs/ai/skills/adding-a-retailer/SKILL.md).
Other retailers were researched and ruled out (no official API, or an
unofficial/fragile one, or seller-only) — see `docs/roadmap.md`.

## Data

### LCBO

Sourced from [api.lcbo.dev](https://lcbo.dev), an independent (not
LCBO-affiliated) GraphQL API — no auth required. It doesn't allow CORS
from the browser and rate-limits to 60 req/60s per IP, so a scheduled
GitHub Action (`.github/workflows/fetch-deals.yml`, daily) does the
fetching server-side and commits static JSON, which the frontend reads
directly as a static asset (no API calls from the browser at all):

- `scripts/fetch-lcbo-stores.mjs` → `public/data/lcbo-stores.json` — every
  LCBO store's location. The frontend uses the browser's Geolocation API +
  client-side distance calculation to find your nearest store; prices are
  the same everywhere in Ontario, only stock varies by store.
- `scripts/fetch-lcbo-deals.mjs` → `public/data/lcbo-deals.json` — pulls
  LCBO's own official "on sale"/"clearance" merchandising categories (the
  real signal; the API's price-history endpoints exist in its schema but
  are currently unpopulated). Also maintains
  `public/data/lcbo-price-history.json`, a small log of our own, to add
  "price dropped" / "at an all-time low" badges once a few days of runs
  have accumulated.

Per api.lcbo.dev's [terms of service](https://lcbo.dev/legal/terms-of-service):
personal use, daily polling of a few hundred products — well within
"reasonable usage." Don't redistribute or resell the underlying data.

### Best Buy (parked)

Written but not committed or running anywhere — blocked on Best Buy's
developer signup itself, which rejects free email providers (Gmail, Yahoo,
Outlook, etc.) and requires a custom-domain email to register for an API
key. Documented here as the intended design once unblocked; see
`docs/roadmap.md`.

Sourced from the official [Best Buy Developer API](https://developer.bestbuy.com/)
(Products API, `onSale=true` filter) via `scripts/fetch-bestbuy-deals.mjs` →
`public/data/bestbuy-deals.json`. Unlike LCBO, Best Buy exposes real
`regularPrice`/`salePrice` directly, so no self-derived price-history
tracking is needed for it. Per-store "in stock near me" is intentionally
**not** fetched for Best Buy (`inStockStoreIds` is always `[]`) — scoped
out to avoid per-SKU-per-store rate-limit complexity; the API does support
it if this gets revisited.

Best Buy's terms: personal apps you develop are permitted; the real
constraints are no caching beyond 72 hours (this repo refreshes daily,
well within that) and no redistribution/resale of the data. Rate limit:
5 req/sec, 50,000 calls/day for a standard key.

Once unblocked, needs a `BESTBUY_API_KEY` GitHub Actions repository secret
for the daily fetch to run in CI.

See [`docs/data-architecture.md`](docs/data-architecture.md) for the full
data flow from LCBO's API through to what renders on screen, and why it's
shaped the way it is. See [`docs/roadmap.md`](docs/roadmap.md) for what's
shipped vs. parked.

## Running locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The deals page works with just that. Preferences and thumbs up/down need a
database:

1. Provision a Postgres database from the Vercel dashboard's Storage tab
   (attached to this project — production already gets its env vars from
   this automatically).
2. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL` from that
   same dashboard.
3. `npm run db:migrate` (once, to create the tables).
