import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Crosshair, Locate, Navigation2, Route as RouteIcon } from "lucide-react";
import {
  fetchRoutes,
  formatDistance,
  formatDuration,
  geocodeLocation,
  haversineMeters,
  loadLeaflet,
  offsetLatLngWest,
  pickReroute,
  type LatLng,
  type RouteResult,
} from "./maps";
import type { Result } from "./data";

type Incident = LatLng & { label: string; radius_m: number };

export function InteractiveMap({ run }: { run: Result }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [incident, setIncident] = useState<Incident | null>(null);
  const [user, setUser] = useState<LatLng | null>(null);
  const [routes, setRoutes] = useState<{ primary: RouteResult; alternate: RouteResult | null } | null>(null);
  const [recommended, setRecommended] = useState<"primary" | "alternate" | null>(null);
  const [loading, setLoading] = useState(true);
  const [permState, setPermState] = useState<"unknown" | "granted" | "denied">("unknown");

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

  // 2) Try the browser's geolocation (best-effort, single shot)
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

  // 3) Compute routes whenever incident or user changes
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

  // 4) Render with Leaflet
  useEffect(() => {
    let alive = true;
    (async () => {
      const L = await loadLeaflet();
      if (!alive || !containerRef.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          attributionControl: false,
          zoomControl: false,
          scrollWheelZoom: false,
          worldCopyJump: true,
        }).setView([24.86, 67.01], 12);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapRef.current);
        L.control.zoom({ position: "topright" }).addTo(mapRef.current);
      }
      // Reset overlay layer
      if (layerRef.current) layerRef.current.clearLayers();
      else layerRef.current = L.layerGroup().addTo(mapRef.current);
      const L_ = layerRef.current;

      if (incident) {
        // Affected zone
        L.circle([incident.lat, incident.lng], {
          radius: incident.radius_m,
          color: "#ef4444",
          weight: 1.5,
          fillColor: "#ef4444",
          fillOpacity: 0.10,
          dashArray: "4 4",
        }).addTo(L_);

        // Incident pin
        const icon = L.divIcon({
          html: `<div style="width:22px;height:22px;border-radius:50%;background:rgba(239,68,68,0.95);border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 4px rgba(239,68,68,0.20)">
                   <span style="display:block;width:6px;height:6px;background:#fff;border-radius:50%"></span>
                 </div>`,
          className: "",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        L.marker([incident.lat, incident.lng], { icon }).addTo(L_);
      }

      if (user) {
        const ui = L.divIcon({
          html: `<div style="width:14px;height:14px;border-radius:50%;background:#67e8f9;border:3px solid #0a0b0d"></div>`,
          className: "",
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        L.marker([user.lat, user.lng], { icon: ui }).addTo(L_);
      }

      if (routes?.primary) {
        L.polyline(
          routes.primary.coords.map((c) => [c.lat, c.lng]),
          { color: "#ef4444", weight: 4, opacity: 0.85, dashArray: "10 6" }
        ).addTo(L_);
      }
      if (routes?.alternate) {
        L.polyline(
          routes.alternate.coords.map((c) => [c.lat, c.lng]),
          { color: "#34d399", weight: 4, opacity: 0.92 }
        ).addTo(L_);
      }

      // Fit bounds
      const points: [number, number][] = [];
      if (incident) points.push([incident.lat, incident.lng]);
      if (user) points.push([user.lat, user.lng]);
      if (routes?.primary) routes.primary.coords.forEach((c) => points.push([c.lat, c.lng]));
      if (routes?.alternate) routes.alternate.coords.forEach((c) => points.push([c.lat, c.lng]));
      if (points.length) {
        try {
          mapRef.current.fitBounds(points as any, { padding: [30, 30], maxZoom: 14 });
        } catch {}
      }
    })();
    return () => {
      alive = false;
    };
  }, [incident?.lat, incident?.lng, user?.lat, user?.lng, routes?.primary?.coords?.length, routes?.alternate?.coords?.length]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {}
        mapRef.current = null;
        layerRef.current = null;
      }
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
        className="relative rounded-md border border-line bg-surface-2"
        style={{ height: 320 }}
      />

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-text-secondary font-mono">
        <Legend color="#ef4444" label="Affected route" dashed />
        <Legend color="#34d399" label="Reroute" />
        {user && <Legend color="#67e8f9" label="You" filled />}
        <div className="ml-auto flex items-center gap-1.5 text-text-tertiary">
          <Crosshair className="h-3 w-3" />
          {incident
            ? `${incident.lat.toFixed(3)}°N · ${incident.lng.toFixed(3)}°E`
            : "—"}
        </div>
      </div>

      {/* Reroute panel */}
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

void AlertTriangle;
