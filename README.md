# BoozeRadar

Tracks LCBO deals, stock, and special drops across Ontario. Static
frontend (plain HTML/CSS/JS), no backend server.

## Data

Sourced from [api.lcbo.dev](https://lcbo.dev), an independent (not
LCBO-affiliated) GraphQL API — no auth required. It doesn't allow CORS
from the browser and rate-limits to 60 req/60s per IP, so a scheduled
GitHub Action (`.github/workflows/fetch-deals.yml`, daily) does the
fetching server-side and commits static JSON, which the frontend reads
directly (no API calls from the browser at all):

- `scripts/fetch-stores.mjs` → `data/stores.json` — every LCBO store's
  location. The frontend uses the browser's Geolocation API + client-side
  distance calculation to find your nearest store; prices are the same
  everywhere in Ontario, only stock varies by store.
- `scripts/fetch-deals.mjs` → `data/deals.json` — pulls LCBO's own
  official "on sale"/"clearance" merchandising categories (the real
  signal; the API's price-history endpoints exist in its schema but are
  currently unpopulated). Also maintains `data/price-history.json`, a
  small log of our own, to add "price dropped" / "at an all-time low"
  badges once a few days of runs have accumulated.

Per api.lcbo.dev's [terms of service](https://lcbo.dev/legal/terms-of-service):
personal use, daily polling of a few hundred products — well within
"reasonable usage." Don't redistribute or resell the underlying data.

## Running locally

No build step. Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
```
