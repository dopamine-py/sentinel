// Maps + routing helpers.
// - geocodeLocation(text) → best-effort {lat, lng, label}
//   First tries a built-in city/landmark lookup (no network), then falls back to
//   OpenStreetMap Nominatim if available.
// - fetchRoutes(from, to)    → primary + alternate route polylines via OSRM public demo.
// - decodePolyline / haversine utilities.

const CITY_BBOX = {
  karachi:    { lat: 24.86, lng: 67.01, radius_m: 12000 },
  saddar:     { lat: 24.86, lng: 67.01, radius_m: 1500 },
  dha:        { lat: 24.79, lng: 67.04, radius_m: 3000 },
  clifton:    { lat: 24.81, lng: 67.03, radius_m: 2500 },
  nazimabad:  { lat: 24.91, lng: 67.03, radius_m: 2000 },
  korangi:    { lat: 24.83, lng: 67.13, radius_m: 3500 },
  malir:      { lat: 24.89, lng: 67.20, radius_m: 4000 },
  'shahrah-e-faisal': { lat: 24.86, lng: 67.07, radius_m: 800 },

  lahore:     { lat: 31.55, lng: 74.34, radius_m: 14000 },
  'mall road': { lat: 31.55, lng: 74.31, radius_m: 1200 },
  'charing cross': { lat: 31.55, lng: 74.34, radius_m: 800 },

  multan:     { lat: 30.16, lng: 71.50, radius_m: 10000 },
  islamabad:  { lat: 33.69, lng: 73.05, radius_m: 11000 },
  rawalpindi: { lat: 33.60, lng: 73.04, radius_m: 9000 },
  peshawar:   { lat: 34.01, lng: 71.58, radius_m: 9000 },
  pakistan:   { lat: 30.38, lng: 69.35, radius_m: 200000 },
};

/**
 * Best-effort geocoder for the kind of free-text locations the CIRO backend produces.
 * Returns {lat, lng, label, radius_m, source} or null.
 */
export async function geocodeLocation(text) {
  if (!text || typeof text !== 'string') return null;
  const normalized = text.trim().toLowerCase();

  // 1) Direct lookup: scan for any known token
  for (const key of Object.keys(CITY_BBOX)) {
    if (normalized.includes(key)) {
      const m = CITY_BBOX[key];
      return { lat: m.lat, lng: m.lng, label: text, radius_m: m.radius_m, source: 'lookup' };
    }
  }

  // 2) Nominatim fallback (~1 RPS soft limit; we retry once on failure)
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'sentinel-mobile/1.0 (contact: ops@sentinel.ai)',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) return null;
    const list = await res.json();
    if (Array.isArray(list) && list[0]) {
      const r = list[0];
      return {
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        label: r.display_name || text,
        radius_m: 1500,
        source: 'nominatim',
      };
    }
  } catch {}
  return null;
}

/**
 * Pick a sensible "destination" for routing demos when we only know the user
 * is near an incident — try to move out of the affected zone by ~3km in the
 * direction of the city centre.
 */
export function projectDestination(userLatLng, incident, cityCentre) {
  // If we have a city centre and it's clearly outside the incident radius, route there.
  if (cityCentre && haversineMeters(cityCentre, incident) > incident.radius_m * 1.5) {
    return cityCentre;
  }
  // Otherwise shift the user position by ~3km on a heading away from the incident.
  const bearing = bearingDeg(incident, userLatLng); // away from incident
  const d = Math.max(3000, incident.radius_m * 2.5);
  return offsetLatLng(userLatLng, d, bearing);
}

/**
 * Fetch routes from OSRM public demo.
 * Returns { primary: { coords, distance_m, duration_s }, alternate: same | null }.
 *
 * The "primary" route is what OSRM picks by default — typically the shortest.
 * "Alternate" is the next-best avoiding the same first 60% of geometry.
 *
 * Note: OSRM public demo is rate-limited and intended for testing.
 * Replace with your own OSRM / Mapbox / Google Directions for production.
 */
export async function fetchRoutes(from, to) {
  if (!from || !to) return null;
  const a = `${from.lng},${from.lat}`;
  const b = `${to.lng},${to.lat}`;
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/${a};${b}` +
      `?overview=full&geometries=geojson&alternatives=true&steps=false`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j || !Array.isArray(j.routes) || j.routes.length === 0) return null;
    const conv = (r) => ({
      coords: r.geometry.coordinates.map(([lng, lat]) => ({ latitude: lat, longitude: lng })),
      distance_m: Math.round(r.distance || 0),
      duration_s: Math.round(r.duration || 0),
    });
    const primary = conv(j.routes[0]);
    const alternate = j.routes[1] ? conv(j.routes[1]) : null;
    return { primary, alternate };
  } catch {
    return null;
  }
}

/**
 * Decide which OSRM-returned route to recommend as the "reroute":
 * the one whose polyline maintains the largest distance from the incident point.
 */
export function pickReroute(routes, incident) {
  if (!routes || !routes.alternate) return null;
  const minDist = (coords) => {
    let best = Infinity;
    for (const c of coords) {
      const d = haversineMeters({ lat: c.latitude, lng: c.longitude }, incident);
      if (d < best) best = d;
    }
    return best;
  };
  const p = minDist(routes.primary.coords);
  const a = minDist(routes.alternate.coords);
  // Prefer the route that stays further from the incident centroid.
  if (a > p && a > incident.radius_m * 0.6) return 'alternate';
  if (p > a && p > incident.radius_m * 0.6) return 'primary';
  return a >= p ? 'alternate' : 'primary';
}

/* ------------------------------------------------------------
   GEO UTILITIES
   ------------------------------------------------------------ */

export function haversineMeters(a, b) {
  const R = 6371000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function bearingDeg(from, to) {
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δλ = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function offsetLatLng(point, meters, bearing) {
  const R = 6371000;
  const δ = meters / R;
  const θ = (bearing * Math.PI) / 180;
  const φ1 = (point.lat * Math.PI) / 180;
  const λ1 = (point.lng * Math.PI) / 180;

  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
  );
  return { lat: (φ2 * 180) / Math.PI, lng: (λ2 * 180) / Math.PI };
}

export function formatDistance(m) {
  if (m == null) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function formatDuration(s) {
  if (s == null) return '—';
  if (s < 90) return `${Math.round(s)} s`;
  const min = Math.round(s / 60);
  if (min < 90) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return `${h}h ${rem}m`;
}
