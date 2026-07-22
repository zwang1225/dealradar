export type Retailer = "lcbo" | "bestbuy";

export interface Deal {
  sku: string;
  name: string;
  priceInCents: number;
  regularPriceInCents: number | null;
  discountPercent: number | null;
  category: string;
  thumbnailUrl: string | null;
  unitVolumeMl: number | null;
  alcoholPercent: number | null;
  saleCategories: string[];
  priceDropped: boolean;
  nearHistoricalLow: boolean;
  isNew: boolean;
  inStockStoreIds: string[];
  retailer: Retailer;
}

export interface Store {
  externalId: string;
  name: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface NearbyStore {
  store: Store;
  distanceKm: number;
}

export type Vote = "up" | "down";

export interface CategoryNode {
  name: string;
  path: string;
  children: CategoryNode[];
}

export type SortOption = "price-asc" | "price-desc" | "name-asc" | "in-stock";

export const centsToDollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const formatVolume = (unitVolumeMl: number) =>
  unitVolumeMl >= 1000
    ? `${(unitVolumeMl / 1000).toFixed(unitVolumeMl % 1000 === 0 ? 0 : 1)} L`
    : `${unitVolumeMl} mL`;

// "750 mL · 13% ABV" -- either half may be missing in the source data (605/607
// and 594/607 of LCBO's current on-sale deals have volume/ABV respectively),
// so this only joins the parts that are actually present, and returns null
// when neither is.
export function formatBottleInfo(deal: Pick<Deal, "unitVolumeMl" | "alcoholPercent">): string | null {
  const parts: string[] = [];
  if (deal.unitVolumeMl != null) parts.push(formatVolume(deal.unitVolumeMl));
  if (deal.alcoholPercent != null) parts.push(`${deal.alcoholPercent}% ABV`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// "Products|Wine|Red Wine" -> "Red Wine"
export const lastCategorySegment = (category: string | undefined | null) =>
  category?.split("|").at(-1) ?? "";

// "Products|Spirits|Whisky|Scotch Whisky" -> "Spirits|Whisky|Scotch Whisky"
// LCBO's own category tree, just with the meaningless "Products" root dropped.
export const normalizedCategory = (category: string | undefined | null) =>
  (category ?? "").split("|").filter((part) => part !== "Products").join("|");

// Haversine distance in km between two lat/lng points.
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Nearest-first stores within `radiusKm` of `userCoords`. Falls back to the
// single nearest store when nothing is within radius (e.g. a small radius in
// a rural area) rather than showing a dead end.
export function computeNearbyStores(
  userCoords: { lat: number; lng: number } | null,
  allStores: Store[],
  radiusKm: number,
): NearbyStore[] {
  if (!userCoords || allStores.length === 0) return [];

  const withDistance = allStores
    .map((store) => ({
      store,
      distanceKm: distanceKm(userCoords.lat, userCoords.lng, store.latitude, store.longitude),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const withinRadius = withDistance.filter((s) => s.distanceKm <= radiusKm);
  if (withinRadius.length === 0 && withDistance.length > 0) {
    return [withDistance[0]];
  }
  return withinRadius;
}

// The nearest store (within `nearbyStores`) that actually carries this deal,
// or null if none of them do.
export function nearestInStockStore(deal: Deal, nearbyStores: NearbyStore[]): NearbyStore | null {
  return nearbyStores.find((s) => deal.inStockStoreIds.includes(s.store.externalId)) ?? null;
}

export function isInStock(deal: Deal, nearbyStores: NearbyStore[]): boolean {
  return nearestInStockStore(deal, nearbyStores) !== null;
}

// Turns LCBO's real category tree (from the products' pipe-delimited
// `category` paths) into a nested tree, sorted alphabetically at every
// level, so it can be rendered as an actual collapsible tree -- every level
// present in the data, not just the top-level bucket.
export function buildCategoryTree(deals: Deal[]): CategoryNode[] {
  interface MutableNode {
    name: string;
    path: string;
    children: Map<string, MutableNode>;
  }
  const root: MutableNode = { name: "", path: "", children: new Map() };
  for (const deal of deals) {
    const parts = normalizedCategory(deal.category).split("|").filter(Boolean);
    let node = root;
    let prefix = "";
    for (const part of parts) {
      prefix = prefix ? `${prefix}|${part}` : part;
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path: prefix, children: new Map() });
      }
      node = node.children.get(part)!;
    }
  }

  const toSortedArray = (node: MutableNode): CategoryNode[] =>
    [...node.children.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((child) => ({ name: child.name, path: child.path, children: toSortedArray(child) }));

  return toSortedArray(root);
}

export function flattenCategoryPaths(tree: CategoryNode[]): string[] {
  return tree.flatMap((node) => [node.path, ...flattenCategoryPaths(node.children)]);
}

export interface VisibleDealsParams {
  allDeals: Deal[];
  search: string;
  category: string;
  retailer: Retailer | "";
  sort: SortOption;
  nearbyStores: NearbyStore[];
  // A specific store's externalId, e.g. picked from StoreSelect -- distinct
  // from nearbyStores/radiusKm, which only affect the "in stock near me"
  // sort and each DealCard's own distance readout. This actually removes
  // deals that aren't in stock at the one chosen store, regardless of
  // distance (LCBO-only concept today; Best Buy deals have no
  // inStockStoreIds, so they're always dropped once a store is picked).
  storeId: string;
  // Only deals whose sku wasn't present in the *previous* day's deals file
  // for its retailer (see the fetch scripts' `isNew` computation) -- not
  // "new to the on-sale list ever", just "new since yesterday's run".
  newOnly: boolean;
}

export function getVisibleDeals({
  allDeals,
  search,
  category,
  retailer,
  sort,
  nearbyStores,
  storeId,
  newOnly,
}: VisibleDealsParams): Deal[] {
  const query = search.trim().toLowerCase();
  const effectiveSort = sort === "in-stock" && nearbyStores.length === 0 ? "price-asc" : sort;

  const filtered = allDeals.filter((deal) => {
    if (retailer && deal.retailer !== retailer) return false;
    if (category) {
      const path = normalizedCategory(deal.category);
      if (path !== category && !path.startsWith(category + "|")) return false;
    }
    if (query && !deal.name.toLowerCase().includes(query)) return false;
    if (storeId && !deal.inStockStoreIds.includes(storeId)) return false;
    if (newOnly && !deal.isNew) return false;
    return true;
  });

  return [...filtered].sort((a, b) => {
    switch (effectiveSort) {
      case "price-desc":
        return b.priceInCents - a.priceInCents;
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "in-stock":
        return (
          Number(isInStock(b, nearbyStores)) - Number(isInStock(a, nearbyStores)) ||
          a.priceInCents - b.priceInCents
        );
      case "price-asc":
      default:
        return a.priceInCents - b.priceInCents;
    }
  });
}
