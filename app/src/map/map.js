import L from 'leaflet';
import 'leaflet.heat';
import { getAccidents } from '../data/accidents.js';

// Fix Leaflet default icon paths for bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const SEVERITY_COLORS = {
    Fatal: '#ef4444',
    Major: '#f59e0b',
    Minor: '#10b981',
};

const CAUSE_COLORS = {
    Overspeeding: '#ef4444',
    'Drunk Driving': '#f59e0b',
    'Distracted Driving': '#8b5cf6',
    'Brake Failure': '#ec4899',
    'Wrong Turn': '#06b6d4',
    'Poor Visibility': '#64748b',
    'Road Damage': '#a855f7',
    'Lane Change': '#3b82f6',
    'Animal Crossing': '#10b981',
    'Pedestrian Crossing': '#f97316',
};

const VEHICLE_COLORS = {
    Car: '#3b82f6',
    Truck: '#ef4444',
    Bus: '#f59e0b',
    Auto: '#10b981',
    'Two Wheeler': '#8b5cf6',
    Van: '#06b6d4',
    Bicycle: '#ec4899',
};

let map = null;
let markersLayer = null;
let heatLayer = null;
let densityLayer = null;
let thematicLayer = null;
let currentLegend = null;

const TN_CENTER = [10.85, 78.65];
const TN_ZOOM = 7;

export function initMap() {
    map = L.map('map', {
        center: TN_CENTER,
        zoom: TN_ZOOM,
        zoomControl: true,
        attributionControl: true,
    });

    // Dark-themed tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
        subdomains: 'abcd',
        maxZoom: 19,
    }).addTo(map);

    return map;
}

function createCircleMarker(accident, colorField = 'severity') {
    let color;
    if (colorField === 'severity') {
        color = SEVERITY_COLORS[accident.severity] || '#94a3b8';
    } else if (colorField === 'cause') {
        color = CAUSE_COLORS[accident.cause] || '#94a3b8';
    } else if (colorField === 'vehicles') {
        color = VEHICLE_COLORS[accident.vehicles] || '#94a3b8';
    } else {
        color = SEVERITY_COLORS[accident.severity] || '#94a3b8';
    }

    const severityClass = accident.severity.toLowerCase();
    const marker = L.circleMarker([accident.lat, accident.lon], {
        radius: accident.severity === 'Fatal' ? 8 : accident.severity === 'Major' ? 6 : 5,
        fillColor: color,
        color: color,
        weight: 1,
        opacity: 0.9,
        fillOpacity: 0.7,
    });

    marker.bindPopup(`
    <div class="popup-content">
      <h3>${accident.severity === 'Fatal' ? '💀' : accident.severity === 'Major' ? '⚠️' : 'ℹ️'} ${accident.acc_id}</h3>
      <div class="popup-row"><span class="popup-label">District</span><span class="popup-value">${accident.district}</span></div>
      <div class="popup-row"><span class="popup-label">Severity</span><span class="popup-value ${severityClass}">${accident.severity}</span></div>
      <div class="popup-row"><span class="popup-label">Date</span><span class="popup-value">${accident.acc_date}</span></div>
      <div class="popup-row"><span class="popup-label">Time</span><span class="popup-value">${accident.acc_time}</span></div>
      <div class="popup-row"><span class="popup-label">Vehicle</span><span class="popup-value">${accident.vehicles}</span></div>
      <div class="popup-row"><span class="popup-label">Road</span><span class="popup-value">${accident.roadtype}</span></div>
      <div class="popup-row"><span class="popup-label">Weather</span><span class="popup-value">${accident.weather}</span></div>
      <div class="popup-row"><span class="popup-label">Light</span><span class="popup-value">${accident.lightcond}</span></div>
      <div class="popup-row"><span class="popup-label">Cause</span><span class="popup-value">${accident.cause}</span></div>
      <div class="popup-row"><span class="popup-label">Fatalities</span><span class="popup-value ${accident.fatals > 0 ? 'fatal' : ''}">${accident.fatals}</span></div>
      <div class="popup-row"><span class="popup-label">Injuries</span><span class="popup-value">${accident.injuries}</span></div>
    </div>
  `, { maxWidth: 280 });

    return marker;
}

export function showAllMarkers(data = null, colorField = 'severity') {
    clearOverlays();
    const accidents = data || getAccidents();

    markersLayer = L.layerGroup();
    accidents.forEach((a) => {
        const marker = createCircleMarker(a, colorField);
        markersLayer.addLayer(marker);
    });

    markersLayer.addTo(map);
    updateStats(`${accidents.length} accidents displayed`);
    return accidents.length;
}

export function generateHeatmap(data = null) {
    clearOverlays();
    const accidents = data || getAccidents();

    const heatData = accidents.map((a) => {
        const intensity = a.severity === 'Fatal' ? 1.0 : a.severity === 'Major' ? 0.6 : 0.3;
        return [a.lat, a.lon, intensity];
    });

    heatLayer = L.heatLayer(heatData, {
        radius: 25,
        blur: 20,
        maxZoom: 12,
        max: 1.0,
        gradient: {
            0.0: '#0d1b2a',
            0.2: '#1b263b',
            0.4: '#2563eb',
            0.6: '#f59e0b',
            0.8: '#f97316',
            1.0: '#ef4444',
        },
    }).addTo(map);

    updateStats(`Heatmap: ${accidents.length} accidents`);
    updateLegend('heatmap');
}

export function generateDensityMap(field = 'district') {
    clearOverlays();
    const accidents = getAccidents();

    // Aggregate by field
    const counts = {};
    const positions = {};
    accidents.forEach((a) => {
        const key = a[field] || 'Unknown';
        counts[key] = (counts[key] || 0) + 1;
        if (!positions[key]) {
            positions[key] = { lats: [], lons: [] };
        }
        positions[key].lats.push(a.lat);
        positions[key].lons.push(a.lon);
    });

    const maxCount = Math.max(...Object.values(counts));
    densityLayer = L.layerGroup();

    Object.entries(counts).forEach(([key, count]) => {
        const centerLat = positions[key].lats.reduce((a, b) => a + b, 0) / positions[key].lats.length;
        const centerLon = positions[key].lons.reduce((a, b) => a + b, 0) / positions[key].lons.length;

        const ratio = count / maxCount;
        const radius = 12 + ratio * 30;
        const color = ratio > 0.75 ? '#ef4444' : ratio > 0.5 ? '#f59e0b' : ratio > 0.25 ? '#3b82f6' : '#10b981';

        const circle = L.circleMarker([centerLat, centerLon], {
            radius,
            fillColor: color,
            color: color,
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.35,
        });

        circle.bindPopup(`
      <div class="popup-content">
        <h3>📊 ${key}</h3>
        <div class="popup-row"><span class="popup-label">Accidents</span><span class="popup-value">${count}</span></div>
        <div class="popup-row"><span class="popup-label">Percentage</span><span class="popup-value">${((count / accidents.length) * 100).toFixed(1)}%</span></div>
      </div>
    `, { maxWidth: 250 });

        // Also add a label
        const label = L.divIcon({
            className: 'density-label',
            html: `<div style="
        color: white;
        font-size: 11px;
        font-weight: 600;
        font-family: Inter, sans-serif;
        text-shadow: 0 1px 3px rgba(0,0,0,0.8);
        text-align: center;
        white-space: nowrap;
      ">${key}<br/><span style="font-size:13px">${count}</span></div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
        });

        densityLayer.addLayer(circle);
        densityLayer.addLayer(L.marker([centerLat, centerLon], { icon: label, interactive: false }));
    });

    densityLayer.addTo(map);
    updateStats(`Density by ${field}: ${Object.keys(counts).length} groups`);
    updateLegend('density');
}

export function generateThematicMap(field = 'severity') {
    clearOverlays();
    const accidents = getAccidents();

    thematicLayer = L.layerGroup();
    accidents.forEach((a) => {
        const marker = createCircleMarker(a, field);
        thematicLayer.addLayer(marker);
    });

    thematicLayer.addTo(map);
    updateStats(`Thematic map by ${field}: ${accidents.length} accidents`);
    updateLegend('thematic', field);
}

export function filterMarkers(filters) {
    clearOverlays();
    const accidents = getAccidents();

    const filtered = accidents.filter((a) =>
        Object.entries(filters).every(([key, value]) => {
            if (!value) return true;
            return a[key]?.toString().toLowerCase() === value.toString().toLowerCase();
        })
    );

    markersLayer = L.layerGroup();
    filtered.forEach((a) => {
        const marker = createCircleMarker(a, 'severity');
        markersLayer.addLayer(marker);
    });

    markersLayer.addTo(map);

    if (filtered.length > 0) {
        fitToData(filtered);
    }

    updateStats(`${filtered.length} of ${accidents.length} accidents (filtered)`);
    return filtered.length;
}

export function clearOverlays() {
    if (markersLayer) { map.removeLayer(markersLayer); markersLayer = null; }
    if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; }
    if (densityLayer) { map.removeLayer(densityLayer); densityLayer = null; }
    if (thematicLayer) { map.removeLayer(thematicLayer); thematicLayer = null; }
    if (currentLegend) { map.removeControl(currentLegend); currentLegend = null; }
}

export function resetMap() {
    clearOverlays();
    showAllMarkers();
    map.setView(TN_CENTER, TN_ZOOM);
    restoreDefaultLegend();
}

export function fitToData(data = null) {
    const accidents = data || getAccidents();
    if (accidents.length === 0) return;

    const bounds = L.latLngBounds(accidents.map((a) => [a.lat, a.lon]));
    map.fitBounds(bounds, { padding: [30, 30] });
}

function updateStats(text) {
    const el = document.getElementById('stats-text');
    if (el) el.textContent = text;
}

function restoreDefaultLegend() {
    const legendEl = document.getElementById('map-legend');
    if (legendEl) {
        legendEl.innerHTML = `
      <div class="legend-title">Severity</div>
      <div class="legend-item"><span class="legend-dot fatal"></span> Fatal</div>
      <div class="legend-item"><span class="legend-dot major"></span> Major</div>
      <div class="legend-item"><span class="legend-dot minor"></span> Minor</div>
    `;
    }
}

function updateLegend(type, field = '') {
    const legendEl = document.getElementById('map-legend');
    if (!legendEl) return;

    if (type === 'heatmap') {
        legendEl.innerHTML = `
      <div class="legend-title">Heatmap Intensity</div>
      <div class="legend-item"><span class="legend-dot" style="background:#ef4444;box-shadow:0 0 6px #ef4444"></span> High</div>
      <div class="legend-item"><span class="legend-dot" style="background:#f59e0b;box-shadow:0 0 6px #f59e0b"></span> Medium</div>
      <div class="legend-item"><span class="legend-dot" style="background:#2563eb;box-shadow:0 0 6px #2563eb"></span> Low</div>
    `;
    } else if (type === 'density') {
        legendEl.innerHTML = `
      <div class="legend-title">Density</div>
      <div class="legend-item"><span class="legend-dot" style="background:#ef4444;box-shadow:0 0 6px #ef4444"></span> High (>75%)</div>
      <div class="legend-item"><span class="legend-dot" style="background:#f59e0b;box-shadow:0 0 6px #f59e0b"></span> Medium (50-75%)</div>
      <div class="legend-item"><span class="legend-dot" style="background:#3b82f6;box-shadow:0 0 6px #3b82f6"></span> Low (25-50%)</div>
      <div class="legend-item"><span class="legend-dot" style="background:#10b981;box-shadow:0 0 6px #10b981"></span> Minimal (<25%)</div>
    `;
    } else if (type === 'thematic') {
        const colorMap = field === 'cause' ? CAUSE_COLORS : field === 'vehicles' ? VEHICLE_COLORS : SEVERITY_COLORS;
        const items = Object.entries(colorMap)
            .map(([name, color]) => `<div class="legend-item"><span class="legend-dot" style="background:${color};box-shadow:0 0 6px ${color}"></span> ${name}</div>`)
            .join('');
        legendEl.innerHTML = `<div class="legend-title">By ${field}</div>${items}`;
    }
}

export function getMap() {
    return map;
}
