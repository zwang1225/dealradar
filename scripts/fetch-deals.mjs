// Builds data/deals.json from LCBO's own "on sale"/"clearance" merchandising
// categories (the real signal — LCBO.dev's price-history/series endpoints
// are present in the schema but empirically empty, so they're not used here).
// Also maintains data/price-history.json, a small log scoped to just the
// on-sale/clearance products, to layer "price dropped" / "at an all-time
// low we've seen" badges on top once a few days of runs have accumulated.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { lcboQuery, paginateAll } from "./lib/lcbo-client.mjs";

const DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
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

  const priceHistoryPath = path.join(DATA_DIR, "price-history.json");
  const priceHistory = await readJsonIfExists(priceHistoryPath, {});

  const deals = [];
  for (const product of dealProducts.values()) {
    const previous = priceHistory[product.sku];
    const priceDropped = previous ? product.priceInCents < previous.last : false;
    const historicalLow = previous ? Math.min(previous.low, product.priceInCents) : product.priceInCents;
    const nearHistoricalLow = previous ? product.priceInCents <= historicalLow * 1.05 : false;

    priceHistory[product.sku] = {
      low: historicalLow,
      last: product.priceInCents,
      lastSeenAt: new Date().toISOString(),
    };

    const inStockStoreIds = await fetchInStockStoreIds(product.sku);

    deals.push({
      sku: product.sku,
      name: product.name,
      priceInCents: product.priceInCents,
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
