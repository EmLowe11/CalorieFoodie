// Default: Sanford, FL
const DEFAULT = { zip: "32771", lat: 28.8003, lon: -81.2731, label: "Sanford, FL" };
const RADIUS_MILES = 10;
const RADIUS_METERS = Math.round(RADIUS_MILES * 1609.34);
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const TYPE_LABELS = { restaurant: "Restaurant", fast_food: "Fast Food", cafe: "Café" };

const els = {
  form: document.getElementById("search"),
  zip: document.getElementById("zip"),
  locate: document.getElementById("locate"),
  chips: document.getElementById("chips"),
  place: document.getElementById("place"),
  count: document.getElementById("count"),
  status: document.getElementById("status"),
  list: document.getElementById("list"),
};

let places = [];
let filter = "all";
let markers = L.layerGroup();
let radiusCircle = null;

const map = L.map("map", { zoomControl: true }).setView([DEFAULT.lat, DEFAULT.lon], 11);
L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
  maxZoom: 19,
}).addTo(map);
markers.addTo(map);

// Zip code -> coordinates (Zippopotam.us, free, no key)
async function lookupZip(zip) {
  const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!res.ok) throw new Error("We couldn't find that zip code.");
  const data = await res.json();
  const p = data.places[0];
  return {
    lat: parseFloat(p.latitude),
    lon: parseFloat(p.longitude),
    label: `${p["place name"]}, ${p["state abbreviation"]}`,
  };
}

// Restaurants near a point (OpenStreetMap Overpass API, free, no key)
async function findRestaurants(lat, lon) {
  const query = `[out:json][timeout:25];
    nwr["amenity"~"^(restaurant|fast_food|cafe)$"]["name"](around:${RADIUS_METERS},${lat},${lon});
    out center tags;`;
  let lastError;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(query) });
      if (!res.ok) throw new Error(`Overpass error ${res.status}`);
      const data = await res.json();
      return data.elements
        .map((el) => {
          const pLat = el.lat ?? el.center?.lat;
          const pLon = el.lon ?? el.center?.lon;
          const t = el.tags || {};
          return {
            id: el.type + el.id,
            name: t.name,
            type: t.amenity,
            cuisine: t.cuisine ? t.cuisine.split(";")[0].replace(/_/g, " ") : "",
            address: [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" "),
            lat: pLat,
            lon: pLon,
            miles: distanceMiles(lat, lon, pLat, pLon),
          };
        })
        .filter((p) => p.lat != null && p.miles <= RADIUS_MILES)
        .sort((a, b) => a.miles - b.miles);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Couldn't load restaurants.");
}

function distanceMiles(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function directionsUrl(p) {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`;
}

function render() {
  const shown = filter === "all" ? places : places.filter((p) => p.type === filter);
  els.count.textContent = `${shown.length} place${shown.length === 1 ? "" : "s"}`;
  els.list.innerHTML = "";
  markers.clearLayers();

  if (!shown.length && !els.status.textContent) {
    els.status.textContent = "No places found here. Try another zip code.";
  }

  for (const p of shown) {
    const meta = [TYPE_LABELS[p.type], p.cuisine, p.address].filter(Boolean).map(escapeHtml).join(" · ");
    const marker = L.circleMarker([p.lat, p.lon], {
      radius: 6, color: "#fff", weight: 2, fillColor: "#0a84ff", fillOpacity: 1,
    }).bindPopup(
      `<strong>${escapeHtml(p.name)}</strong><br>${meta}<br>${p.miles.toFixed(1)} mi · ` +
      `<a href="${directionsUrl(p)}" target="_blank" rel="noopener">Directions</a>`
    );
    markers.addLayer(marker);

    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div>
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="meta">${meta}</div>
      </div>
      <div class="right">
        <div class="dist">${p.miles.toFixed(1)} mi</div>
        <a href="${directionsUrl(p)}" target="_blank" rel="noopener">Directions</a>
      </div>`;
    li.addEventListener("click", (e) => {
      if (e.target.tagName === "A") return;
      map.setView([p.lat, p.lon], 16);
      marker.openPopup();
      if (window.innerWidth < 860) window.scrollTo({ top: 0, behavior: "smooth" });
    });
    els.list.appendChild(li);
  }
}

async function search(center) {
  els.status.textContent = "Finding restaurants…";
  els.list.innerHTML = "";
  els.count.textContent = "";
  els.place.textContent = center.label;
  setBusy(true);

  if (radiusCircle) radiusCircle.remove();
  radiusCircle = L.circle([center.lat, center.lon], {
    radius: RADIUS_METERS, color: "#0a84ff", weight: 1, fillOpacity: 0.05,
  }).addTo(map);
  map.fitBounds(radiusCircle.getBounds(), { padding: [8, 8] });

  try {
    places = await findRestaurants(center.lat, center.lon);
    els.status.textContent = "";
  } catch {
    places = [];
    els.status.textContent = "Couldn't load restaurants right now. Please try again.";
  } finally {
    setBusy(false);
    render();
  }
}

function setBusy(busy) {
  els.form.querySelectorAll("button").forEach((b) => (b.disabled = busy));
}

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const zip = els.zip.value.trim();
  if (!/^\d{5}$/.test(zip)) {
    els.status.textContent = "Please enter a 5-digit US zip code.";
    return;
  }
  try {
    setBusy(true);
    els.status.textContent = "Looking up zip code…";
    await search(await lookupZip(zip));
  } catch (err) {
    setBusy(false);
    els.status.textContent = err.message;
  }
});

els.locate.addEventListener("click", () => {
  if (!navigator.geolocation) {
    els.status.textContent = "Location isn't available in this browser.";
    return;
  }
  els.status.textContent = "Getting your location…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      els.zip.value = "";
      search({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "Near you" });
    },
    () => (els.status.textContent = "Couldn't get your location. Enter a zip code instead.")
  );
});

els.chips.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  els.chips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
  filter = chip.dataset.type;
  els.status.textContent = "";
  render();
});

search(DEFAULT);
