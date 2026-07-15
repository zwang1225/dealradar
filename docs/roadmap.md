# Roadmap / Status

What's shipped, what's parked, and what's next. See
[`docs/data-architecture.md`](data-architecture.md) for how each piece
actually works.

## Shipped (committed, deployed)

- **Phase 1** — migrated from a static site to Next.js (App Router,
  TypeScript), deployed on Vercel behind Vercel Authentication.
- **Phase 2** — `preferences` (notes) + `deal_feedback` (thumbs up/down) in
  Postgres, with API routes and UI for both.
- Bottle size/ABV shown on deal cards.
- Vitest unit tests for `lib/deals.ts` / `lib/favorites.ts` (pure logic only).

## Parked (written, not committed/deployed)

- **Best Buy as a second retailer** — real developer API (`onSale=true`,
  real `regularPrice`/`salePrice`, 5 req/sec / 50k calls/day), merged into
  the existing deals list via a `retailer` field + client-side merge of
  per-retailer files (`public/data/lcbo-*.json` renamed for symmetry,
  `public/data/bestbuy-deals.json` new). Per-store inventory intentionally
  scoped out of this pass (`inStockStoreIds: []` for Best Buy) to avoid
  per-SKU-per-store rate-limit complexity. Code written, type-checks,
  builds — but not yet committed. Blocked on **Best Buy's developer signup
  itself**: it rejects free email providers (Gmail, Yahoo, Outlook, etc.)
  and requires a custom-domain email to register for an API key. Parked
  until a domain-based email is available; revisit then to actually run
  `fetch-bestbuy-deals.mjs` and verify before shipping. See
  [`docs/ai/skills/adding-a-retailer/SKILL.md`](ai/skills/adding-a-retailer/SKILL.md)
  for the pattern this established, ready to reuse once unblocked.
- **Email verification for `preferences.email`** — magic-link flow so a
  typed email only becomes active once its owner clicks a confirmation
  link; applies on every change, not just the first. Code is written
  (`app/api/preferences/route.ts`, `app/api/preferences/verify/route.ts`,
  `app/preferences/page.tsx`, schema columns in `scripts/db/migrate.mjs`),
  type-checks, and builds clean — but not yet committed. Blocked on getting
  a Resend API key + `RESEND_FROM` to actually verify the send-and-click
  flow end-to-end before shipping it live (this changes real
  `/preferences` behavior in production once deployed).
- **Phase 3 — LLM-picked deals + email** (`scripts/notify.mjs`,
  `scripts/notify.test.mjs`) — reads `preferences`/`deal_feedback`, asks an
  LLM to pick/rank deals, emails the result. Written and tested, not
  committed. Parked on an LLM-billing decision: OpenAI was chosen, but
  ChatGPT Plus/Pro subscriptions can't pay for API calls (separate billing
  systems) — needs a standard pay-per-token API key instead
  (~$1-2/month estimated for this use case). `OPENAI_MODEL` is deliberately
  a required env var with no hardcoded default, since the current model
  lineup was unclear when this was written.

## Next

- More retailers beyond LCBO/Best Buy — see
  [`docs/ai/skills/adding-a-retailer/SKILL.md`](ai/skills/adding-a-retailer/SKILL.md).
  Researched and **ruled out** so far (no official API worth using without
  scraping, which is an explicit non-goal of this project):
  - **Walmart, Sephora, Canada Computers, Costco, Canadian Tire, Home Depot**
    — no official public API at all.
  - **Target (RedSky)** — technically public/undocumented, but explicitly
    "becoming more closed off" with IP blocking after low request volume;
    no formal terms or fair-use guarantee. Same fragility category as an
    unsanctioned workaround — not worth building on.
  - **Amazon, eBay, Newegg, Shopify, WooCommerce, BigCommerce** — real APIs,
    but seller/marketplace-management APIs (for people running a store on
    that platform), not consumer-facing product-catalog reads. Doesn't fit
    this project's use case. Exception worth remembering: many smaller/
    boutique retailers run on Shopify, and Shopify's *Storefront* API is
    often publicly readable with no auth for basic product data — worth a
    case-by-case check if a specific Shopify-powered retailer comes up.
