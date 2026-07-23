const ORS_API_KEY = "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjcwZDYwNGJjMmZmMTRhYzI5N2NiNTU0YmMwMjAyNDgyIiwiaCI6Im11cm11cjY0In0=";
const TOMORROW_API_KEY = "PO0BiTXHEmU1dWBcdtt6NAtKuNLdhG4F";

let map;
let startMarker = null;
let endMarker = null;
let routeLine = null;
let nearbyMarkers = [];

function initMap() {
    const mapElement = document.getElementById("map");
    if (!mapElement) return;

    map = L.map("map").setView([20.5937, 78.9629], 5);

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution: "© OpenStreetMap contributors"
        }
    ).addTo(map);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMap);
} else {
    initMap();
}

function updateClock() {
    const clockElement = document.getElementById("clock");
    if (clockElement) {
        clockElement.innerText = new Date().toLocaleString();
    }
}

updateClock();
setInterval(updateClock, 1000);

loadHistory();

const routeBtn = document.getElementById("routeBtn");
const resetBtn = document.getElementById("resetBtn");
const clearBtn = document.getElementById("clearBtn");
const printBtn = document.getElementById("printBtn");
const fuelBtn = document.getElementById("fuelBtn");

if (routeBtn) {
    routeBtn.addEventListener("click", function () {
        const startInput = document.getElementById("start");
        const endInput = document.getElementById("end");

        const start = startInput ? startInput.value.trim() : "";
        const end = endInput ? endInput.value.trim() : "";

        if (start === "" || end === "") {
            alert("Enter both locations");
            return;
        }

        const loadingElem = document.getElementById("loading");
        if (loadingElem) loadingElem.innerText = "Loading...";

        getRoute(start, end);
    });
}

async function getRoute(start, end) {
    try {
        const startData = await geocode(start);
        const endData = await geocode(end);

        const fromPlaceElem = document.getElementById("fromPlace");
        const toPlaceElem = document.getElementById("toPlace");
        if (fromPlaceElem) fromPlaceElem.innerText = start;
        if (toPlaceElem) toPlaceElem.innerText = end;

        showMarkers(startData, endData);

        await drawRoute(startData, endData);

        try {
            await getWeather(startData, endData);
        } catch (wErr) {
            const weatherElem = document.getElementById("weather");
            if (weatherElem) {
                weatherElem.innerHTML = "Start : N/A<br>Destination : N/A";
            }
        }

        try {
            await findNearbyPlaces(endData.lat, endData.lng);
        } catch (pErr) {
            resetPlacesUI();
        }

        saveTrip(start, end);

        const tipElem = document.getElementById("tip");
        if (tipElem) tipElem.innerText = getTip();

    } catch (error) {
        alert("Unable to fetch trip details. Please check location names.");
    } finally {
        const loadingElem = document.getElementById("loading");
        if (loadingElem) loadingElem.innerText = "Ready";
    }
}

async function geocode(place) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}`;

    const response = await fetch(url, {
        headers: {
            "Accept": "application/json"
        }
    });

    if (!response.ok) {
        throw new Error("Geocoding failed");
    }

    const data = await response.json();

    if (!data || data.length === 0) {
        throw new Error("Location not found");
    }

    return {
        lat: Number(data[0].lat),
        lng: Number(data[0].lon),
        name: data[0].display_name
    };
}

function showMarkers(start, end) {
    if (!map) return;

    if (startMarker) {
        map.removeLayer(startMarker);
        startMarker = null;
    }

    if (endMarker) {
        map.removeLayer(endMarker);
        endMarker = null;
    }

    startMarker = L.marker([start.lat, start.lng])
        .addTo(map)
        .bindPopup("Start: " + start.name.split(",")[0])
        .openPopup();

    endMarker = L.marker([end.lat, end.lng])
        .addTo(map)
        .bindPopup("Destination: " + end.name.split(",")[0]);
}

async function drawRoute(start, end) {
    if (!map) return;

    let points = [];
    let distKm = 0;
    let durationMins = 0;
    let routeSuccess = false;

    try {
        const response = await fetch(
            "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
            {
                method: "POST",
                headers: {
                    "Authorization": ORS_API_KEY,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    coordinates: [
                        [start.lng, start.lat],
                        [end.lng, end.lat]
                    ]
                })
            }
        );

        if (response.ok) {
            const data = await response.json();
            if (data && data.features && data.features.length > 0) {
                points = data.features[0].geometry.coordinates.map(function (point) {
                    return [point[1], point[0]];
                });

                const summary = data.features[0].properties.summary;
                distKm = (summary.distance / 1000).toFixed(2);
                durationMins = Math.round(summary.duration / 60);
                routeSuccess = true;
            }
        }
    } catch (e) {
        routeSuccess = false;
    }

    if (!routeSuccess) {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
        const osrmResponse = await fetch(osrmUrl);
        if (!osrmResponse.ok) {
            throw new Error("Routing failed");
        }
        const osrmData = await osrmResponse.json();
        if (!osrmData || !osrmData.routes || osrmData.routes.length === 0) {
            throw new Error("No route found");
        }

        const route = osrmData.routes[0];
        points = route.geometry.coordinates.map(function (point) {
            return [point[1], point[0]];
        });

        distKm = (route.distance / 1000).toFixed(2);
        durationMins = Math.round(route.duration / 60);
    }

    if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
    }

    routeLine = L.polyline(points, {
        color: "#2563eb",
        weight: 5
    }).addTo(map);

    map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });

    const distElem = document.getElementById("distance");
    const durElem = document.getElementById("duration");

    if (distElem) distElem.innerText = distKm + " km";
    if (durElem) durElem.innerText = durationMins + " mins";
}

async function getWeather(start, end) {
    async function weather(lat, lng) {
        try {
            const url = `https://api.tomorrow.io/v4/weather/realtime?location=${lat},${lng}&apikey=${TOMORROW_API_KEY}`;
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                if (data && data.data && data.data.values && typeof data.data.values.temperature === "number") {
                    return data.data.values.temperature.toFixed(1);
                }
            }
        } catch (e) {
        }

        try {
            const fallbackUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`;
            const fbResponse = await fetch(fallbackUrl);
            if (fbResponse.ok) {
                const fbData = await fbResponse.json();
                if (fbData && fbData.current_weather && typeof fbData.current_weather.temperature === "number") {
                    return fbData.current_weather.temperature.toFixed(1);
                }
            }
        } catch (e) {
        }

        return "--";
    }

    const startTemp = await weather(start.lat, start.lng);
    const endTemp = await weather(end.lat, end.lng);

    const weatherElem = document.getElementById("weather");
    if (weatherElem) {
        weatherElem.innerHTML = "Start : " + startTemp + "°C<br>Destination : " + endTemp + "°C";
    }
}

// Helper function to create custom Leaflet marker icons using Font Awesome
function createCategoryMarkerIcon(iconClass, color) {
    return L.divIcon({
        className: "custom-place-marker",
        html: `<div style="background-color: ${color}; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.3); font-size: 15px;"><i class="${iconClass}"></i></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
    });
}

// Corrected function to find nearby places using OpenStreetMap Overpass API
async function findNearbyPlaces(lat, lon) {
    if (map && nearbyMarkers.length > 0) {
        nearbyMarkers.forEach(function (marker) {
            map.removeLayer(marker);
        });
    }
    nearbyMarkers = [];

    const hotelList = document.getElementById("hotelList");
    const restaurantList = document.getElementById("restaurantList");
    const petrolList = document.getElementById("petrolList");
    const evList = document.getElementById("evList");

    const hotelCount = document.getElementById("hotelCount");
    const restaurantCount = document.getElementById("restaurantCount");
    const petrolCount = document.getElementById("petrolCount");
    const evCount = document.getElementById("evCount");

    const radius = 5000; // 5000 meters radius
    const overpassQuery = `[out:json][timeout:15];
(
  node(around:${radius},${lat},${lon})["tourism"~"hotel|guest_house|motel|hostel"];
  way(around:${radius},${lat},${lon})["tourism"~"hotel|guest_house|motel|hostel"];
  node(around:${radius},${lat},${lon})["amenity"~"restaurant|fast_food|cafe"];
  way(around:${radius},${lat},${lon})["amenity"~"restaurant|fast_food|cafe"];
  node(around:${radius},${lat},${lon})["amenity"="fuel"];
  way(around:${radius},${lat},${lon})["amenity"="fuel"];
  node(around:${radius},${lat},${lon})["amenity"="charging_station"];
  way(around:${radius},${lat},${lon})["amenity"="charging_station"];
);
out center 40;`;

    const overpassEndpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass.nchc.org.tw/api/interpreter"
    ];

    let data = null;
    let fetchSuccess = false;

    for (let i = 0; i < overpassEndpoints.length; i++) {
        try {
            const url = overpassEndpoints[i] + "?data=" + encodeURIComponent(overpassQuery);
            const response = await fetch(url);
            if (response.ok) {
                const text = await response.text();
                if (text.trim().startsWith("{")) {
                    data = JSON.parse(text);
                    fetchSuccess = true;
                    break;
                }
            }
        } catch (e) {
        }
    }

    if (!fetchSuccess || !data) {
        if (hotelList) hotelList.innerHTML = "<li>Unable to load nearby places</li>";
        if (restaurantList) restaurantList.innerHTML = "<li>Unable to load nearby places</li>";
        if (petrolList) petrolList.innerHTML = "<li>Unable to load nearby places</li>";
        if (evList) evList.innerHTML = "<li>Unable to load nearby places</li>";

        if (hotelCount) hotelCount.innerText = "0";
        if (restaurantCount) restaurantCount.innerText = "0";
        if (petrolCount) petrolCount.innerText = "0";
        if (evCount) evCount.innerText = "0";
        return;
    }

    const categories = {
        hotels: [],
        restaurants: [],
        petrol: [],
        ev: []
    };

    if (Array.isArray(data.elements)) {
        data.elements.forEach(function (element) {
            const tags = element.tags || {};
            const placeLat = element.lat || (element.center ? element.center.lat : null);
            const placeLon = element.lon || (element.center ? element.center.lon : null);

            if (!placeLat || !placeLon) return;

            const name = tags.name || tags["name:en"] || "";

            if (tags.tourism && ["hotel", "guest_house", "motel", "hostel"].includes(tags.tourism)) {
                categories.hotels.push({
                    name: name || "Hotel",
                    lat: placeLat,
                    lon: placeLon
                });
            } else if (tags.amenity && ["restaurant", "fast_food", "cafe"].includes(tags.amenity)) {
                categories.restaurants.push({
                    name: name || "Restaurant",
                    lat: placeLat,
                    lon: placeLon
                });
            } else if (tags.amenity === "fuel") {
                categories.petrol.push({
                    name: name || "Petrol Pump",
                    lat: placeLat,
                    lon: placeLon
                });
            } else if (tags.amenity === "charging_station" || tags["capacity:charging"]) {
                categories.ev.push({
                    name: name || "EV Charging Station",
                    lat: placeLat,
                    lon: placeLon
                });
            }
        });
    }

    const icons = {
        hotel: createCategoryMarkerIcon("fa-solid fa-hotel", "#2563eb"),
        restaurant: createCategoryMarkerIcon("fa-solid fa-utensils", "#d97706"),
        petrol: createCategoryMarkerIcon("fa-solid fa-gas-pump", "#dc2626"),
        ev: createCategoryMarkerIcon("fa-solid fa-charging-station", "#16a34a")
    };

    function renderCategory(items, listElem, countElem, categoryLabel, iconKey) {
        if (!listElem) return;
        listElem.innerHTML = "";

        if (items.length === 0) {
            listElem.innerHTML = "<li>No nearby places found</li>";
            if (countElem) countElem.innerText = "0";
            return;
        }

        if (countElem) countElem.innerText = items.length;

        items.forEach(function (item) {
            const li = document.createElement("li");
            li.textContent = item.name;
            listElem.appendChild(li);

            if (map) {
                const marker = L.marker([item.lat, item.lon], { icon: icons[iconKey] })
                    .addTo(map)
                    .bindPopup("<strong>" + categoryLabel + ":</strong> " + item.name);
                nearbyMarkers.push(marker);
            }
        });
    }

    renderCategory(categories.hotels, hotelList, hotelCount, "Hotel", "hotel");
    renderCategory(categories.restaurants, restaurantList, restaurantCount, "Restaurant", "restaurant");
    renderCategory(categories.petrol, petrolList, petrolCount, "Petrol Pump", "petrol");
    renderCategory(categories.ev, evList, evCount, "EV Station", "ev");
}

// Alias to maintain full compatibility with existing function calls
async function getNearbyPlaces(lat, lng) {
    return await findNearbyPlaces(lat, lng);
}

function resetPlacesUI() {
    const hotelList = document.getElementById("hotelList");
    const restaurantList = document.getElementById("restaurantList");
    const petrolList = document.getElementById("petrolList");
    const evList = document.getElementById("evList");

    if (hotelList) hotelList.innerHTML = "<li>No Data</li>";
    if (restaurantList) restaurantList.innerHTML = "<li>No Data</li>";
    if (petrolList) petrolList.innerHTML = "<li>No Data</li>";
    if (evList) evList.innerHTML = "<li>No Data</li>";

    const hc = document.getElementById("hotelCount");
    const rc = document.getElementById("restaurantCount");
    const pc = document.getElementById("petrolCount");
    const ec = document.getElementById("evCount");

    if (hc) hc.innerText = "0";
    if (rc) rc.innerText = "0";
    if (pc) pc.innerText = "0";
    if (ec) ec.innerText = "0";
}

function saveTrip(start, end) {
    try {
        let trips = JSON.parse(localStorage.getItem("routewise")) || [];
        if (!Array.isArray(trips)) trips = [];

        const tripStr = start + " → " + end;
        trips = trips.filter(function (t) { return t !== tripStr; });
        trips.unshift(tripStr);
        trips = trips.slice(0, 5);

        localStorage.setItem("routewise", JSON.stringify(trips));
    } catch (e) {
    }

    loadHistory();
}

function loadHistory() {
    const history = document.getElementById("historyList");
    if (!history) return;

    let trips = [];
    try {
        trips = JSON.parse(localStorage.getItem("routewise")) || [];
        if (!Array.isArray(trips)) trips = [];
    } catch (e) {
        trips = [];
    }

    history.innerHTML = "";

    if (trips.length === 0) {
        history.innerHTML = "<li>No Trips Yet</li>";
        return;
    }

    trips.forEach(function (trip) {
        const li = document.createElement("li");
        li.innerText = trip;
        li.className = "clickable-trip";
        li.addEventListener("click", function () {
            const parts = trip.split(" → ");
            if (parts.length === 2) {
                const sInput = document.getElementById("start");
                const eInput = document.getElementById("end");
                if (sInput) sInput.value = parts[0];
                if (eInput) eInput.value = parts[1];
            }
        });
        history.appendChild(li);
    });
}

if (fuelBtn) {
    fuelBtn.addEventListener("click", function () {
        const mileageInput = document.getElementById("mileage");
        const fuelPriceInput = document.getElementById("fuelPrice");
        const distElem = document.getElementById("distance");

        const mileage = mileageInput ? Number(mileageInput.value) : 0;
        const fuelPrice = fuelPriceInput ? Number(fuelPriceInput.value) : 0;
        const distanceText = distElem ? distElem.innerText : "";
        const distance = parseFloat(distanceText);

        if (isNaN(distance) || distance <= 0 || isNaN(mileage) || mileage <= 0 || isNaN(fuelPrice) || fuelPrice <= 0) {
            alert("Complete trip and enter valid fuel details");
            return;
        }

        const litres = (distance / mileage).toFixed(2);
        const cost = (litres * fuelPrice).toFixed(2);

        const fuelResultElem = document.getElementById("fuelResult");
        if (fuelResultElem) {
            fuelResultElem.innerHTML = "Fuel Needed : " + litres + " L<br>Estimated Cost : ₹" + cost;
        }
    });
}

function getTip() {
    const tips = [
        "Check tyre pressure before travelling.",
        "Carry enough drinking water.",
        "Take breaks every 2 hours.",
        "Keep your fuel tank above 25%.",
        "Follow speed limits."
    ];

    return tips[Math.floor(Math.random() * tips.length)];
}

if (clearBtn) {
    clearBtn.addEventListener("click", function () {
        if (!map) return;

        if (startMarker) {
            map.removeLayer(startMarker);
            startMarker = null;
        }

        if (endMarker) {
            map.removeLayer(endMarker);
            endMarker = null;
        }

        if (routeLine) {
            map.removeLayer(routeLine);
            routeLine = null;
        }

        nearbyMarkers.forEach(function (marker) {
            map.removeLayer(marker);
        });
        nearbyMarkers = [];

        map.setView([20.5937, 78.9629], 5);
    });
}

if (resetBtn) {
    resetBtn.addEventListener("click", function () {
        if (clearBtn) {
            clearBtn.click();
        }

        const sInput = document.getElementById("start");
        const eInput = document.getElementById("end");
        if (sInput) sInput.value = "";
        if (eInput) eInput.value = "";

        const distElem = document.getElementById("distance");
        const durElem = document.getElementById("duration");
        if (distElem) distElem.innerText = "--";
        if (durElem) durElem.innerText = "--";

        const weatherElem = document.getElementById("weather");
        if (weatherElem) {
            weatherElem.innerHTML = "Start : --<br>Destination : --";
        }

        resetPlacesUI();

        const fromPlace = document.getElementById("fromPlace");
        const toPlace = document.getElementById("toPlace");
        const tipElem = document.getElementById("tip");
        if (fromPlace) fromPlace.innerText = "--";
        if (toPlace) toPlace.innerText = "--";
        if (tipElem) tipElem.innerText = "--";

        const mileageInput = document.getElementById("mileage");
        const fuelPriceInput = document.getElementById("fuelPrice");
        const fuelResultElem = document.getElementById("fuelResult");

        if (mileageInput) mileageInput.value = "";
        if (fuelPriceInput) fuelPriceInput.value = "";
        if (fuelResultElem) {
            fuelResultElem.innerHTML = "Fuel Needed : --<br>Estimated Cost : --";
        }

        const loadingElem = document.getElementById("loading");
        if (loadingElem) loadingElem.innerText = "Ready";
    });
}

if (printBtn) {
    printBtn.addEventListener("click", function () {
        window.print();
    });
}
