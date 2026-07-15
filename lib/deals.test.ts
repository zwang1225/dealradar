import { describe, expect, it } from "vitest";
import {
  Deal,
  Store,
  buildCategoryTree,
  centsToDollars,
  computeNearbyStores,
  distanceKm,
  flattenCategoryPaths,
  formatBottleInfo,
  getVisibleDeals,
  isInStock,
  lastCategorySegment,
  nearestInStockStore,
  normalizedCategory,
} from "./deals";

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    sku: "1",
    name: "Test Wine",
    priceInCents: 1000,
    regularPriceInCents: null,
    discountPercent: null,
    category: "Products|Wine|Red Wine",
    thumbnailUrl: null,
    unitVolumeMl: null,
    alcoholPercent: null,
    saleCategories: [],
    priceDropped: false,
    nearHistoricalLow: false,
    inStockStoreIds: [],
    ...overrides,
  };
}

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    externalId: "1",
    name: "Test Store",
    city: "Toronto",
    address: "123 Test St",
    latitude: 0,
    longitude: 0,
    ...overrides,
  };
}

describe("centsToDollars", () => {
  it("formats cents as a two-decimal dollar string", () => {
    expect(centsToDollars(2195)).toBe("$21.95");
    expect(centsToDollars(100)).toBe("$1.00");
    expect(centsToDollars(0)).toBe("$0.00");
  });
});

describe("formatBottleInfo", () => {
  it("joins volume and ABV when both are present", () => {
    expect(formatBottleInfo({ unitVolumeMl: 750, alcoholPercent: 13 })).toBe("750 mL · 13% ABV");
  });

  it("formats volumes >= 1000mL in litres", () => {
    expect(formatBottleInfo({ unitVolumeMl: 1000, alcoholPercent: null })).toBe("1 L");
    expect(formatBottleInfo({ unitVolumeMl: 1500, alcoholPercent: null })).toBe("1.5 L");
  });

  it("shows only whichever half is present", () => {
    expect(formatBottleInfo({ unitVolumeMl: 750, alcoholPercent: null })).toBe("750 mL");
    expect(formatBottleInfo({ unitVolumeMl: null, alcoholPercent: 13 })).toBe("13% ABV");
  });

  it("returns null when neither is present", () => {
    expect(formatBottleInfo({ unitVolumeMl: null, alcoholPercent: null })).toBeNull();
  });
});

describe("lastCategorySegment", () => {
  it("returns the last pipe-delimited segment", () => {
    expect(lastCategorySegment("Products|Wine|Red Wine")).toBe("Red Wine");
  });

  it("returns an empty string for null/undefined/empty input", () => {
    expect(lastCategorySegment(null)).toBe("");
    expect(lastCategorySegment(undefined)).toBe("");
    expect(lastCategorySegment("")).toBe("");
  });
});

describe("normalizedCategory", () => {
  it("drops the meaningless 'Products' root", () => {
    expect(normalizedCategory("Products|Wine|Red Wine")).toBe("Wine|Red Wine");
  });

  it("handles null/empty input without crashing", () => {
    expect(normalizedCategory(null)).toBe("");
    expect(normalizedCategory("")).toBe("");
  });
});

describe("distanceKm", () => {
  it("is zero for the same point", () => {
    expect(distanceKm(43.65, -79.38, 43.65, -79.38)).toBe(0);
  });

  it("is symmetric", () => {
    const a = distanceKm(43.65, -79.38, 45.42, -75.7);
    const b = distanceKm(45.42, -75.7, 43.65, -79.38);
    expect(a).toBeCloseTo(b, 6);
  });

  it("is roughly correct for a known distance (1 degree of latitude ~ 111km)", () => {
    expect(distanceKm(0, 0, 1, 0)).toBeCloseTo(111.2, 0);
  });
});

describe("computeNearbyStores", () => {
  const stores = [
    makeStore({ externalId: "near", latitude: 0, longitude: 0.05 }),
    makeStore({ externalId: "far", latitude: 0, longitude: 5 }),
  ];

  it("returns [] when there's no user location", () => {
    expect(computeNearbyStores(null, stores, 10)).toEqual([]);
  });

  it("returns [] when there are no stores", () => {
    expect(computeNearbyStores({ lat: 0, lng: 0 }, [], 10)).toEqual([]);
  });

  it("returns only stores within the radius, nearest first", () => {
    const result = computeNearbyStores({ lat: 0, lng: 0 }, stores, 10);
    expect(result.map((s) => s.store.externalId)).toEqual(["near"]);
  });

  it("falls back to the single nearest store when none are within radius", () => {
    const result = computeNearbyStores({ lat: 0, lng: 0 }, stores, 1);
    expect(result.map((s) => s.store.externalId)).toEqual(["near"]);
  });
});

describe("nearestInStockStore / isInStock", () => {
  const nearby = [
    { store: makeStore({ externalId: "a" }), distanceKm: 1 },
    { store: makeStore({ externalId: "b" }), distanceKm: 2 },
  ];

  it("finds the nearest store that carries the deal", () => {
    const deal = makeDeal({ inStockStoreIds: ["b"] });
    expect(nearestInStockStore(deal, nearby)?.store.externalId).toBe("b");
    expect(isInStock(deal, nearby)).toBe(true);
  });

  it("returns null/false when none of the nearby stores carry it", () => {
    const deal = makeDeal({ inStockStoreIds: ["z"] });
    expect(nearestInStockStore(deal, nearby)).toBeNull();
    expect(isInStock(deal, nearby)).toBe(false);
  });
});

describe("buildCategoryTree / flattenCategoryPaths", () => {
  const deals = [
    makeDeal({ category: "Products|Wine|Red Wine" }),
    makeDeal({ category: "Products|Wine|White Wine" }),
    makeDeal({ category: "Products|Spirits|Whisky|Scotch Whisky" }),
  ];

  it("builds a nested, alphabetically-sorted tree with the 'Products' root dropped", () => {
    const tree = buildCategoryTree(deals);
    expect(tree.map((n) => n.name)).toEqual(["Spirits", "Wine"]);

    const wine = tree.find((n) => n.name === "Wine")!;
    expect(wine.path).toBe("Wine");
    expect(wine.children.map((c) => c.name)).toEqual(["Red Wine", "White Wine"]);

    const spirits = tree.find((n) => n.name === "Spirits")!;
    expect(spirits.children[0].children.map((c) => c.name)).toEqual(["Scotch Whisky"]);
  });

  it("flattens every level of the tree into a path list", () => {
    const tree = buildCategoryTree(deals);
    expect(flattenCategoryPaths(tree)).toEqual([
      "Spirits",
      "Spirits|Whisky",
      "Spirits|Whisky|Scotch Whisky",
      "Wine",
      "Wine|Red Wine",
      "Wine|White Wine",
    ]);
  });
});

describe("getVisibleDeals", () => {
  const cheap = makeDeal({ sku: "cheap", name: "Cheap Red", priceInCents: 500, category: "Products|Wine|Red Wine" });
  const pricey = makeDeal({
    sku: "pricey",
    name: "Pricey White",
    priceInCents: 2000,
    category: "Products|Wine|White Wine",
    inStockStoreIds: ["1"],
  });
  const allDeals = [cheap, pricey];
  const noStores = { allDeals, search: "", category: "", sort: "price-asc" as const, nearbyStores: [] };

  it("filters by category, including nested descendants via prefix match", () => {
    const result = getVisibleDeals({ ...noStores, category: "Wine" });
    expect(result).toHaveLength(2);

    const redOnly = getVisibleDeals({ ...noStores, category: "Wine|Red Wine" });
    expect(redOnly.map((d) => d.sku)).toEqual(["cheap"]);
  });

  it("filters by case-insensitive name search", () => {
    const result = getVisibleDeals({ ...noStores, search: "cheap" });
    expect(result.map((d) => d.sku)).toEqual(["cheap"]);
  });

  it("sorts by price ascending and descending", () => {
    expect(getVisibleDeals({ ...noStores, sort: "price-asc" }).map((d) => d.sku)).toEqual(["cheap", "pricey"]);
    expect(getVisibleDeals({ ...noStores, sort: "price-desc" }).map((d) => d.sku)).toEqual(["pricey", "cheap"]);
  });

  it("falls back to price-asc for 'in-stock' sort when there's no location", () => {
    const result = getVisibleDeals({ ...noStores, sort: "in-stock" });
    expect(result.map((d) => d.sku)).toEqual(["cheap", "pricey"]);
  });

  it("sorts in-stock deals first when nearbyStores is set", () => {
    const nearbyStores = [{ store: makeStore({ externalId: "1" }), distanceKm: 1 }];
    const result = getVisibleDeals({ ...noStores, sort: "in-stock", nearbyStores });
    expect(result.map((d) => d.sku)).toEqual(["pricey", "cheap"]);
  });
});
