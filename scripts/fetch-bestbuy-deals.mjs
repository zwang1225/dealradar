// Builds public/data/bestbuy-deals.json from Best Buy's Products API,
// filtered to on-sale items (onSale=true). Unlike LCBO, Best Buy exposes a
// real regularPrice/salePrice/percentSavings directly, so no self-derived
// price-history workaround is needed here -- see fetch-lcbo-deals.mjs for
// why that one does. Per-store inventory is intentionally NOT fetched here
// (inStockStoreIds is always []) -- scoped out for v1 to avoid per-SKU
// per-store rate-limit complexity; Best Buy's API does support it
// (Products + Stores API by postal code/store ID) if this gets revisited.
//
// Best Buy's terms: 72-hour max caching (this repo refreshes daily, well
// within that), no redistribution/derivative-works resale, personal-use
// apps are permitted. Rate limit: 5 req/sec, 50k calls/day for a standard
// key -- this script adds a short delay between pages to stay safely under.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "data");

const API_KEY = process.env.BESTBUY_API_KEY;
if (!API_KEY) {
  throw new Error("BESTBUY_API_KEY is not set.");
}

const PAGE_SIZE = 100;
const FIELDS = [
  "sku",
  "name",
  "salePrice",
  "regularPrice",
  "onSale",
  "percentSavings",
  "categoryPath.id",
  "categoryPath.name",
  "thumbnailImage",
].join(",");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(page) {
  const url = new URL("https://api.bestbuy.com/v1/products(onSale=true)");
  url.searchParams.set("apiKey", API_KEY);
  url.searchParams.set("format", "json");
  url.searchParams.set("show", FIELDS);
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Best Buy API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function fetchAllOnSaleProducts() {
  const products = [];
  let page = 1;
  let totalPages = 1;

  do {
    const data = await fetchPage(page);
    products.push(...data.products);
    totalPages = data.totalPages;
    page += 1;
    if (page <= totalPages) await sleep(250);
  } while (page <= totalPages);

  return products;
}

function toDeal(product, previousDealSkus) {
  const priceInCents = Math.round(product.salePrice * 100);
  const regularPriceInCents =
    product.onSale && product.regularPrice > product.salePrice ? Math.round(product.regularPrice * 100) : null;

  return {
    sku: String(product.sku),
    name: product.name,
    priceInCents,
    regularPriceInCents,
    discountPercent: regularPriceInCents !== null ? Math.round(product.percentSavings) : null,
    category: (product.categoryPath ?? []).map((c) => c.name).join("|"),
    thumbnailUrl: product.thumbnailImage ?? null,
    unitVolumeMl: null,
    alcoholPercent: null,
    saleCategories: ["On Sale"],
    // No historical price tracking for Best Buy in v1 -- not fabricating a
    // signal we don't actually have (contrast fetch-lcbo-deals.mjs's
    // equivalent fields, which ARE backed by real tracking).
    priceDropped: false,
    nearHistoricalLow: false,
    isNew: !previousDealSkus.has(String(product.sku)),
    inStockStoreIds: [],
    retailer: "bestbuy",
  };
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
  const products = await fetchAllOnSaleProducts();
  console.log(`Fetched ${products.length} on-sale Best Buy products`);

  const dealsPath = path.join(DATA_DIR, "bestbuy-deals.json");
  const previousDealsFile = await readJsonIfExists(dealsPath, { deals: [] });
  const previousDealSkus = new Set(previousDealsFile.deals.map((deal) => deal.sku));

  const deals = products.map((product) => toDeal(product, previousDealSkus));

  await writeFile(dealsPath, JSON.stringify({ generatedAt: new Date().toISOString(), deals }, null, 2));
  console.log(`Wrote ${deals.length} deals to public/data/bestbuy-deals.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
