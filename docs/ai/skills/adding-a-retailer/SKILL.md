# Adding a New Retailer

Use when extending DealRadar beyond LCBO to a new retailer (e.g. Best Buy),
per the project's stated direction in [README.md](../../../../README.md).

## Steps

1. Add `scripts/fetch-<retailer>-deals.mjs` (and `fetch-<retailer>-stores.mjs`
   if the retailer has physical locations), following the shape of the
   existing `scripts/fetch-deals.mjs` / `scripts/fetch-stores.mjs`.
2. Normalize each deal to the shared shape the frontend already expects (see
   the `deals` array written by `scripts/fetch-deals.mjs`):
   `sku`, `name`, `priceInCents`, `regularPriceInCents`, `discountPercent`,
   `category`, `thumbnailUrl`, `inStockStoreIds`, `priceDropped`,
   `nearHistoricalLow`.
   - If the new retailer's API exposes a real "regular price" directly, use
     it — LCBO's self-derived price-history workaround
     (`scripts/fetch-deals.mjs`) exists only because LCBO.dev doesn't give us
     one.
3. Decide on data layout: separate files per retailer
   (`public/data/<retailer>-deals.json`) vs. a single `public/data/deals.json`
   with a `retailer` field, based on whether the frontend should ever show
   cross-retailer results in one list.
4. Wire the new script(s) into `.github/workflows/fetch-deals.yml`, or add a
   separate workflow if the schedule or rate limits differ from LCBO's.
5. Update the `Deal` type and the fetch calls in `app/deal-radar.tsx` to read
   from the new source(s), and add a retailer filter to the UI if
   `public/data/deals.json` now spans multiple retailers.
6. Update the README's Data section to document the new source, its terms of
   use, and its rate limits.

## Gotchas

- Don't assume every retailer exposes stock-by-store — some may be
  online-only. `inStockStoreIds` should be an empty array in that case;
  `app/deal-radar.tsx` already handles `nearbyStores.length === 0`
  gracefully (no stock line rendered) via the shared logic in `lib/deals.ts`.
- Respect the new API's own rate limits and terms of service, same as
  api.lcbo.dev's fair-use requirement documented in the README.
