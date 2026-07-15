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

## Parked, but gated (committed locally, safe to push, dormant until configured)

Committed at `08505a1` — **not pushed yet** (`git log`/`git status -sb` shows
`main` 1 commit ahead of `origin/main`). Pushing is a separate decision from
committing; this section describes what happens *if* it's pushed, not a
claim that it's live.

Each item below was gated specifically so pushing it wouldn't regress
anything that works today — no failed CI steps, no 500s, just dormant
functionality until its secrets exist:

- **Best Buy as a second retailer** — real developer API (`onSale=true`,
  real `regularPrice`/`salePrice`, 5 req/sec / 50k calls/day), merged into
  the existing deals list via a `retailer` field + client-side merge of
  per-retailer files (`public/data/lcbo-*.json` renamed for symmetry,
  `public/data/bestbuy-deals.json` new). Per-store inventory intentionally
  scoped out of this pass (`inStockStoreIds: []` for Best Buy) to avoid
  per-SKU-per-store rate-limit complexity. Blocked on **Best Buy's developer
  signup itself**: it rejects free email providers (Gmail, Yahoo, Outlook,
  etc.) and requires a custom-domain email to register for an API key.
  **Gate**: `.github/workflows/fetch-deals.yml`'s Best Buy step is
  `if: env.BESTBUY_API_KEY != ''` — skipped, not failed, so the LCBO
  fetch+commit steps still run normally without it. The retailer filter
  `<select>` in `app/deal-radar.tsx` only renders once more than one
  retailer's data is actually loaded (`availableRetailers`), so it won't
  show a permanently-empty "Best Buy" option in the meantime. Once
  unblocked: get a `BESTBUY_API_KEY`, add it as a GitHub Actions secret,
  run `fetch-bestbuy-deals.mjs` once for real to verify before relying on
  it. See [`docs/ai/skills/adding-a-retailer/SKILL.md`](ai/skills/adding-a-retailer/SKILL.md)
  for the pattern this established.
- **Email verification for `preferences.email`** — magic-link flow so a
  typed email only becomes active once its owner clicks a confirmation
  link; applies on every change, not just the first
  (`app/api/preferences/route.ts`, `app/api/preferences/verify/route.ts`,
  `app/preferences/page.tsx`, schema columns in `scripts/db/migrate.mjs`).
  Blocked on a Resend API key + `RESEND_FROM`. **Gate**:
  `isEmailVerificationConfigured()` in `route.ts` checks whether
  `RESEND_API_KEY`/`RESEND_FROM` are set as **Vercel** env vars before
  starting the verification flow; if not, `PUT` falls back to saving the
  email directly — the exact behavior this repo had before verification
  existed. No 500s regardless of whether those env vars exist. Once
  unblocked: set those two as Vercel project env vars, confirm "Enable
  access to System Environment Variables" is checked (for
  `VERCEL_PROJECT_PRODUCTION_URL`), then verify the real send-and-click
  flow once before relying on it.
- **Phase 3 — LLM-picked deals + email** (`scripts/notify.mjs`,
  `scripts/notify.test.mjs`) — reads `preferences`/`deal_feedback`, asks an
  LLM to pick/rank deals, emails the result. Blocked on an LLM-billing
  decision: OpenAI was chosen, but ChatGPT Plus/Pro subscriptions can't pay
  for API calls (separate billing systems) — needs a standard pay-per-token
  API key instead (~$1-2/month estimated for this use case). `OPENAI_MODEL`
  is deliberately a required env var with no hardcoded default, since the
  current model lineup was unclear when this was written. **Gate**: the
  workflow's notify step is `if: env.DATABASE_URL != ''` — skipped, not
  failed (and this was already the last step, after the commit step, so it
  couldn't have blocked the LCBO refresh regardless). Once unblocked: add
  `DATABASE_URL`/`OPENAI_API_KEY`/`OPENAI_MODEL`/`RESEND_API_KEY`/
  `RESEND_FROM` as GitHub Actions secrets, run `notify.mjs` once locally to
  verify a real send before relying on it in CI.

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
