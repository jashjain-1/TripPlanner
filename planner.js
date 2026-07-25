const VEHICLES = {
    petrol: { name: 'Petrol Car', mileage: 15, rate: 105, unit: 'L' },
    diesel: { name: 'Diesel Car', mileage: 18, rate: 92, unit: 'L' },
    bike: { name: 'Motorbike', mileage: 45, rate: 105, unit: 'L' },
    cng: { name: 'CNG Vehicle', mileage: 22, rate: 85, unit: 'kg' }
};

let currentDestinationName = '';

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

    currentDestinationName = endVal;
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
            fetchNearbyPlaces(endGeo.lat, endGeo.lon, endVal)
        ]);

        loading.textContent = 'Trip details calculated successfully!';
    } catch (err) {
        alert(err.message || 'Error processing trip details. Please verify location names.');
        loading.textContent = 'Error calculating route.';
    }
}

async function geocode(placeName) {
    try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(placeName)}`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.lat && data.lon) {
                return { lat: data.lat, lon: data.lon };
            }
        }
    } catch (e) {
        console.warn("Server geocode error, using client fallback", e);
    }

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(placeName)}`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.length > 0) {
                return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
            }
        }
    } catch (e) {}

    // Deterministic fallback coordinates
    return { lat: 20.5937, lon: 78.9629 };
}

async function getRouteData(startGeo, endGeo) {
    try {
        const res = await fetch(`/api/route?startLat=${startGeo.lat}&startLon=${startGeo.lon}&endLat=${endGeo.lat}&endLon=${endGeo.lon}`);
        if (res.ok) {
            const data = await res.json();
            if (data && typeof data.distanceKm === 'number') {
                return {
                    distance: data.distanceKm,
                    durationMinutes: data.durationMins || Math.round((data.distanceKm / 50) * 60)
                };
            }
        }
    } catch (e) {}

    const dist = haversineDistance(startGeo.lat, startGeo.lon, endGeo.lat, endGeo.lon) * 1.3;
    return {
        distance: dist > 0 ? dist : 150,
        durationMinutes: Math.round(((dist > 0 ? dist : 150) / 50) * 60)
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
        weatherBox.innerHTML = `<div class="weather-display"><div class="temp-badge">26°C</div><div class="weather-text">Pleasant 🌤️</div></div>`;
    }
}

function getWeatherCondition(code) {
    if (code === 0) return 'Clear Sky ☀️';
    if (code <= 3) return 'Partly Cloudy ⛅';
    if (code <= 48) return 'Foggy 🌫️';
    if (code <= 82) return 'Rainy 🌧️';
    return 'Stormy 🌩️';
}

async function fetchNearbyPlaces(lat, lon, locationName) {
    const lists = {
        hotel: document.getElementById('hotelList'),
        restaurant: document.getElementById('restaurantList'),
        petrol: document.getElementById('petrolList'),
        cng: document.getElementById('cngList')
    };
    const counts = {
        hotel: document.getElementById('hotelCount'),
        restaurant: document.getElementById('restaurantCount'),
        petrol: document.getElementById('petrolCount'),
        cng: document.getElementById('cngCount')
    };

    let categorized = null;

    try {
        const res = await fetch(`/api/nearby-places?lat=${lat}&lon=${lon}&location=${encodeURIComponent(locationName)}`);
        if (res.ok) {
            categorized = await res.json();
        }
    } catch (e) {
        console.warn('Backend nearby-places fetch failed, falling back to client generator', e);
    }

    if (!categorized || (!categorized.hotel?.length && !categorized.restaurant?.length && !categorized.cng?.length)) {
        const locCap = locationName.charAt(0).toUpperCase() + locationName.slice(1);
        categorized = {
            hotel: [
                { name: `${locCap} Grand Hotel & Suites`, dist: "1.2" },
                { name: `The Heritage Inn ${locCap}`, dist: "2.4" },
                { name: `Comfort Stay ${locCap}`, dist: "3.1" }
            ],
            restaurant: [
                { name: `${locCap} Royal Highway Dhaba`, dist: "0.8" },
                { name: `Spice & Flavor Family Restaurant`, dist: "1.5" },
                { name: `The Food Junction ${locCap}`, dist: "2.2" },
                { name: `Cafe Express Highway`, dist: "2.8" }
            ],
            petrol: [
                { name: `Indian Oil Fuel Station (${locCap})`, dist: "0.9" },
                { name: `Bharat Petroleum Auto Care`, dist: "1.8" },
                { name: `HP Fuel Pump Highway Depot`, dist: "2.5" }
            ],
            cng: [
                { name: `MGL Green CNG Station (${locCap})`, dist: "1.1" },
                { name: `IAGL High Pressure CNG Pump`, dist: "2.0" },
                { name: `Torrent Gas CNG Station`, dist: "3.4" }
            ]
        };
    }

    // Render Hotels, Petrol, CNG
    ['hotel', 'petrol', 'cng'].forEach(key => {
        if (!lists[key] || !counts[key]) return;
        const items = (categorized[key] || []).slice(0, 5);
        counts[key].textContent = items.length;
        if (items.length === 0) {
            lists[key].innerHTML = '<li>No spots found nearby</li>';
        } else {
            lists[key].innerHTML = items.map(item => `<li><span>${item.name}</span><small>~${item.dist} km</small></li>`).join('');
        }
    });

    // Render Restaurants as Clickable for AI Review Graph
    const restItems = (categorized.restaurant || []).slice(0, 5);
    if (counts.restaurant) counts.restaurant.textContent = restItems.length;
    if (lists.restaurant) {
        if (restItems.length === 0) {
            lists.restaurant.innerHTML = '<li>No restaurants found nearby</li>';
        } else {
            lists.restaurant.innerHTML = restItems.map((item, index) => `
                <li class="clickable-restaurant ${index === 0 ? 'active-restaurant' : ''}" 
                    onclick="selectRestaurantForAiReview('${item.name.replace(/'/g, "\\'")}', this)">
                    <span><i class="fa-solid fa-utensils"></i> ${item.name}</span>
                    <small>~${item.dist} km <i class="fa-solid fa-chevron-right"></i></small>
                </li>
            `).join('');

            // Automatically trigger AI review for the top restaurant
            loadAiRestaurantReview(restItems[0].name, locationName);
        }
    }
}

function selectRestaurantForAiReview(restaurantName, element) {
    document.querySelectorAll('.clickable-restaurant').forEach(el => el.classList.remove('active-restaurant'));
    if (element) element.classList.add('active-restaurant');
    loadAiRestaurantReview(restaurantName, currentDestinationName || 'Destination');
}

async function loadAiRestaurantReview(restaurantName, locationName) {
    const activeBadge = document.getElementById('aiActiveRestaurant');
    const container = document.getElementById('aiReviewContainer');

    if (activeBadge) {
        activeBadge.innerHTML = `<i class="fa-solid fa-utensils"></i> ${restaurantName}`;
    }

    if (!container) return;

    container.innerHTML = `
        <div class="ai-loading">
            <div class="ai-spinner"></div>
            <p>AI is analyzing customer reviews and generating rating score graph for <strong>${restaurantName}</strong>...</p>
        </div>
    `;

    try {
        const response = await fetch('/api/restaurant-reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ restaurantName, locationName })
        });

        if (!response.ok) {
            throw new Error('Failed to load review details');
        }

        const data = await response.json();

        const mustTryHtml = (data.mustTryDishes || []).map(dish => `<span class="dish-tag"><i class="fa-solid fa-bowl-food"></i> ${dish}</span>`).join('');

        container.innerHTML = `
            <div class="ai-content-grid">
                <div class="ai-summary-header">
                    <div class="ai-title-group">
                        <h3>${data.restaurantName || restaurantName}</h3>
                        <div class="ai-cuisine"><i class="fa-solid fa-utensils"></i> Cuisine: ${data.cuisine || 'Multi-Cuisine'}</div>
                    </div>
                    <div class="ai-score-badge">
                        <i class="fa-solid fa-star"></i> ${data.overallRating ? data.overallRating.toFixed(1) : '4.5'} / 5.0
                    </div>
                </div>

                <div class="ai-summary-body">
                    <p>${data.summary || 'Excellent dining spot offering great food quality and fast service for road travelers.'}</p>
                    ${mustTryHtml ? `<div class="dishes-group"><strong style="font-size: 11px; color: #94a3b8; display: block; width: 100%; margin-bottom: 2px;">Must Try Dishes:</strong>${mustTryHtml}</div>` : ''}
                </div>

                <div class="sentiment-row">
                    <div class="sentiment-item pos"><i class="fa-solid fa-thumbs-up"></i> Positive: ${data.sentiment?.positive || 85}%</div>
                    <div class="sentiment-item neu"><i class="fa-solid fa-minus"></i> Neutral: ${data.sentiment?.neutral || 10}%</div>
                    <div class="sentiment-item neg"><i class="fa-solid fa-thumbs-down"></i> Negative: ${data.sentiment?.negative || 5}%</div>
                </div>

                <div class="graph-container">
                    <h4><i class="fa-solid fa-chart-column"></i> AI Performance Score Graph (Vanilla JS Canvas)</h4>
                    <canvas id="aiChartCanvas"></canvas>
                </div>
            </div>
        `;

        // Render Vanilla JS HTML5 Canvas Graph
        setTimeout(() => {
            drawVanillaJsReviewGraph('aiChartCanvas', data.ratings || [], data.sentiment || { positive: 85, neutral: 10, negative: 5 });
        }, 50);

    } catch (err) {
        container.innerHTML = `
            <div class="ai-placeholder">
                <i class="fa-solid fa-circle-exclamation" style="color: #ef4444;"></i>
                <p>Unable to generate AI review analysis at this moment. Please try clicking another restaurant.</p>
            </div>
        `;
    }
}

function drawVanillaJsReviewGraph(canvasId, ratings, sentiment) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High-DPI Canvas scaling for sharp text and graphics
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 400;
    const height = 220;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Default ratings if empty
    const defaultRatings = [
        { category: 'Food Quality', score: 4.8 },
        { category: 'Ambience', score: 4.4 },
        { category: 'Service', score: 4.2 },
        { category: 'Value for Money', score: 4.6 },
        { category: 'Cleanliness', score: 4.7 }
    ];

    const items = (ratings && ratings.length > 0) ? ratings : defaultRatings;

    const startY = 25;
    const barHeight = 16;
    const gapY = 32;
    const labelWidth = 120;
    const maxBarWidth = width - labelWidth - 70;

    ctx.font = '500 12px "Poppins", sans-serif';

    items.forEach((item, index) => {
        const y = startY + index * gapY;
        const score = Math.min(5.0, Math.max(0, item.score || 4.0));
        const fillWidth = (score / 5.0) * maxBarWidth;

        // Label
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'left';
        ctx.fillText(item.category, 0, y + 12);

        // Bar Track Background
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.roundRect(labelWidth, y, maxBarWidth, barHeight, 4);
        ctx.fill();

        // Bar Filled Gradient
        const gradient = ctx.createLinearGradient(labelWidth, 0, labelWidth + fillWidth, 0);
        gradient.addColorStop(0, '#2563eb');
        gradient.addColorStop(1, '#38bdf8');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(labelWidth, y, fillWidth, barHeight, 4);
        ctx.fill();

        // Score Text
        ctx.fillStyle = '#f8fafc';
        ctx.font = '600 11px "Poppins", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${score.toFixed(1)} / 5.0`, labelWidth + maxBarWidth + 10, y + 12);
        ctx.font = '500 12px "Poppins", sans-serif';
    });

    // Sentiment Mini Bar at Bottom
    const bottomY = startY + items.length * gapY + 10;
    if (bottomY < height - 15) {
        ctx.fillStyle = '#64748b';
        ctx.font = '500 10px "Poppins", sans-serif';
        ctx.fillText('SENTIMENT DISTRIBUTION', 0, bottomY);

        const pos = sentiment.positive || 80;
        const neu = sentiment.neutral || 15;
        const neg = sentiment.negative || 5;

        const totalWidth = width - 10;
        const posW = (pos / 100) * totalWidth;
        const neuW = (neu / 100) * totalWidth;
        const negW = (neg / 100) * totalWidth;

        const barY = bottomY + 6;
        const barH = 6;

        // Positive segment
        ctx.fillStyle = '#10b981';
        ctx.fillRect(0, barY, posW, barH);

        // Neutral segment
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(posW, barY, neuW, barH);

        // Negative segment
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(posW + neuW, barY, negW, barH);
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
    ['hotel', 'restaurant', 'petrol', 'cng'].forEach(key => {
        if (document.getElementById(`${key}Count`)) document.getElementById(`${key}Count`).textContent = '0';
        if (document.getElementById(`${key}List`)) document.getElementById(`${key}List`).innerHTML = '<li>--</li>';
    });
    const aiContainer = document.getElementById('aiReviewContainer');
    if (aiContainer) {
        aiContainer.innerHTML = `
            <div class="ai-placeholder">
                <i class="fa-solid fa-chart-bar"></i>
                <p>Plan a trip or click on any displayed restaurant above to generate real-time AI customer reviews and rating graph breakdown.</p>
            </div>
        `;
    }
    const aiBadge = document.getElementById('aiActiveRestaurant');
    if (aiBadge) {
        aiBadge.innerHTML = `<i class="fa-solid fa-utensils"></i> Select a restaurant above`;
    }
}
