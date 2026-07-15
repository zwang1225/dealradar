// Fetches all LCBO store locations (name, address, lat/lng, hours) into
// public/data/stores.json. Small (~690 rows), so this pulls every store
// rather than trying to guess "home stores" ahead of time — the frontend
// does its own nearest-store lookup client-side via the browser Geolocation
// API, so the full list needs to be available statically. The `stores`
// array shape written below must stay in sync with the `Store` type in
// lib/deals.ts.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { lcboQuery, paginateAll } from "./lib/lcbo-client.mjs";

const STORES_QUERY = `
  query Stores($after: String) {
    stores(pagination: { first: 100, after: $after }) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          externalId
          name
          city
          address
          latitude
          longitude
        }
      }
    }
  }
`;

async function main() {
  const stores = [];
  await paginateAll(
    (after) => lcboQuery(STORES_QUERY, { after }),
    (data) => data.stores,
    (node) => stores.push(node),
  );

  const outPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "public",
    "data",
    "stores.json",
  );
  await writeFile(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), stores }, null, 2),
  );
  console.log(`Wrote ${stores.length} stores to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
