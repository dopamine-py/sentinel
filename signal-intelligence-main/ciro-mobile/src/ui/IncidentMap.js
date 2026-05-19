// IncidentMap — interactive map for a single CIRO run, rendered with Leaflet
// inside a WebView. This works on every Android device without a Google Maps
// API key (which is what was crashing the APK on map open with react-native-maps).
//
// What's shown:
//   - Incident pin + red affected-area circle
//   - Your blue user pin (if location permission granted)
//   - Primary route through the affected zone (red dashed)
//   - Alternate "reroute" route around the zone (green)
//
// Tiles come from OpenStreetMap; routes from OSRM (router.project-osrm.org).

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { Navigation2, Route as RouteIcon } from 'lucide-react-native';
import DemoSurface from './DemoSurface';

import {
  geocodeLocation,
  fetchRoutes,
  pickReroute,
  haversineMeters,
  formatDistance,
  formatDuration,
} from '../lib/maps';
import { Eyebrow, Pill, GhostButton } from './primitives';
import { colors, radii, type, spacing } from './theme';

export default function IncidentMap({ run, style }) {
  const [incident, setIncident] = useState(null);
  const [user, setUser] = useState(null);
  const [routes, setRoutes] = useState(null);
  const [recommended, setRecommended] = useState(null);
  const [loading, setLoading] = useState(true);
  const [perm, setPerm] = useState('unknown');

  // 1) Geocode the incident
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setIncident(null);
    (async () => {
      const c = run?.detection?.coordinates || run?.coordinates;
      let inc = null;
      if (c && Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
        inc = {
          lat: c.lat,
          lng: c.lng,
          label: run.detection?.location || run.location || '—',
          radius_m: 1500,
        };
      } else {
        const text = run?.detection?.location || run?.location || run?.scenarioLabel || '';
        inc = await geocodeLocation(text);
      }
      if (!alive) return;
      if (inc) setIncident({ ...inc, radius_m: inc.radius_m || 1500 });
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [
    run?.id,
    run?.detection?.location,
    run?.detection?.coordinates?.lat,
    run?.detection?.coordinates?.lng,
  ]);

  // 2) Best-effort user location
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          const ask = await Location.requestForegroundPermissionsAsync();
          if (ask.status !== 'granted') {
            if (alive) setPerm('denied');
            return;
          }
        }
        if (!alive) return;
        setPerm('granted');
        const last = await Location.getLastKnownPositionAsync({});
        if (alive && last) setUser({ lat: last.coords.latitude, lng: last.coords.longitude });
        const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (alive && cur) setUser({ lat: cur.coords.latitude, lng: cur.coords.longitude });
      } catch {
        if (alive) setPerm('denied');
      }
    })();
    return () => { alive = false; };
  }, []);

  // 3) Routing
  useEffect(() => {
    let alive = true;
    if (!incident) { setRoutes(null); return; }
    (async () => {
      const origin = user ?? offsetLatLngWest(incident, 4000);
      const dest = { lat: incident.lat + 0.04, lng: incident.lng + 0.04 };
      const r = await fetchRoutes(origin, dest);
      if (!alive) return;
      setRoutes(r);
      if (r) setRecommended(pickReroute(r, incident));
    })();
    return () => { alive = false; };
  }, [incident?.lat, incident?.lng, user?.lat, user?.lng]);

  const userInZone = useMemo(() => {
    if (!user || !incident) return false;
    return haversineMeters(user, incident) <= incident.radius_m;
  }, [user, incident]);

  const html = useMemo(
    () => buildMapHtml({ incident, user, routes }),
    [
      incident?.lat,
      incident?.lng,
      incident?.radius_m,
      user?.lat,
      user?.lng,
      routes?.primary?.coords?.length,
      routes?.alternate?.coords?.length,
    ]
  );

  const primary = routes?.primary;
  const alternate = routes?.alternate;
  const saved = primary && alternate ? primary.duration_s - alternate.duration_s : 0;
  const savedAbs = Math.abs(saved);

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.headerRow}>
        <Eyebrow>Interactive map</Eyebrow>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {!incident && !loading && <Pill variant="muted">no geo</Pill>}
          {loading && <ActivityIndicator size="small" color={colors.accentCyan} />}
          {userInZone && <Pill variant="critical">in affected zone</Pill>}
        </View>
      </View>

      <View style={styles.mapShell}>
        {incident ? (
          <DemoSurface
            html={html}
            style={{ flex: 1, backgroundColor: colors.surface2 }}
          />
        ) : (
          <View style={styles.webLoading}>
            {loading ? (
              <ActivityIndicator color={colors.accentCyan} />
            ) : (
              <Text style={{ ...type.body, fontSize: 12, color: colors.textTertiary }}>
                No geographic coordinates for this incident.
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Reroute panel */}
      <View style={styles.rerouteCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <RouteIcon size={14} color={colors.accentCyan} strokeWidth={1.75} />
          <Text style={{ ...type.title, fontSize: 13, color: colors.textPrimary }}>Suggested reroute</Text>
          {recommended === 'alternate' && <Pill variant="ok">recommended</Pill>}
          {recommended === 'primary' && <Pill variant="medium">no alternate found</Pill>}
        </View>

        {primary || alternate ? (
          <View style={{ marginTop: 10 }}>
            <RouteRow
              label="Affected"
              color={colors.statusCritical}
              dur={primary?.duration_s}
              dist={primary?.distance_m}
              dashed
            />
            {alternate ? (
              <RouteRow
                label="Reroute"
                color={colors.statusOk}
                dur={alternate.duration_s}
                dist={alternate.distance_m}
                highlight={recommended === 'alternate'}
              />
            ) : (
              <Text style={{ ...type.body, fontSize: 11.5, color: colors.textTertiary, marginTop: 6 }}>
                No alternate route returned. Routing service may be rate-limited.
              </Text>
            )}

            {primary && alternate && (
              <View style={styles.savedRow}>
                <Navigation2 size={11} color={saved > 0 ? colors.statusOk : colors.statusWarn} />
                <Text style={{ ...type.mono, fontSize: 11, color: saved > 0 ? colors.statusOk : colors.statusWarn }}>
                  {saved > 0
                    ? `Reroute saves ${formatDuration(savedAbs)}`
                    : saved < 0
                    ? `Reroute adds ${formatDuration(savedAbs)} but avoids the zone`
                    : `Same ETA — reroute avoids the zone`}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <Text style={{ ...type.body, fontSize: 11.5, color: colors.textTertiary, marginTop: 6 }}>
            {loading
              ? 'Computing routes…'
              : incident
              ? 'Routing data unavailable from this network.'
              : 'No geographic coordinates for this incident.'}
          </Text>
        )}

        {perm === 'denied' && (
          <GhostButton
            onPress={async () => {
              const ask = await Location.requestForegroundPermissionsAsync();
              if (ask.status === 'granted') setPerm('granted');
            }}
            style={{ marginTop: 10, alignSelf: 'flex-start' }}
          >
            Enable location for personal reroute
          </GhostButton>
        )}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------
   HTML builder — renders Leaflet via CDN inside a WebView.
   ------------------------------------------------------------ */
function buildMapHtml({ incident, user, routes }) {
  if (!incident) return '<!doctype html><html><body></body></html>';

  // Serialise lightweight data for the page
  const primaryCoords = routes?.primary?.coords?.map((c) => [c.latitude, c.longitude]) ?? [];
  const alternateCoords = routes?.alternate?.coords?.map((c) => [c.latitude, c.longitude]) ?? [];

  const data = JSON.stringify({
    incident: { lat: incident.lat, lng: incident.lng, radius_m: incident.radius_m },
    user: user ? { lat: user.lat, lng: user.lng } : null,
    primary: primaryCoords,
    alternate: alternateCoords,
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossorigin="" />
  <style>
    html, body, #map { margin:0; padding:0; height:100%; width:100%; }
    body { background:#0e1014; }
    .leaflet-container { background:#0e1014; }
    .leaflet-control-attribution { display:none; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
          integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
          crossorigin=""></script>
  <script>
    (function() {
      try {
        var DATA = ${data};
        var center = [DATA.incident.lat, DATA.incident.lng];
        var map = L.map('map', {
          attributionControl: false,
          zoomControl: true,
          scrollWheelZoom: true,
          worldCopyJump: true,
        }).setView(center, 13);

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

        // Affected zone
        L.circle(center, {
          radius: DATA.incident.radius_m,
          color: '#ef4444',
          weight: 1.5,
          fillColor: '#ef4444',
          fillOpacity: 0.10,
          dashArray: '4 4'
        }).addTo(map);

        // Incident pin
        var incIcon = L.divIcon({
          html: '<div style="width:22px;height:22px;border-radius:50%;background:rgba(239,68,68,0.95);border:2px solid #fff;box-shadow:0 0 0 4px rgba(239,68,68,0.18);display:flex;align-items:center;justify-content:center;"><span style="display:block;width:6px;height:6px;background:#fff;border-radius:50%"></span></div>',
          className: '',
          iconSize: [22,22],
          iconAnchor: [11,11]
        });
        L.marker(center, { icon: incIcon }).addTo(map);

        // User pin
        if (DATA.user) {
          var userIcon = L.divIcon({
            html: '<div style="width:14px;height:14px;border-radius:50%;background:#67e8f9;border:3px solid #0a0b0d"></div>',
            className: '',
            iconSize: [14,14],
            iconAnchor: [7,7]
          });
          L.marker([DATA.user.lat, DATA.user.lng], { icon: userIcon }).addTo(map);
        }

        var pts = [center];

        // Primary (affected) route — dashed red
        if (DATA.primary && DATA.primary.length) {
          var primary = L.polyline(DATA.primary, { color: '#ef4444', weight: 4, opacity: 0.85, dashArray: '10 6' }).addTo(map);
          DATA.primary.forEach(function(p){ pts.push(p); });
        }
        // Alternate (reroute) — solid green
        if (DATA.alternate && DATA.alternate.length) {
          var alt = L.polyline(DATA.alternate, { color: '#34d399', weight: 4, opacity: 0.92 }).addTo(map);
          DATA.alternate.forEach(function(p){ pts.push(p); });
        }

        if (DATA.user) pts.push([DATA.user.lat, DATA.user.lng]);

        if (pts.length > 1) {
          try { map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 }); } catch(e) {}
        }
      } catch (e) {
        document.body.innerHTML = '<div style="padding:16px;color:#9a9ea5;font-family:sans-serif;font-size:12px">Map failed to initialise: ' + (e && e.message) + '</div>';
      }
    })();
  </script>
</body>
</html>`;
}

function offsetLatLngWest(point, meters) {
  const R = 6371000;
  const dlng = (meters / (R * Math.cos((point.lat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat: point.lat, lng: point.lng - dlng };
}

function RouteRow({ label, color, dur, dist, dashed, highlight }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: highlight ? 'rgba(52, 211, 153, 0.06)' : colors.surface2,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: highlight ? 'rgba(52, 211, 153, 0.30)' : colors.line,
        marginBottom: 6,
      }}
    >
      <View
        style={{
          width: 22, height: 4, borderRadius: 2,
          backgroundColor: dashed ? 'transparent' : color,
          borderWidth: dashed ? 1 : 0, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid',
        }}
      />
      <Text style={{ ...type.title, fontSize: 12, color: colors.textPrimary, flex: 1 }}>{label}</Text>
      <Text style={{ ...type.mono, fontSize: 11, color: colors.textSecondary }}>{formatDuration(dur)}</Text>
      <Text style={{ ...type.mono, fontSize: 11, color: colors.textTertiary, minWidth: 60, textAlign: 'right' }}>
        {formatDistance(dist)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radii.lg,
    padding: spacing(3),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  mapShell: {
    height: 280,
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
  },
  webLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(4),
  },
  rerouteCard: {
    marginTop: spacing(2),
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  savedRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
