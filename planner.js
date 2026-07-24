const VEHICLES = {
    petrol: { name: 'Petrol Car', mileage: 15, rate: 105, unit: 'L' },
    diesel: { name: 'Diesel Car', mileage: 18, rate: 92, unit: 'L' },
    bike: { name: 'Motorbike', mileage: 45, rate: 105, unit: 'L' },
    ev: { name: 'Electric Vehicle', mileage: 6, rate: 10, unit: 'kWh' }
};

function updateClock() {
    const clock = document.getElementById('clock');
    if (clock) clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

document.addEventListener('DOMContentLoaded', () => {
    loadTripHistory();
    document.getElementById('routeBtn')?.addEventListener('click', handlePlanTrip);
    document.getElementById('resetBtn')?.addEventListener('click', handleReset);
    document.getElementById('clearHistoryBtn')?.addEventListener('click', handleClearHistory);
});

async function handlePlanTrip(e) {
    if (e) e.preventDefault();
    const startVal = document.getElementById('start').value.trim();
    const endVal = document.getElementById('end').value.trim();
    const vehicleKey = document.getElementById('vehicle').value;
    const loading = document.getElementById('loading');

    if (!startVal || !endVal) {
        alert('Please enter both starting location and destination.');
        return;
    }

    loading.textContent = 'Calculating optimal route & fetching destination data...';

    try {
        const [startGeo, endGeo] = await Promise.all([geocode(startVal), geocode(endVal)]);
        const routeData = await getRouteData(startGeo, endGeo);
        
        const vehicle = VEHICLES[vehicleKey] || VEHICLES.petrol;
        const fuelNeeded = (routeData.distance / vehicle.mileage).toFixed(1);
        const fuelCostVal = Math.round(fuelNeeded * vehicle.rate);
        const avgSpeedVal = Math.round(routeData.distance / (routeData.durationMinutes / 60));

        document.getElementById('distance').textContent = `${routeData.distance.toFixed(1)} km`;
        document.getElementById('duration').textContent = formatDuration(routeData.durationMinutes);
        document.getElementById('fuelCost').textContent = `₹${fuelCostVal} (${fuelNeeded} ${vehicle.unit})`;
        document.getElementById('avgSpeed').textContent = `${avgSpeedVal} km/h`;

        const gmapsContainer = document.getElementById('gmapsContainer');
        const gmapsBtn = document.getElementById('gmapsBtn');
        if (gmapsContainer && gmapsBtn) {
            gmapsBtn.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(startVal)}&destination=${encodeURIComponent(endVal)}&travelmode=driving`;
            gmapsContainer.classList.remove('hidden');
        }

        saveTripToHistory(startVal, endVal, routeData.distance.toFixed(1), formatDuration(routeData.durationMinutes));

        await Promise.allSettled([
            fetchDestinationWeather(endGeo.lat, endGeo.lon),
            fetchNearbyPlaces(endGeo.lat, endGeo.lon)
        ]);

        loading.textContent = 'Trip details calculated successfully!';
    } catch (err) {
        alert(err.message || 'Error processing trip details. Please verify location names.');
        loading.textContent = 'Error calculating route.';
    }
}

async function geocode(placeName) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(placeName)}`);
    if (!res.ok) throw new Error(`Geocoding error for ${placeName}`);
    const data = await res.json();
    if (!data || data.length === 0) throw new Error(`Location "${placeName}" not found.`);
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

async function getRouteData(startGeo, endGeo) {
    try {
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${startGeo.lon},${startGeo.lat};${endGeo.lon},${endGeo.lat}?overview=false`);
        if (res.ok) {
            const data = await res.json();
            if (data.routes && data.routes.length > 0) {
                const route = data.routes[0];
                return {
                    distance: route.distance / 1000,
                    durationMinutes: Math.round(route.duration / 60)
                };
            }
        }
    } catch (e) {}

    const dist = haversineDistance(startGeo.lat, startGeo.lon, endGeo.lat, endGeo.lon) * 1.3;
    return {
        distance: dist,
        durationMinutes: Math.round((dist / 50) * 60)
    };
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function formatDuration(mins) {
    if (mins < 60) return `${mins} mins`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h} hr ${m} mins`;
}

async function fetchDestinationWeather(lat, lon) {
    const weatherBox = document.getElementById('weatherInfo');
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        if (!res.ok) throw new Error('Weather unavailable');
        const data = await res.json();
        const curr = data.current_weather;
        const condition = getWeatherCondition(curr.weathercode);
        weatherBox.innerHTML = `
            <div class="weather-display">
                <div class="temp-badge">${curr.temperature}°C</div>
                <div class="weather-text">${condition}</div>
            </div>
        `;
    } catch (e) {
        weatherBox.innerHTML = `<div class="weather-placeholder">Weather data unavailable</div>`;
    }
}

function getWeatherCondition(code) {
    if (code === 0) return 'Clear Sky ';
    if (code <= 3) return 'Partly Cloudy ';
    if (code <= 48) return 'Foggy ';
    if (code <= 82) return 'Rainy ';
    return 'Stormy 🌩️';
}

async function fetchNearbyPlaces(lat, lon) {
    const query = `[out:json][timeout:10];(
        node(around:5000,${lat},${lon})["tourism"~"hotel|guest_house|motel"];
        node(around:5000,${lat},${lon})["amenity"~"restaurant|fast_food|cafe"];
        node(around:5000,${lat},${lon})["amenity"="fuel"];
        node(around:5000,${lat},${lon})["amenity"="charging_station"];
    );out center 25;`;

    const lists = {
        hotel: document.getElementById('hotelList'),
        restaurant: document.getElementById('restaurantList'),
        petrol: document.getElementById('petrolList'),
        ev: document.getElementById('evList')
    };
    const counts = {
        hotel: document.getElementById('hotelCount'),
        restaurant: document.getElementById('restaurantCount'),
        petrol: document.getElementById('petrolCount'),
        ev: document.getElementById('evCount')
    };

    try {
        const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error('Overpass error');
        const data = await res.json();
        const categorized = { hotel: [], restaurant: [], petrol: [], ev: [] };

        (data.elements || []).forEach(el => {
            const tags = el.tags || {};
            const name = tags.name || tags['name:en'] || 'Local Spot';
            const placeLat = el.lat || (el.center && el.center.lat);
            const placeLon = el.lon || (el.center && el.center.lon);
            const dist = placeLat ? haversineDistance(lat, lon, placeLat, placeLon).toFixed(1) : '1.2';

            if (tags.tourism) categorized.hotel.push({ name, dist });
            else if (tags.amenity === 'fuel') categorized.petrol.push({ name, dist });
            else if (tags.amenity === 'charging_station') categorized.ev.push({ name, dist });
            else if (tags.amenity) categorized.restaurant.push({ name, dist });
        });

        Object.keys(categorized).forEach(key => {
            const items = categorized[key].slice(0, 5);
            counts[key].textContent = items.length;
            if (items.length === 0) {
                lists[key].innerHTML = '<li>No spots found nearby</li>';
            } else {
                lists[key].innerHTML = items.map(item => `<li><span>${item.name}</span><small>~${item.dist} km</small></li>`).join('');
            }
        });
    } catch (e) {
        Object.keys(lists).forEach(k => {
            counts[k].textContent = '0';
            lists[k].innerHTML = '<li>Unable to load places</li>';
        });
    }
}

function saveTripToHistory(start, end, distance, duration) {
    let history = getHistoryFromStorage();
    const newTrip = {
        id: Date.now(),
        start,
        end,
        distance,
        duration,
        date: new Date().toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
    };
    history = [newTrip, ...history.filter(t => !(t.start === start && t.end === end))].slice(0, 5);
    localStorage.setItem('routewise_trips', JSON.stringify(history));
    loadTripHistory();
}

function getHistoryFromStorage() {
    try {
        return JSON.parse(localStorage.getItem('routewise_trips')) || [];
    } catch (e) {
        return [];
    }
}

function loadTripHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    const history = getHistoryFromStorage();
    if (history.length === 0) {
        list.innerHTML = '<li class="empty-msg">No recent trips logged</li>';
        return;
    }
    list.innerHTML = history.map(t => `
        <li class="history-item" onclick="loadSelectedTrip('${t.start}', '${t.end}')">
            <div class="trip-info">
                <strong>${t.start} → ${t.end}</strong>
                <small>${t.distance} km &bull; ${t.duration} &bull; ${t.date}</small>
            </div>
            <button class="del-btn" onclick="deleteHistoryItem(${t.id}, event)"><i class="fa-solid fa-trash"></i></button>
        </li>
    `).join('');
}

function loadSelectedTrip(start, end) {
    document.getElementById('start').value = start;
    document.getElementById('end').value = end;
    handlePlanTrip();
}

function deleteHistoryItem(id, event) {
    if (event) event.stopPropagation();
    let history = getHistoryFromStorage().filter(t => t.id !== id);
    localStorage.setItem('routewise_trips', JSON.stringify(history));
    loadTripHistory();
}

function handleClearHistory() {
    localStorage.removeItem('routewise_trips');
    loadTripHistory();
}

function handleReset() {
    document.getElementById('start').value = '';
    document.getElementById('end').value = '';
    document.getElementById('vehicle').selectedIndex = 0;
    document.getElementById('distance').textContent = '--';
    document.getElementById('duration').textContent = '--';
    document.getElementById('fuelCost').textContent = '--';
    document.getElementById('avgSpeed').textContent = '--';
    document.getElementById('loading').textContent = '';
    document.getElementById('gmapsContainer')?.classList.add('hidden');
    document.getElementById('weatherInfo').innerHTML = `<div class="weather-placeholder">Enter trip details to check live weather</div>`;
    ['hotel', 'restaurant', 'petrol', 'ev'].forEach(key => {
        document.getElementById(`${key}Count`).textContent = '0';
        document.getElementById(`${key}List`).innerHTML = '<li>--</li>';
    });
}
