"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Deal,
  Store,
  SortOption,
  buildCategoryTree,
  computeNearbyStores,
  flattenCategoryPaths,
  getVisibleDeals,
  lastCategorySegment,
} from "@/lib/deals";
import { getFavoriteCategories, toggleFavoriteCategory } from "@/lib/favorites";
import { CategoryTree } from "./components/CategoryTree";
import { DealCard } from "./components/DealCard";
import { FavoriteChips } from "./components/FavoriteChips";
import { RadiusSelect } from "./components/RadiusSelect";

type LocationState = "locating" | "located" | "unsupported" | "error";
type DealsLoadState = "loading" | "loaded" | "error";

const LOCATION_STATUS_TEXT: Record<Exclude<LocationState, "located">, string> = {
  locating: "Locating nearest store…",
  unsupported: "Location isn't available in this browser.",
  error: "Enable location to see stock near you.",
};

export function DealRadar() {
  const [allDeals, setAllDeals] = useState<Deal[]>([]);
  const [dealsLoadState, setDealsLoadState] = useState<DealsLoadState>("loading");

  const [allStores, setAllStores] = useState<Store[]>([]);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationState, setLocationState] = useState<LocationState>("locating");
  const [radiusKm, setRadiusKm] = useState(10);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [sort, setSort] = useState<SortOption>("price-asc");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);

  const didInitCategory = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/data/deals.json")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setAllDeals(data.deals);
        setDealsLoadState("loaded");
      })
      .catch(() => {
        if (!cancelled) setDealsLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setFavorites(getFavoriteCategories());
  }, []);

  const locate = useCallback(() => {
    setLocationState("locating");
    if (!("geolocation" in navigator)) {
      setLocationState("unsupported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        fetch("/data/stores.json")
          .then((res) => res.json())
          .then((data) => {
            setAllStores(data.stores);
            setLocationState("located");
          });
      },
      () => {
        setUserCoords(null);
        setLocationState("error");
      },
    );
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  const categoryTree = useMemo(() => buildCategoryTree(allDeals), [allDeals]);

  // Default to the most-recently-favorited category on a fresh load, same
  // idea as "remember where I left off". Runs once, the first time deals
  // (and thus the category tree) become available.
  useEffect(() => {
    if (didInitCategory.current || allDeals.length === 0) return;
    didInitCategory.current = true;
    const allPaths = flattenCategoryPaths(categoryTree);
    const [mostRecentFavorite] = getFavoriteCategories();
    if (mostRecentFavorite && allPaths.includes(mostRecentFavorite)) {
      setSelectedCategory(mostRecentFavorite);
    }
  }, [allDeals, categoryTree]);

  const nearbyStores = useMemo(
    () => computeNearbyStores(userCoords, allStores, radiusKm),
    [userCoords, allStores, radiusKm],
  );

  const visibleDeals = useMemo(
    () => getVisibleDeals({ allDeals, search, category: selectedCategory, sort, nearbyStores }),
    [allDeals, search, selectedCategory, sort, nearbyStores],
  );

  const selectCategory = (path: string) => {
    setSelectedCategory(path);
    setCategoryPickerOpen(false);
  };

  const isFavorite = Boolean(selectedCategory) && favorites.includes(selectedCategory);

  const handleToggleFavorite = () => {
    if (!selectedCategory) return;
    setFavorites(toggleFavoriteCategory(selectedCategory));
  };

  const handleRemoveFavorite = (path: string) => {
    setFavorites(toggleFavoriteCategory(path));
  };

  const located = locationState === "located";

  return (
    <>
      <header>
        <p className="eyebrow">🍷 LCBO · Ontario</p>
        <h1>DealRadar</h1>
        <p className="subtitle">Tracking LCBO deals, stock, and drops across Ontario.</p>
      </header>

      <main>
        <section id="location">
          <p id="location-status" className="empty-state" hidden={located}>
            {locationState === "located" ? "" : LOCATION_STATUS_TEXT[locationState]}
          </p>
          <button
            id="retry-location"
            type="button"
            hidden={locationState !== "error"}
            onClick={locate}
          >
            Try location again
          </button>

          <RadiusSelect value={radiusKm} onChange={setRadiusKm} hidden={!located} />
        </section>

        <section id="deals">
          <div className="deals-header">
            <h2>Deals</h2>
            <p id="results-count">
              {allDeals.length ? `${visibleDeals.length} of ${allDeals.length} deals` : ""}
            </p>
          </div>

          <div id="filter-bar">
            <input
              id="search-input"
              type="search"
              placeholder="Search deals…"
              aria-label="Search deals"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <details
              id="category-picker"
              className="category-picker"
              open={categoryPickerOpen}
              onToggle={(event) => setCategoryPickerOpen(event.currentTarget.open)}
            >
              <summary id="category-picker-summary">
                {selectedCategory ? lastCategorySegment(selectedCategory) : "All categories"}
              </summary>
              <CategoryTree tree={categoryTree} selectedCategory={selectedCategory} onSelect={selectCategory} />
            </details>
            <button
              id="favorite-category-button"
              type="button"
              title={isFavorite ? "Remove favorite category" : "Save as favorite category"}
              aria-pressed={isFavorite}
              disabled={!selectedCategory}
              onClick={handleToggleFavorite}
            >
              {isFavorite ? "★" : "☆"}
            </button>

            <select
              id="sort-select"
              aria-label="Sort deals"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortOption)}
            >
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="name-asc">Name: A to Z</option>
              <option value="in-stock" id="sort-in-stock-option" hidden={!located}>
                In Stock Near Me First
              </option>
            </select>
          </div>

          <FavoriteChips favorites={favorites} onSelect={selectCategory} onRemove={handleRemoveFavorite} />

          <p id="deals-status" className="empty-state" hidden={dealsLoadState === "loaded" && visibleDeals.length > 0}>
            {dealsLoadState === "error"
              ? "Couldn't load deals data."
              : dealsLoadState === "loading"
                ? "Loading deals…"
                : "No deals match your filters."}
          </p>
          <ul id="deals-list">
            {visibleDeals.map((deal) => (
              <DealCard key={deal.sku} deal={deal} nearbyStores={nearbyStores} radiusKm={radiusKm} />
            ))}
          </ul>
        </section>
      </main>

      <footer>
        <p>Not affiliated with LCBO. Data sourced independently.</p>
      </footer>
    </>
  );
}
