# Adding a New Retailer

Use when extending DealRadar beyond LCBO/Best Buy to a new retailer, per the
project's stated direction in [README.md](../../../../README.md). The
pattern below is proven, not just proposed — Best Buy is the reference
implementation to copy from.

**First**: check the retailer actually has a usable API before writing any
code. `docs/roadmap.md` lists retailers already researched and ruled out
(Walmart, Sephora, Canada Computers, Costco, Canadian Tire, Home Depot,
Target) and why — no official API, an unofficial/fragile one, or seller-only
access. Don't scrape; that's an explicit non-goal of this project.

## Steps

1. Add `scripts/fetch-<retailer>-deals.mjs` (and `fetch-<retailer>-stores.mjs`
   if the retailer has physical locations and you're wiring up per-store
   inventory — see the Best Buy gotcha below on whether that's worth doing
   day one), following the shape of `scripts/fetch-lcbo-deals.mjs` /
   `scripts/fetch-lcbo-stores.mjs` (self-derived price-history) or
   `scripts/fetch-bestbuy-deals.mjs` (real regular price from the API,
   REST pagination) depending on which fits the new API better. Only
   extract a shared client file (like `scripts/lib/lcbo-client.mjs`) once
   there's a second script for that retailer to share it with — don't
   pre-build one.
2. Normalize each deal to the shared shape (`Deal` in `lib/deals.ts`):
   `sku`, `name`, `priceInCents`, `regularPriceInCents`, `discountPercent`,
   `category`, `thumbnailUrl`, `inStockStoreIds`, `priceDropped`,
   `nearHistoricalLow`, and **`retailer`** (add the new retailer to the
   `Retailer` union type).
   - If the new retailer's API exposes a real "regular price" directly, use
     it — LCBO's self-derived price-history workaround
     (`scripts/fetch-lcbo-deals.mjs`) exists only because LCBO.dev doesn't
     give us one; don't build that workaround for a retailer that doesn't
     need it (Best Buy didn't).
3. Data layout is settled, not a per-retailer decision: each retailer gets
   its own `public/data/<retailer>-deals.json`, written by a full overwrite
   in its own script. **Never** share one file across retailers' fetch
   scripts — whichever runs second in CI would silently destroy the other's
   data (this was considered and rejected when Best Buy was added). The
   frontend merges retailers into one list client-side instead (see step 5).
4. Wire the new script(s) into `.github/workflows/fetch-deals.yml` (add a
   step + its `git add` path to the commit step), or add a separate
   workflow if the schedule or rate limits differ enough to warrant it.
5. Update `app/deal-radar.tsx`'s deals-loading effect to also fetch the new
   `public/data/<retailer>-deals.json` via the existing `Promise.allSettled`
   (tolerates one source being temporarily missing, e.g. before its first
   CI run — only errors if every source fails), and add the new retailer as
   an `<option>` in the existing retailer `<select>`. No changes needed to
   `buildCategoryTree`/category filtering — it already works generically off
   the `category` string regardless of retailer.
6. Update the README's Data section to document the new source, its terms of
   use, and its rate limits — including any caching/redistribution
   restrictions (Best Buy's terms cap caching at 72 hours and forbid
   redistribution; check the new retailer's terms for equivalents before
   shipping).

## Gotchas

- Don't assume every retailer exposes stock-by-store — some may be
  online-only, or exposing it may not be worth the added API-call volume
  (Best Buy's per-SKU-per-store inventory calls were scoped out for this
  reason, even though the API supports it). `inStockStoreIds` should be an
  empty array in that case; `app/deal-radar.tsx` already handles
  `nearbyStores.length === 0` gracefully (no stock line rendered) via the
  shared logic in `lib/deals.ts`.
- Respect the new API's own rate limits and terms of service, same as
  api.lcbo.dev's fair-use requirement and Best Buy's 72-hour caching/
  no-redistribution terms, both documented in the README.
- Don't fabricate signals you don't actually have. Best Buy's
  `priceDropped`/`nearHistoricalLow` are hardcoded `false` rather than
  faked, since there's no historical price tracking for it (yet) — same
  spirit as never inventing a "regular price."
