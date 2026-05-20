import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Locate, Navigation2, Route as RouteIcon } from "lucide-react";
import {
  fetchRoutes,
  formatDistance,
  formatDuration,
  geocodeLocation,
  haversineMeters,
  loadGoogleMaps,
  offsetLatLngWest,
  pickReroute,
  type LatLng,
  type RouteResult,
} from "./maps";
import type { Result } from "./data";

type Incident = LatLng & { label: string; radius_m: number };

// Dark map style tuned to the Sentinel graphite palette. Plain JSON styles
// work without a cloud-configured mapId — keeps setup to a single env var.
const SENTINEL_DARK_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#0e1014" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0a0b0d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9a9ea5" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#1a1d22" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a1d22" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#6b6f76" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#262a31" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#070809" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#6b6f76" }] },
];

export function InteractiveMapGoogle({
  run,
  apiKey,
}: {
  run: Result;
  apiKey: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [user, setUser] = useState<LatLng | null>(null);
  const [routes, setRoutes] = useState<{ primary: RouteResult; alternate: RouteResult | null } | null>(null);
  const [recommended, setRecommended] = useState<"primary" | "alternate" | null>(null);
  const [loading, setLoading] = useState(true);
  const [permState, setPermState] = useState<"unknown" | "granted" | "denied">("unknown");
  const [loadError, setLoadError] = useState<string | null>(null);

  // 1) Geocode the incident
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setIncident(null);
    (async () => {
      const c = run.detection.coordinates;
      let inc: Incident | null = null;
      if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng) && (c.lat !== 0 || c.lng !== 0)) {
        inc = { lat: c.lat, lng: c.lng, label: run.detection.location, radius_m: 1500 };
      } else {
        const g = await geocodeLocation(run.detection.location);
        if (g) inc = { lat: g.lat, lng: g.lng, label: g.label, radius_m: g.radius_m || 1500 };
      }
      if (!alive) return;
      setIncident(inc);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [run.id, run.detection.location, run.detection.coordinates.lat, run.detection.coordinates.lng]);

  // 2) Browser geolocation (best-effort)
  useEffect(() => {
    let alive = true;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPermState("denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!alive) return;
        setUser({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setPermState("granted");
      },
      () => {
        if (!alive) return;
        setPermState("denied");
      },
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 60000 }
    );
    return () => {
      alive = false;
    };
  }, []);

  // 3) Routes — same OSRM-backed routing as the Leaflet variant
  useEffect(() => {
    let alive = true;
    if (!incident) {
      setRoutes(null);
      return;
    }
    (async () => {
      const origin = user ?? offsetLatLngWest(incident, 4000);
      const dest: LatLng = { lat: incident.lat + 0.04, lng: incident.lng + 0.04 };
      const r = await fetchRoutes(origin, dest);
      if (!alive) return;
      setRoutes(r);
      setRecommended(r ? pickReroute(r, incident) : null);
    })();
    return () => {
      alive = false;
    };
  }, [incident?.lat, incident?.lng, user?.lat, user?.lng]);

  // 4) Render with Google Maps
  useEffect(() => {
    let alive = true;
    (async () => {
      let gmaps: any;
      try {
        gmaps = await loadGoogleMaps(apiKey);
      } catch (e: any) {
        if (alive) setLoadError(e?.message || "Google Maps failed to load");
        return;
      }
      if (!alive || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = new gmaps.Map(containerRef.current, {
          center: { lat: 24.86, lng: 67.01 },
          zoom: 12,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: gmaps.ControlPosition.TOP_RIGHT },
          clickableIcons: false,
          backgroundColor: "#0e1014",
          styles: SENTINEL_DARK_STYLE,
          gestureHandling: "cooperative",
        });
      }

      // Clear previous overlays
      overlaysRef.current.forEach((o) => o.setMap && o.setMap(null));
      overlaysRef.current = [];

      const map = mapRef.current;
      const bounds = new gmaps.LatLngBounds();

      if (incident) {
        // Affected zone — Google has no native dashed circle outline, so a
        // filled translucent circle gets the same read.
        const circle = new gmaps.Circle({
          map,
          center: { lat: incident.lat, lng: incident.lng },
          radius: incident.radius_m,
          strokeColor: "#ef4444",
          strokeOpacity: 0.85,
          strokeWeight: 1.5,
          fillColor: "#ef4444",
          fillOpacity: 0.1,
          clickable: false,
        });
        overlaysRef.current.push(circle);

        const pin = new gmaps.Marker({
          map,
          position: { lat: incident.lat, lng: incident.lng },
          icon: {
            path: gmaps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: "#ef4444",
            fillOpacity: 0.95,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
          zIndex: 5,
        });
        overlaysRef.current.push(pin);
        bounds.extend({ lat: incident.lat, lng: incident.lng });
      }

      if (user) {
        const userPin = new gmaps.Marker({
          map,
          position: { lat: user.lat, lng: user.lng },
          icon: {
            path: gmaps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: "#67e8f9",
            fillOpacity: 1,
            strokeColor: "#0a0b0d",
            strokeWeight: 3,
          },
          zIndex: 6,
        });
        overlaysRef.current.push(userPin);
        bounds.extend({ lat: user.lat, lng: user.lng });
      }

      if (routes?.primary) {
        // Dashed via icon symbols repeated along the path
        const dash = {
          icon: {
            path: "M 0,-1 0,1",
            strokeColor: "#ef4444",
            strokeOpacity: 0.9,
            scale: 3,
          },
          offset: "0",
          repeat: "12px",
        };
        const line = new gmaps.Polyline({
          map,
          path: routes.primary.coords.map((c) => ({ lat: c.lat, lng: c.lng })),
          strokeOpacity: 0,
          icons: [dash],
          zIndex: 3,
        });
        overlaysRef.current.push(line);
        routes.primary.coords.forEach((c) => bounds.extend({ lat: c.lat, lng: c.lng }));
      }
      if (routes?.alternate) {
        const line = new gmaps.Polyline({
          map,
          path: routes.alternate.coords.map((c) => ({ lat: c.lat, lng: c.lng })),
          strokeColor: "#34d399",
          strokeOpacity: 0.92,
          strokeWeight: 4,
          zIndex: 4,
        });
        overlaysRef.current.push(line);
        routes.alternate.coords.forEach((c) => bounds.extend({ lat: c.lat, lng: c.lng }));
      }

      if (!bounds.isEmpty()) {
        try {
          map.fitBounds(bounds, 40);
          // Cap zoom-in so a single point doesn't max-zoom past readability
          const listener = gmaps.event.addListenerOnce(map, "idle", () => {
            if (map.getZoom() && map.getZoom() > 14) map.setZoom(14);
          });
          overlaysRef.current.push({ setMap: () => gmaps.event.removeListener(listener) });
        } catch {}
      }
    })();
    return () => {
      alive = false;
    };
  }, [apiKey, incident?.lat, incident?.lng, user?.lat, user?.lng, routes?.primary?.coords?.length, routes?.alternate?.coords?.length]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      overlaysRef.current.forEach((o) => o.setMap && o.setMap(null));
      overlaysRef.current = [];
      mapRef.current = null;
    };
  }, []);

  const userInZone = useMemo(() => {
    if (!user || !incident) return false;
    return haversineMeters(user, incident) <= incident.radius_m;
  }, [user, incident]);

  const primary = routes?.primary;
  const alternate = routes?.alternate;
  const saved = primary && alternate ? primary.duration_s - alternate.duration_s : 0;

  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <RouteIcon className="h-4 w-4 text-accent-cyan" strokeWidth={1.75} />
          <h3 className="font-display text-[15px] font-semibold tracking-tight">Interactive map</h3>
          <span className="pill pill-ok">Google Maps</span>
          {userInZone && <span className="pill pill-critical">You are in the affected zone</span>}
        </div>
        <div className="flex items-center gap-2">
          {loading && <span className="label-eyebrow text-text-tertiary">Locating…</span>}
          {!loading && !incident && <span className="pill pill-medium">no geo</span>}
          {permState === "denied" && (
            <button
              onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(
                    (p) => setUser({ lat: p.coords.latitude, lng: p.coords.longitude }),
                    () => {}
                  );
                }
              }}
              className="btn-ghost text-[11.5px] py-1 px-2.5"
            >
              <Locate className="h-3 w-3" /> Use my location
            </button>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative rounded-md border border-line bg-surface-2 overflow-hidden"
        style={{ height: 320 }}
      />

      {loadError && (
        <p className="mt-2 font-mono text-[11px] text-status-warn">
          {loadError}. Check the key + referrer restrictions in Google Cloud Console.
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-text-secondary font-mono">
        <Legend color="#ef4444" label="Affected route" dashed />
        <Legend color="#34d399" label="Reroute" />
        {user && <Legend color="#67e8f9" label="You" filled />}
        <div className="ml-auto flex items-center gap-1.5 text-text-tertiary">
          <Crosshair className="h-3 w-3" />
          {incident ? `${incident.lat.toFixed(3)}°N · ${incident.lng.toFixed(3)}°E` : "—"}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-line">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium">Suggested reroute</span>
          {recommended === "alternate" && <span className="pill pill-ok">recommended</span>}
          {recommended === "primary" && <span className="pill pill-medium">no alternate found</span>}
        </div>

        {primary || alternate ? (
          <div className="mt-3 grid sm:grid-cols-2 gap-2">
            <RouteRow label="Affected" color="#ef4444" dashed dur={primary?.duration_s} dist={primary?.distance_m} />
            {alternate ? (
              <RouteRow
                label="Reroute"
                color="#34d399"
                dur={alternate.duration_s}
                dist={alternate.distance_m}
                highlight={recommended === "alternate"}
              />
            ) : (
              <div className="surface-input rounded-md p-3 text-[11.5px] text-text-tertiary">
                No alternate route. OSRM may be rate-limited.
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-text-tertiary">
            {loading
              ? "Computing routes…"
              : incident
              ? "Routing service unavailable from this network."
              : "No geographic coordinates for this incident."}
          </p>
        )}

        {primary && alternate && (
          <div className="mt-3 flex items-center gap-2">
            <Navigation2
              className={`h-3 w-3 ${saved > 0 ? "text-status-ok" : "text-status-warn"}`}
              strokeWidth={1.75}
            />
            <span
              className={`font-mono text-[11.5px] ${
                saved > 0 ? "text-status-ok" : "text-status-warn"
              }`}
            >
              {saved > 0
                ? `Reroute saves ${formatDuration(Math.abs(saved))}`
                : saved < 0
                ? `Reroute adds ${formatDuration(Math.abs(saved))} but stays out of the zone`
                : `Same ETA — reroute avoids the zone`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({
  color,
  label,
  dashed,
  filled,
}: {
  color: string;
  label: string;
  dashed?: boolean;
  filled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block"
        style={{
          width: 18,
          height: 4,
          borderRadius: 2,
          background: filled ? color : "transparent",
          border: `1.5px ${dashed ? "dashed" : "solid"} ${color}`,
        }}
      />
      <span>{label}</span>
    </span>
  );
}

function RouteRow({
  label,
  color,
  dashed,
  dur,
  dist,
  highlight,
}: {
  label: string;
  color: string;
  dashed?: boolean;
  dur?: number;
  dist?: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-md px-3 py-2.5 ${
        highlight ? "bg-emerald-500/5 border border-emerald-500/30" : "surface-input"
      }`}
    >
      <span
        className="shrink-0"
        style={{
          width: 22,
          height: 4,
          borderRadius: 2,
          background: dashed ? "transparent" : color,
          border: dashed ? `1.5px dashed ${color}` : "none",
        }}
      />
      <span className="text-[12.5px] font-medium flex-1">{label}</span>
      <span className="font-mono text-[11.5px] text-text-secondary">{formatDuration(dur)}</span>
      <span className="font-mono text-[11px] text-text-tertiary">{formatDistance(dist)}</span>
    </div>
  );
}
