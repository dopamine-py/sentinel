// Maps + OSRM routing helpers for the web dashboard. Mirrors the mobile lib.

export type LatLng = { lat: number; lng: number };

const CITY_BBOX: Record<string, { lat: number; lng: number; radius_m: number }> = {
  karachi:            { lat: 24.86, lng: 67.01, radius_m: 12000 },
  saddar:             { lat: 24.86, lng: 67.01, radius_m: 1500 },
  dha:                { lat: 24.79, lng: 67.04, radius_m: 3000 },
  clifton:            { lat: 24.81, lng: 67.03, radius_m: 2500 },
  nazimabad:          { lat: 24.91, lng: 67.03, radius_m: 2000 },
  korangi:            { lat: 24.83, lng: 67.13, radius_m: 3500 },
  malir:              { lat: 24.89, lng: 67.20, radius_m: 4000 },
  "shahrah-e-faisal": { lat: 24.86, lng: 67.07, radius_m: 800 },
  lahore:             { lat: 31.55, lng: 74.34, radius_m: 14000 },
  "mall road":        { lat: 31.55, lng: 74.31, radius_m: 1200 },
  "charing cross":    { lat: 31.55, lng: 74.34, radius_m: 800 },
  multan:             { lat: 30.16, lng: 71.50, radius_m: 10000 },
  islamabad:          { lat: 33.69, lng: 73.05, radius_m: 11000 },
  rawalpindi:         { lat: 33.60, lng: 73.04, radius_m: 9000 },
  peshawar:           { lat: 34.01, lng: 71.58, radius_m: 9000 },
  pakistan:           { lat: 30.38, lng: 69.35, radius_m: 200000 },
};

export type Geocoded = LatLng & { label: string; radius_m: number; source: "lookup" | "nominatim" };

export async function geocodeLocation(text: string): Promise<Geocoded | null> {
  if (!text) return null;
  const norm = text.trim().toLowerCase();
  for (const key of Object.keys(CITY_BBOX)) {
    if (norm.includes(key)) {
      const m = CITY_BBOX[key];
      return { lat: m.lat, lng: m.lng, label: text, radius_m: m.radius_m, source: "lookup" };
    }
  }
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(text)}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const list = await res.json();
    if (Array.isArray(list) && list[0]) {
      const r = list[0];
      return {
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        label: r.display_name || text,
        radius_m: 1500,
        source: "nominatim",
      };
    }
  } catch {}
  return null;
}

export type RouteResult = {
  coords: LatLng[];
  distance_m: number;
  duration_s: number;
};

export async function fetchRoutes(
  from: LatLng,
  to: LatLng
): Promise<{ primary: RouteResult; alternate: RouteResult | null } | null> {
  if (!from || !to) return null;
  const a = `${from.lng},${from.lat}`;
  const b = `${to.lng},${to.lat}`;
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${a};${b}` +
        `?overview=full&geometries=geojson&alternatives=true&steps=false`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const j = await res.json();
    if (!j?.routes?.length) return null;
    const conv = (r: { geometry: { coordinates: [number, number][] }; distance?: number; duration?: number }): RouteResult => ({
      coords: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      distance_m: Math.round(r.distance || 0),
      duration_s: Math.round(r.duration || 0),
    });
    return {
      primary: conv(j.routes[0]),
      alternate: j.routes[1] ? conv(j.routes[1]) : null,
    };
  } catch {
    return null;
  }
}

export function pickReroute(
  routes: { primary: RouteResult; alternate: RouteResult | null } | null,
  incident: LatLng & { radius_m: number }
): "primary" | "alternate" | null {
  if (!routes?.alternate) return null;
  const minDist = (coords: LatLng[]) => {
    let best = Infinity;
    for (const c of coords) {
      const d = haversineMeters(c, incident);
      if (d < best) best = d;
    }
    return best;
  };
  const p = minDist(routes.primary.coords);
  const a = minDist(routes.alternate.coords);
  if (a > p && a > incident.radius_m * 0.6) return "alternate";
  if (p > a && p > incident.radius_m * 0.6) return "primary";
  return a >= p ? "alternate" : "primary";
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const dφ = ((b.lat - a.lat) * Math.PI) / 180;
  const dλ = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function offsetLatLngWest(point: LatLng, meters: number): LatLng {
  const R = 6371000;
  const dlng = (meters / (R * Math.cos((point.lat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat: point.lat, lng: point.lng - dlng };
}

export function formatDistance(m?: number): string {
  if (m == null) return "—";
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function formatDuration(s?: number): string {
  if (s == null) return "—";
  if (s < 90) return `${Math.round(s)} s`;
  const min = Math.round(s / 60);
  if (min < 90) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}

/* ============================================================
   LEAFLET LOADER — loads Leaflet from CDN once, cached for the session.
   No npm dependency added.
   ============================================================ */

let leafletPromise: Promise<typeof window & { L: any }> | null = null;

export function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletPromise) return leafletPromise.then((w) => w.L);

  leafletPromise = new Promise((resolve, reject) => {
    // CSS
    if (!document.querySelector("link[data-leaflet]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.dataset.leaflet = "true";
      link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
      link.crossOrigin = "";
      document.head.appendChild(link);
    }
    // JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => resolve(window as typeof window & { L: any });
    script.onerror = () => reject(new Error("Failed to load Leaflet"));
    document.head.appendChild(script);
  });

  return leafletPromise.then((w) => w.L);
}

/* ============================================================
   Google Maps JS API loader — opt-in via VITE_GOOGLE_MAPS_API_KEY.
   The key MUST be HTTP-referrer-restricted in Google Cloud Console;
   any JS API key shipped to the browser is by design publicly visible.
   ============================================================ */
let googlePromise: Promise<any> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const w = window as any;
  if (w.google?.maps) return Promise.resolve(w.google.maps);
  if (googlePromise) return googlePromise;
  if (!apiKey) return Promise.reject(new Error("missing VITE_GOOGLE_MAPS_API_KEY"));

  googlePromise = new Promise((resolve, reject) => {
    const cbName = `__sentinelGmapsCb_${Math.random().toString(36).slice(2)}`;
    (window as any)[cbName] = () => {
      delete (window as any)[cbName];
      resolve((window as any).google.maps);
    };
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      libraries: "geometry",
      callback: cbName,
      loading: "async",
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Failed to load Google Maps JS API"));
    document.head.appendChild(script);
  });
  return googlePromise;
}
