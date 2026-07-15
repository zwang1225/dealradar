// Builds public/data/deals.json from LCBO's own "on sale"/"clearance"
// merchandising categories (the real signal — LCBO.dev's price-history/series
// endpoints are present in the schema but empirically empty, so they're not
// used here). The `deals` array shape written below must stay in sync with
// the `Deal` type in lib/deals.ts -- this script has no import relationship
// to the Next.js app (plain Node, no TypeScript), so nothing enforces that
// automatically.
//
// Also maintains data/price-history.json — but scoped to the ENTIRE catalog,
// not just today's on-sale subset. That's the only way to eventually know a
// discount: LCBO.dev never exposes a "regular price" field, only the current
// one, so the only way to learn what a product cost before it went on sale
// is to have already been recording its price while it wasn't discounted.
// Scanning all ~6,662 products daily (just sku + price, cheap — no per-
// product inventory calls) means once a product we've already seen at full
// price later shows up in a sale category, we can compute a real discount %.
// Day one, nothing has a prior price yet, so discounts start showing up a
// few days in, same as the "near all-time low" badge already did.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { lcboQuery, paginateAll } from "./lib/lcbo-client.mjs";

const DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "data",
);

const CATEGORY_SEARCH_TERMS = ["sale", "clearance"];

const CATEGORIES_QUERY = `
  query Categories($search: String!) {
    categories(pagination: { first: 100 }, filters: { search: $search }) {
      edges { node { slug name } }
    }
  }
`;

const PRODUCTS_BY_CATEGORY_QUERY = `
  query ProductsByCategory($slug: String!, $after: String) {
    products(
      pagination: { first: 100, after: $after }
      filters: { categorySlug: $slug }
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          sku
          name
          priceInCents
          primaryCategory
          thumbnailUrl
          unitVolumeMl
          alcoholPercent
        }
      }
    }
  }
`;

const CATALOG_PRICES_QUERY = `
  query CatalogPrices($after: String) {
    products(pagination: { first: 100, after: $after }) {
      pageInfo { hasNextPage endCursor }
      edges { node { sku priceInCents } }
    }
  }
`;

const INVENTORY_QUERY = `
  query ProductInventory($sku: String!) {
    product(sku: $sku) {
      inventories(filters: { minQuantity: 1 }, pagination: { first: 100 }) {
        edges { node { store { externalId } } }
      }
    }
  }
`;

async function discoverSaleCategorySlugs() {
  const slugs = new Map();
  for (const search of CATEGORY_SEARCH_TERMS) {
    const data = await lcboQuery(CATEGORIES_QUERY, { search });
    for (const { node } of data.categories.edges) {
      // The API's `search` filter matches broadly (e.g. "clearance" also
      // returns generic categories like "Wine" or "Spirits") — only keep
      // categories that actually mention sale/clearance in their own
      // name, otherwise we'd pull in the entire catalog.
      const name = node.name.toLowerCase();
      if (name.includes("sale") || name.includes("clearance")) {
        slugs.set(node.slug, node.name);
      }
    }
  }
  return slugs;
}

async function fetchDealProducts(slugs) {
  const bySku = new Map();
  for (const [slug, categoryName] of slugs) {
    await paginateAll(
      (after) => lcboQuery(PRODUCTS_BY_CATEGORY_QUERY, { slug, after }),
      (data) => data.products,
      (product) => {
        const existing = bySku.get(product.sku);
        if (existing) {
          existing.saleCategories.push(categoryName);
        } else {
          bySku.set(product.sku, { ...product, saleCategories: [categoryName] });
        }
      },
    );
  }
  return bySku;
}

async function fetchCatalogPrices() {
  const prices = new Map();
  await paginateAll(
    (after) => lcboQuery(CATALOG_PRICES_QUERY, { after }),
    (data) => data.products,
    (product) => prices.set(product.sku, product.priceInCents),
  );
  return prices;
}

async function fetchInStockStoreIds(sku) {
  const data = await lcboQuery(INVENTORY_QUERY, { sku });
  return data.product.inventories.edges.map((edge) => edge.node.store.externalId);
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function main() {
  const slugs = await discoverSaleCategorySlugs();
  console.log(`Discovered ${slugs.size} sale/clearance categories: ${[...slugs.keys()].join(", ")}`);

  const dealProducts = await fetchDealProducts(slugs);
  console.log(`Found ${dealProducts.size} distinct deal products`);

  console.log("Scanning full catalog for price history...");
  const catalogPrices = await fetchCatalogPrices();
  console.log(`Scanned ${catalogPrices.size} total products`);

  const priceHistoryPath = path.join(DATA_DIR, "price-history.json");
  const priceHistory = await readJsonIfExists(priceHistoryPath, {});
  const previousSnapshot = { ...priceHistory }; // pre-update per-sku refs, read before overwriting below

  for (const [sku, priceInCents] of catalogPrices) {
    const previous = previousSnapshot[sku];
    priceHistory[sku] = {
      // `high` didn't exist in the schema before this change — fall back to
      // `priceInCents` for entries written by older runs so this migrates
      // cleanly instead of poisoning the value with Math.max(undefined, x).
      low: Math.min(previous?.low ?? priceInCents, priceInCents),
      high: Math.max(previous?.high ?? priceInCents, priceInCents),
      last: priceInCents,
      lastSeenAt: new Date().toISOString(),
    };
  }

  const deals = [];
  for (const product of dealProducts.values()) {
    const currentPrice = catalogPrices.get(product.sku) ?? product.priceInCents;
    const previous = previousSnapshot[product.sku];
    const priceDropped = previous ? currentPrice < previous.last : false;
    const nearHistoricalLow = previous ? currentPrice <= priceHistory[product.sku].low * 1.05 : false;
    // Only claim a discount once we've actually seen a higher price for this
    // SKU ourselves — never fabricate a "regular price" the API never gave us.
    const discountPercent =
      previous && previous.high > currentPrice
        ? Math.round((1 - currentPrice / previous.high) * 100)
        : null;

    const inStockStoreIds = await fetchInStockStoreIds(product.sku);

    deals.push({
      sku: product.sku,
      name: product.name,
      priceInCents: currentPrice,
      regularPriceInCents: discountPercent !== null ? previous.high : null,
      discountPercent,
      category: product.primaryCategory,
      thumbnailUrl: product.thumbnailUrl,
      unitVolumeMl: product.unitVolumeMl,
      alcoholPercent: product.alcoholPercent,
      saleCategories: product.saleCategories,
      priceDropped,
      nearHistoricalLow,
      inStockStoreIds,
    });
  }

  await writeFile(priceHistoryPath, JSON.stringify(priceHistory, null, 2));
  await writeFile(
    path.join(DATA_DIR, "deals.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), deals }, null, 2),
  );
  console.log(`Wrote ${deals.length} deals to data/deals.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
