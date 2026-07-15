# DealRadar

A deals/stock tracker, currently scoped to LCBO (Ontario) but meant to
grow into a general multi-retailer tracker over time (e.g. Best Buy and
others) — hence the name isn't liquor-specific. Next.js (App Router,
TypeScript) frontend, mostly client-rendered, with a small Postgres-backed
API for preferences and thumbs-up/down feedback. Deployed on Vercel, gated
by Vercel Authentication since this is a single-user tool, not a public
product.

**Today**: LCBO only. The data layer (`scripts/`, `public/data/*.json`) and
the frontend's filtering/sorting are LCBO-shaped for now; extending to
another retailer means adding its own fetch script + a shared/normalized
deal shape, not a rewrite of the UI. See
[`docs/ai/skills/adding-a-retailer/SKILL.md`](docs/ai/skills/adding-a-retailer/SKILL.md).

## Data

Sourced from [api.lcbo.dev](https://lcbo.dev), an independent (not
LCBO-affiliated) GraphQL API — no auth required. It doesn't allow CORS
from the browser and rate-limits to 60 req/60s per IP, so a scheduled
GitHub Action (`.github/workflows/fetch-deals.yml`, daily) does the
fetching server-side and commits static JSON, which the frontend reads
directly as a static asset (no API calls from the browser at all):

- `scripts/fetch-stores.mjs` → `public/data/stores.json` — every LCBO
  store's location. The frontend uses the browser's Geolocation API +
  client-side distance calculation to find your nearest store; prices are
  the same everywhere in Ontario, only stock varies by store.
- `scripts/fetch-deals.mjs` → `public/data/deals.json` — pulls LCBO's own
  official "on sale"/"clearance" merchandising categories (the real
  signal; the API's price-history endpoints exist in its schema but are
  currently unpopulated). Also maintains `public/data/price-history.json`,
  a small log of our own, to add "price dropped" / "at an all-time low"
  badges once a few days of runs have accumulated.

Per api.lcbo.dev's [terms of service](https://lcbo.dev/legal/terms-of-service):
personal use, daily polling of a few hundred products — well within
"reasonable usage." Don't redistribute or resell the underlying data.

See [`docs/data-architecture.md`](docs/data-architecture.md) for the full
data flow from LCBO's API through to what renders on screen, and why it's
shaped the way it is.

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
