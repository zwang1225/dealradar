const locationStatus = document.getElementById("location-status");
const retryLocationButton = document.getElementById("retry-location");
const dealsStatus = document.getElementById("deals-status");
const dealsList = document.getElementById("deals-list");

const centsToDollars = (cents) => `$${(cents / 100).toFixed(2)}`;

// "Products|Wine|Red Wine" -> "Red Wine"
const lastCategorySegment = (category) => category?.split("|").at(-1) ?? "";

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

function findNearestStore(stores, lat, lng) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const store of stores) {
    const d = distanceKm(lat, lng, store.latitude, store.longitude);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = store;
    }
  }
  return { store: nearest, distanceKm: nearestDistance };
}

function renderDeals(deals, nearestStore) {
  dealsList.innerHTML = "";
  if (deals.length === 0) {
    dealsStatus.textContent = "No deals found.";
    return;
  }
  dealsStatus.hidden = true;

  for (const deal of deals) {
    const li = document.createElement("li");
    li.className = "deal";

    const badges = [];
    if (deal.priceDropped) badges.push('<span class="badge badge-drop">Price drop</span>');
    if (deal.nearHistoricalLow) badges.push('<span class="badge badge-low">Near all-time low</span>');

    let stockLine = "";
    if (nearestStore) {
      const inStock = deal.inStockStoreIds.includes(nearestStore.store.externalId);
      stockLine = `<p class="stock ${inStock ? "in-stock" : "out-of-stock"}">
        ${inStock ? "In stock" : "Not in stock"} at ${nearestStore.store.name}
        (${nearestStore.distanceKm.toFixed(1)} km)
      </p>`;
    }

    li.innerHTML = `
      <img class="thumb" src="${deal.thumbnailUrl ?? ""}" alt="" loading="lazy" />
      <div class="deal-body">
        <h3>${deal.name}</h3>
        <p class="category">${lastCategorySegment(deal.category)}</p>
        <p class="price">${centsToDollars(deal.priceInCents)}</p>
        <p class="badges">${badges.join(" ")}</p>
        ${stockLine}
      </div>
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

function locate() {
  retryLocationButton.hidden = true;
  locationStatus.hidden = false;
  locationStatus.textContent = "Locating nearest store…";

  if (!("geolocation" in navigator)) {
    locationStatus.textContent = "Location isn't available in this browser.";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const stores = await loadStores();
      const nearestStore = findNearestStore(
        stores,
        position.coords.latitude,
        position.coords.longitude,
      );
      locationStatus.hidden = true;
      const deals = await loadDeals();
      renderDeals(deals, nearestStore);
    },
    (err) => {
      console.error(err);
      locationStatus.textContent = "Enable location to see stock near you.";
      retryLocationButton.hidden = false;
      loadDeals().then((deals) => renderDeals(deals, null));
    },
  );
}

retryLocationButton.addEventListener("click", locate);
locate();
