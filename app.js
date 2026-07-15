const locationStatus = document.getElementById("location-status");
const retryLocationButton = document.getElementById("retry-location");
const radiusLabel = document.getElementById("radius-label");
const radiusSelect = document.getElementById("radius-select");
const dealsStatus = document.getElementById("deals-status");
const dealsList = document.getElementById("deals-list");
const searchInput = document.getElementById("search-input");
const categoryPicker = document.getElementById("category-picker");
const categoryPickerSummary = document.getElementById("category-picker-summary");
const categoryTree = document.getElementById("category-tree");
const sortSelect = document.getElementById("sort-select");
const sortInStockOption = document.getElementById("sort-in-stock-option");
const resultsCount = document.getElementById("results-count");
const favoriteCategoryButton = document.getElementById("favorite-category-button");
const favoriteChips = document.getElementById("favorite-chips");

let allDeals = [];
let allStores = [];
let userCoords = null;
let nearbyStores = []; // [{ store, distanceKm }], sorted nearest first, within the selected radius
let selectedCategory = ""; // pipe path, e.g. "Spirits|Whisky|Scotch Whisky", or "" for all

// A small list of favorited category paths — the whole point is quick
// one-click access to them (rendered as chips), not just a remembered
// default on page load. Most-recently-favorited first.
const FAVORITE_CATEGORIES_KEY = "boozeradar:favoriteCategories";

function getFavoriteCategories() {
  try {
    const stored = JSON.parse(localStorage.getItem(FAVORITE_CATEGORIES_KEY));
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function isFavoriteCategory(path) {
  return getFavoriteCategories().includes(path);
}

function toggleFavoriteCategory(path) {
  const current = getFavoriteCategories();
  const next = current.includes(path) ? current.filter((c) => c !== path) : [path, ...current];
  localStorage.setItem(FAVORITE_CATEGORIES_KEY, JSON.stringify(next));
  renderFavoriteChips();
}

function renderFavoriteChips() {
  const favorites = getFavoriteCategories();
  favoriteChips.hidden = favorites.length === 0;
  favoriteChips.innerHTML = favorites
    .map(
      (path) => `
        <span class="favorite-chip">
          <button type="button" class="favorite-chip-select" data-category="${path}">★ ${lastCategorySegment(path)}</button>
          <button type="button" class="favorite-chip-remove" data-category="${path}" aria-label="Remove favorite">×</button>
        </span>
      `,
    )
    .join("");
}

const centsToDollars = (cents) => `$${(cents / 100).toFixed(2)}`;

// "Products|Wine|Red Wine" -> "Red Wine"
const lastCategorySegment = (category) => category?.split("|").at(-1) ?? "";

// "Products|Spirits|Whisky|Scotch Whisky" -> "Spirits|Whisky|Scotch Whisky"
// LCBO's own category tree, just with the meaningless "Products" root dropped.
const normalizedCategory = (category) =>
  (category ?? "").split("|").filter((part) => part !== "Products").join("|");

// Haversine distance in km between two lat/lng points.
function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Recomputes `nearbyStores` from the cached user position + store list +
// currently selected radius. Cheap and synchronous — no need to re-request
// geolocation or refetch stores.json just because the radius changed.
function computeNearbyStores() {
  if (!userCoords || allStores.length === 0) {
    nearbyStores = [];
    return;
  }
  const radiusKm = Number(radiusSelect.value);
  const withDistance = allStores
    .map((store) => ({
      store,
      distanceKm: distanceKm(userCoords.lat, userCoords.lng, store.latitude, store.longitude),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  nearbyStores = withDistance.filter((s) => s.distanceKm <= radiusKm);
  // Nothing within radius (e.g. a small radius in a rural area) — fall back
  // to the single nearest store rather than showing a dead end.
  if (nearbyStores.length === 0 && withDistance.length > 0) {
    nearbyStores = [withDistance[0]];
  }
}

// The nearest store (within the current nearbyStores) that actually
// carries this deal, or null if none of them do.
function nearestInStockStore(deal) {
  return nearbyStores.find((s) => deal.inStockStoreIds.includes(s.store.externalId)) ?? null;
}

function isInStock(deal) {
  return nearestInStockStore(deal) !== null;
}

// Turns LCBO's real category tree (from the products' pipe-delimited
// `category` paths) into a nested { name, path, children: Map } structure,
// so it can be rendered as an actual collapsible tree -- every level
// present in the data, not just the top-level bucket.
function buildCategoryTree(deals) {
  const root = { name: "", path: "", children: new Map() };
  for (const deal of deals) {
    const parts = normalizedCategory(deal.category).split("|").filter(Boolean);
    let node = root;
    let prefix = "";
    for (const part of parts) {
      prefix = prefix ? `${prefix}|${part}` : part;
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, path: prefix, children: new Map() });
      }
      node = node.children.get(part);
    }
  }
  return root;
}

// Renders one node as either a plain selectable button (leaf) or a nested
// <details> (has children) whose <summary> is itself selectable -- so e.g.
// "Whisky" both filters to everything under it AND expands/collapses to
// reveal "Scotch Whisky", "Canadian Whisky", etc.
function renderCategoryNode(node) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "category-option";
  button.dataset.category = node.path;
  button.textContent = node.name;

  if (node.children.size === 0) {
    return button;
  }

  const details = document.createElement("details");
  details.className = "category-subtree";
  const summary = document.createElement("summary");
  summary.appendChild(button);
  details.appendChild(summary);
  for (const child of [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    details.appendChild(renderCategoryNode(child));
  }
  return details;
}

function populateCategoryFilter(deals) {
  const tree = buildCategoryTree(deals);
  for (const node of [...tree.children.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    categoryTree.appendChild(renderCategoryNode(node));
  }

  renderFavoriteChips();

  // Default to the most-recently-favorited category on a fresh load, same
  // idea as "remember where I left off" — the chips below are what let you
  // actually jump between favorites during a session.
  const [mostRecentFavorite] = getFavoriteCategories();
  const allPaths = [...categoryTree.querySelectorAll(".category-option")].map((b) => b.dataset.category);
  selectCategory(mostRecentFavorite && allPaths.includes(mostRecentFavorite) ? mostRecentFavorite : "", {
    render: false,
  });
}

// Single source of truth for "what's selected" -- updates state, the active
// highlight, the collapsed summary label, and the favorite star, all from
// one place. `render: false` skips the deals re-render (used during
// initial setup, where initDeals() already renders right after).
function selectCategory(path, { render = true } = {}) {
  selectedCategory = path;
  let selectedButton = null;
  for (const btn of categoryTree.querySelectorAll(".category-option")) {
    const isMatch = btn.dataset.category === path;
    btn.classList.toggle("active", isMatch);
    if (isMatch) selectedButton = btn;
  }
  categoryPickerSummary.textContent = path ? lastCategorySegment(path) : "All categories";

  // Expand the selected node's own subtree (if it has one) and every
  // ancestor, so the drill-down path stays visible instead of collapsing
  // back to just the top level after picking something nested.
  let details = selectedButton?.closest("details");
  while (details && details !== categoryPicker) {
    details.open = true;
    details = details.parentElement?.closest("details") ?? null;
  }

  categoryPicker.open = false;
  updateFavoriteButton();
  if (render) renderDeals();
}

function updateFavoriteButton() {
  const isFavorite = Boolean(selectedCategory) && isFavoriteCategory(selectedCategory);
  favoriteCategoryButton.textContent = isFavorite ? "★" : "☆";
  favoriteCategoryButton.setAttribute("aria-pressed", String(isFavorite));
  favoriteCategoryButton.title = isFavorite ? "Remove favorite category" : "Save as favorite category";
  favoriteCategoryButton.disabled = !selectedCategory;
}

function getVisibleDeals() {
  const query = searchInput.value.trim().toLowerCase();
  const category = selectedCategory;
  let sort = sortSelect.value;
  if (sort === "in-stock" && nearbyStores.length === 0) sort = "price-asc";

  const filtered = allDeals.filter((deal) => {
    if (category) {
      const path = normalizedCategory(deal.category);
      if (path !== category && !path.startsWith(category + "|")) return false;
    }
    if (query && !deal.name.toLowerCase().includes(query)) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case "price-desc":
        return b.priceInCents - a.priceInCents;
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "in-stock":
        return Number(isInStock(b)) - Number(isInStock(a)) || a.priceInCents - b.priceInCents;
      case "price-asc":
      default:
        return a.priceInCents - b.priceInCents;
    }
  });

  return sorted;
}

function renderDeals() {
  const deals = getVisibleDeals();
  dealsList.innerHTML = "";
  resultsCount.textContent = allDeals.length
    ? `${deals.length} of ${allDeals.length} deals`
    : "";

  if (deals.length === 0) {
    dealsStatus.hidden = false;
    dealsStatus.textContent = "No deals match your filters.";
    return;
  }
  dealsStatus.hidden = true;

  for (const deal of deals) {
    const li = document.createElement("li");
    li.className = "deal";

    const badges = [];
    if (deal.discountPercent) badges.push(`<span class="badge badge-discount">-${deal.discountPercent}%</span>`);
    if (deal.priceDropped) badges.push('<span class="badge badge-drop">Price drop</span>');
    if (deal.nearHistoricalLow) badges.push('<span class="badge badge-low">Near all-time low</span>');

    const regularPrice = deal.regularPriceInCents
      ? `<span class="regular-price">${centsToDollars(deal.regularPriceInCents)}</span>`
      : "";

    let stockLine = "";
    if (nearbyStores.length > 0) {
      const match = nearestInStockStore(deal);
      stockLine = match
        ? `<p class="stock in-stock">In stock at ${match.store.name} (${match.distanceKm.toFixed(1)} km)</p>`
        : `<p class="stock out-of-stock">Not in stock within ${radiusSelect.value} km</p>`;
    }

    li.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb" src="${deal.thumbnailUrl ?? ""}" alt="" loading="lazy" />
      </div>
      <h3>${deal.name}</h3>
      <p class="category">${lastCategorySegment(deal.category)}</p>
      <p class="price">${centsToDollars(deal.priceInCents)} ${regularPrice}</p>
      <p class="badges">${badges.join(" ")}</p>
      ${stockLine}
    `;
    dealsList.appendChild(li);
  }
}

async function loadDeals() {
  try {
    const res = await fetch("data/deals.json");
    const data = await res.json();
    return data.deals;
  } catch (err) {
    dealsStatus.hidden = false;
    dealsStatus.textContent = "Couldn't load deals data.";
    console.error(err);
    return [];
  }
}

async function loadStores() {
  const res = await fetch("data/stores.json");
  const data = await res.json();
  return data.stores;
}

async function initDeals() {
  allDeals = await loadDeals();
  populateCategoryFilter(allDeals);
  renderDeals();
}

function locate() {
  retryLocationButton.hidden = true;
  radiusLabel.hidden = true;
  locationStatus.hidden = false;
  locationStatus.textContent = "Locating nearest store…";

  if (!("geolocation" in navigator)) {
    locationStatus.textContent = "Location isn't available in this browser.";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      userCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
      allStores = await loadStores();
      computeNearbyStores();
      locationStatus.hidden = true;
      radiusLabel.hidden = false;
      sortInStockOption.hidden = false;
      renderDeals();
    },
    (err) => {
      console.error(err);
      userCoords = null;
      nearbyStores = [];
      locationStatus.textContent = "Enable location to see stock near you.";
      retryLocationButton.hidden = false;
    },
  );
}

searchInput.addEventListener("input", renderDeals);
sortSelect.addEventListener("change", renderDeals);
retryLocationButton.addEventListener("click", locate);
radiusSelect.addEventListener("change", () => {
  computeNearbyStores();
  renderDeals();
});

categoryTree.addEventListener("click", (event) => {
  const button = event.target.closest(".category-option");
  if (!button) return;
  // Selecting a parent node's own label (its <summary> button) shouldn't
  // also toggle that <details> open/closed via the native summary click.
  event.preventDefault();
  selectCategory(button.dataset.category);
});

favoriteCategoryButton.addEventListener("click", () => {
  if (!selectedCategory) return;
  toggleFavoriteCategory(selectedCategory);
  updateFavoriteButton();
});

favoriteChips.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".favorite-chip-remove");
  if (removeButton) {
    toggleFavoriteCategory(removeButton.dataset.category);
    updateFavoriteButton(); // in case the removed chip was the currently-selected category
    return;
  }
  const selectButton = event.target.closest(".favorite-chip-select");
  if (selectButton) selectCategory(selectButton.dataset.category);
});

initDeals();
locate();
