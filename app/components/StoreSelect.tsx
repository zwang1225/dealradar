"use client";

import { useMemo, useState } from "react";
import { Button, Popover, Text, TextField } from "@radix-ui/themes";
import { Store, distanceKm } from "@/lib/deals";

// Ontario has ~690 LCBO stores -- a plain <select> would be unsearchable and
// a fully unfiltered list is a lot of DOM to keep mounted, so this caps how
// many rows render at once. Search narrows it down fast; nothing here needs
// pagination or virtualization for that to feel instant.
const MAX_VISIBLE_RESULTS = 40;

export function StoreSelect({
  stores,
  userCoords,
  selectedStoreId,
  onSelect,
}: {
  stores: Store[];
  userCoords: { lat: number; lng: number } | null;
  selectedStoreId: string;
  onSelect: (externalId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedStore = useMemo(
    () => stores.find((store) => store.externalId === selectedStoreId) ?? null,
    [stores, selectedStoreId],
  );

  // Nearest-first once we have the user's location (same distance calc as
  // the radius/nearby-stores logic elsewhere), otherwise alphabetical by
  // name -- either way, the most useful stores land in the visible cap
  // before the user types anything.
  const sortedStores = useMemo(() => {
    if (!userCoords) {
      return [...stores].sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...stores].sort(
      (a, b) =>
        distanceKm(userCoords.lat, userCoords.lng, a.latitude, a.longitude) -
        distanceKm(userCoords.lat, userCoords.lng, b.latitude, b.longitude),
    );
  }, [stores, userCoords]);

  const matches = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return sortedStores;
    return sortedStores.filter(
      (store) => store.name.toLowerCase().includes(trimmed) || store.city.toLowerCase().includes(trimmed),
    );
  }, [sortedStores, query]);

  const visibleMatches = matches.slice(0, MAX_VISIBLE_RESULTS);

  const selectStore = (externalId: string) => {
    onSelect(externalId);
    setOpen(false);
  };

  if (stores.length === 0) return null;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <Popover.Trigger>
        <Button id="store-picker" type="button" variant="soft" color="gray" size="2">
          {selectedStore ? selectedStore.name : "All stores"}
        </Button>
      </Popover.Trigger>
      <Popover.Content>
        <div className="store-select">
          <TextField.Root
            id="store-search-input"
            type="search"
            placeholder="Search stores by name or city…"
            aria-label="Search stores"
            size="2"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="store-select-list">
            <Button
              type="button"
              variant={selectedStoreId === "" ? "solid" : "ghost"}
              color={selectedStoreId === "" ? "ruby" : "gray"}
              size="2"
              className="store-option"
              onClick={() => selectStore("")}
            >
              All stores
            </Button>
            {visibleMatches.map((store) => (
              <Button
                key={store.externalId}
                type="button"
                variant={selectedStoreId === store.externalId ? "solid" : "ghost"}
                color={selectedStoreId === store.externalId ? "ruby" : "gray"}
                size="2"
                className="store-option"
                onClick={() => selectStore(store.externalId)}
              >
                {store.name}
                <Text as="span" size="1" color="gray" className="store-option-city">
                  {store.city}
                </Text>
              </Button>
            ))}
            {matches.length === 0 ? (
              <Text as="p" size="2" color="gray" className="store-select-empty">
                No stores match &ldquo;{query}&rdquo;.
              </Text>
            ) : null}
            {matches.length > MAX_VISIBLE_RESULTS ? (
              <Text as="p" size="1" color="gray" className="store-select-empty">
                Showing {MAX_VISIBLE_RESULTS} of {matches.length} matches — keep typing to narrow it down.
              </Text>
            ) : null}
          </div>
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}
