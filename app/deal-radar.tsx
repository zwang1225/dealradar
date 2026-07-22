"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { Button, IconButton, Popover, Select, TextField } from "@radix-ui/themes";
import {
  Deal,
  Retailer,
  Store,
  SortOption,
  Vote,
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
import { StoreSelect } from "./components/StoreSelect";

type LocationState = "locating" | "located" | "unsupported" | "error";
type DealsLoadState = "loading" | "loaded" | "error";

// Rendering all 600+ deal cards (each with an image) at once is the actual
// cost here -- images already lazy-load via the <img loading="lazy">
// attribute, but the DOM nodes themselves don't. Infinite scroll caps how
// many are ever mounted at a time.
const PAGE_SIZE = 30;

const LOCATION_STATUS_TEXT: Record<Exclude<LocationState, "located">, string> = {
  locating: "Locating nearest store…",
  unsupported: "Location isn't available in this browser.",
  error: "Enable location to see stock near you.",
};

const RETAILER_LABELS: Record<Retailer, string> = { lcbo: "LCBO", bestbuy: "Best Buy" };

export function DealRadar() {
  const [allDeals, setAllDeals] = useState<Deal[]>([]);
  const [dealsLoadState, setDealsLoadState] = useState<DealsLoadState>("loading");

  const [allStores, setAllStores] = useState<Store[]>([]);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationState, setLocationState] = useState<LocationState>("locating");
  const [radiusKm, setRadiusKm] = useState(10);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [retailerFilter, setRetailerFilter] = useState<Retailer | "">("");
  const [newOnly, setNewOnly] = useState(false);
  const [sort, setSort] = useState<SortOption>("price-asc");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Record<string, Vote>>({});

  const didInitCategory = useRef(false);

  // Fetches every retailer's deals file independently and merges them --
  // each fetch script writes its own file (see docs/data-architecture.md),
  // so one retailer's source being temporarily missing (e.g. before its
  // first CI run) shouldn't take down the whole page, only shrink the list.
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetch("/data/lcbo-deals.json").then((res) => res.json()),
      fetch("/data/bestbuy-deals.json").then((res) => res.json()),
    ]).then((results) => {
      if (cancelled) return;
      const deals = results
        .filter((result): result is PromiseFulfilledResult<{ deals: Deal[] }> => result.status === "fulfilled")
        .flatMap((result) => result.value.deals);
      if (deals.length === 0) {
        setDealsLoadState("error");
        return;
      }
      setAllDeals(deals);
      setDealsLoadState("loaded");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setFavorites(getFavoriteCategories());
  }, []);

  useEffect(() => {
    fetch("/api/feedback")
      .then((res) => res.json())
      .then((data) => setFeedback(data.feedback))
      .catch(() => {});
  }, []);

  // Fetched independently of geolocation -- StoreSelect lets a user pick a
  // specific store by name/city even when location access is denied or
  // unsupported, so the store list can't be gated behind that succeeding.
  useEffect(() => {
    fetch("/data/lcbo-stores.json")
      .then((res) => res.json())
      .then((data) => setAllStores(data.stores))
      .catch(() => {});
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
        setLocationState("located");
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

  // Only offer a retailer as a filter option once its data has actually
  // loaded -- e.g. Best Buy support is currently parked (no
  // bestbuy-deals.json exists yet), so the whole filter stays hidden
  // rather than showing a dropdown with a permanently-empty option.
  const availableRetailers = useMemo(
    () => [...new Set(allDeals.map((deal) => deal.retailer))].sort(),
    [allDeals],
  );

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
    () =>
      getVisibleDeals({
        allDeals,
        search,
        category: selectedCategory,
        retailer: retailerFilter,
        sort,
        nearbyStores,
        storeId: selectedStoreId,
        newOnly,
      }),
    [allDeals, search, selectedCategory, retailerFilter, sort, nearbyStores, selectedStoreId, newOnly],
  );

  // Only the current filter/search/sort/category/store selection resets how
  // many cards are mounted -- not radius/nearbyStores, so tweaking the
  // radius doesn't collapse a list you've already scrolled through back down.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, selectedCategory, retailerFilter, sort, selectedStoreId, newOnly]);

  const pagedDeals = useMemo(() => visibleDeals.slice(0, visibleCount), [visibleDeals, visibleCount]);
  const hasMore = pagedDeals.length < visibleDeals.length;

  const { ref: loadMoreRef, inView } = useInView({
    rootMargin: "600px", // start loading before the sentinel is actually on screen
    skip: !hasMore,
  });
  useEffect(() => {
    if (inView && hasMore) {
      setVisibleCount((count) => Math.min(count + PAGE_SIZE, visibleDeals.length));
    }
  }, [inView, hasMore, visibleDeals.length]);

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

  // Optimistic local update, then persist -- same shape as the favorites
  // toggle above, just server-backed instead of localStorage. Voting the
  // same way again clears the vote (matches the favorite star's toggle UX).
  const handleVote = (sku: string, vote: Vote) => {
    const isSame = feedback[sku] === vote;
    setFeedback((current) => {
      const next = { ...current };
      if (isSame) {
        delete next[sku];
      } else {
        next[sku] = vote;
      }
      return next;
    });

    if (isSame) {
      fetch(`/api/feedback?sku=${encodeURIComponent(sku)}`, { method: "DELETE" });
    } else {
      fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sku, vote }),
      });
    }
  };

  const located = locationState === "located";

  return (
    <>
      <header>
        <p className="eyebrow">🛍️ Ontario</p>
        <h1>DealRadar</h1>
        <p className="subtitle">Tracking deals, stock, and drops across Ontario retailers.</p>
        <Button asChild variant="ghost" size="2" className="preferences-link">
          <Link href="/preferences">Preferences</Link>
        </Button>
      </header>

      <main>
        <section id="location">
          <p id="location-status" className="empty-state" hidden={located}>
            {locationState === "located" ? "" : LOCATION_STATUS_TEXT[locationState]}
          </p>
          {locationState === "error" ? (
            <Button id="retry-location" type="button" variant="soft" size="2" onClick={locate}>
              Try location again
            </Button>
          ) : null}

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
            <TextField.Root
              id="search-input"
              type="search"
              placeholder="Search deals…"
              aria-label="Search deals"
              size="2"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            {availableRetailers.length > 1 ? (
              <Select.Root
                value={retailerFilter || "all"}
                onValueChange={(next) => setRetailerFilter(next === "all" ? "" : (next as Retailer))}
                size="2"
              >
                <Select.Trigger id="retailer-select" aria-label="Filter by store" />
                <Select.Content>
                  <Select.Item value="all">All stores</Select.Item>
                  {availableRetailers.map((retailer) => (
                    <Select.Item key={retailer} value={retailer}>
                      {RETAILER_LABELS[retailer]}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            ) : null}

            <Popover.Root open={categoryPickerOpen} onOpenChange={setCategoryPickerOpen}>
              <Popover.Trigger>
                <Button id="category-picker" variant="soft" color="gray" size="2">
                  {selectedCategory ? lastCategorySegment(selectedCategory) : "All categories"}
                </Button>
              </Popover.Trigger>
              <Popover.Content>
                <CategoryTree tree={categoryTree} selectedCategory={selectedCategory} onSelect={selectCategory} />
              </Popover.Content>
            </Popover.Root>

            <StoreSelect
              stores={allStores}
              userCoords={userCoords}
              selectedStoreId={selectedStoreId}
              onSelect={setSelectedStoreId}
            />
            <Button
              id="new-today-toggle"
              type="button"
              variant={newOnly ? "solid" : "soft"}
              color={newOnly ? "ruby" : "gray"}
              size="2"
              aria-pressed={newOnly}
              onClick={() => setNewOnly((current) => !current)}
            >
              New today
            </Button>
            <IconButton
              id="favorite-category-button"
              type="button"
              variant="soft"
              color={isFavorite ? "ruby" : "gray"}
              title={isFavorite ? "Remove favorite category" : "Save as favorite category"}
              aria-pressed={isFavorite}
              disabled={!selectedCategory}
              onClick={handleToggleFavorite}
            >
              {isFavorite ? "★" : "☆"}
            </IconButton>

            <Select.Root value={sort} onValueChange={(next) => setSort(next as SortOption)} size="2">
              <Select.Trigger id="sort-select" aria-label="Sort deals" />
              <Select.Content>
                <Select.Item value="price-asc">Price: Low to High</Select.Item>
                <Select.Item value="price-desc">Price: High to Low</Select.Item>
                <Select.Item value="name-asc">Name: A to Z</Select.Item>
                {located ? (
                  <Select.Item value="in-stock" id="sort-in-stock-option">
                    In Stock Near Me First
                  </Select.Item>
                ) : null}
              </Select.Content>
            </Select.Root>
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
            {pagedDeals.map((deal) => (
              <DealCard
                key={deal.sku}
                deal={deal}
                nearbyStores={nearbyStores}
                radiusKm={radiusKm}
                vote={feedback[deal.sku]}
                onVote={handleVote}
              />
            ))}
            {hasMore ? (
              <li ref={loadMoreRef} className="load-more-sentinel" aria-hidden="true">
                Loading more deals…
              </li>
            ) : null}
          </ul>
        </section>
      </main>

      <footer>
        <p>Not affiliated with LCBO or Best Buy. Data sourced independently.</p>
      </footer>
    </>
  );
}
