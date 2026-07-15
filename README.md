# BoozeRadar

Tracks LCBO deals, stock, and special drops across Ontario. Static
frontend (plain HTML/CSS/JS), no backend server.

## Data

LCBO has no official public API, so the data layer will need to scrape
lcbo.com (or a mirror/aggregator if one exists) on a schedule and drop
the result into a static JSON file the frontend reads — the browser
itself won't scrape LCBO directly (CORS, and it'd hammer their site on
every visit). Likely shape: a scheduled GitHub Action that scrapes,
writes `data/deals.json`, commits it, and the static site (GitHub
Pages) just fetches that file.

Not built yet — this is the plan, not the implementation.

## Running locally

No build step. Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000
```
